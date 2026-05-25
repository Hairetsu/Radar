import type { CapturedRequest, ReplayDraft } from "../types";

export type AiProviderId = "openai" | "anthropic" | "openai-compatible";

export type AiConnectPresetId = "codex" | "cursor_cli";

export type AiConnectMeta = {
  presetId: AiConnectPresetId;
  label: string;
  apiKeySource: string;
};

export type AiConnectProbe = {
  ok: boolean;
  message: string;
};

export type AiConnectResult = {
  settings: AiSettings;
  meta: AiConnectMeta;
  probe: AiConnectProbe;
};

export type AiTaskType =
  | "capture_summary"
  | "repeater_drafts"
  | "scope_checklist"
  | "report_notes"
  | "browser_helper";

export type AiSettings = {
  provider: AiProviderId;
  model: string;
  apiKey: string;
  baseUrl: string;
};

export type AiRunRequest = {
  task: AiTaskType;
  captureIds: string[];
  includeRaw: boolean;
  userPrompt?: string;
};

export type AiContextPreview = {
  captureCount: number;
  charCount: number;
  previewText: string;
  redacted: boolean;
  blockedReason?: string;
};

export type AiCaptureSummaryOutput = {
  summary: string;
  observations: string[];
  uncertainties: string[];
};

export type AiRepeaterDraftItem = {
  label: string;
  rationale: string;
  draft: ReplayDraft;
};

export type AiRepeaterDraftsOutput = {
  drafts: AiRepeaterDraftItem[];
};

export type AiScopeChecklistOutput = {
  items: Array<{ title: string; steps: string[] }>;
};

export type AiReportNotesOutput = {
  notes: string;
  evidenceRefs: string[];
  uncertainties: string[];
};

export type AiBrowserStep = {
  label: string;
  action: "navigate" | "observe";
  url?: string;
};

export type AiBrowserHelperOutput = {
  steps: AiBrowserStep[];
};

export type AiTaskOutput =
  | { task: "capture_summary"; data: AiCaptureSummaryOutput }
  | { task: "repeater_drafts"; data: AiRepeaterDraftsOutput }
  | { task: "scope_checklist"; data: AiScopeChecklistOutput }
  | { task: "report_notes"; data: AiReportNotesOutput }
  | { task: "browser_helper"; data: AiBrowserHelperOutput };

export type AiRunResult = {
  ok: boolean;
  auditId: string;
  error?: string;
  rawText?: string;
  output?: AiTaskOutput;
};

export type AiAuditEntry = {
  id: string;
  createdAt: string;
  task: AiTaskType;
  provider: AiProviderId;
  model: string;
  captureIds: string[];
  redacted: boolean;
  promptChars: number;
  resultChars: number;
  ok: boolean;
  error?: string;
};

export const AI_TASK_META: Record<
  AiTaskType,
  { label: string; hint: string }
> = {
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
