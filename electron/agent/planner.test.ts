import { describe, expect, it } from "vitest";
import { normalizeAgentDecision } from "./planner.js";

describe("agent planner", () => {
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
      call: { tool: "getSitemapCoverage", input: { limit: undefined } },
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
