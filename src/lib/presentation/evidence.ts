import type { CapturedRequest } from "../../types";

export function interceptEvidenceText(
  capture: CapturedRequest | null
) {
  if (!capture?.intercept?.length) {
    return "";
  }
  return capture.intercept
    .map((record) => {
      const resolved = record.resolvedAt
        ? ` -> ${record.resolvedAt}`
        : "";
      const edited = record.edited ? " edited" : "";
      return `${record.stage}: ${record.resolution}${edited} (${record.queuedAt}${resolved})${
        record.note ? `\n${record.note}` : ""
      }`;
    })
    .join("\n");
}

export function rewriteEvidenceText(
  capture: CapturedRequest | null
) {
  if (!capture?.rewrites?.length) {
    return "";
  }
  return capture.rewrites
    .map(
      (hit) =>
        `${hit.stage} rewrite: ${hit.name} (${hit.target}; ${hit.detail})`
    )
    .join("\n");
}

export function evidenceMetadataText(
  capture: CapturedRequest | null
) {
  const text = [
    interceptEvidenceText(capture),
    rewriteEvidenceText(capture)
  ]
    .filter(Boolean)
    .join("\n");
  return text ? `\n${text}` : "";
}
