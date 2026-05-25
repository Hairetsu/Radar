import { describe, expect, it } from "vitest";
const { systemPrompt, TASK_INSTRUCTIONS } = require("./tasks.cjs");

describe("tasks", () => {
  it("defines all task instructions", () => {
    expect(Object.keys(TASK_INSTRUCTIONS)).toEqual([
      "capture_summary",
      "repeater_drafts",
      "scope_checklist",
      "report_notes",
      "browser_helper"
    ]);
  });

  it("builds defensive system prompt", () => {
    const prompt = systemPrompt("capture_summary");
    expect(prompt).toContain("defensive web security assistant");
    expect(prompt).toContain("Return JSON only");
    expect(prompt).toContain("Summarize the selected HTTP captures");
  });

  it("falls back to capture_summary for unknown task", () => {
    expect(systemPrompt("unknown")).toContain("Summarize the selected HTTP captures");
  });
});
