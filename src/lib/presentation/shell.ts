import type { MouseEvent } from "react";
import type { GlobalSearchResult } from "../../types";
import type { RequestExportFormat } from "../requestExport";

export const requestExportFormats: RequestExportFormat[] = [
  "curl",
  "bash",
  "python",
  "fetch",
  "raw"
];

export function contextMenuPosition(
  event: MouseEvent<HTMLElement>
) {
  const menuWidth = 264;
  const menuHeight = 404;
  const viewportWidth = window.innerWidth || 1024;
  const viewportHeight = window.innerHeight || 768;
  return {
    x: Math.max(
      12,
      Math.min(event.clientX, viewportWidth - menuWidth - 12)
    ),
    y: Math.max(
      12,
      Math.min(event.clientY, viewportHeight - menuHeight - 12)
    )
  };
}

export function testIdSuffix(format: RequestExportFormat) {
  return (
    format.slice(0, 1).toUpperCase() + format.slice(1)
  );
}

export function clampAiDrawerWidth(
  width: number,
  viewportWidth: number
) {
  return Math.max(
    420,
    Math.min(width, Math.min(820, viewportWidth - 280))
  );
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
    return entry.toolCall.tool === "showView"
      ? "Workbench tab changed"
      : `${entry.toolCall.tool} requested`;
  }
  return entry.note || "Agent step";
}

export function recoveryActionLabel(
  action:
    | "retry-tool"
    | "retry-with-evidence"
    | "skip-and-continue"
    | "stop-run"
    | "draft-finding"
) {
  if (action === "retry-tool") return "Retry Tool";
  if (action === "retry-with-evidence") return "Refresh Evidence";
  if (action === "skip-and-continue") return "Skip / Continue";
  if (action === "draft-finding") return "Draft Finding";
  return "Stop Run";
}

export function globalSearchKindLabel(
  kind: GlobalSearchResult["kind"]
) {
  return kind
    .split("-")
    .map(
      (part) =>
        part.slice(0, 1).toUpperCase() + part.slice(1)
    )
    .join(" ");
}
