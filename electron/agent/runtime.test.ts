import { describe, expect, it, vi } from "vitest";
import type { AgentRun } from "../../shared/agent-types.js";
import { AgentRuntime } from "./runtime.js";

function makeRuntime(seed?: AgentRun) {
  const runs = new Map<string, AgentRun>();
  if (seed) {
    runs.set(seed.id, seed);
  }

  const runtime = new AgentRuntime({
    currentSessionId: () => "session-test",
    allowlist: () => ["https://allowed.test"],
    saveRun: (run) => {
      runs.set(run.id, run);
    },
    loadRun: (runId) => runs.get(runId) || null,
    listRuns: () => Array.from(runs.values()),
    getBrowserState: () => ({ open: false, url: "", title: "", loading: false, engine: "none" }),
    openBrowser: vi.fn(async (url: string) => ({ open: true, url, title: "Chrome", loading: false, engine: "chrome" })),
    navigateBrowser: vi.fn(async (url: string) => ({ open: true, url, title: "Chrome", loading: false, engine: "chrome" })),
    getCaptures: () => [],
    sendReplay: vi.fn(async () => ({ ok: true, status: 200, statusText: "OK", headers: {}, body: "", bytes: 0, durationMs: 1 }))
  });

  return { runtime, runs };
}

describe("AgentRuntime", () => {
  it("marks active runs stopped", () => {
    const run: AgentRun = {
      id: "agent-1",
      sessionId: "session-test",
      createdAt: "2026-05-25T00:00:00.000Z",
      updatedAt: "2026-05-25T00:00:00.000Z",
      goal: "Inspect target",
      status: "running",
      policy: {
        maxRuntimeMs: 120000,
        maxSteps: 8,
        maxReplay: 1,
        maxCaptureSample: 20,
        allowRawContext: false
      },
      timeline: [],
      findings: []
    };
    const { runtime, runs } = makeRuntime(run);

    const stopped = runtime.stop(run.id);

    expect(stopped?.status).toBe("stopped");
    expect(runs.get(run.id)?.timeline.at(-1)?.note).toBe("Stop requested by operator.");
  });
});

