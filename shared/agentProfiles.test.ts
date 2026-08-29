import { describe, expect, it } from "vitest";
import {
  agentBudgetLabels,
  agentProfileAllowsTool,
  agentRunAllowsTool,
  getAgentRunProfile,
  getAgentBudgetExhaustion,
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
      allowRawContext: false,
      maxProbeRequests: 0
    });
    const legacyPolicy = normalizeAgentPolicy({ maxParallelWorkers: 99 } as Parameters<typeof normalizeAgentPolicy>[0] & { maxParallelWorkers: number }, "passive-map");
    expect(legacyPolicy).not.toHaveProperty("maxParallelWorkers");
    expect(normalizeAgentPolicy({ tutorialMode: "true" as never }, "passive-map").tutorialMode).toBeUndefined();
  });

  it("enforces profile-specific tool access", () => {
    expect(agentProfileAllowsTool("browser-assessment", "clickElement")).toBe(true);
    expect(agentProfileAllowsTool("browser-assessment", "runWorkflow")).toBe(true);
    expect(getAgentRunProfile("browser-assessment").policy.maxReplay).toBe(3);
    expect(getAgentRunProfile("browser-assessment").policy.maxRuntimeMs).toBe(600000);
    expect(agentProfileAllowsTool("header-cookie-review", "analyzeSecurityHeaders")).toBe(true);
    expect(agentProfileAllowsTool("header-cookie-review", "prepareWorkflowDraft")).toBe(false);
    expect(agentProfileAllowsTool("advanced-api-review", "runWorkflow")).toBe(true);
    expect(getAgentRunProfile("advanced-api-review").capabilityCeiling).toMatchObject({
      maxRiskTier: "active",
      maxConcurrency: 1
    });
    expect(getAgentRunProfile("passive-map").capabilityCeiling.maxRiskTier).toBe("navigate");
  });

  it("arms autonomous assessment with experiment tools and a probe budget", () => {
    const profile = getAgentRunProfile("autonomous-assessment");
    expect(profile.policy.maxProbeRequests).toBe(40);
    expect(profile.allowedTools).toEqual(expect.arrayContaining([
      "openBrowser",
      "navigateBrowser",
      "waitForNetworkIdle",
      "getAssessmentCandidates",
      "runReplayExperiment",
      "getAssessmentProgress"
    ]));
    expect(profile.allowedTools).not.toContain("runWorkflow");
    expect(profile.allowedTools).not.toContain("submitForm");
    expect(profile.allowedTools).not.toContain("sendReplay");
    expect(profile.allowedTools).not.toContain("clickElement");
    expect(profile.capabilityCeiling.maxDurationMs).toBe(600_000);
  });

  it("gives goal-driven assessment the largest bounded active budget", () => {
    const profile = getAgentRunProfile("goal-driven-assessment");

    expect(normalizeAgentRunProfileId("goal-driven-assessment")).toBe("goal-driven-assessment");
    expect(profile.policy).toMatchObject({
      maxRuntimeMs: 600_000,
      maxSteps: 40,
      maxReplay: 10,
      maxWorkflowRequests: 10,
      maxCaptureSample: 100
    });
    expect(profile.allowedTools).toEqual(expect.arrayContaining([
      "submitForm",
      "sendReplay",
      "runWorkflow",
      "saveAuthState",
      "loadAuthState",
      "listAuthStates",
      "compareAuthStates"
    ]));
    expect(profile.capabilityCeiling).toMatchObject({
      maxRiskTier: "active",
      maxUses: 40,
      maxRequests: 10,
      maxConcurrency: 1
    });
  });

  it("hides raw browser-state tools unless the run explicitly allows raw context", () => {
    expect(agentRunAllowsTool("auth-review", { allowRawContext: false }, "getStorageState")).toBe(false);
    expect(agentRunAllowsTool("auth-review", { allowRawContext: false }, "getCookies")).toBe(false);
    expect(agentRunAllowsTool("auth-review", { allowRawContext: false }, "getIdentityLabContext")).toBe(true);
    expect(agentRunAllowsTool("auth-review", { allowRawContext: true }, "getStorageState")).toBe(true);
  });

  it("identifies sealed runtime and step budgets", () => {
    expect(getAgentBudgetExhaustion({
      policy: { ...getAgentRunProfile("browser-assessment").policy, maxRuntimeMs: 300000 },
      checkpoint: {
        startUrl: "https://example.test",
        targetOrigin: "https://example.test",
        stepCount: 19,
        replayCount: 0,
        workflowRequestCount: 0,
        elapsedMs: 332763,
        lastResumedAt: "2026-07-19T00:00:00.000Z"
      },
      error: "Agent exceeded its runtime budget."
    })).toEqual({ kind: "runtime", used: 332763, limit: 300000 });
    expect(getAgentBudgetExhaustion({
      policy: { ...getAgentRunProfile("passive-map").policy, maxSteps: 8 },
      checkpoint: {
        startUrl: "https://example.test",
        targetOrigin: "https://example.test",
        stepCount: 8,
        replayCount: 0,
        workflowRequestCount: 0,
        elapsedMs: 1000,
        lastResumedAt: "2026-07-19T00:00:00.000Z"
      }
    })).toEqual({ kind: "steps", used: 8, limit: 8 });
  });

  it("formats visible budget labels", () => {
    const labels = agentBudgetLabels({ ...getAgentRunProfile("advanced-api-review").policy, tutorialMode: true });
    expect(labels).toContain("workflow 2");
    expect(labels).toContain("captures 90");
    expect(labels.some((label) => label.startsWith("recon "))).toBe(false);
    expect(labels).toContain("raw context off");
    expect(labels).toContain("tutorial paced");
  });
});
