import { describe, expect, it } from "vitest";
import { availableToolNames, normalizeAgentToolCall, toolSchemas } from "./tools.js";

describe("agent tools", () => {
  it("exposes tool schemas for planner context", () => {
    expect(availableToolNames()).toEqual(
      expect.arrayContaining([
        "openBrowser",
        "getDomSummary",
        "getClickableElements",
        "clickElement",
        "fillInput",
        "saveAuthState",
        "compareAuthStates",
        "analyzeSecurityHeaders",
        "waitForNetworkIdle",
        "getCaptures",
        "getInterceptQueue",
        "prepareInterceptEdit",
        "sendReplay",
        "getReplayContext",
        "prepareReplayTab",
        "compareReplayResults",
        "getAutomateContext",
        "prepareAutomateDraft",
        "analyzeAutomateResults",
        "getWorkflowCatalog",
        "runWorkflow",
        "getPluginInventory",
        "getAdvancedTestingSummary"
      ])
    );
    expect(toolSchemas()).toHaveProperty("getDomSummary");
    expect(availableToolNames()).not.toEqual(expect.arrayContaining(["installPlugin", "approvePlugin", "runPluginApiAction"]));
  });

  it("normalizes observation tool inputs", () => {
    expect(normalizeAgentToolCall({ tool: "waitForNetworkIdle", input: { idleMs: 1, timeoutMs: 999999 } })).toEqual({
      tool: "waitForNetworkIdle",
      input: { idleMs: 100, timeoutMs: 30000 }
    });
    expect(normalizeAgentToolCall({ tool: "getDomSummary", input: {} })).toEqual({ tool: "getDomSummary", input: {} });
    expect(normalizeAgentToolCall({ tool: "fillInput", input: { selector: "#email", value: 123 } })).toEqual({
      tool: "fillInput",
      input: { selector: "#email", value: "123" }
    });
    expect(normalizeAgentToolCall({ tool: "compareAuthStates", input: { left: " guest ", right: " admin " } })).toEqual({
      tool: "compareAuthStates",
      input: { left: "guest", right: "admin" }
    });
    expect(normalizeAgentToolCall({ tool: "getInterceptQueue", input: { limit: 999 } })).toEqual({
      tool: "getInterceptQueue",
      input: { limit: 100 }
    });
    expect(
      normalizeAgentToolCall({
        tool: "prepareInterceptEdit",
        input: {
          id: " intercept-1 ",
          draft: { method: "POST", url: "https://allowed.test/login", headers: { A: 1 }, body: "x" },
          note: "load this mutation"
        }
      })
    ).toEqual({
      tool: "prepareInterceptEdit",
      input: {
        id: "intercept-1",
        draft: { method: "POST", url: "https://allowed.test/login", headers: { A: "1" }, body: "x" },
        response: undefined,
        note: "load this mutation"
      }
    });
    expect(
      normalizeAgentToolCall({
        tool: "prepareReplayTab",
        input: {
          name: " Auth ",
          draft: { method: "GET", url: "https://allowed.test/profile", headers: { A: 1 }, body: "" },
          environmentId: " env-1 ",
          note: "review this"
        }
      })
    ).toEqual({
      tool: "prepareReplayTab",
      input: {
        name: "Auth",
        draft: { method: "GET", url: "https://allowed.test/profile", headers: { A: "1" }, body: "" },
        environmentId: "env-1",
        note: "review this"
      }
    });
    expect(
      normalizeAgentToolCall({
        tool: "compareReplayResults",
        input: { leftHistoryId: " left ", rightHistoryId: " right ", tabId: " tab-1 " }
      })
    ).toEqual({
      tool: "compareReplayResults",
      input: { leftHistoryId: "left", rightHistoryId: "right", tabId: "tab-1" }
    });
    expect(normalizeAgentToolCall({ tool: "getReplayContext", input: {} })).toEqual({
      tool: "getReplayContext",
      input: {}
    });
    expect(
      normalizeAgentToolCall({
        tool: "prepareAutomateDraft",
        input: {
          name: " Roles ",
          draft: { method: "GET", url: "https://allowed.test/api?role={{payload:role}}", headers: { A: 1 }, body: "" },
          payloads: [" admin ", ""],
          rules: [{ id: "status", name: "OK", target: "status", status: 200 }],
          note: "review payload run"
        }
      })
    ).toEqual({
      tool: "prepareAutomateDraft",
      input: {
        name: "Roles",
        draft: { method: "GET", url: "https://allowed.test/api?role={{payload:role}}", headers: { A: "1" }, body: "" },
        payloads: [" admin "],
        rules: [
          expect.objectContaining({
            id: "status",
            name: "OK",
            target: "status",
            status: 200
          })
        ],
        environmentId: "",
        note: "review payload run"
      }
    });
    expect(normalizeAgentToolCall({ tool: "analyzeAutomateResults", input: { sessionId: " auto-1 " } })).toEqual({
      tool: "analyzeAutomateResults",
      input: { sessionId: "auto-1" }
    });
    expect(normalizeAgentToolCall({ tool: "getWorkflowCatalog", input: { ignored: true } })).toEqual({
      tool: "getWorkflowCatalog",
      input: {}
    });
    expect(normalizeAgentToolCall({ tool: "getPluginInventory", input: { ignored: true } })).toEqual({
      tool: "getPluginInventory",
      input: {}
    });
    expect(normalizeAgentToolCall({ tool: "getAdvancedTestingSummary", input: { ignored: true } })).toEqual({
      tool: "getAdvancedTestingSummary",
      input: {}
    });
    expect(
      normalizeAgentToolCall({
        tool: "runWorkflow",
        input: { workflowId: " workflow-1 ", inputs: { "capture-id": " cap-1 ", long: 123 } }
      })
    ).toEqual({
      tool: "runWorkflow",
      input: { workflowId: "workflow-1", inputs: { "capture-id": " cap-1 ", long: "123" } }
    });
  });

  it("rejects unsafe url shapes before policy checks", () => {
    expect(() => normalizeAgentToolCall({ tool: "openBrowser", input: { url: "hairetsu.com" } })).toThrow(
      "explicit http(s) URL"
    );
  });
});
