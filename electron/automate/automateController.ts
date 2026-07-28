import { randomUUID } from "node:crypto";
import type {
  AutomateSession,
  LocalContext,
  ReplayDraft,
  ReplayResult
} from "../../shared/domain.js";
import {
  assignmentsForPayload,
  automateErrorResult,
  automateResultFromReplay,
  clusterAutomateResults,
  createAutomateSession,
  materializeAutomateDraft,
  MAX_AUTOMATE_COUNT,
  MAX_AUTOMATE_PAYLOADS,
  normalizeAutomateLimits,
  normalizeAutomateRules
} from "../../shared/automate.js";
import { normalizeDraft } from "../../shared/draft.js";
import {
  evidenceRefFromAutomateResult,
  normalizeFinding
} from "../../shared/findings.js";
import { createReplayTab } from "../../shared/replayTabs.js";
import {
  prepareReplayDraft
} from "../../shared/replayVariables.js";
import { isAllowedTarget } from "../../shared/allowlist.js";
import type { LocalStore } from "../localStore.js";

type AutomateSessionController = {
  stopped: boolean;
  paused: boolean;
  active: Set<AbortController>;
};

type AutomateControllerDeps = {
  store: () => LocalStore;
  context: () => LocalContext;
  allowlist: () => string[];
  sendRequest: (
    input: ReplayDraft | { draft: ReplayDraft; environmentId?: string },
    options?: { timeoutMs?: number; signal?: AbortSignal }
  ) => Promise<ReplayResult>;
};

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createAutomateController(deps: AutomateControllerDeps) {
  const controllers = new Map<string, AutomateSessionController>();

  function currentSession(id: string) {
    return deps.store().getAutomateSession(deps.context().session.id, id);
  }

  function saveSession(session: AutomateSession) {
    const clustered = clusterAutomateResults(session.results);
    return deps.store().upsertAutomateSession(deps.context().session.id, {
      ...session,
      results: clustered.results,
      clusters: clustered.clusters,
      updatedAt: new Date().toISOString()
    });
  }

  function sessionWithStatus(
    session: AutomateSession,
    status: AutomateSession["status"],
    error?: string
  ) {
    return saveSession({
      ...session,
      status,
      error: error || undefined
    });
  }

  async function waitForResume(controller: AutomateSessionController) {
    while (controller.paused && !controller.stopped) {
      await delay(200);
    }
  }

  async function runSession(sessionId: string, payloadOverride?: string[]) {
    const controller =
      controllers.get(sessionId) ||
      (() => {
        const next: AutomateSessionController = {
          stopped: false,
          paused: false,
          active: new Set()
        };
        controllers.set(sessionId, next);
        return next;
      })();
    const loadedSession = currentSession(sessionId);
    if (!loadedSession) {
      controllers.delete(sessionId);
      return;
    }
    let session = loadedSession;
    const startingResultCount = session.results.length;
    const remainingPayloads = (
      payloadOverride || session.payloads.slice(startingResultCount)
    )
      .map((payload) => String(payload || "").slice(0, 8000))
      .filter((payload) => payload.trim().length > 0)
      .slice(0, MAX_AUTOMATE_PAYLOADS);
    let cursor = 0;

    async function worker() {
      while (!controller.stopped) {
        await waitForResume(controller);
        if (controller.stopped) {
          return;
        }
        const localIndex = cursor;
        cursor += 1;
        if (localIndex >= remainingPayloads.length) {
          return;
        }
        if (
          session.limits.delayMs > 0 &&
          startingResultCount + localIndex > 0
        ) {
          await delay(session.limits.delayMs);
        }

        const payload = remainingPayloads[localIndex];
        const index = startingResultCount + localIndex + 1;
        const request = materializeAutomateDraft(
          session.draft,
          assignmentsForPayload(session.positions, payload)
        );
        const scopedRequest = prepareReplayDraft(
          request,
          deps
            .store()
            .listReplayEnvironments(deps.context().workspace.id),
          session.environmentId
        );
        let result;

        if (!isAllowedTarget(scopedRequest.url, deps.allowlist())) {
          result = automateErrorResult({
            id: `automate_result_${randomUUID()}`,
            index,
            payload,
            request: scopedRequest,
            error: "Automate URL is outside the current scope allowlist.",
            rules: session.rules
          });
        } else {
          const abort = new AbortController();
          controller.active.add(abort);
          try {
            const response = await deps.sendRequest(
              { draft: request, environmentId: session.environmentId },
              {
                timeoutMs: session.limits.timeoutMs,
                signal: abort.signal
              }
            );
            result = automateResultFromReplay({
              id: `automate_result_${randomUUID()}`,
              index,
              payload,
              request: scopedRequest,
              response,
              rules: session.rules
            });
          } catch (error) {
            result = automateErrorResult({
              id: `automate_result_${randomUUID()}`,
              index,
              payload,
              request: scopedRequest,
              error:
                error instanceof Error
                  ? error.message
                  : "Automate request failed.",
              rules: session.rules
            });
          } finally {
            controller.active.delete(abort);
          }
        }

        const latest = currentSession(sessionId) || session;
        session = saveSession({
          ...latest,
          status: controller.paused ? "paused" : "running",
          results: [...latest.results, result].sort(
            (left, right) => left.index - right.index
          )
        });
      }
    }

    try {
      await Promise.all(
        Array.from(
          {
            length: Math.min(
              session.limits.concurrency,
              remainingPayloads.length || 1
            )
          },
          () => worker()
        )
      );
      const latest = currentSession(sessionId);
      if (!latest) {
        return;
      }
      if (controller.stopped) {
        saveSession({ ...latest, status: "stopped" });
      } else if (latest.status !== "paused") {
        saveSession({ ...latest, status: "completed" });
      }
    } catch (error) {
      const latest = currentSession(sessionId) || session;
      saveSession({
        ...latest,
        status: "failed",
        error:
          error instanceof Error
            ? error.message
            : "Automate session failed."
      });
    } finally {
      if (!controller.paused) {
        controllers.delete(sessionId);
      }
    }
  }

  function start(input: unknown) {
    const value =
      input && typeof input === "object" && !Array.isArray(input)
        ? (input as Record<string, unknown>)
        : {};
    const payloads = Array.isArray(value.payloads)
      ? value.payloads.map((payload) => String(payload || ""))
      : [];
    const session = createAutomateSession({
      name: String(value.name || ""),
      draft: normalizeDraft(value.draft as ReplayDraft),
      environmentId: String(value.environmentId || ""),
      payloadSetId:
        typeof value.payloadSetId === "string"
          ? value.payloadSetId
          : undefined,
      payloads,
      positions: Array.isArray(value.positions) ? value.positions : undefined,
      limits: normalizeAutomateLimits(value.limits),
      rules: normalizeAutomateRules(value.rules)
    });
    if (!session) {
      throw new Error("Automate session could not be created.");
    }
    if (session.positions.length === 0) {
      throw new Error(
        "Automate needs at least one payload marker before a run can start."
      );
    }
    if (session.payloads.length === 0) {
      throw new Error(
        "Automate needs at least one payload before a run can start."
      );
    }

    const running = saveSession({ ...session, status: "running" });
    controllers.set(running.id, {
      stopped: false,
      paused: false,
      active: new Set()
    });
    void runSession(running.id);
    return running;
  }

  function pause(id: string) {
    const session = currentSession(id);
    if (!session) {
      return null;
    }
    const controller = controllers.get(session.id);
    if (controller) {
      controller.paused = true;
    }
    return sessionWithStatus(session, "paused");
  }

  function resume(id: string) {
    const session = currentSession(id);
    if (!session) {
      return null;
    }
    const controller = controllers.get(session.id);
    const running = sessionWithStatus(session, "running");
    if (controller) {
      controller.paused = false;
    } else {
      controllers.set(running.id, {
        stopped: false,
        paused: false,
        active: new Set()
      });
      void runSession(running.id);
    }
    return running;
  }

  function stop(id: string) {
    const session = currentSession(id);
    if (!session) {
      return null;
    }
    const controller = controllers.get(session.id);
    if (controller) {
      controller.stopped = true;
      controller.paused = false;
      for (const abort of controller.active) {
        abort.abort();
      }
    }
    controllers.delete(session.id);
    return sessionWithStatus(session, "stopped");
  }

  function retry(id: string) {
    const session = currentSession(id);
    if (!session) {
      return null;
    }
    if (controllers.has(session.id)) {
      return session;
    }
    const failedPayloads = session.results
      .filter(
        (result) => result.error || !result.ok || result.status >= 400
      )
      .map((result) => result.payload)
      .slice(0, MAX_AUTOMATE_COUNT);
    const retryPayloads =
      failedPayloads.length > 0
        ? failedPayloads
        : session.payloads.slice(0, session.limits.count);
    const running = saveSession({
      ...session,
      status: "running",
      error: undefined
    });
    controllers.set(running.id, {
      stopped: false,
      paused: false,
      active: new Set()
    });
    void runSession(running.id, retryPayloads);
    return running;
  }

  function resultFromInput(input: unknown) {
    const payload =
      input && typeof input === "object" && !Array.isArray(input)
        ? (input as Record<string, unknown>)
        : {};
    const session = currentSession(String(payload.sessionId || ""));
    const result = session?.results.find(
      (entry) => entry.id === String(payload.resultId || "")
    );
    if (!session || !result) {
      throw new Error("Automate result was not found.");
    }
    return { session, result };
  }

  function promoteToRepeater(input: unknown) {
    const { result } = resultFromInput(input);
    const store = deps.store();
    const workspaceId = deps.context().workspace.id;
    const state = store.getReplayTabState(workspaceId);
    const tab = createReplayTab(
      `Automate ${result.payload || result.index}`,
      result.request
    );
    return store.setReplayTabState(workspaceId, {
      tabs: [...state.tabs, tab],
      activeTabId: tab.id
    });
  }

  function promoteToFinding(input: unknown) {
    const { session, result } = resultFromInput(input);
    const createdAt = new Date().toISOString();
    const finding = normalizeFinding(
      {
        id: `finding_${randomUUID()}`,
        title: `Review Automate result: ${
          result.payload || `attempt ${result.index}`
        }`,
        severity:
          result.status >= 500 || result.error ? "medium" : "low",
        confidence:
          result.matchedRules.length + result.extracts.length > 0
            ? "medium"
            : "low",
        status: "draft",
        affectedAssets: [result.request.url],
        evidence: [evidenceRefFromAutomateResult(session, result)],
        reproductionSteps: `${result.request.method} ${result.request.url}\nPayload: ${result.payload}`,
        impact:
          "Automate identified a response delta or interesting payload result that needs manual review.",
        remediation: "",
        notes: result.bodyPreview || result.error || "",
        owner: "",
        retestResult: "",
        source: "automate",
        sourceId: session.id,
        createdAt,
        updatedAt: createdAt
      },
      createdAt
    );
    if (!finding) {
      throw new Error(
        "Automate result did not contain enough evidence for a finding."
      );
    }
    return deps
      .store()
      .upsertFinding(deps.context().session.id, finding);
  }

  return {
    start,
    pause,
    resume,
    stop,
    retry,
    promoteToRepeater,
    promoteToFinding
  };
}
