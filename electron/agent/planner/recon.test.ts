import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentDecisionContext } from "../../../shared/agent-types.js";
import { createAgentCapabilityState } from "../../../shared/agentCapabilities.js";
import { createAgentMission } from "../../../shared/agentMission.js";
import { DEFAULT_AGENT_POLICY } from "../../../shared/agentProfiles.js";
import { complete } from "../../ai/providers.js";
import { createAiReconPlanner } from "./recon.js";

vi.mock("../../ai/providers.js", () => ({ complete: vi.fn() }));
vi.mock("../../ai/settings.js", () => ({
  loadSettings: vi.fn(() => ({
    provider: "codex-local",
    model: "auto",
    apiKey: "local",
    baseUrl: "codex://local"
  }))
}));

function context(): AgentDecisionContext {
  return {
    goal: "Inspect the scoped target",
    startUrl: "https://target.example/",
    targetOrigin: "https://target.example",
    allowlist: ["https://target.example"],
    browserState: {
      open: true,
      url: "https://target.example/",
      title: "Target",
      loading: false,
      engine: "chrome"
    },
    policy: { ...DEFAULT_AGENT_POLICY, maxRuntimeMs: 600_000 },
    profile: "browser-assessment",
    stepCount: 1,
    replayCount: 0,
    workflowRequestCount: 0,
    availableTools: ["getCaptures"],
    capturedTraffic: [{
      id: "capture-1",
      method: "GET",
      url: "https://target.example/api/account",
      status: 200,
      statusText: "OK",
      type: "Fetch",
      mimeType: "application/json",
      source: "browser",
      requestHeaders: { Authorization: "Bearer secret" },
      responseHeaders: { "set-cookie": "session=secret" },
      requestBodyPreview: "password=secret",
      responseBodyPreview: "token=secret"
    }],
    contextSummary: {
      generatedAt: "2026-08-04T00:00:00.000Z",
      sitemap: { hostCount: 1, endpointCount: 1, topHosts: [] },
      findings: [],
      advanced: {
        graphQlOperations: 0,
        imports: 0,
        authRows: 0,
        parameters: 0,
        secrets: 0,
        headerSignals: 0
      },
      workflows: { definitions: [], recentRuns: [] },
      projectArtifacts: { notes: [], savedViews: [] },
      runMemory: []
    },
    runMemory: [],
    mission: createAgentMission("Inspect the scoped target", "https://target.example/"),
    capabilities: createAgentCapabilityState(),
    tutorialMode: false,
    timeline: []
  };
}

describe("recon planner", () => {
  beforeEach(() => {
    vi.mocked(complete).mockReset();
  });

  it("runs four redacted read-only assignments concurrently and normalizes handoffs", async () => {
    vi.mocked(complete).mockResolvedValue({
      text: "{}",
      parsed: {
        summary: "Observed the scoped account API.",
        observations: ["GET /api/account returned 200."],
        evidenceRefs: ["capture:capture-1", "capture:unknown"],
        gaps: ["Authentication state is unknown."]
      }
    });

    const reports = await createAiReconPlanner("/tmp/radar-recon-test")(context(), 4);

    expect(reports).toHaveLength(4);
    expect(reports.map((report) => report.focus)).toEqual([
      "surface-map",
      "headers-cookies",
      "auth-session",
      "api-workflows"
    ]);
    expect(reports[0]).toMatchObject({
      status: "completed",
      evidenceRefs: ["capture:capture-1"]
    });
    expect(complete).toHaveBeenCalledTimes(4);
    const request = vi.mocked(complete).mock.calls[0]?.[0];
    expect(request?.timeoutMs).toBe(75_000);
    expect(request?.system).toContain("read-only recon worker");
    expect(request?.user).toContain('"Authorization": "[REDACTED]"');
    expect(request?.user).not.toContain("Bearer secret");
  });

  it("returns a failed overview handoff instead of rejecting the recon wave", async () => {
    vi.mocked(complete).mockRejectedValue(new Error("provider unavailable"));

    const reports = await createAiReconPlanner("/tmp/radar-recon-test")(context(), 1);

    expect(reports).toEqual([
      expect.objectContaining({
        focus: "scoped-overview",
        status: "failed",
        error: "provider unavailable"
      })
    ]);
  });

  it("uses balanced surface, auth, and API lanes for three workers", async () => {
    vi.mocked(complete).mockResolvedValue({
      text: "{}",
      parsed: { summary: "Reviewed.", observations: [], evidenceRefs: [], gaps: [] }
    });

    const reports = await createAiReconPlanner("/tmp/radar-recon-test")(context(), 3);

    expect(reports.map((report) => report.focus)).toEqual([
      "surface-map",
      "auth-hardening",
      "api-workflows"
    ]);
  });
});
