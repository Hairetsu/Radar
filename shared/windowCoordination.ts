import type { AppMode, AgentWorkbenchView } from "./agent-types.js";

export const RADAR_WINDOW_ROLES = ["workspace", "ai-operator"] as const;
export type RadarWindowRole = (typeof RADAR_WINDOW_ROLES)[number];

export const AI_OPERATOR_SECTIONS = ["runs", "settings"] as const;
export type AiOperatorSection = (typeof AI_OPERATOR_SECTIONS)[number];

export type WorkspaceSelectionRef = {
  kind: "capture" | "websocket" | "finding" | "workflow" | "automate";
  id: string;
  label: string;
};

export type WorkspaceContextSnapshot = {
  revision: number;
  mode: AppMode;
  activeView: AgentWorkbenchView;
  project: { id: string; name: string } | null;
  session: { id: string; name: string } | null;
  browser: { open: boolean; url: string; title: string };
  selection: WorkspaceSelectionRef | null;
  executingRunId: string;
  attentionCount: number;
};

export type WorkspaceControlIntent =
  | { type: "show-view"; view: AgentWorkbenchView }
  | { type: "propose-scope-origin"; origin: string; reason: string }
  | { type: "reveal-evidence"; ref: WorkspaceSelectionRef }
  | { type: "reveal-timeline-target"; runId: string; entryId: string }
  | { type: "show-notice"; message: string }
  | { type: "focus-workspace" };

export type WorkspaceIntentResult = {
  ok: boolean;
  error?: string;
};

export type AiOperatorWindowState = {
  created: boolean;
  visible: boolean;
  focused: boolean;
  section: AiOperatorSection;
};

export type AgentChangedEvent = {
  runId: string;
  revision: number;
};

export type AppModeChangedEvent = {
  mode: AppMode;
  revision: number;
};

export type AiConnectionSummary = {
  connected: boolean;
  checking: boolean;
  provider: string;
  model: string;
  message: string;
  revision: number;
};

export const WINDOW_CHANNELS = {
  openAiOperator: "window:ai-operator:open",
  getAiOperatorState: "window:ai-operator:state:get",
  aiOperatorStateChanged: "window:ai-operator:state:changed",
  getAppMode: "window:mode:get",
  setAppMode: "window:mode:set",
  appModeChanged: "window:mode:changed",
  publishWorkspaceContext: "window:workspace:context:publish",
  getWorkspaceContext: "window:workspace:context:get",
  workspaceContextChanged: "window:workspace:context:changed",
  dispatchWorkspaceIntent: "window:workspace:intent:dispatch",
  workspaceIntent: "window:workspace:intent",
  focusWorkspace: "window:workspace:focus",
  agentChanged: "agent:changed",
  aiConnectionChanged: "ai:connection:changed"
} as const;

const VIEW_IDS: AgentWorkbenchView[] = [
  "traffic",
  "websocket",
  "intercept",
  "repeater",
  "automate",
  "findings",
  "workflows",
  "plugins",
  "advanced",
  "sitemap",
  "scope",
  "ssl"
];

const SELECTION_KINDS: WorkspaceSelectionRef["kind"][] = [
  "capture",
  "websocket",
  "finding",
  "workflow",
  "automate"
];

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function text(value: unknown, max: number) {
  return String(value || "").trim().slice(0, max);
}

function nonNegativeInteger(value: unknown, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.round(numeric)) : fallback;
}

export function normalizeRadarWindowRole(value: unknown): RadarWindowRole | null {
  return RADAR_WINDOW_ROLES.includes(value as RadarWindowRole)
    ? value as RadarWindowRole
    : null;
}

export function normalizeAiOperatorSection(value: unknown): AiOperatorSection {
  return AI_OPERATOR_SECTIONS.includes(value as AiOperatorSection)
    ? value as AiOperatorSection
    : "runs";
}

export function normalizeAppMode(value: unknown): AppMode {
  return value === "ai-first" ? "ai-first" : "manual-first";
}

export function normalizeWorkspaceSelectionRef(value: unknown): WorkspaceSelectionRef | null {
  const input = record(value);
  if (!input || !SELECTION_KINDS.includes(input.kind as WorkspaceSelectionRef["kind"])) {
    return null;
  }
  const id = text(input.id, 160);
  if (!id) {
    return null;
  }
  return {
    kind: input.kind as WorkspaceSelectionRef["kind"],
    id,
    label: text(input.label, 240) || id
  };
}

function normalizeEntityLabel(value: unknown) {
  const input = record(value);
  if (!input) {
    return null;
  }
  const id = text(input.id, 160);
  const name = text(input.name, 240);
  return id && name ? { id, name } : null;
}

export function normalizeWorkspaceContextSnapshot(value: unknown): WorkspaceContextSnapshot | null {
  const input = record(value);
  const browser = record(input?.browser);
  const activeView = text(input?.activeView, 32) as AgentWorkbenchView;
  if (!input || !browser || !VIEW_IDS.includes(activeView)) {
    return null;
  }
  return {
    revision: nonNegativeInteger(input.revision),
    mode: normalizeAppMode(input.mode),
    activeView,
    project: normalizeEntityLabel(input.project),
    session: normalizeEntityLabel(input.session),
    browser: {
      open: Boolean(browser.open),
      url: text(browser.url, 2_048),
      title: text(browser.title, 240)
    },
    selection: normalizeWorkspaceSelectionRef(input.selection),
    executingRunId: text(input.executingRunId, 160),
    attentionCount: Math.min(nonNegativeInteger(input.attentionCount), 999)
  };
}

function normalizedOrigin(value: unknown) {
  const candidate = text(value, 2_048);
  try {
    const url = new URL(candidate);
    return url.protocol === "http:" || url.protocol === "https:" ? url.origin : "";
  } catch {
    return "";
  }
}

export function normalizeWorkspaceControlIntent(value: unknown): WorkspaceControlIntent | null {
  const input = record(value);
  const type = text(input?.type, 48);
  if (!input) {
    return null;
  }
  if (type === "focus-workspace") {
    return { type };
  }
  if (type === "show-view") {
    const view = text(input.view, 32) as AgentWorkbenchView;
    return VIEW_IDS.includes(view) ? { type, view } : null;
  }
  if (type === "propose-scope-origin") {
    const origin = normalizedOrigin(input.origin);
    return origin
      ? { type, origin, reason: text(input.reason, 500) || "AI Operator proposed a Scope origin." }
      : null;
  }
  if (type === "reveal-evidence") {
    const ref = normalizeWorkspaceSelectionRef(input.ref);
    return ref ? { type, ref } : null;
  }
  if (type === "reveal-timeline-target") {
    const runId = text(input.runId, 160);
    const entryId = text(input.entryId, 160);
    return runId && entryId ? { type, runId, entryId } : null;
  }
  if (type === "show-notice") {
    const message = text(input.message, 500);
    return message ? { type, message } : null;
  }
  return null;
}
