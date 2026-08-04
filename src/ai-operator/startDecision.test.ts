import { describe, expect, it } from "vitest";
import { decideAgentRunStart } from "./startDecision";

describe("decideAgentRunStart", () => {
  it("rejects empty goals and unavailable workspaces", () => {
    expect(decideAgentRunStart({ goal: " ", browserUrl: "https://app.test", targets: ["https://app.test"], workspaceAvailable: true })).toEqual({
      type: "reject",
      reason: "Describe a goal before starting AI-First."
    });
    expect(decideAgentRunStart({ goal: "Inspect auth", browserUrl: "https://app.test", targets: ["https://app.test"], workspaceAvailable: false }).type).toBe("reject");
  });

  it("starts against a goal URL already covered by saved Scope", () => {
    expect(decideAgentRunStart({
      goal: "Inspect https://app.test/account",
      browserUrl: "",
      targets: ["https://app.test"],
      workspaceAvailable: true
    })).toEqual({
      type: "start",
      goal: "Inspect https://app.test/account",
      startUrl: "https://app.test/account"
    });
  });

  it("uses the visible browser address when the goal has no URL", () => {
    expect(decideAgentRunStart({
      goal: "Review the current session boundary",
      browserUrl: "https://app.test/dashboard",
      targets: ["https://app.test"],
      workspaceAvailable: true
    })).toMatchObject({ type: "start", startUrl: "https://app.test/dashboard" });
  });

  it("returns an unsaved Scope proposal for an uncovered origin", () => {
    expect(decideAgentRunStart({
      goal: "Inspect https://outside.test/admin",
      browserUrl: "https://app.test",
      targets: ["https://app.test"],
      workspaceAvailable: true
    })).toEqual({
      type: "propose-scope",
      origin: "https://outside.test",
      startUrl: "https://outside.test/admin"
    });
  });
});
