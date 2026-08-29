import { describe, expect, it } from "vitest";
import { defaultAssessmentContract } from "../../../shared/agentAssessment.js";
import { defaultReplayTabState as emptyTabs } from "../../../shared/replayTabs.js";
import type { CapturedRequest, ReplayDraft, ReplayResult, ReplayTabState } from "../../../shared/domain.js";
import { assessmentLeaseFromContract } from "./armContract.js";
import { runManualReplayExperiment } from "./manualExperiment.js";
import { runVisibleReplayExperiment } from "./replayExperiment.js";
import { assessmentTrafficSignal, delayWithSignal, stopAssessmentTraffic } from "./stopController.js";

function capture(overrides: Partial<CapturedRequest> = {}): CapturedRequest {
  return {
    id: "cap-search",
    startedAt: "2026-08-22T00:00:00.000Z",
    method: "GET",
    url: "http://127.0.0.1:3000/api/cargo-search?q=alpha",
    host: "127.0.0.1:3000",
    path: "/api/cargo-search",
    requestHeaders: {},
    requestBody: "",
    status: 200,
    statusText: "OK",
    mimeType: "application/json",
    type: "xhr",
    responseHeaders: {},
    responseBody: "{}",
    durationMs: 12,
    allowed: true,
    source: "browser",
    ...overrides
  };
}

function replayResult(overrides: Partial<ReplayResult> = {}): ReplayResult {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    durationMs: 8,
    headers: {},
    body: "{}",
    bytes: 2,
    ...overrides
  };
}

function deps(tabState = emptyTabs()) {
  const sends: ReplayDraft[] = [];
  return {
    sends,
    impl: {
      send: async (draft: ReplayDraft) => {
        sends.push(draft);
        return replayResult({ body: draft.url.includes("%27") ? "syntax" : "{}" });
      },
      getTabState: () => tabState,
      setTabState: (state: ReplayTabState) => {
        tabState = state;
        return state;
      },
      delay: async () => undefined,
      now: () => "2026-08-22T00:00:00.000Z",
      createId: (prefix: string) => `${prefix}-1`
    }
  };
}

describe("assessment runner", () => {
  it("builds a run-level lease from the approved contract", () => {
    const lease = assessmentLeaseFromContract({
      contract: defaultAssessmentContract({ seedCaptureIds: ["cap-search"] }),
      allowlist: ["http://127.0.0.1:3000"],
      reason: "Arm & Run"
    });
    expect(lease.tools).toEqual(["runReplayExperiment"]);
    expect(lease.maxConcurrency).toBe(1);
    expect(lease.grants.some((grant) => grant.probeFamily === "injection-signal")).toBe(true);
    expect(lease.grants[0]?.sourceCaptureIds).toEqual(["cap-search"]);
  });

  it("runs a visible sequential experiment and records history", async () => {
    const runtime = deps();
    const result = await runVisibleReplayExperiment({
      request: {
        captureId: "cap-search",
        family: "injection-signal",
        hypothesis: "Boolean pair",
        location: { kind: "replace-query", name: "q", value: "" }
      },
      capture: capture(),
      contract: defaultAssessmentContract(),
      allowlist: ["http://127.0.0.1:3000"],
      deps: runtime.impl
    });
    expect(runtime.sends.length).toBeGreaterThan(1);
    expect(result.family).toBe("injection-signal");
    expect(result.variants.length).toBe(2);
    expect(result.requestCost).toBe(3);
    expect(result.tabId).toBeTruthy();
  });

  it("fails closed on out-of-scope, state-changing, and aborted starts", async () => {
    const runtime = deps();
    const contract = defaultAssessmentContract();
    await expect(
      runVisibleReplayExperiment({
        request: {
          captureId: "cap-search",
          family: "injection-signal",
          hypothesis: "out",
          location: { kind: "replace-query", name: "q", value: "" }
        },
        capture: capture({ allowed: false }),
        contract,
        allowlist: ["http://127.0.0.1:3000"],
        deps: runtime.impl
      })
    ).rejects.toThrow(/outside saved Scope/);
    await expect(
      runVisibleReplayExperiment({
        request: {
          captureId: "cap-profile",
          family: "injection-signal",
          hypothesis: "profile",
          location: { kind: "replace-query", name: "q", value: "" }
        },
        capture: capture({
          id: "cap-profile",
          method: "POST",
          url: "http://127.0.0.1:3000/profile/update",
          path: "/profile/update"
        }),
        contract,
        allowlist: ["http://127.0.0.1:3000"],
        deps: runtime.impl
      })
    ).rejects.toThrow(/not autonomous/);
    const signal = new AbortController();
    signal.abort();
    await expect(
      runVisibleReplayExperiment({
        request: {
          captureId: "cap-search",
          family: "injection-signal",
          hypothesis: "stopped",
          location: { kind: "replace-query", name: "q", value: "" }
        },
        capture: capture(),
        contract,
        allowlist: ["http://127.0.0.1:3000"],
        deps: runtime.impl,
        signal: signal.signal
      })
    ).rejects.toThrow(/before dispatch/);
  });

  it("rejects a malformed manual experiment and runs a valid one", async () => {
    const runtime = deps();
    await expect(
      runManualReplayExperiment({
        request: { family: "cors-origin" },
        captures: [capture()],
        allowlist: ["http://127.0.0.1:3000"],
        deps: runtime.impl
      })
    ).rejects.toThrow(/requires a capture/);
    await expect(
      runManualReplayExperiment({
        request: {
          captureId: "missing",
          family: "injection-signal",
          location: { kind: "replace-query", name: "q", value: "" }
        },
        captures: [capture()],
        allowlist: ["http://127.0.0.1:3000"],
        deps: runtime.impl
      })
    ).rejects.toThrow(/not found/);
    const result = await runManualReplayExperiment({
      request: {
        captureId: "cap-search",
        family: "cors-origin",
        location: { kind: "set-origin", value: "" }
      },
      captures: [capture()],
      allowlist: ["http://127.0.0.1:3000"],
      deps: runtime.impl
    });
    expect(result.family).toBe("cors-origin");
  });

  it("aborts queued delays when Stop Traffic Now fires", async () => {
    const signal = assessmentTrafficSignal();
    stopAssessmentTraffic();
    await expect(delayWithSignal(20, assessmentTrafficSignal())).resolves.toBeUndefined();
    const live = new AbortController();
    const pending = delayWithSignal(50, live.signal);
    live.abort();
    await expect(pending).rejects.toThrow(/Stop Traffic Now/);
    await expect(delayWithSignal(10, signal)).rejects.toThrow(/Stop Traffic Now/);
    expect(assessmentTrafficSignal().aborted).toBe(false);
  });
});
