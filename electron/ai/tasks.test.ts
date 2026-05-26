import type { AiTaskType } from "../../shared/ai-types.js";
import { describe, expect, it } from "vitest";
import { systemPrompt, customSkillPrompt, TASK_INSTRUCTIONS } from "./tasks.js";

describe("tasks", () => {
  it("defines all task instructions", () => {
    expect(Object.keys(TASK_INSTRUCTIONS)).toEqual([
      "capture_summary",
      "repeater_drafts",
      "scope_checklist",
      "report_notes",
      "browser_helper",
      "tls_review"
    ]);
  });

  it("builds defensive system prompt", () => {
    const prompt = systemPrompt("capture_summary");
    expect(prompt).toContain("defensive web security assistant");
    expect(prompt).toContain("Return JSON only");
    expect(prompt).toContain("Summarize the selected HTTP captures");
  });

  it("falls back to capture_summary for unknown task", () => {
    expect(systemPrompt("unknown" as AiTaskType)).toContain("Summarize the selected HTTP captures");
  });

  it("builds custom skill prompt", () => {
    const prompt = customSkillPrompt({
      id: "skill-1",
      label: "Header diff",
      hint: "Compare headers",
      instructions: "Compare auth headers across captures.",
      views: ["traffic"],
      createdAt: "2026-05-25T00:00:00.000Z"
    });
    expect(prompt).toContain("Header diff");
    expect(prompt).toContain("Compare auth headers");
  });
});
