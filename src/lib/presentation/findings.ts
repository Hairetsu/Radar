import type {
  Finding,
  FindingConfidence,
  FindingReportPreset,
  FindingSeverity,
  FindingStatus
} from "../../types";
import type { StatusTone } from "./statusTone";

export const findingSeverities: FindingSeverity[] = [
  "info",
  "low",
  "medium",
  "high",
  "critical"
];
export const findingConfidences: FindingConfidence[] = [
  "low",
  "medium",
  "high"
];
export const findingStatuses: FindingStatus[] = [
  "draft",
  "needs-evidence",
  "reviewed",
  "accepted-risk",
  "fixed-pending-retest",
  "retest-passed",
  "retest-failed"
];
export const findingReportPresets: FindingReportPreset[] = [
  "client-report",
  "internal-notes",
  "raw-technical-appendix"
];

export function findingSeverityTone(
  severity: FindingSeverity
): StatusTone {
  if (severity === "critical" || severity === "high") {
    return "danger";
  }
  if (severity === "medium") {
    return "warn";
  }
  if (severity === "low") {
    return "move";
  }
  return "ghost";
}

export function findingStatusTone(
  status: FindingStatus
): StatusTone {
  if (status === "reviewed" || status === "retest-passed") {
    return "good";
  }
  if (status === "retest-failed") {
    return "danger";
  }
  if (
    status === "accepted-risk" ||
    status === "needs-evidence"
  ) {
    return "warn";
  }
  if (status === "fixed-pending-retest") {
    return "move";
  }
  return "ghost";
}

export function findingEvidenceText(finding: Finding | null) {
  if (!finding) {
    return "";
  }
  return finding.evidence
    .map((ref) => {
      const metadata = Object.entries(ref.metadata)
        .filter(([, value]) => Boolean(value))
        .map(([key, value]) => `${key}=${value}`)
        .join(", ");
      return metadata
        ? `${ref.kind}:${ref.id} - ${ref.label} (${metadata})`
        : `${ref.kind}:${ref.id} - ${ref.label}`;
    })
    .join("\n");
}
