import type { ReplayDraft, ReplayResult, BrowserState, CapturedRequest } from "./domain.js";

export type AppMode = "manual-first" | "ai-first";

export type AgentWorkbenchView = "traffic" | "repeater" | "scope" | "ssl";

export type AgentRunStatus = "queued" | "running" | "paused" | "stopped" | "completed" | "failed";

export type AgentToolName =
  | "showView"
  | "getBrowserState"
  | "openBrowser"
  | "navigateBrowser"
  | "getCaptures"
  | "sendReplay";

export type AgentToolCall =
  | { tool: "showView"; input: { view: AgentWorkbenchView; reason: string } }
  | { tool: "getBrowserState"; input: Record<string, never> }
  | { tool: "openBrowser"; input: { url: string } }
  | { tool: "navigateBrowser"; input: { url: string } }
  | { tool: "getCaptures"; input: { limit?: number } }
  | { tool: "sendReplay"; input: { draft: ReplayDraft } };

export type AgentToolResult =
  | { tool: "showView"; ok: true; data: { view: AgentWorkbenchView } }
  | { tool: "getBrowserState"; ok: true; data: BrowserState }
  | { tool: "openBrowser"; ok: true; data: BrowserState }
  | { tool: "navigateBrowser"; ok: true; data: BrowserState }
  | { tool: "getCaptures"; ok: true; data: { captures: CapturedRequest[] } }
  | { tool: "sendReplay"; ok: true; data: ReplayResult }
  | { tool: AgentToolName; ok: false; error: string };

export type AgentTimelineEntry = {
  id: string;
  createdAt: string;
  note?: string;
  toolCall?: AgentToolCall;
  toolResult?: AgentToolResult;
};

export type AgentFinding = {
  id: string;
  createdAt: string;
  title: string;
  confidence: "low" | "medium" | "high";
  evidenceRefs: string[];
  notes: string;
  uncertainties: string[];
};

export type AgentPolicy = {
  maxRuntimeMs: number;
  maxSteps: number;
  maxReplay: number;
  maxCaptureSample: number;
  allowRawContext: boolean;
};

export type AgentRunRequest = {
  goal: string;
  startUrl?: string;
  policy?: Partial<AgentPolicy>;
};

export type AgentRun = {
  id: string;
  sessionId: string;
  createdAt: string;
  updatedAt: string;
  goal: string;
  status: AgentRunStatus;
  policy: AgentPolicy;
  timeline: AgentTimelineEntry[];
  findings: AgentFinding[];
  error?: string;
};

