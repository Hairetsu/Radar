import { describe, expect, it } from "vitest";
import { blockedToolReason, normalizeAgentPolicy } from "./policy.js";

describe("agent policy", () => {
  it("normalizes autonomous limits", () => {
    expect(
      normalizeAgentPolicy({
        maxRuntimeMs: 1,
        maxSteps: 999,
        maxReplay: -1,
        maxWorkflowRequests: 999,
        maxCaptureSample: 500,
        allowRawContext: true
      })
    ).toEqual({
      maxRuntimeMs: 10000,
      maxSteps: 40,
      maxReplay: 0,
      maxWorkflowRequests: 100,
      maxCaptureSample: 100,
      allowRawContext: false,
      maxProbeRequests: 0
    });
  });

  it("blocks out-of-scope network actions", () => {
    const reason = blockedToolReason({
      call: { tool: "navigateBrowser", input: { url: "https://blocked.test" } },
      allowlist: ["https://allowed.test"],
      policy: normalizeAgentPolicy(),
      profileId: "api-hardening",
      replayCount: 0,
      workflowRequestCount: 0,
      stepCount: 0,
      startedAt: Date.now()
    });

    expect(reason).toContain("Blocked out-of-scope URL");
  });

  it("enforces replay budgets", () => {
    const reason = blockedToolReason({
      call: {
        tool: "sendReplay",
        input: { draft: { method: "GET", url: "https://allowed.test/api", headers: {}, body: "" } }
      },
      allowlist: ["https://allowed.test"],
      policy: normalizeAgentPolicy({ maxReplay: 1 }, "advanced-api-review"),
      profileId: "advanced-api-review",
      replayCount: 1,
      workflowRequestCount: 0,
      stepCount: 0,
      startedAt: Date.now()
    });

    expect(reason).toBe("Autonomous run exceeded its replay budget.");
  });

  it("allows goal-driven replay until its tenth request", () => {
    const common: Omit<Parameters<typeof blockedToolReason>[0], "replayCount"> = {
      call: {
        tool: "sendReplay",
        input: { draft: { method: "GET", url: "https://allowed.test/api", headers: {}, body: "" } }
      },
      allowlist: ["https://allowed.test"],
      policy: normalizeAgentPolicy({}, "goal-driven-assessment"),
      profileId: "goal-driven-assessment",
      workflowRequestCount: 0,
      stepCount: 0,
      startedAt: Date.now()
    };

    expect(blockedToolReason({ ...common, replayCount: 9 })).toBe("");
    expect(blockedToolReason({ ...common, replayCount: 10 })).toBe("Autonomous run exceeded its replay budget.");
  });

  it("blocks raw browser-state tools when raw context is off", () => {
    const reason = blockedToolReason({
      call: { tool: "getStorageState", input: {} },
      allowlist: ["https://allowed.test"],
      policy: normalizeAgentPolicy({}, "auth-review"),
      profileId: "auth-review",
      replayCount: 0,
      workflowRequestCount: 0,
      stepCount: 0,
      startedAt: Date.now()
    });

    expect(reason).toBe("Run raw-context policy does not allow getStorageState.");
  });

  it("blocks out-of-scope automate preparation", () => {
    const reason = blockedToolReason({
      call: {
        tool: "prepareAutomateDraft",
        input: {
          draft: { method: "GET", url: "https://blocked.test/api?x={{payload:x}}", headers: {}, body: "" },
          payloads: ["admin"],
          rules: []
        }
      },
      allowlist: ["https://allowed.test"],
      policy: normalizeAgentPolicy(),
      profileId: "api-hardening",
      replayCount: 0,
      workflowRequestCount: 0,
      stepCount: 0,
      startedAt: Date.now()
    });

    expect(reason).toContain("Blocked out-of-scope URL");
  });
});
