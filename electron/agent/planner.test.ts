import { describe, expect, it } from "vitest";
import type { AgentDecisionContext } from "../../shared/agent-types.js";
import { createAgentCapabilityState } from "../../shared/agentCapabilities.js";
import { createAgentMission } from "../../shared/agentMission.js";
import { DEFAULT_AGENT_POLICY } from "../../shared/agentProfiles.js";
import { buildAgentUserPrompt, normalizeAgentDecision } from "./planner.js";

describe("agent planner", () => {
  it("builds a redacted, budgeted planner context", () => {
    const context: AgentDecisionContext = {
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
      policy: { ...DEFAULT_AGENT_POLICY, maxSteps: 10, maxReplay: 2, maxWorkflowRequests: 3 },
      profile: "browser-assessment",
      stepCount: 2,
      replayCount: 1,
      workflowRequestCount: 1,
      availableTools: ["getCaptures"],
      capturedTraffic: [
        {
          id: "capture-1",
          method: "GET",
          url: "https://target.example/account",
          status: 200,
          statusText: "OK",
          type: "Fetch",
          mimeType: "application/json",
          source: "browser",
          requestHeaders: { Authorization: "Bearer secret" },
          responseHeaders: { "set-cookie": "session=secret" },
          requestBodyPreview: "password=secret",
          responseBodyPreview: "token=secret"
        }
      ],
      contextSummary: {
        generatedAt: "2026-07-31T00:00:00.000Z",
        sitemap: { hostCount: 0, endpointCount: 0, topHosts: [] },
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
      reconReports: [{
        id: "recon-1",
        focus: "surface-map",
        label: "Surface map",
        status: "completed",
        summary: "Observed one account endpoint.",
        observations: ["GET /account returned 200."],
        evidenceRefs: ["capture:capture-1"],
        gaps: ["Authentication state is unknown."],
        startedAt: "2026-07-31T00:00:00.000Z",
        completedAt: "2026-07-31T00:00:01.000Z"
      }],
      tutorialMode: false,
      timeline: [
        {
          id: "timeline-1",
          createdAt: "2026-07-31T00:00:00.000Z",
          toolResult: {
            tool: "getCaptures",
            ok: true,
            data: { captures: [] }
          }
        }
      ]
    };

    const prompt = JSON.parse(buildAgentUserPrompt(context)) as Record<string, unknown>;
    expect(prompt).toMatchObject({
      budgetRemaining: { toolCalls: 8, replay: 1, workflowRequests: 2 },
      capturedTraffic: [
        {
          requestHeaders: { Authorization: "[REDACTED]" },
          responseHeaders: { "set-cookie": "[REDACTED]" }
        }
      ],
      mission: { revision: 0 },
      capabilities: { revision: 0 },
      reconReports: [{
        id: "recon-1",
        focus: "surface-map",
        status: "completed",
        evidenceRefs: ["capture:capture-1"]
      }]
    });
  });
  it("normalizes tool decisions", () => {
    expect(
      normalizeAgentDecision(
        {
          action: "tool",
          tool: "openBrowser",
          input: { url: "https://hairetsu.com" },
          rationale: "Open target"
        }
      )
    ).toEqual({
      action: "tool",
      call: { tool: "openBrowser", input: { url: "https://hairetsu.com" } },
      rationale: "Open target"
    });
  });

  it("keeps getCaptures unfiltered by default so redirects stay visible", () => {
    expect(
      normalizeAgentDecision(
        {
          action: "tool",
          tool: "getCaptures",
          input: { limit: 20 }
        }
      )
    ).toEqual({
      action: "tool",
      call: { tool: "getCaptures", input: { limit: 20, targetOrigin: "" } },
      rationale: ""
    });
  });

  it("normalizes browser interaction decisions", () => {
    expect(
      normalizeAgentDecision(
        {
          action: "tool",
          tool: "clickElement",
          input: { selector: "#login" }
        }
      )
    ).toEqual({
      action: "tool",
      call: { tool: "clickElement", input: { selector: "#login" } },
      rationale: ""
    });
  });

  it("normalizes advertised read-only and prepare-only context tools", () => {
    expect(
      normalizeAgentDecision({
        action: "tool",
        tool: "getAdvancedTestingSummary",
        input: { ignored: true }
      })
    ).toEqual({
      action: "tool",
      call: { tool: "getAdvancedTestingSummary", input: {} },
      rationale: ""
    });

    expect(
      normalizeAgentDecision({
        action: "tool",
        tool: "getPluginInventory",
        input: { ignored: true }
      })
    ).toEqual({
      action: "tool",
      call: { tool: "getPluginInventory", input: {} },
      rationale: ""
    });

    expect(
      normalizeAgentDecision({
        action: "tool",
        tool: "prepareTrafficQuery",
        input: { query: "method:POST", reason: "Review API posts" }
      })
    ).toEqual({
      action: "tool",
      call: { tool: "prepareTrafficQuery", input: { query: "method:POST", reason: "Review API posts" } },
      rationale: ""
    });
  });

  it("normalizes prepare-only intercept decisions", () => {
    expect(
      normalizeAgentDecision({
        action: "tool",
        tool: "prepareInterceptEdit",
        input: {
          id: "intercept-1",
          response: { status: 401, statusText: "Unauthorized", headers: { "content-type": "application/json" }, body: "{\"ok\":false}" },
          note: "Load a visible response denial draft."
        }
      })
    ).toEqual({
      action: "tool",
      call: {
        tool: "prepareInterceptEdit",
        input: {
          id: "intercept-1",
          draft: undefined,
          response: {
            status: 401,
            statusText: "Unauthorized",
            headers: { "content-type": "application/json" },
            body: "{\"ok\":false}"
          },
          note: "Load a visible response denial draft."
        }
      },
      rationale: ""
    });
  });

  it("normalizes finish decisions", () => {
    expect(
      normalizeAgentDecision(
        {
          action: "finish",
          rationale: "Done",
          findings: [{ title: "Missing HSTS", confidence: "medium", evidenceRefs: ["capture:1"], notes: "Review manually." }]
        }
      )
    ).toEqual({
      action: "finish",
      rationale: "Done",
      findings: [
        {
          title: "Missing HSTS",
          confidence: "medium",
          evidenceRefs: ["capture:1"],
          notes: "Review manually.",
          affectedAssets: [],
          reproductionNotes: "",
          severityRationale: "",
          remediation: "",
          uncertainties: []
        }
      ]
    });
  });

  it("normalizes tutorial guidance and downgrades incomplete CVE claims", () => {
    expect(
      normalizeAgentDecision({
        action: "tool",
        tool: "getDomSummary",
        input: {},
        rationale: "Map the visible surface.",
        tutorial: {
          stage: "observe",
          title: "Map trust boundaries",
          clue: "The account page exposes an object identifier.",
          whyItMatters: "Identifiers can reveal where authorization needs to be tested.",
          lookFor: ["IDs that change between accounts"],
          strongerEvidence: ["A response comparison under two identities"],
          falsifiers: ["The identifier is only a public display value"],
          safeNextStep: "Capture the page under the current identity.",
          disposition: "cve-review",
          dispositionRationale: "Needs product-level validation.",
          evidenceRefs: []
        }
      })
    ).toMatchObject({
      action: "tool",
      tutorial: { title: "Map trust boundaries", disposition: "vendor-report" }
    });
  });

  it("normalizes revision-checked mission patches with decisions", () => {
    expect(
      normalizeAgentDecision({
        action: "tool",
        tool: "getSitemapCoverage",
        input: {},
        missionPatch: {
          baseRevision: 4,
          updates: [
            {
              kind: "hypothesis",
              id: "hyp-authz",
              objectiveId: "obj-primary",
              statement: "Authorization may be inconsistent.",
              status: "testing",
              pinned: true
            }
          ]
        }
      })
    ).toEqual({
      action: "tool",
      call: { tool: "getSitemapCoverage", input: { limit: 12 } },
      rationale: "",
      missionPatch: {
        baseRevision: 4,
        updates: [
          {
            kind: "hypothesis",
            id: "hyp-authz",
            objectiveId: "obj-primary",
            statement: "Authorization may be inconsistent.",
            status: "testing"
          }
        ]
      }
    });
  });

  it("normalizes a bounded capability lease request without granting it", () => {
    expect(
      normalizeAgentDecision({
        action: "tool",
        tool: "sendReplay",
        input: { draft: { method: "GET", url: "https://api.target.test/v1/invoices/817", headers: {}, body: "" } },
        leaseRequest: {
          name: "Invoice comparison",
          riskTier: "active",
          tools: ["sendReplay"],
          grants: [{ origin: "https://api.target.test/path", method: "get", pathPrefix: "v1/invoices/", identity: "user-b" }],
          durationMs: 120000,
          maxUses: 1,
          maxRequests: 1,
          maxConcurrency: 1,
          maxPayloadBytes: 1024,
          reason: "Compare one invoice under the challenger identity."
        }
      })
    ).toMatchObject({
      action: "tool",
      call: { tool: "sendReplay" },
      leaseRequest: {
        name: "Invoice comparison",
        riskTier: "active",
        tools: ["sendReplay"],
        grants: [
          { origin: "https://api.target.test", method: "GET", pathPrefix: "/v1/invoices/", identity: "user-b" }
        ]
      }
    });
  });

  it("rejects invalid decisions", () => {
    expect(() => normalizeAgentDecision({ action: "tool", tool: "deleteEverything" })).toThrow("Invalid agent tool");
    expect(() => normalizeAgentDecision({ action: "wait" })).toThrow("action=tool or action=finish");
    expect(() =>
      normalizeAgentDecision({
        action: "finish",
        missionPatch: { baseRevision: 0, updates: [{ kind: "unknown" }] }
      })
    ).toThrow("missionPatch was invalid");
    expect(() =>
      normalizeAgentDecision({
        action: "tool",
        tool: "sendReplay",
        input: { draft: { method: "DELETE", url: "https://api.target.test/v1/invoices/817", headers: {}, body: "" } },
        leaseRequest: { ...{}, riskTier: "destructive" }
      })
    ).toThrow("leaseRequest was invalid");
    expect(() =>
      normalizeAgentDecision({
        action: "finish",
        leaseRequest: {
          name: "Invalid finish request",
          riskTier: "navigate",
          tools: ["openBrowser"],
          grants: [{ origin: "https://target.test", method: "GET", pathPrefix: "/", identity: "current" }],
          durationMs: 60000,
          maxUses: 1,
          maxRequests: 1,
          maxConcurrency: 1,
          maxPayloadBytes: 0,
          reason: "Finish decisions cannot request authority."
        }
      })
    ).toThrow("finish decisions cannot request");
  });
});
