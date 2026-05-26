import { randomUUID } from "node:crypto";
import type {
  AgentFinding,
  AgentRun,
  AgentRunRequest,
  AgentTimelineEntry,
  AgentToolCall,
  AgentToolResult
} from "../../shared/agent-types.js";
import type { BrowserState, CapturedRequest, ReplayDraft, ReplayResult } from "../../shared/domain.js";
import { originFromUrl } from "../../shared/url.js";
import { normalizeDraft } from "../../shared/draft.js";
import { DEFAULT_AGENT_POLICY, blockedToolReason, normalizeAgentPolicy } from "./policy.js";

type AgentRuntimeDeps = {
  currentSessionId: () => string;
  allowlist: () => string[];
  saveRun: (run: AgentRun) => void;
  loadRun: (runId: string) => AgentRun | null;
  listRuns: () => AgentRun[];
  getBrowserState: () => BrowserState;
  openBrowser: (url: string) => Promise<BrowserState>;
  navigateBrowser: (url: string) => Promise<BrowserState>;
  getCaptures: () => CapturedRequest[];
  sendReplay: (draft: ReplayDraft) => Promise<ReplayResult>;
};

type RunCounters = {
  startedAt: number;
  stepCount: number;
  replayCount: number;
};

const running = new Set<string>();
const stopped = new Set<string>();

function nowIso() {
  return new Date().toISOString();
}

function createId(prefix: string) {
  return `${prefix}_${randomUUID()}`;
}

function firstUrlFromText(text: string) {
  const match = String(text || "").match(/https?:\/\/[^\s"'<>]+/i);
  return match?.[0] || "";
}

function timeline(note: string, extra: Partial<AgentTimelineEntry> = {}): AgentTimelineEntry {
  return {
    id: createId("step"),
    createdAt: nowIso(),
    note,
    ...extra
  };
}

function withUpdate(run: AgentRun, saveRun: (run: AgentRun) => void, update: Partial<AgentRun>) {
  const next = {
    ...run,
    ...update,
    updatedAt: nowIso()
  };
  saveRun(next);
  return next;
}

function headerValue(headers: Record<string, string>, name: string) {
  const found = Object.entries(headers || {}).find(([key]) => key.toLowerCase() === name.toLowerCase());
  return found?.[1] || "";
}

function finding(title: string, notes: string, evidenceRefs: string[], confidence: AgentFinding["confidence"]): AgentFinding {
  return {
    id: createId("finding"),
    createdAt: nowIso(),
    title,
    confidence,
    evidenceRefs,
    notes,
    uncertainties: ["Agent findings are draft-only until manually reviewed."]
  };
}

function findingsFromCaptures(captures: CapturedRequest[]) {
  const findings: AgentFinding[] = [];
  const seen = new Set<string>();

  for (const capture of captures) {
    const evidence = [`capture:${capture.id}`];
    if ((capture.status || 0) >= 500 && !seen.has("server-error")) {
      seen.add("server-error");
      findings.push(
        finding(
          "Server error observed in scoped traffic",
          `${capture.method} ${capture.url} returned ${capture.status} ${capture.statusText}.`,
          evidence,
          "medium"
        )
      );
    }

    const contentType = headerValue(capture.responseHeaders, "content-type");
    if (/text\/html/i.test(contentType) && !headerValue(capture.responseHeaders, "content-security-policy") && !seen.has("csp")) {
      seen.add("csp");
      findings.push(
        finding(
          "HTML response missing Content-Security-Policy",
          `${capture.url} returned HTML without a Content-Security-Policy header.`,
          evidence,
          "low"
        )
      );
    }

    if (capture.url.startsWith("https://") && !headerValue(capture.responseHeaders, "strict-transport-security") && !seen.has("hsts")) {
      seen.add("hsts");
      findings.push(
        finding(
          "HTTPS response missing HSTS",
          `${originFromUrl(capture.url) || capture.host} did not include Strict-Transport-Security in the sampled response.`,
          evidence,
          "low"
        )
      );
    }
  }

  return findings;
}

function replayFinding(capture: CapturedRequest, response: ReplayResult) {
  if ((response.status || 0) >= 500) {
    return finding(
      "Replay reproduced a server error",
      `${capture.method} ${capture.url} replay returned ${response.status} ${response.statusText}.`,
      [`capture:${capture.id}`, "replay:latest"],
      "medium"
    );
  }

  if (capture.status !== null && response.status !== capture.status) {
    return finding(
      "Replay response changed status",
      `Captured response was ${capture.status}; replay returned ${response.status} ${response.statusText}.`,
      [`capture:${capture.id}`, "replay:latest"],
      "low"
    );
  }

  return null;
}

function latestToolResult<T extends AgentToolResult["tool"]>(run: AgentRun, tool: T) {
  for (let index = run.timeline.length - 1; index >= 0; index -= 1) {
    const result = run.timeline[index]?.toolResult;
    if (result?.tool === tool && result.ok) {
      return result;
    }
  }
  return null;
}

export class AgentRuntime {
  constructor(private readonly deps: AgentRuntimeDeps) {}

  start(request: AgentRunRequest) {
    const goal = String(request.goal || "").trim();
    if (!goal) {
      throw new Error("Agent goal is required.");
    }

    const createdAt = nowIso();
    const run: AgentRun = {
      id: createId("agent"),
      sessionId: this.deps.currentSessionId(),
      createdAt,
      updatedAt: createdAt,
      goal,
      status: "queued",
      policy: normalizeAgentPolicy(request.policy),
      timeline: [timeline("Run queued from AI-First goal prompt.")],
      findings: []
    };

    this.deps.saveRun(run);
    void this.execute(run.id, firstUrlFromText(goal) || request.startUrl || "");
    return run;
  }

  stop(runId: string) {
    stopped.add(runId);
    const run = this.deps.loadRun(runId);
    if (!run) {
      return null;
    }
    if (run.status === "completed" || run.status === "failed" || run.status === "stopped") {
      return run;
    }
    return withUpdate(run, this.deps.saveRun, {
      status: "stopped",
      timeline: [...run.timeline, timeline("Stop requested by operator.")]
    });
  }

  get(runId: string) {
    return this.deps.loadRun(runId);
  }

  list() {
    return this.deps.listRuns();
  }

  private isStopped(runId: string) {
    const persisted = this.deps.loadRun(runId);
    return stopped.has(runId) || persisted?.status === "stopped" || persisted?.status === "paused";
  }

  private async callTool(run: AgentRun, counters: RunCounters, call: AgentToolCall) {
    const blocked = blockedToolReason({
      call,
      allowlist: this.deps.allowlist(),
      policy: run.policy,
      replayCount: counters.replayCount,
      stepCount: counters.stepCount,
      startedAt: counters.startedAt
    });
    if (blocked) {
      return withUpdate(run, this.deps.saveRun, {
        timeline: [...run.timeline, timeline(blocked, { toolCall: call })]
      });
    }

    let next = withUpdate(run, this.deps.saveRun, {
      timeline: [...run.timeline, timeline(`Tool call: ${call.tool}`, { toolCall: call })]
    });
    counters.stepCount += 1;

    let result: AgentToolResult;
    try {
      switch (call.tool) {
        case "getBrowserState":
          result = { tool: call.tool, ok: true, data: this.deps.getBrowserState() };
          break;
        case "showView":
          result = { tool: call.tool, ok: true, data: { view: call.input.view } };
          break;
        case "openBrowser":
          result = { tool: call.tool, ok: true, data: await this.deps.openBrowser(call.input.url) };
          break;
        case "navigateBrowser":
          result = { tool: call.tool, ok: true, data: await this.deps.navigateBrowser(call.input.url) };
          break;
        case "getCaptures":
          result = {
            tool: call.tool,
            ok: true,
            data: { captures: this.deps.getCaptures().slice(0, call.input.limit || run.policy.maxCaptureSample) }
          };
          break;
        case "sendReplay": {
          counters.replayCount += 1;
          result = { tool: call.tool, ok: true, data: await this.deps.sendReplay(normalizeDraft(call.input.draft)) };
          break;
        }
      }
    } catch (error) {
      result = {
        tool: call.tool,
        ok: false,
        error: error instanceof Error ? error.message : "Agent tool failed."
      };
    }

    next = withUpdate(next, this.deps.saveRun, {
      timeline: [...next.timeline, timeline(`Tool result: ${call.tool}`, { toolResult: result })]
    });
    return next;
  }

  private async execute(runId: string, startUrl: string) {
    if (running.has(runId)) {
      return;
    }
    running.add(runId);
    const counters = { startedAt: Date.now(), stepCount: 0, replayCount: 0 };

    try {
      let run = this.deps.loadRun(runId);
      if (!run) {
        return;
      }

      run = withUpdate(run, this.deps.saveRun, {
        status: "running",
        timeline: [...run.timeline, timeline("Run started. Scope and policy checks are active.")]
      });

      if (this.isStopped(runId)) {
        return;
      }

      run = await this.callTool(run, counters, {
        tool: "showView",
        input: { view: "scope", reason: "Review active engagement boundary before autonomous actions." }
      });

      if (this.isStopped(runId)) {
        return;
      }

      if (startUrl) {
        run = await this.callTool(run, counters, {
          tool: "showView",
          input: { view: "traffic", reason: "Launch browser and observe captured traffic." }
        });
        run = await this.callTool(run, counters, { tool: "openBrowser", input: { url: startUrl } });
      } else {
        run = await this.callTool(run, counters, {
          tool: "showView",
          input: { view: "traffic", reason: "Inspect the current browser and capture state." }
        });
        run = await this.callTool(run, counters, { tool: "getBrowserState", input: {} });
      }

      if (this.isStopped(runId)) {
        return;
      }

      run = await this.callTool(run, counters, { tool: "getCaptures", input: { limit: run.policy.maxCaptureSample } });
      const captureResult = latestToolResult(run, "getCaptures") as Extract<AgentToolResult, { tool: "getCaptures"; ok: true }> | null;
      const captures = (captureResult?.data.captures || []).filter((capture) => capture.allowed);
      const candidate = captures.find((capture) => !["OPTIONS", "HEAD"].includes(capture.method));
      let nextFindings = findingsFromCaptures(captures);

      if (candidate && counters.replayCount < run.policy.maxReplay && !this.isStopped(runId)) {
        run = await this.callTool(run, counters, {
          tool: "showView",
          input: { view: "repeater", reason: "Replay a selected in-scope request with strict autonomous limits." }
        });
        run = await this.callTool(run, counters, {
          tool: "sendReplay",
          input: {
            draft: {
              method: candidate.method,
              url: candidate.url,
              headers: candidate.requestHeaders,
              body: candidate.requestBody
            }
          }
        });
        const replayResult = latestToolResult(run, "sendReplay") as Extract<AgentToolResult, { tool: "sendReplay"; ok: true }> | null;
        const replayObservation = replayResult ? replayFinding(candidate, replayResult.data) : null;
        nextFindings = replayObservation ? [...nextFindings, replayObservation] : nextFindings;
      }

      if (this.isStopped(runId)) {
        return;
      }

      run = await this.callTool(run, counters, {
        tool: "showView",
        input: { view: "ssl", reason: "Surface TLS and proxy evidence before finishing." }
      });

      run = withUpdate(run, this.deps.saveRun, {
        status: "completed",
        findings: nextFindings,
        timeline: [
          ...run.timeline,
          timeline(
            nextFindings.length > 0
              ? `Run completed with ${nextFindings.length} draft finding${nextFindings.length === 1 ? "" : "s"}.`
              : captures.length > 0
                ? "Run completed. No draft findings were created from the sampled captures."
                : "Run completed. No in-scope captures were available to inspect."
          )
        ]
      });
    } catch (error) {
      const run = this.deps.loadRun(runId);
      if (run) {
        withUpdate(run, this.deps.saveRun, {
          status: "failed",
          error: error instanceof Error ? error.message : "Agent run failed.",
          timeline: [...run.timeline, timeline("Run failed.")]
        });
      }
    } finally {
      running.delete(runId);
      stopped.delete(runId);
    }
  }
}

export { DEFAULT_AGENT_POLICY };

