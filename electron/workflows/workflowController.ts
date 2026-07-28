import type {
  LocalContext,
  ReplayDraft,
  ReplayResult,
  WorkflowDefinition,
  WorkflowRunSource
} from "../../shared/domain.js";
import { isAllowedTarget } from "../../shared/allowlist.js";
import { findingFromWorkflowResult } from "../../shared/workflows.js";
import {
  BUILT_IN_WORKFLOWS,
  activeBrowserWorkflowResult,
  activeReplayWorkflowResult,
  allWorkflows,
  createWorkflowRunRecord,
  evaluatePassiveWorkflow,
  isActiveWorkflowStep,
  normalizeWorkflowDefinition,
  normalizeWorkflowInputs,
  replayDraftFromCapture,
  shouldRunWorkflowStep,
  validateWorkflowDraft
} from "../../shared/workflows.js";
import type { LocalStore } from "../localStore.js";

type WorkflowControllerDeps = {
  store: () => LocalStore;
  context: () => LocalContext;
  allowlist: () => string[];
  sendRequest: (
    input: { draft: ReplayDraft },
    options?: { timeoutMs?: number; signal?: AbortSignal }
  ) => Promise<ReplayResult>;
  openBrowser: (url: string) => Promise<unknown>;
};

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createWorkflowController(deps: WorkflowControllerDeps) {
  function catalog() {
    return allWorkflows(
      deps
        .store()
        .listWorkflowDefinitions(deps.context().workspace.id)
    );
  }

  function save(input: unknown) {
    const workflow = normalizeWorkflowDefinition(input);
    if (!workflow) {
      throw new Error("Workflow definition was invalid.");
    }
    if (
      workflow.builtIn ||
      BUILT_IN_WORKFLOWS.some((item) => item.id === workflow.id)
    ) {
      throw new Error("Built-in workflows cannot be overwritten.");
    }
    return deps
      .store()
      .upsertWorkflowDefinition(deps.context().workspace.id, {
        ...workflow,
        builtIn: false
      });
  }

  function remove(id: unknown) {
    const workflowId = String(id || "").trim();
    if (
      !workflowId ||
      BUILT_IN_WORKFLOWS.some(
        (workflow) => workflow.id === workflowId
      )
    ) {
      return { ok: false, workflows: catalog() };
    }
    deps
      .store()
      .deleteWorkflowDefinition(deps.context().workspace.id, workflowId);
    return { ok: true, workflows: catalog() };
  }

  function validate(input: unknown) {
    const payload =
      input && typeof input === "object" && !Array.isArray(input)
        ? (input as Record<string, unknown>)
        : {};
    const inputs =
      payload.inputs &&
      typeof payload.inputs === "object" &&
      !Array.isArray(payload.inputs)
        ? Object.fromEntries(
            Object.entries(payload.inputs).map(([key, value]) => [
              key,
              String(value || "")
            ])
          )
        : {};
    return validateWorkflowDraft(
      "definition" in payload ? payload.definition : input,
      inputs
    );
  }

  function revisions(id: unknown) {
    const workflowId = String(id || "").trim();
    if (!workflowId) {
      return [];
    }
    return deps
      .store()
      .listWorkflowRevisions(
        deps.context().workspace.id,
        workflowId,
        60
      );
  }

  function byId(workflowId: string): WorkflowDefinition | null {
    return (
      catalog().find((workflow) => workflow.id === workflowId) || null
    );
  }

  async function run(input: unknown) {
    const payload =
      input && typeof input === "object" && !Array.isArray(input)
        ? (input as Record<string, unknown>)
        : {};
    const definition = byId(String(payload.workflowId || "").trim());
    if (!definition) {
      throw new Error("Workflow was not found.");
    }
    const source: WorkflowRunSource =
      payload.source === "ai" ? "ai" : "manual";
    const inputs = normalizeWorkflowInputs(
      definition,
      payload.inputs as Record<string, unknown>
    );
    const context = deps.context();
    const store = deps.store();
    const sessionId = context.session.id;
    let runRecord = createWorkflowRunRecord({
      definition,
      sessionId,
      source,
      inputs,
      status: "running",
      startedAt: new Date().toISOString()
    });
    store.upsertWorkflowRun(sessionId, runRecord);

    try {
      const captures = store.listCaptures(sessionId, 2000);
      const results = evaluatePassiveWorkflow(
        definition,
        captures,
        deps.allowlist(),
        inputs
      );
      let actionCount = 0;
      for (const step of definition.steps) {
        if (
          !isActiveWorkflowStep(step) ||
          !shouldRunWorkflowStep(step, inputs)
        ) {
          continue;
        }
        if (!definition.scope.allowActive) {
          throw new Error("Workflow active steps are disabled by policy.");
        }
        if (actionCount >= definition.scope.maxRequests) {
          throw new Error("Workflow exceeded its active request cap.");
        }
        if (definition.scope.delayMs > 0 && actionCount > 0) {
          await delay(definition.scope.delayMs);
        }

        if (step.kind === "active-replay") {
          const captureId =
            inputs["capture-id"] || inputs.captureId || "";
          const capture = captures.find(
            (item) => item.id === captureId
          );
          if (!capture) {
            throw new Error(
              "Active workflow needs a selected capture id."
            );
          }
          if (
            definition.scope.requireInScope &&
            !isAllowedTarget(capture.url, deps.allowlist())
          ) {
            throw new Error(
              "Workflow capture is outside the current scope allowlist."
            );
          }
          const draft = replayDraftFromCapture(
            capture,
            step.config.stripAuth !== "false"
          );
          const replay = await deps.sendRequest(
            { draft },
            { timeoutMs: definition.scope.timeoutMs }
          );
          results.push(
            activeReplayWorkflowResult({ step, capture, replay })
          );
        } else {
          const targetUrl =
            inputs[step.config.urlInput || "url"] ||
            step.config.url ||
            "";
          if (!targetUrl) {
            throw new Error(
              "Workflow browser step needs a URL input or config value."
            );
          }
          if (!isAllowedTarget(targetUrl, deps.allowlist())) {
            throw new Error(
              "Workflow browser URL is outside the current scope allowlist."
            );
          }
          await deps.openBrowser(targetUrl);
          results.push(
            activeBrowserWorkflowResult({ step, url: targetUrl })
          );
        }
        actionCount += 1;
      }

      runRecord = {
        ...runRecord,
        status: "completed",
        completedAt: new Date().toISOString(),
        actionCount,
        results: results.slice(0, definition.scope.maxResults)
      };
      return store.upsertWorkflowRun(sessionId, runRecord);
    } catch (error) {
      runRecord = {
        ...runRecord,
        status: "failed",
        completedAt: new Date().toISOString(),
        error:
          error instanceof Error ? error.message : "Workflow failed."
      };
      store.upsertWorkflowRun(sessionId, runRecord);
      return runRecord;
    }
  }

  function promoteResult(input: unknown) {
    const payload =
      input && typeof input === "object" && !Array.isArray(input)
        ? (input as Record<string, unknown>)
        : {};
    const store = deps.store();
    const sessionId = deps.context().session.id;
    const runRecord = store.getWorkflowRun(
      sessionId,
      String(payload.runId || "")
    );
    const result = runRecord?.results.find(
      (item) => item.id === String(payload.resultId || "")
    );
    if (!runRecord || !result) {
      throw new Error("Workflow result was not found.");
    }
    const finding = findingFromWorkflowResult(runRecord, result);
    if (!finding) {
      throw new Error(
        "Only warning or failed workflow results can become findings."
      );
    }
    return store.upsertFinding(sessionId, finding);
  }

  return {
    catalog,
    save,
    remove,
    validate,
    revisions,
    run,
    promoteResult
  };
}
