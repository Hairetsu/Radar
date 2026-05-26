import { describe, expect, it } from "vitest";
import { blockedToolReason, normalizeAgentPolicy } from "./policy.js";

describe("agent policy", () => {
  it("normalizes autonomous limits", () => {
    expect(
      normalizeAgentPolicy({
        maxRuntimeMs: 1,
        maxSteps: 999,
        maxReplay: -1,
        maxCaptureSample: 500,
        allowRawContext: true
      })
    ).toEqual({
      maxRuntimeMs: 10000,
      maxSteps: 40,
      maxReplay: 0,
      maxCaptureSample: 100,
      allowRawContext: true
    });
  });

  it("blocks out-of-scope network actions", () => {
    const reason = blockedToolReason({
      call: { tool: "navigateBrowser", input: { url: "https://blocked.test" } },
      allowlist: ["https://allowed.test"],
      policy: normalizeAgentPolicy(),
      replayCount: 0,
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
      policy: normalizeAgentPolicy({ maxReplay: 1 }),
      replayCount: 1,
      stepCount: 0,
      startedAt: Date.now()
    });

    expect(reason).toBe("Autonomous run exceeded its replay budget.");
  });
});

