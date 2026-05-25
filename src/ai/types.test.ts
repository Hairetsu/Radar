import { describe, expect, it } from "vitest";
import { AI_TASK_META, DEFAULT_AI_SETTINGS } from "./types";

describe("ai types", () => {
  it("defines all task metadata", () => {
    expect(Object.keys(AI_TASK_META)).toHaveLength(5);
    expect(AI_TASK_META.capture_summary.label).toBe("Capture Summary");
  });

  it("provides default ai settings", () => {
    expect(DEFAULT_AI_SETTINGS.provider).toBe("openai");
    expect(DEFAULT_AI_SETTINGS.model).toBe("gpt-4o-mini");
  });
});
