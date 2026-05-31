import type { EvidenceAnnotation } from "./domain.js";

const MAX_TAGS = 12;
const MAX_TAG = 40;
const MAX_COMMENT = 500;

function cleanText(value: unknown, max: number) {
  return String(value || "").trim().slice(0, max);
}

export function normalizeEvidenceAnnotation(
  input: Partial<EvidenceAnnotation>,
  now = new Date().toISOString()
): EvidenceAnnotation | null {
  const evidenceId = cleanText(input.evidenceId, 120);
  if (!evidenceId) {
    return null;
  }
  const kind = input.kind === "websocket" ? "websocket" : "capture";
  const tags = Array.isArray(input.tags)
    ? [...new Set(input.tags.map((tag) => cleanText(tag, MAX_TAG).toLowerCase()).filter(Boolean))].slice(0, MAX_TAGS)
    : [];
  return {
    evidenceId,
    kind,
    tags,
    comment: cleanText(input.comment, MAX_COMMENT),
    updatedAt: now
  };
}

export function normalizeEvidenceAnnotations(input: unknown, now = new Date().toISOString()) {
  if (!Array.isArray(input)) {
    return [];
  }
  return input
    .slice(0, 5000)
    .map((item) =>
      item && typeof item === "object" && !Array.isArray(item)
        ? normalizeEvidenceAnnotation(item as Partial<EvidenceAnnotation>, now)
        : null
    )
    .filter((item): item is EvidenceAnnotation => Boolean(item));
}

export function annotationContext(annotations: EvidenceAnnotation[]) {
  const tagsByEvidenceId: Record<string, string[]> = {};
  const commentsByEvidenceId: Record<string, string> = {};
  for (const annotation of annotations) {
    tagsByEvidenceId[annotation.evidenceId] = annotation.tags;
    if (annotation.comment.trim()) {
      commentsByEvidenceId[annotation.evidenceId] = annotation.comment;
    }
  }
  return { tagsByEvidenceId, commentsByEvidenceId };
}
