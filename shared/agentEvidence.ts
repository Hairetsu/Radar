import type { AgentRun } from "./agent-types.js";
import type {
  AutomateSession,
  CapturedRequest,
  ReplayHistoryEntry,
  ReplayTab,
  WebSocketEvent,
  WorkflowRun
} from "./domain.js";

export const AGENT_EVIDENCE_KINDS = ["capture", "websocket", "replay", "automate", "workflow", "ai"] as const;

export type AgentEvidenceKind = (typeof AGENT_EVIDENCE_KINDS)[number];

export type AgentEvidenceCatalog = ReadonlySet<string>;

type EvidenceId = { id: string };

type CatalogReplayTab = Pick<ReplayTab, "id"> & {
  history: ReadonlyArray<Pick<ReplayHistoryEntry, "id">>;
};

type CatalogAutomateSession = Pick<AutomateSession, "id"> & {
  results: ReadonlyArray<EvidenceId>;
};

type CatalogWorkflowRun = Pick<WorkflowRun, "id"> & {
  results: ReadonlyArray<EvidenceId>;
};

type CatalogAgentRun = Pick<AgentRun, "id"> & {
  timeline: ReadonlyArray<EvidenceId>;
};

export type AgentEvidenceCatalogInput = {
  captures?: ReadonlyArray<Pick<CapturedRequest, "id">>;
  webSocketEvents?: ReadonlyArray<Pick<WebSocketEvent, "id">>;
  replayTabState?: { tabs: ReadonlyArray<CatalogReplayTab> } | null;
  automateSessions?: ReadonlyArray<CatalogAutomateSession>;
  workflowRuns?: ReadonlyArray<CatalogWorkflowRun>;
  agentRuns?: ReadonlyArray<CatalogAgentRun>;
};

export type AgentEvidenceRefResolution =
  | { ok: true; key: string; kind: AgentEvidenceKind }
  | {
      ok: false;
      code: "malformed" | "unsupported" | "missing";
      ref: string;
      message: string;
    };

const MAX_EVIDENCE_KEY = 180;
const evidenceKindSet = new Set<string>(AGENT_EVIDENCE_KINDS);

function isEvidenceKind(value: string): value is AgentEvidenceKind {
  return evidenceKindSet.has(value);
}

function validSegment(value: string) {
  return Boolean(value) && !/[:\s]/.test(value);
}

function validSegmentCount(kind: AgentEvidenceKind, count: number) {
  if (kind === "capture" || kind === "websocket") {
    return count === 1;
  }
  return count === 1 || count === 2;
}

export function canonicalAgentEvidenceKey(kind: AgentEvidenceKind, ...segments: string[]) {
  if (!validSegmentCount(kind, segments.length) || segments.some((segment) => !validSegment(segment))) {
    return null;
  }
  const key = `${kind}:${segments.join(":")}`;
  return key.length <= MAX_EVIDENCE_KEY ? key : null;
}

function addKey(catalog: Set<string>, kind: AgentEvidenceKind, ...segments: string[]) {
  const key = canonicalAgentEvidenceKey(kind, ...segments);
  if (key) {
    catalog.add(key);
  }
}

export function buildAgentEvidenceCatalog(input: AgentEvidenceCatalogInput): AgentEvidenceCatalog {
  const catalog = new Set<string>();

  for (const capture of input.captures || []) {
    addKey(catalog, "capture", capture.id);
  }
  for (const event of input.webSocketEvents || []) {
    addKey(catalog, "websocket", event.id);
  }
  for (const tab of input.replayTabState?.tabs || []) {
    addKey(catalog, "replay", tab.id);
    for (const entry of tab.history) {
      addKey(catalog, "replay", entry.id);
      addKey(catalog, "replay", tab.id, entry.id);
    }
  }
  for (const session of input.automateSessions || []) {
    addKey(catalog, "automate", session.id);
    for (const result of session.results) {
      addKey(catalog, "automate", session.id, result.id);
    }
  }
  for (const run of input.workflowRuns || []) {
    addKey(catalog, "workflow", run.id);
    for (const result of run.results) {
      addKey(catalog, "workflow", run.id, result.id);
    }
  }
  for (const run of input.agentRuns || []) {
    addKey(catalog, "ai", run.id);
    for (const entry of run.timeline) {
      addKey(catalog, "ai", run.id, entry.id);
    }
  }

  return catalog;
}

export function resolveAgentEvidenceRef(
  value: unknown,
  catalog: AgentEvidenceCatalog
): AgentEvidenceRefResolution {
  const ref = typeof value === "string" ? value.trim() : "";
  const separator = ref.indexOf(":");
  if (!ref || separator <= 0) {
    return {
      ok: false,
      code: "malformed",
      ref,
      message: `evidence reference "${ref || "(empty)"}" is malformed`
    };
  }

  const kind = ref.slice(0, separator);
  if (!isEvidenceKind(kind)) {
    return {
      ok: false,
      code: "unsupported",
      ref,
      message: `evidence reference "${ref}" uses an unsupported kind`
    };
  }

  const segments = ref.slice(separator + 1).split(":");
  const key = canonicalAgentEvidenceKey(kind, ...segments);
  if (!key) {
    return {
      ok: false,
      code: "malformed",
      ref,
      message: `evidence reference "${ref}" is malformed`
    };
  }
  if (!catalog.has(key)) {
    return {
      ok: false,
      code: "missing",
      ref: key,
      message: `evidence reference "${key}" is not present in the local evidence catalog`
    };
  }
  return { ok: true, key, kind };
}
