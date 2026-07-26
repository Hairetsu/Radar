import type { MouseEvent } from "react";
import { bodyPreview } from "./text";
import { formatHeaders } from "./headers";
import type { RequestExportFormat } from "./requestExport";
import type { CapturedRequest, WebSocketDirection, WebSocketEvent } from "../types";
import type {
  Finding,
  FindingConfidence,
  FindingReportPreset,
  FindingSeverity,
  FindingStatus,
  GlobalSearchResult,
  ProjectBundleRedactionProfile,
  WorkflowDefinition,
  WorkflowResultLevel,
  PluginInstallStatus
} from "../types";

export type StatusTone = "good" | "warn" | "danger" | "move" | "ghost";

export const findingSeverities: FindingSeverity[] = ["info", "low", "medium", "high", "critical"];
export const findingConfidences: FindingConfidence[] = ["low", "medium", "high"];
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

export const bundleRedactionOptions: Array<{ id: ProjectBundleRedactionProfile; label: string }> = [
  { id: "redacted-evidence", label: "Redacted Evidence" },
  { id: "metadata-only", label: "Metadata Only" },
  { id: "reviewed-findings", label: "Reviewed Findings" },
  { id: "raw-evidence", label: "Raw Evidence" }
];

export const requestExportFormats: RequestExportFormat[] = ["curl", "bash", "python", "fetch", "raw"];

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

export function findingSeverityTone(severity: FindingSeverity): StatusTone {
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

export function findingStatusTone(status: FindingStatus): StatusTone {
  if (status === "reviewed" || status === "retest-passed") {
    return "good";
  }
  if (status === "retest-failed") {
    return "danger";
  }
  if (status === "accepted-risk" || status === "needs-evidence") {
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
      return metadata ? `${ref.kind}:${ref.id} - ${ref.label} (${metadata})` : `${ref.kind}:${ref.id} - ${ref.label}`;
    })
    .join("\n");
}

export function workflowResultTone(level: WorkflowResultLevel): StatusTone {
  if (level === "pass") {
    return "good";
  }
  if (level === "fail") {
    return "danger";
  }
  if (level === "warn") {
    return "warn";
  }
  return "ghost";
}

export function pluginStatusTone(status: PluginInstallStatus): StatusTone {
  if (status === "approved") {
    return "good";
  }
  if (status === "pending") {
    return "warn";
  }
  if (status === "blocked") {
    return "danger";
  }
  return "ghost";
}

export function pluginTrustTone(trust: string): StatusTone {
  if (trust === "first-party") {
    return "good";
  }
  if (trust === "verified-local") {
    return "move";
  }
  if (trust === "untrusted") {
    return "danger";
  }
  return "ghost";
}

export function validationTone(severity: string): StatusTone {
  return severity === "error" ? "danger" : "warn";
}

export function diffTone(kind: string): StatusTone {
  if (kind === "added") {
    return "good";
  }
  if (kind === "removed") {
    return "danger";
  }
  return "move";
}

export function advancedSignalTone(severity: string): StatusTone {
  if (severity === "high") {
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

export function workflowDefinitionText(workflow: WorkflowDefinition | null) {
  if (!workflow) {
    return "";
  }
  return JSON.stringify(
    {
      id: workflow.builtIn ? `${workflow.id}-custom` : workflow.id,
      name: workflow.name,
      description: workflow.description,
      mode: workflow.mode,
      scope: workflow.scope,
      inputs: workflow.inputs,
      steps: workflow.steps
    },
    null,
    2
  );
}

export function formatBytes(value: number) {
  if (value >= 1024 * 1024) {
    return `${(value / (1024 * 1024)).toFixed(1)}mb`;
  }
  if (value >= 1024) {
    return `${(value / 1024).toFixed(1)}kb`;
  }
  return `${value}b`;
}

export function websocketDirectionTone(direction: WebSocketDirection): StatusTone {
  if (direction === "received") {
    return "move";
  }
  if (direction === "sent") {
    return "good";
  }
  if (direction === "error") {
    return "danger";
  }
  if (direction === "closed") {
    return "warn";
  }
  return "ghost";
}

export function websocketFrameKind(event: WebSocketEvent) {
  if (event.direction === "handshake") {
    return event.status ? `HTTP ${event.status}` : "handshake";
  }
  if (event.direction === "closed") {
    return "closed";
  }
  if (event.direction === "error") {
    return "error";
  }
  if (event.opcode === 1) {
    return "text";
  }
  if (event.opcode === 2) {
    return "binary";
  }
  if (event.opcode === 8) {
    return "close";
  }
  if (event.opcode === 9) {
    return "ping";
  }
  if (event.opcode === 10) {
    return "pong";
  }
  return `op ${event.opcode ?? "?"}`;
}

export function websocketPayloadPreview(event: WebSocketEvent) {
  if (event.error) {
    return event.error;
  }
  if (event.payloadData) {
    return event.payloadData.replace(/\s+/g, " ").trim();
  }
  return event.statusText || event.direction;
}

export function websocketDetailText(event: WebSocketEvent | null) {
  if (!event) {
    return "";
  }
  return [
    `${event.direction.toUpperCase()} ${event.url}`,
    `ID: ${event.requestId}`,
    `Host: ${event.host}`,
    `Kind: ${websocketFrameKind(event)}`,
    `Size: ${formatBytes(event.size)}`,
    event.status ? `Status: ${event.status} ${event.statusText || ""}`.trim() : "",
    event.error ? `Error: ${event.error}` : "",
    event.initiator ? `Initiator: ${event.initiator}` : "",
    "",
    "Request headers:",
    formatHeaders(event.requestHeaders || {}),
    "",
    "Response headers:",
    formatHeaders(event.responseHeaders || {}),
    "",
    "Payload:",
    bodyPreview(event.payloadData)
  ]
    .filter((line, index, lines) => line || lines[index - 1] !== "")
    .join("\n");
}

export function interceptEvidenceText(capture: CapturedRequest | null) {
  if (!capture?.intercept?.length) {
    return "";
  }
  return capture.intercept
    .map((record) => {
      const resolved = record.resolvedAt ? ` -> ${record.resolvedAt}` : "";
      const edited = record.edited ? " edited" : "";
      return `${record.stage}: ${record.resolution}${edited} (${record.queuedAt}${resolved})${record.note ? `\n${record.note}` : ""}`;
    })
    .join("\n");
}

export function rewriteEvidenceText(capture: CapturedRequest | null) {
  if (!capture?.rewrites?.length) {
    return "";
  }
  return capture.rewrites
    .map((hit) => `${hit.stage} rewrite: ${hit.name} (${hit.target}; ${hit.detail})`)
    .join("\n");
}

export function evidenceMetadataText(capture: CapturedRequest | null) {
  const text = [interceptEvidenceText(capture), rewriteEvidenceText(capture)].filter(Boolean).join("\n");
  return text ? `\n${text}` : "";
}

export function contextMenuPosition(event: MouseEvent<HTMLElement>) {
  const menuWidth = 264;
  const menuHeight = 404;
  const viewportWidth = window.innerWidth || 1024;
  const viewportHeight = window.innerHeight || 768;
  return {
    x: Math.max(12, Math.min(event.clientX, viewportWidth - menuWidth - 12)),
    y: Math.max(12, Math.min(event.clientY, viewportHeight - menuHeight - 12))
  };
}

export function testIdSuffix(format: RequestExportFormat) {
  return format.slice(0, 1).toUpperCase() + format.slice(1);
}

export function clampAiDrawerWidth(width: number, viewportWidth: number) {
  return Math.max(420, Math.min(width, Math.min(820, viewportWidth - 280)));
}

export function timelineEntryText(entry: {
  note?: string;
  summary?: string;
  toolCall?: { tool: string };
  toolResult?: { tool: string; ok: boolean; error?: string };
}) {
  if (entry.summary) {
    return entry.summary;
  }
  if (entry.toolResult) {
    return entry.toolResult.ok
      ? `${entry.toolResult.tool} completed`
      : `${entry.toolResult.tool} blocked: ${entry.toolResult.error}`;
  }
  if (entry.toolCall) {
    if (entry.toolCall.tool === "showView") {
      return "Workbench tab changed";
    }
    return `${entry.toolCall.tool} requested`;
  }
  return entry.note || "Agent step";
}

export function recoveryActionLabel(
  action: "retry-tool" | "retry-with-evidence" | "skip-and-continue" | "stop-run" | "draft-finding"
) {
  if (action === "retry-tool") {
    return "Retry Tool";
  }
  if (action === "retry-with-evidence") {
    return "Refresh Evidence";
  }
  if (action === "skip-and-continue") {
    return "Skip / Continue";
  }
  if (action === "draft-finding") {
    return "Draft Finding";
  }
  return "Stop Run";
}

export function globalSearchKindLabel(kind: GlobalSearchResult["kind"]) {
  return kind
    .split("-")
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
}
