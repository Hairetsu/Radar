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
      allowRawContext: false
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
