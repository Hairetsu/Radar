import { describe, expect, it } from "vitest";
import {
  agentBudgetLabels,
  agentProfileAllowsTool,
  getAgentRunProfile,
  normalizeAgentPolicy,
  normalizeAgentRunProfileId
} from "./agentProfiles.js";

describe("agentProfiles", () => {
  it("normalizes profile ids and clamps profile policy", () => {
    expect(normalizeAgentRunProfileId("header-cookie-review")).toBe("header-cookie-review");
    expect(normalizeAgentRunProfileId("unknown")).toBe("api-hardening");
    expect(normalizeAgentPolicy({ maxSteps: 999, maxReplay: -3 }, "passive-map")).toEqual({
      maxRuntimeMs: 300000,
      maxSteps: 40,
      maxReplay: 0,
      maxWorkflowRequests: 0,
      maxCaptureSample: 80,
      allowRawContext: false
    });
  });

  it("enforces profile-specific tool access", () => {
    expect(agentProfileAllowsTool("header-cookie-review", "analyzeSecurityHeaders")).toBe(true);
    expect(agentProfileAllowsTool("header-cookie-review", "prepareWorkflowDraft")).toBe(false);
    expect(agentProfileAllowsTool("advanced-api-review", "runWorkflow")).toBe(true);
    expect(getAgentRunProfile("advanced-api-review").capabilityCeiling).toMatchObject({
      maxRiskTier: "active",
      maxConcurrency: 1
    });
    expect(getAgentRunProfile("passive-map").capabilityCeiling.maxRiskTier).toBe("navigate");
  });

  it("formats visible budget labels", () => {
    const labels = agentBudgetLabels(getAgentRunProfile("advanced-api-review").policy);
    expect(labels).toContain("workflow 2");
    expect(labels).toContain("raw context off");
  });
});
