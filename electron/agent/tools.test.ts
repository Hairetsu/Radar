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
        "sendReplay"
      ])
    );
    expect(toolSchemas()).toHaveProperty("getDomSummary");
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
  });

  it("rejects unsafe url shapes before policy checks", () => {
    expect(() => normalizeAgentToolCall({ tool: "openBrowser", input: { url: "hairetsu.com" } })).toThrow(
      "explicit http(s) URL"
    );
  });
});
