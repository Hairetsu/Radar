import type { ReplayDraft, SslEvent } from "./domain.js";

export type AiProviderId = "openai" | "anthropic" | "openai-compatible" | "codex-local" | "cursor-local";

export type AiConnectPresetId = "codex" | "cursor_cli";

export type AiWorkView = "traffic" | "websocket" | "intercept" | "repeater" | "sitemap" | "scope" | "ssl";

export type AiSettings = {
  provider: AiProviderId;
  model: string;
  apiKey: string;
  baseUrl: string;
};

export type AiModelOption = {
  id: string;
  label: string;
};

export type AiTaskType =
  | "capture_summary"
  | "repeater_drafts"
  | "scope_checklist"
  | "report_notes"
  | "browser_helper"
  | "tls_review";

export type AiCustomSkill = {
  id: string;
  label: string;
  hint: string;
  instructions: string;
  views: AiWorkView[];
  createdAt: string;
};

export type AiViewContext = {
  view?: AiWorkView;
  draft?: ReplayDraft;
  lastResponse?: {
    status: number;
    statusText: string;
    body: string;
  };
  targets?: string[];
  sslEvents?: SslEvent[];
  proxyRunning?: boolean;
  proxyUrl?: string;
  caCertPath?: string;
};

export type AiRunRequest = {
  task: AiTaskType | "custom";
  skillId?: string;
  view?: AiWorkView;
  captureIds: string[];
  webSocketEventIds?: string[];
  includeRaw: boolean;
  userPrompt?: string;
  viewContext?: AiViewContext;
};

export type AiAuditEntry = {
  id: string;
  createdAt: string;
  task: AiTaskType | "custom";
  skillId?: string;
  provider: AiProviderId;
  model: string;
  captureIds: string[];
  webSocketEventIds?: string[];
  redacted: boolean;
  promptChars: number;
  resultChars: number;
  ok: boolean;
  error?: string;
};

export type AiContextPreview = {
  captureCount: number;
  webSocketEventCount?: number;
  charCount: number;
  previewText: string;
  redacted: boolean;
  blockedReason?: string;
};

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

export type AiCaptureSummaryOutput = {
  summary: string;
  observations: string[];
  uncertainties: string[];
};

export type AiRepeaterDraftItem = {
  label: string;
  rationale: string;
  draft: {
    method: string;
    url: string;
    headers: Record<string, string>;
    body: string;
  };
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

export type AiTlsReviewOutput = {
  summary: string;
  findings: string[];
  recommendations: string[];
};

export type AiCustomSkillOutput = {
  skillId: string;
  label: string;
  text: string;
};

export type AiTaskOutput =
  | { task: "capture_summary"; data: AiCaptureSummaryOutput }
  | { task: "repeater_drafts"; data: AiRepeaterDraftsOutput }
  | { task: "scope_checklist"; data: AiScopeChecklistOutput }
  | { task: "report_notes"; data: AiReportNotesOutput }
  | { task: "browser_helper"; data: AiBrowserHelperOutput }
  | { task: "tls_review"; data: AiTlsReviewOutput }
  | { task: "custom"; data: AiCustomSkillOutput };

export type AiRunResult = {
  ok: boolean;
  auditId: string;
  error?: string;
  rawText?: string;
  output?: AiTaskOutput;
};

export type ProbeSettingsInput = AiSettings & {
  presetId?: AiConnectPresetId;
};
