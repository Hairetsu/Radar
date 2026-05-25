import { describe, expect, it } from "vitest";
import { AI_TASK_META, AI_TASK_TYPES, DEFAULT_AI_SETTINGS } from "./types";

describe("ai types", () => {
  it("defines all task metadata", () => {
    expect(Object.keys(AI_TASK_META)).toHaveLength(5);
    expect(AI_TASK_META.capture_summary.label).toBe("Capture Summary");
  });

  it("lists task types in stable order", () => {
    expect(AI_TASK_TYPES).toEqual([
      "capture_summary",
      "repeater_drafts",
      "scope_checklist",
      "report_notes",
      "browser_helper"
    ]);
  });

  it("provides default ai settings", () => {
    expect(DEFAULT_AI_SETTINGS.provider).toBe("openai");
    expect(DEFAULT_AI_SETTINGS.model).toBe("gpt-4o-mini");
  });
});
