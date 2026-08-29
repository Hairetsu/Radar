import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentDecisionContext } from "../../shared/agent-types.js";
import { createAgentCapabilityState } from "../../shared/agentCapabilities.js";
import { createAgentMission } from "../../shared/agentMission.js";
import { DEFAULT_AGENT_POLICY } from "../../shared/agentProfiles.js";

const providerMocks = vi.hoisted(() => ({
  complete: vi.fn(),
  loadSettings: vi.fn(() => ({
    provider: "codex-local" as const,
    model: "gpt-5.6-terra",
    apiKey: "local",
    baseUrl: ""
  }))
}));

vi.mock("../ai/providers.js", () => ({ complete: providerMocks.complete }));
vi.mock("../ai/settings.js", () => ({ loadSettings: providerMocks.loadSettings }));

import { createAiAgentPlanner } from "./planner.js";

function decisionContext(): AgentDecisionContext {
  return {
    goal: "Assess Harborline until Radar finds a supported result.",
    startUrl: "http://127.0.0.1:3000",
    targetOrigin: "http://127.0.0.1:3000",
    allowlist: ["http://127.0.0.1:3000"],
    browserState: { open: true, url: "http://127.0.0.1:3000", title: "Harborline", loading: false, engine: "chrome" },
    policy: { ...DEFAULT_AGENT_POLICY, maxProbeRequests: 40 },
    profile: "autonomous-assessment",
    stepCount: 2,
    replayCount: 0,
    workflowRequestCount: 0,
    probeRequestCount: 0,
    availableTools: ["getAssessmentCandidates", "runReplayExperiment", "getAssessmentProgress"],
    capturedTraffic: [],
    contextSummary: {
      generatedAt: "2026-08-27T00:00:00.000Z",
      sitemap: { hostCount: 0, endpointCount: 0, topHosts: [] },
      findings: [],
      advanced: { graphQlOperations: 0, imports: 0, authRows: 0, parameters: 0, secrets: 0, headerSignals: 0 },
      workflows: { definitions: [], recentRuns: [] },
      projectArtifacts: { notes: [], savedViews: [] },
      runMemory: []
    },
    runMemory: [],
    mission: createAgentMission("Assess Harborline"),
    capabilities: createAgentCapabilityState(),
    tutorialMode: false,
    timeline: []
  };
}

describe("AI agent planner provider boundary", () => {
  beforeEach(() => {
    providerMocks.complete.mockReset();
  });

  it("asks once for a corrected decision when a mutation location is incomplete", async () => {
    providerMocks.complete
      .mockResolvedValueOnce({
        text: "invalid location",
        parsed: {
          action: "tool",
          tool: "runReplayExperiment",
          input: {
            captureId: "capture-search",
            family: "injection-signal",
            hypothesis: "Search input may be interpreted as syntax.",
            location: { kind: "replace-query" }
          }
        }
      })
      .mockResolvedValueOnce({
        text: "corrected location",
        parsed: {
          action: "tool",
          tool: "runReplayExperiment",
          input: {
            captureId: "capture-search",
            family: "injection-signal",
            hypothesis: "Search input may be interpreted as syntax.",
            location: { kind: "replace-query", name: "q", value: "" }
          }
        }
      });

    const decision = await createAiAgentPlanner("/tmp/radar-planner-test")(decisionContext());

    expect(decision).toMatchObject({
      action: "tool",
      call: { tool: "runReplayExperiment", input: { location: { kind: "replace-query", name: "q" } } }
    });
    expect(providerMocks.complete).toHaveBeenCalledTimes(2);
    expect(providerMocks.complete.mock.calls[1]?.[0].user).toContain("previous JSON decision was rejected");
    expect(providerMocks.complete.mock.calls[1]?.[0].user).toContain("location.name is required");
  });
});
