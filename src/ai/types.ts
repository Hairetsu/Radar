import type { CapturedRequest } from "../../shared/domain";

export type {
  AiAuditEntry,
  AiBrowserHelperOutput,
  AiCaptureSummaryOutput,
  AiConnectMeta,
  AiConnectPresetId,
  AiConnectProbe,
  AiConnectResult,
  AiContextPreview,
  AiProviderId,
  AiRepeaterDraftItem,
  AiRepeaterDraftsOutput,
  AiReportNotesOutput,
  AiRunRequest,
  AiRunResult,
  AiScopeChecklistOutput,
  AiSettings,
  AiTaskOutput,
  AiTaskType
} from "../../shared/ai-types";

import type { AiSettings, AiTaskType } from "../../shared/ai-types";

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
  }
};

export const AI_TASK_TYPES: AiTaskType[] = [
  "capture_summary",
  "repeater_drafts",
  "scope_checklist",
  "report_notes",
  "browser_helper"
];

export const DEFAULT_AI_SETTINGS: AiSettings = {
  provider: "openai",
  model: "gpt-4o-mini",
  apiKey: "",
  baseUrl: "http://127.0.0.1:11434/v1"
};

export type AiPaletteContext = {
  captureIds: string[];
  captures: CapturedRequest[];
  targets: string[];
  browserUrl: string;
};
