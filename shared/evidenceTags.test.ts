import { describe, expect, it } from "vitest";
import {
  annotationContext,
  normalizeEvidenceAnnotation,
  normalizeEvidenceAnnotations
} from "./evidenceTags.js";

describe("evidenceTags", () => {
  it("normalizes tags and comments", () => {
    const annotation = normalizeEvidenceAnnotation({
      evidenceId: "cap-1",
      kind: "capture",
      tags: ["Review", " review ", "auth"],
      comment: " suspicious "
    });
    expect(annotation?.tags).toEqual(["review", "auth"]);
    expect(annotation?.comment).toBe("suspicious");
  });

  it("rejects invalid annotations", () => {
    expect(normalizeEvidenceAnnotation({ evidenceId: "" })).toBeNull();
    expect(normalizeEvidenceAnnotations(null)).toEqual([]);
    expect(normalizeEvidenceAnnotations([{ evidenceId: "" }])).toEqual([]);
  });

  it("builds query context maps", () => {
    const context = annotationContext([
      {
        evidenceId: "cap-1",
        kind: "capture",
        tags: ["review"],
        comment: "note",
        updatedAt: "now"
      },
      {
        evidenceId: "ws-1",
        kind: "websocket",
        tags: ["stream"],
        comment: "",
        updatedAt: "now"
      }
    ]);
    expect(context.tagsByEvidenceId["cap-1"]).toEqual(["review"]);
    expect(context.commentsByEvidenceId["cap-1"]).toBe("note");
    expect(context.commentsByEvidenceId["ws-1"]).toBeUndefined();
  });
});
