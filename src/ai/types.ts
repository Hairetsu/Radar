import type { CapturedRequest, WebSocketEvent } from "../../shared/domain";
import { DEFAULT_AI_SETTINGS } from "../../shared/ai-providers";

export type {
  AiAuditEntry,
  AiBrowserHelperOutput,
  AiCaptureSummaryOutput,
  AiConnectMeta,
  AiConnectPresetId,
  AiConnectProbe,
  AiConnectResult,
  AiContextPreview,
  AiCustomSkill,
  AiModelOption,
  AiCustomSkillOutput,
  AiProviderId,
  AiRepeaterDraftItem,
  AiRepeaterDraftsOutput,
  AiReportNotesOutput,
  AiRunRequest,
  AiRunResult,
  AiScopeChecklistOutput,
  AiSettings,
  AiTaskOutput,
  AiTaskType,
  AiTlsReviewOutput,
  AiViewContext,
  AiWorkView
} from "../../shared/ai-types";

import type { AiCustomSkill, AiTaskType, AiWorkView } from "../../shared/ai-types";

export const AI_TASK_META: Record<AiTaskType, { label: string; hint: string }> = {
  capture_summary: {
    label: "Capture Summary",
    hint: "Explain selected request/response and TLS signals"
  },
  repeater_drafts: {
    label: "Repeater Drafts",
    hint: "Suggest safe request variants — does not transmit"
  },
  scope_checklist: {
    label: "Scope Checklist",
    hint: "Manual test checklist within allowlist"
  },
  report_notes: {
    label: "Report Notes",
    hint: "Evidence notes with uncertainty markers"
  },
  browser_helper: {
    label: "Browser Helper",
    hint: "Suggested exploration steps — you confirm navigation"
  },
  tls_review: {
    label: "TLS Review",
    hint: "Review certificate events, trust failures, and proxy posture"
  }
};

export const AI_TASK_TYPES: AiTaskType[] = [
  "capture_summary",
  "repeater_drafts",
  "scope_checklist",
  "report_notes",
  "browser_helper",
  "tls_review"
];

export const VIEW_AI_TASKS: Record<AiWorkView, AiTaskType[]> = {
  traffic: ["capture_summary", "report_notes"],
  websocket: ["capture_summary", "report_notes"],
  intercept: ["capture_summary", "report_notes"],
  repeater: ["repeater_drafts"],
  automate: ["repeater_drafts"],
  findings: ["report_notes", "capture_summary"],
  workflows: ["scope_checklist", "report_notes"],
  plugins: ["report_notes"],
  advanced: ["capture_summary", "report_notes", "scope_checklist"],
  sitemap: ["capture_summary", "report_notes"],
  scope: ["scope_checklist", "browser_helper"],
  ssl: ["tls_review"]
};

export const VIEW_AI_LABELS: Record<AiWorkView, string> = {
  traffic: "Traffic analysis",
  websocket: "WebSocket analysis",
  intercept: "Intercept review",
  repeater: "Replay engineering",
  automate: "Automate preparation",
  findings: "Findings review",
  workflows: "Workflow planning",
  plugins: "Plugin review",
  advanced: "Advanced testing review",
  sitemap: "Sitemap coverage",
  scope: "Scope planning",
  ssl: "TLS & proxy review"
};

export { DEFAULT_AI_SETTINGS };

export type AiPaletteContext = {
  captureIds: string[];
  captures: CapturedRequest[];
  webSocketEventIds: string[];
  webSocketEvents: WebSocketEvent[];
  targets: string[];
  browserUrl: string;
};

export type AiPaletteSelection =
  | { kind: "builtin"; task: AiTaskType }
  | { kind: "custom"; skillId: string };

export function skillsForView(skills: AiCustomSkill[], view: AiWorkView) {
  return skills.filter((skill) => skill.views.includes(view));
}

export function defaultSelection(view: AiWorkView, skills: AiCustomSkill[]): AiPaletteSelection {
  const custom = skillsForView(skills, view)[0];
  if (custom) {
    return { kind: "custom", skillId: custom.id };
  }
  return { kind: "builtin", task: VIEW_AI_TASKS[view][0] };
}

export function selectionKey(selection: AiPaletteSelection) {
  return selection.kind === "custom" ? `custom:${selection.skillId}` : selection.task;
}

export function runPayloadFromSelection(
  selection: AiPaletteSelection
): Pick<import("../../shared/ai-types").AiRunRequest, "task" | "skillId"> {
  if (selection.kind === "custom") {
    return { task: "custom", skillId: selection.skillId };
  }
  return { task: selection.task };
}
