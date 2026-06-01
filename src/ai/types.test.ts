import { describe, expect, it } from "vitest";
import { AI_TASK_META, VIEW_AI_TASKS } from "./types";

describe("ai types", () => {
  it("defines all task metadata", () => {
    expect(Object.keys(AI_TASK_META)).toHaveLength(6);
    expect(AI_TASK_META.capture_summary.label).toBe("Capture Summary");
  });

  it("maps tasks to views", () => {
    expect(VIEW_AI_TASKS.traffic).toEqual(["capture_summary", "report_notes"]);
    expect(VIEW_AI_TASKS.automate).toEqual(["repeater_drafts"]);
    expect(VIEW_AI_TASKS.ssl).toEqual(["tls_review"]);
  });

  it("provides default ai settings", () => {
    expect(AI_TASK_META.tls_review.label).toBe("TLS Review");
  });
});
