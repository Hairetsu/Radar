import type {
  ProjectBundleRedactionProfile
} from "../../types";

export const bundleRedactionOptions: Array<{
  id: ProjectBundleRedactionProfile;
  label: string;
}> = [
  { id: "redacted-evidence", label: "Redacted Evidence" },
  { id: "metadata-only", label: "Metadata Only" },
  { id: "reviewed-findings", label: "Reviewed Findings" },
  { id: "raw-evidence", label: "Raw Evidence" }
];

export function bundleStatsLine(stats: {
  sessions: number;
  captures: number;
  webSocketEvents: number;
  findings: number;
  workflows: number;
  projectNotes: number;
  savedViews: number;
  proposedTargets: number;
}) {
  return `${stats.sessions} sessions / ${stats.captures} req / ${stats.webSocketEvents} ws / ${stats.findings} findings / ${stats.workflows} workflows / ${stats.projectNotes} notes / ${stats.savedViews} views / ${stats.proposedTargets} targets`;
}

export function handoffStatsLine(stats: {
  findings: number;
  captures: number;
  webSocketEvents: number;
  workflows: number;
  replayCollections: number;
  projectNotes: number;
  targets: number;
}) {
  return `${stats.findings} findings / ${stats.captures} req / ${stats.webSocketEvents} ws / ${stats.workflows} workflows / ${stats.replayCollections} collections / ${stats.projectNotes} notes / ${stats.targets} targets`;
}
