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
          uncertainties: []
        }
      ]
    });
  });

  it("rejects invalid decisions", () => {
    expect(() => normalizeAgentDecision({ action: "tool", tool: "deleteEverything" })).toThrow("Invalid agent tool");
    expect(() => normalizeAgentDecision({ action: "wait" })).toThrow("action=tool or action=finish");
  });
});
