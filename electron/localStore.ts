import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { DEFAULT_ALLOWLIST } from "../shared/allowlist.js";
import type { AgentFinding, AgentPolicy, AgentRun, AgentRunStatus, AgentTimelineEntry } from "../shared/agent-types.js";
import type { AiModelOption } from "../shared/ai-types.js";
import { sanitizeModelOption } from "../shared/ai-models.js";
import { defaultProxyProfiles, normalizeProxyProfile } from "../shared/proxyProfiles.js";
import type {
  AutomatePayloadSet,
  AutomateSession,
  CaptureInterceptRecord,
  CapturedRequest,
  EvidenceAnnotation,
  InterceptRule,
  LocalContext,
  LocalProfile,
  LocalSession,
  LocalSessionSummary,
  LocalWorkspace,
  MatchReplaceHit,
  MatchReplaceRule,
  ProxyProfile,
  ReplayCollection,
  ReplayEnvironment,
  ReplayTabState,
  SavedFilter,
  SslEvent,
  TlsDetails,
  WebSocketDirection,
  WebSocketEvent
} from "../shared/domain.js";
import {
  MAX_AUTOMATE_SESSIONS,
  normalizeAutomatePayloadSets,
  normalizeAutomateSession
} from "../shared/automate.js";
import { normalizeEvidenceAnnotation, normalizeEvidenceAnnotations } from "../shared/evidenceTags.js";
import { normalizeReplayCollections } from "../shared/replayCollections.js";
import { normalizeReplayEnvironments } from "../shared/replayVariables.js";
import { normalizeReplayTabState } from "../shared/replayTabs.js";
import { normalizeSavedFilters } from "../shared/savedFilters.js";

const SCHEMA_VERSION = "10";
const DEFAULT_PROFILE_NAME = "Local Operator";
const DEFAULT_WORKSPACE_NAME = "Default Workspace";
const MAX_NAME_LENGTH = 80;

type ProfileRow = {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
};

type WorkspaceRow = {
  id: string;
  profile_id: string;
  name: string;
  created_at: string;
  updated_at: string;
};

type SessionRow = {
  id: string;
  workspace_id: string;
  name: string;
  started_at: string;
  updated_at: string;
};

type SessionSummaryRow = SessionRow & {
  capture_count: number;
  ssl_event_count: number;
};

type CaptureRow = {
  id: string;
  started_at: string;
  method: string;
  url: string;
  host: string;
  path: string;
  request_headers_json: string;
  request_body: string;
  status: number | null;
  status_text: string;
  mime_type: string;
  resource_type: string;
  response_headers_json: string;
  response_body: string;
  duration_ms: number | null;
  encoded_data_length: number | null;
  allowed: number;
  source: CapturedRequest["source"];
  agent_run_id: string | null;
  navigation_id: string | null;
  frame_url: string | null;
  initiator: string | null;
  tls_json: string | null;
  intercept_json: string | null;
  rewrite_json: string | null;
};

type SslEventRow = {
  id: string;
  url: string;
  error: string;
  trusted: number;
  subject_name: string | null;
  issuer_name: string | null;
  created_at: string;
};

type WebSocketEventRow = {
  id: string;
  request_id: string;
  created_at: string;
  url: string;
  host: string;
  direction: WebSocketDirection;
  opcode: number | null;
  payload_data: string;
  size: number;
  status: number | null;
  status_text: string | null;
  error: string | null;
  request_headers_json: string;
  response_headers_json: string;
  initiator: string | null;
  allowed: number;
};

type AgentRunRow = {
  id: string;
  session_id: string;
  created_at: string;
  updated_at: string;
  goal: string;
  status: AgentRunStatus;
  policy_json: string;
  timeline_json: string;
  findings_json: string;
  error: string | null;
};

type InterceptRuleRow = {
  rule_json: string;
};

type MatchReplaceRuleRow = {
  rule_json: string;
};

type ProxyProfileRow = {
  profile_id: string;
  notes: string;
  updated_at: string;
};

function nowIso() {
  return new Date().toISOString();
}

function createId(prefix: string) {
  return `${prefix}_${randomUUID()}`;
}

function defaultSessionName(createdAt = nowIso()) {
  return `Session ${createdAt.slice(0, 16).replace("T", " ")}`;
}

function normalizeName(value: string | undefined, fallback: string) {
  const next = String(value || "").trim().replace(/\s+/g, " ").slice(0, MAX_NAME_LENGTH);
  return next || fallback;
}

function parseRecordJson(value: string): Record<string, string> {
  try {
    const parsed: unknown = JSON.parse(value || "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    return Object.fromEntries(
      Object.entries(parsed).map(([key, entry]) => [key, typeof entry === "string" ? entry : String(entry)])
    );
  } catch {
    return {};
  }
}

function parseTlsJson(value: string | null): TlsDetails | null {
  if (!value) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    const tls = parsed as Partial<Record<keyof TlsDetails, unknown>>;
    return {
      protocol: typeof tls.protocol === "string" ? tls.protocol : "",
      issuer: typeof tls.issuer === "string" ? tls.issuer : "",
      subjectName: typeof tls.subjectName === "string" ? tls.subjectName : "",
      validFrom: typeof tls.validFrom === "number" ? tls.validFrom : Number(tls.validFrom || 0),
      validTo: typeof tls.validTo === "number" ? tls.validTo : Number(tls.validTo || 0)
    };
  } catch {
    return null;
  }
}

function parseInterceptJson(value: string | null): CaptureInterceptRecord[] | undefined {
  if (!value) {
    return undefined;
  }
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      return undefined;
    }
    const records: CaptureInterceptRecord[] = [];
    for (const entry of parsed) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        continue;
      }
      const record = entry as Partial<Record<keyof CaptureInterceptRecord, unknown>>;
      const stage = record.stage === "response" ? "response" : "request";
      const resolution =
        record.resolution === "forwarded" ||
        record.resolution === "dropped" ||
        record.resolution === "edited" ||
        record.resolution === "resumed"
          ? record.resolution
          : "queued";
      const queuedAt = typeof record.queuedAt === "string" ? record.queuedAt : "";
      if (!queuedAt) {
        continue;
      }
      const nextRecord: CaptureInterceptRecord = {
        stage,
        queuedAt,
        resolution,
        edited: Boolean(record.edited)
      };
      if (typeof record.resolvedAt === "string") {
        nextRecord.resolvedAt = record.resolvedAt;
      }
      if (typeof record.note === "string") {
        nextRecord.note = record.note;
      }
      if (Array.isArray(record.ruleHits)) {
        nextRecord.ruleHits = record.ruleHits
          .map((hit) => {
            if (!hit || typeof hit !== "object" || Array.isArray(hit)) {
              return null;
            }
            const item = hit as Record<string, unknown>;
            return {
              ruleId: String(item.ruleId || ""),
              name: String(item.name || ""),
              reason: String(item.reason || "")
            };
          })
          .filter((hit): hit is NonNullable<CaptureInterceptRecord["ruleHits"]>[number] =>
            Boolean(hit?.ruleId && hit.name)
          );
      }
      records.push(nextRecord);
    }
    return records.length > 0 ? records : undefined;
  } catch {
    return undefined;
  }
}

function parseRewriteJson(value: string | null): MatchReplaceHit[] | undefined {
  if (!value) {
    return undefined;
  }
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      return undefined;
    }
    const hits = parsed
      .map((entry) => {
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
          return null;
        }
        const hit = entry as Partial<Record<keyof MatchReplaceHit, unknown>>;
        const stage = hit.stage === "response" ? "response" : "request";
        const target = hit.target === "header" ? "header" : "body";
        const ruleId = String(hit.ruleId || "");
        const name = String(hit.name || "");
        if (!ruleId || !name) {
          return null;
        }
        return {
          ruleId,
          name,
          stage,
          target,
          detail: String(hit.detail || "")
        };
      })
      .filter((hit): hit is MatchReplaceHit => Boolean(hit));
    return hits.length > 0 ? hits : undefined;
  } catch {
    return undefined;
  }
}

function parseJsonArray<T>(value: string, fallback: T[] = []) {
  try {
    const parsed: unknown = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? (parsed as T[]) : fallback;
  } catch {
    return fallback;
  }
}

function parseJsonObject<T>(value: string, fallback: T) {
  try {
    const parsed: unknown = JSON.parse(value || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as T) : fallback;
  } catch {
    return fallback;
  }
}

function toProfile(row: ProfileRow): LocalProfile {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function toWorkspace(row: WorkspaceRow): LocalWorkspace {
  return {
    id: row.id,
    profileId: row.profile_id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function toSession(row: SessionRow): LocalSession {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    startedAt: row.started_at,
    updatedAt: row.updated_at
  };
}

function toSessionSummary(row: SessionSummaryRow): LocalSessionSummary {
  return {
    ...toSession(row),
    captureCount: Number(row.capture_count || 0),
    sslEventCount: Number(row.ssl_event_count || 0)
  };
}

function toCapture(row: CaptureRow): CapturedRequest {
  const capture: CapturedRequest = {
    id: row.id,
    startedAt: row.started_at,
    method: row.method,
    url: row.url,
    host: row.host,
    path: row.path,
    requestHeaders: parseRecordJson(row.request_headers_json),
    requestBody: row.request_body,
    status: row.status,
    statusText: row.status_text,
    mimeType: row.mime_type,
    type: row.resource_type,
    responseHeaders: parseRecordJson(row.response_headers_json),
    responseBody: row.response_body,
    durationMs: row.duration_ms,
    encodedDataLength: row.encoded_data_length ?? undefined,
    allowed: row.allowed === 1,
    source: row.source,
    agentRunId: row.agent_run_id || undefined,
    navigationId: row.navigation_id || undefined,
    frameUrl: row.frame_url || undefined,
    initiator: row.initiator || undefined,
    tls: parseTlsJson(row.tls_json)
  };
  const intercept = parseInterceptJson(row.intercept_json);
  if (intercept) {
    capture.intercept = intercept;
  }
  const rewrites = parseRewriteJson(row.rewrite_json);
  if (rewrites) {
    capture.rewrites = rewrites;
  }
  return capture;
}

function toSslEvent(row: SslEventRow): SslEvent {
  return {
    id: row.id,
    url: row.url,
    error: row.error,
    trusted: row.trusted === 1,
    subjectName: row.subject_name || undefined,
    issuerName: row.issuer_name || undefined,
    createdAt: row.created_at
  };
}

function toWebSocketEvent(row: WebSocketEventRow): WebSocketEvent {
  return {
    id: row.id,
    requestId: row.request_id,
    createdAt: row.created_at,
    url: row.url,
    host: row.host,
    direction: row.direction,
    opcode: row.opcode ?? undefined,
    payloadData: row.payload_data,
    size: row.size,
    status: row.status ?? undefined,
    statusText: row.status_text || undefined,
    error: row.error || undefined,
    requestHeaders: parseRecordJson(row.request_headers_json),
    responseHeaders: parseRecordJson(row.response_headers_json),
    initiator: row.initiator || undefined,
    allowed: row.allowed === 1
  };
}

function toAgentRun(row: AgentRunRow): AgentRun {
  return {
    id: row.id,
    sessionId: row.session_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    goal: row.goal,
    status: row.status,
    policy: parseJsonObject<AgentPolicy>(row.policy_json, {
      maxRuntimeMs: 0,
      maxSteps: 0,
      maxReplay: 0,
      maxCaptureSample: 0,
      allowRawContext: false
    }),
    timeline: parseJsonArray<AgentTimelineEntry>(row.timeline_json),
    findings: parseJsonArray<AgentFinding>(row.findings_json),
    error: row.error || undefined
  };
}

export type LocalStore = ReturnType<typeof openLocalStore>;

export function openLocalStore(userDataPath: string) {
  fs.mkdirSync(userDataPath, { recursive: true });
  const db = new DatabaseSync(path.join(userDataPath, "radar-local.sqlite"));

  db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;

    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS profiles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS workspaces (
      id TEXT PRIMARY KEY,
      profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      started_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS workspace_targets (
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      position INTEGER NOT NULL,
      target TEXT NOT NULL,
      PRIMARY KEY (workspace_id, target)
    );

    CREATE TABLE IF NOT EXISTS captures (
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      id TEXT NOT NULL,
      started_at TEXT NOT NULL,
      method TEXT NOT NULL,
      url TEXT NOT NULL,
      host TEXT NOT NULL,
      path TEXT NOT NULL,
      request_headers_json TEXT NOT NULL,
      request_body TEXT NOT NULL,
      status INTEGER,
      status_text TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      resource_type TEXT NOT NULL,
      response_headers_json TEXT NOT NULL,
      response_body TEXT NOT NULL,
      duration_ms INTEGER,
      encoded_data_length INTEGER,
      allowed INTEGER NOT NULL,
      source TEXT NOT NULL CHECK (source IN ('browser', 'repeater', 'proxy')),
      agent_run_id TEXT,
      navigation_id TEXT,
      frame_url TEXT,
      initiator TEXT,
      tls_json TEXT,
      intercept_json TEXT,
      rewrite_json TEXT,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (session_id, id)
    );

    CREATE TABLE IF NOT EXISTS ssl_events (
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      id TEXT NOT NULL,
      url TEXT NOT NULL,
      error TEXT NOT NULL,
      trusted INTEGER NOT NULL,
      subject_name TEXT,
      issuer_name TEXT,
      created_at TEXT NOT NULL,
      PRIMARY KEY (session_id, id)
    );

    CREATE TABLE IF NOT EXISTS websocket_events (
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      id TEXT NOT NULL,
      request_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      url TEXT NOT NULL,
      host TEXT NOT NULL,
      direction TEXT NOT NULL CHECK (direction IN ('handshake', 'sent', 'received', 'error', 'closed')),
      opcode INTEGER,
      payload_data TEXT NOT NULL,
      size INTEGER NOT NULL,
      status INTEGER,
      status_text TEXT,
      error TEXT,
      request_headers_json TEXT NOT NULL,
      response_headers_json TEXT NOT NULL,
      initiator TEXT,
      allowed INTEGER NOT NULL,
      PRIMARY KEY (session_id, id)
    );

    CREATE TABLE IF NOT EXISTS ai_models (
      provider TEXT NOT NULL,
      model_id TEXT NOT NULL,
      label TEXT NOT NULL,
      position INTEGER NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (provider, model_id)
    );

    CREATE TABLE IF NOT EXISTS agent_runs (
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      goal TEXT NOT NULL,
      status TEXT NOT NULL,
      policy_json TEXT NOT NULL,
      timeline_json TEXT NOT NULL,
      findings_json TEXT NOT NULL,
      error TEXT,
      PRIMARY KEY (session_id, id)
    );

    CREATE TABLE IF NOT EXISTS workspace_intercept_rules (
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      position INTEGER NOT NULL,
      rule_json TEXT NOT NULL,
      PRIMARY KEY (workspace_id, position)
    );

    CREATE TABLE IF NOT EXISTS workspace_match_replace_rules (
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      position INTEGER NOT NULL,
      rule_json TEXT NOT NULL,
      PRIMARY KEY (workspace_id, position)
    );

    CREATE TABLE IF NOT EXISTS workspace_proxy_profiles (
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      profile_id TEXT NOT NULL,
      notes TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (workspace_id, profile_id)
    );

    CREATE TABLE IF NOT EXISTS workspace_saved_filters (
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      position INTEGER NOT NULL,
      filter_json TEXT NOT NULL,
      PRIMARY KEY (workspace_id, position)
    );

    CREATE TABLE IF NOT EXISTS session_evidence_annotations (
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      evidence_id TEXT NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('capture', 'websocket')),
      tags_json TEXT NOT NULL,
      comment TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (session_id, evidence_id, kind)
    );

    CREATE TABLE IF NOT EXISTS workspace_replay_tabs (
      workspace_id TEXT PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
      state_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS workspace_replay_environments (
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      position INTEGER NOT NULL,
      environment_json TEXT NOT NULL,
      PRIMARY KEY (workspace_id, position)
    );

    CREATE TABLE IF NOT EXISTS workspace_replay_collections (
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      position INTEGER NOT NULL,
      collection_json TEXT NOT NULL,
      PRIMARY KEY (workspace_id, position)
    );

    CREATE TABLE IF NOT EXISTS workspace_automate_payload_sets (
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      position INTEGER NOT NULL,
      payload_set_json TEXT NOT NULL,
      PRIMARY KEY (workspace_id, position)
    );

    CREATE TABLE IF NOT EXISTS session_automate_sessions (
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      id TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      session_json TEXT NOT NULL,
      PRIMARY KEY (session_id, id)
    );

    CREATE INDEX IF NOT EXISTS idx_captures_session_started
      ON captures(session_id, started_at DESC);
    CREATE INDEX IF NOT EXISTS idx_captures_session_host
      ON captures(session_id, host, started_at DESC);
    CREATE INDEX IF NOT EXISTS idx_ssl_events_session_created
      ON ssl_events(session_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_websocket_events_session_created
      ON websocket_events(session_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_websocket_events_session_request
      ON websocket_events(session_id, request_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_agent_runs_session_updated
      ON agent_runs(session_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_automate_sessions_updated
      ON session_automate_sessions(session_id, updated_at DESC);
  `);

  const captureColumns = new Set(
    (
      db.prepare("PRAGMA table_info(captures)").all() as Array<{
        name: string;
      }>
    ).map((column) => column.name)
  );
  const captureColumnMigrations: Array<[string, string]> = [
    ["agent_run_id", "TEXT"],
    ["navigation_id", "TEXT"],
    ["frame_url", "TEXT"],
    ["initiator", "TEXT"],
    ["intercept_json", "TEXT"],
    ["rewrite_json", "TEXT"]
  ];
  for (const [name, type] of captureColumnMigrations) {
    if (!captureColumns.has(name)) {
      db.exec(`ALTER TABLE captures ADD COLUMN ${name} ${type}`);
    }
  }
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_captures_session_agent_run
      ON captures(session_id, agent_run_id, started_at DESC);
  `);

  const readMeta = (key: string) => {
    const row = db.prepare("SELECT value FROM meta WHERE key = ?").get(key) as { value: string } | undefined;
    return row?.value || "";
  };

  const writeMeta = (key: string, value: string) => {
    db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)").run(key, value);
  };

  const setTargets = (workspaceId: string, targets: string[]) => {
    const next = targets.map((target) => target.trim()).filter(Boolean).slice(0, 40);
    const saved = next.length > 0 ? next : [...DEFAULT_ALLOWLIST];

    db.exec("BEGIN IMMEDIATE");
    try {
      db.prepare("DELETE FROM workspace_targets WHERE workspace_id = ?").run(workspaceId);
      const insert = db.prepare(
        "INSERT INTO workspace_targets (workspace_id, position, target) VALUES (?, ?, ?)"
      );
      saved.forEach((target, index) => insert.run(workspaceId, index, target));
      db.prepare("UPDATE workspaces SET updated_at = ? WHERE id = ?").run(nowIso(), workspaceId);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }

    return saved;
  };

  const createProfile = (name = DEFAULT_PROFILE_NAME): LocalProfile => {
    const createdAt = nowIso();
    const profile: LocalProfile = {
      id: createId("profile"),
      name: normalizeName(name, DEFAULT_PROFILE_NAME),
      createdAt,
      updatedAt: createdAt
    };
    db.prepare("INSERT INTO profiles (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)").run(
      profile.id,
      profile.name,
      profile.createdAt,
      profile.updatedAt
    );
    return profile;
  };

  const createWorkspace = (profileId: string, name = DEFAULT_WORKSPACE_NAME): LocalWorkspace => {
    const createdAt = nowIso();
    const workspace: LocalWorkspace = {
      id: createId("workspace"),
      profileId,
      name,
      createdAt,
      updatedAt: createdAt
    };
    db.prepare(
      "INSERT INTO workspaces (id, profile_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
    ).run(workspace.id, workspace.profileId, workspace.name, workspace.createdAt, workspace.updatedAt);
    setTargets(workspace.id, [...DEFAULT_ALLOWLIST]);
    return workspace;
  };

  const createSession = (workspaceId: string, name?: string): LocalSession => {
    const createdAt = nowIso();
    const session: LocalSession = {
      id: createId("session"),
      workspaceId,
      name: normalizeName(name, defaultSessionName(createdAt)),
      startedAt: createdAt,
      updatedAt: createdAt
    };
    db.prepare(
      "INSERT INTO sessions (id, workspace_id, name, started_at, updated_at) VALUES (?, ?, ?, ?, ?)"
    ).run(session.id, session.workspaceId, session.name, session.startedAt, session.updatedAt);
    writeMeta("active_session_id", session.id);
    return session;
  };

  const getProfile = (id: string) => {
    const row = db.prepare("SELECT * FROM profiles WHERE id = ?").get(id) as ProfileRow | undefined;
    return row ? toProfile(row) : null;
  };

  const getWorkspace = (id: string) => {
    const row = db.prepare("SELECT * FROM workspaces WHERE id = ?").get(id) as WorkspaceRow | undefined;
    return row ? toWorkspace(row) : null;
  };

  const getSession = (id: string) => {
    const row = db.prepare("SELECT * FROM sessions WHERE id = ?").get(id) as SessionRow | undefined;
    return row ? toSession(row) : null;
  };

  const latestWorkspaceForProfile = (profileId: string) => {
    const row = db
      .prepare("SELECT * FROM workspaces WHERE profile_id = ? ORDER BY updated_at DESC, created_at DESC LIMIT 1")
      .get(profileId) as WorkspaceRow | undefined;
    return row ? toWorkspace(row) : null;
  };

  const latestSessionForWorkspace = (workspaceId: string) => {
    const row = db
      .prepare("SELECT * FROM sessions WHERE workspace_id = ? ORDER BY updated_at DESC, started_at DESC LIMIT 1")
      .get(workspaceId) as SessionRow | undefined;
    return row ? toSession(row) : null;
  };

  const persistActiveContext = (context: LocalContext) => {
    writeMeta("active_profile_id", context.profile.id);
    writeMeta("active_workspace_id", context.workspace.id);
    writeMeta("active_session_id", context.session.id);
    writeMeta("schema_version", SCHEMA_VERSION);
  };

  const contextFromParts = (profile: LocalProfile, workspace: LocalWorkspace, session: LocalSession): LocalContext => {
    const context = { profile, workspace, session };
    persistActiveContext(context);
    return context;
  };

  const getActiveContext = (): LocalContext => {
    let profile = getProfile(readMeta("active_profile_id"));
    if (!profile) {
      profile = createProfile();
      writeMeta("active_profile_id", profile.id);
    }

    let workspace = getWorkspace(readMeta("active_workspace_id"));
    if (!workspace || workspace.profileId !== profile.id) {
      workspace = createWorkspace(profile.id);
      writeMeta("active_workspace_id", workspace.id);
    }

    let session = getSession(readMeta("active_session_id"));
    if (!session || session.workspaceId !== workspace.id) {
      session = createSession(workspace.id);
    }

    writeMeta("schema_version", SCHEMA_VERSION);
    return { profile, workspace, session };
  };

  const listProfiles = () => {
    const rows = db
      .prepare("SELECT * FROM profiles ORDER BY updated_at DESC, created_at DESC, name ASC")
      .all() as ProfileRow[];
    return rows.map(toProfile);
  };

  const updateProfile = (id: string, name: string) => {
    const profile = getProfile(id);
    if (!profile) {
      throw new Error("Profile was not found.");
    }

    const updatedAt = nowIso();
    const nextName = normalizeName(name, profile.name || DEFAULT_PROFILE_NAME);
    db.prepare("UPDATE profiles SET name = ?, updated_at = ? WHERE id = ?").run(nextName, updatedAt, profile.id);
    return { ...profile, name: nextName, updatedAt };
  };

  const loadProfile = (profileId: string): LocalContext => {
    const profile = getProfile(profileId);
    if (!profile) {
      throw new Error("Profile was not found.");
    }

    let workspace = latestWorkspaceForProfile(profile.id);
    if (!workspace) {
      workspace = createWorkspace(profile.id);
    }

    let session = latestSessionForWorkspace(workspace.id);
    if (!session) {
      session = createSession(workspace.id);
    }

    return contextFromParts(profile, workspace, session);
  };

  const createProfileContext = (name?: string): LocalContext => {
    const profile = createProfile(name);
    const workspace = createWorkspace(profile.id);
    const session = createSession(workspace.id);
    return contextFromParts(profile, workspace, session);
  };

  const listSessions = (profileId: string) => {
    const rows = db
      .prepare(
        `
        SELECT
          sessions.*,
          COUNT(DISTINCT captures.id) AS capture_count,
          COUNT(DISTINCT ssl_events.id) AS ssl_event_count
        FROM sessions
        INNER JOIN workspaces ON workspaces.id = sessions.workspace_id
        LEFT JOIN captures ON captures.session_id = sessions.id
        LEFT JOIN ssl_events ON ssl_events.session_id = sessions.id
        WHERE workspaces.profile_id = ?
        GROUP BY sessions.id
        ORDER BY sessions.updated_at DESC, sessions.started_at DESC
      `
      )
      .all(profileId) as SessionSummaryRow[];
    return rows.map(toSessionSummary);
  };

  const loadSession = (sessionId: string): LocalContext => {
    const session = getSession(sessionId);
    if (!session) {
      throw new Error("Session was not found.");
    }

    const workspace = getWorkspace(session.workspaceId);
    if (!workspace) {
      throw new Error("Session workspace was not found.");
    }

    const profile = getProfile(workspace.profileId);
    if (!profile) {
      throw new Error("Session profile was not found.");
    }

    return contextFromParts(profile, workspace, session);
  };

  const updateSession = (id: string, name: string) => {
    const session = getSession(id);
    if (!session) {
      throw new Error("Session was not found.");
    }

    const updatedAt = nowIso();
    const nextName = normalizeName(name, session.name || defaultSessionName(session.startedAt));
    db.prepare("UPDATE sessions SET name = ?, updated_at = ? WHERE id = ?").run(nextName, updatedAt, session.id);
    return { ...session, name: nextName, updatedAt };
  };

  const getTargets = (workspaceId: string) => {
    const rows = db
      .prepare("SELECT target FROM workspace_targets WHERE workspace_id = ? ORDER BY position ASC")
      .all(workspaceId) as Array<{ target: string }>;
    if (rows.length === 0) {
      return setTargets(workspaceId, [...DEFAULT_ALLOWLIST]);
    }
    return rows.map((row) => row.target);
  };

  const listInterceptRules = (workspaceId: string) => {
    const rows = db
      .prepare("SELECT rule_json FROM workspace_intercept_rules WHERE workspace_id = ? ORDER BY position ASC")
      .all(workspaceId) as InterceptRuleRow[];
    return rows
      .map((row) => parseJsonObject<InterceptRule | null>(row.rule_json, null))
      .filter((rule): rule is InterceptRule => Boolean(rule));
  };

  const setInterceptRules = (workspaceId: string, rules: InterceptRule[]) => {
    const next = rules.slice(0, 40);
    db.exec("BEGIN IMMEDIATE");
    try {
      db.prepare("DELETE FROM workspace_intercept_rules WHERE workspace_id = ?").run(workspaceId);
      const insert = db.prepare(
        "INSERT INTO workspace_intercept_rules (workspace_id, position, rule_json) VALUES (?, ?, ?)"
      );
      next.forEach((rule, index) => insert.run(workspaceId, index, JSON.stringify(rule)));
      db.prepare("UPDATE workspaces SET updated_at = ? WHERE id = ?").run(nowIso(), workspaceId);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    return next;
  };

  const listMatchReplaceRules = (workspaceId: string) => {
    const rows = db
      .prepare("SELECT rule_json FROM workspace_match_replace_rules WHERE workspace_id = ? ORDER BY position ASC")
      .all(workspaceId) as MatchReplaceRuleRow[];
    return rows
      .map((row) => parseJsonObject<MatchReplaceRule | null>(row.rule_json, null))
      .filter((rule): rule is MatchReplaceRule => Boolean(rule));
  };

  const setMatchReplaceRules = (workspaceId: string, rules: MatchReplaceRule[]) => {
    const next = rules.slice(0, 40);
    db.exec("BEGIN IMMEDIATE");
    try {
      db.prepare("DELETE FROM workspace_match_replace_rules WHERE workspace_id = ?").run(workspaceId);
      const insert = db.prepare(
        "INSERT INTO workspace_match_replace_rules (workspace_id, position, rule_json) VALUES (?, ?, ?)"
      );
      next.forEach((rule, index) => insert.run(workspaceId, index, JSON.stringify(rule)));
      db.prepare("UPDATE workspaces SET updated_at = ? WHERE id = ?").run(nowIso(), workspaceId);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    return next;
  };

  const listProxyProfiles = (workspaceId: string): ProxyProfile[] => {
    const rows = db
      .prepare("SELECT profile_id, notes, updated_at FROM workspace_proxy_profiles WHERE workspace_id = ?")
      .all(workspaceId) as ProxyProfileRow[];
    const saved = new Map(rows.map((row) => [row.profile_id, row]));
    return defaultProxyProfiles().map((profile) => {
      const row = saved.get(profile.id);
      return row
        ? {
            ...profile,
            notes: row.notes,
            updatedAt: row.updated_at
          }
        : profile;
    });
  };

  const saveProxyProfile = (workspaceId: string, input: { id?: unknown; notes?: unknown }) => {
    const profile = normalizeProxyProfile(input);
    if (!profile) {
      throw new Error("Proxy profile id was not recognized.");
    }
    db.prepare(`
      INSERT INTO workspace_proxy_profiles (workspace_id, profile_id, notes, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(workspace_id, profile_id) DO UPDATE SET
        notes = excluded.notes,
        updated_at = excluded.updated_at
    `).run(workspaceId, profile.id, profile.notes, profile.updatedAt);
    db.prepare("UPDATE workspaces SET updated_at = ? WHERE id = ?").run(profile.updatedAt, workspaceId);
    return listProxyProfiles(workspaceId);
  };

  const listSavedFilters = (workspaceId: string) => {
    const rows = db
      .prepare("SELECT filter_json FROM workspace_saved_filters WHERE workspace_id = ? ORDER BY position ASC")
      .all(workspaceId) as Array<{ filter_json: string }>;
    return normalizeSavedFilters(rows.map((row) => parseJsonObject(row.filter_json, null)).filter(Boolean));
  };

  const setSavedFilters = (workspaceId: string, filters: SavedFilter[]) => {
    const next = normalizeSavedFilters(filters);
    db.exec("BEGIN IMMEDIATE");
    try {
      db.prepare("DELETE FROM workspace_saved_filters WHERE workspace_id = ?").run(workspaceId);
      const insert = db.prepare(
        "INSERT INTO workspace_saved_filters (workspace_id, position, filter_json) VALUES (?, ?, ?)"
      );
      next.forEach((filter, index) => insert.run(workspaceId, index, JSON.stringify(filter)));
      db.prepare("UPDATE workspaces SET updated_at = ? WHERE id = ?").run(nowIso(), workspaceId);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    return next;
  };

  const getReplayTabState = (workspaceId: string) => {
    const row = db
      .prepare("SELECT state_json FROM workspace_replay_tabs WHERE workspace_id = ?")
      .get(workspaceId) as { state_json: string } | undefined;
    return normalizeReplayTabState(row ? parseJsonObject(row.state_json, null) : null);
  };

  const setReplayTabState = (workspaceId: string, state: ReplayTabState) => {
    const next = normalizeReplayTabState(state);
    db.prepare(`
      INSERT INTO workspace_replay_tabs (workspace_id, state_json, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(workspace_id) DO UPDATE SET
        state_json = excluded.state_json,
        updated_at = excluded.updated_at
    `).run(workspaceId, JSON.stringify(next), nowIso());
    db.prepare("UPDATE workspaces SET updated_at = ? WHERE id = ?").run(nowIso(), workspaceId);
    return next;
  };

  const listReplayEnvironments = (workspaceId: string) => {
    const rows = db
      .prepare("SELECT environment_json FROM workspace_replay_environments WHERE workspace_id = ? ORDER BY position ASC")
      .all(workspaceId) as Array<{ environment_json: string }>;
    return normalizeReplayEnvironments(rows.map((row) => parseJsonObject(row.environment_json, null)).filter(Boolean));
  };

  const setReplayEnvironments = (workspaceId: string, environments: ReplayEnvironment[]) => {
    const next = normalizeReplayEnvironments(environments);
    db.exec("BEGIN IMMEDIATE");
    try {
      db.prepare("DELETE FROM workspace_replay_environments WHERE workspace_id = ?").run(workspaceId);
      const insert = db.prepare(
        "INSERT INTO workspace_replay_environments (workspace_id, position, environment_json) VALUES (?, ?, ?)"
      );
      next.forEach((environment, index) => insert.run(workspaceId, index, JSON.stringify(environment)));
      db.prepare("UPDATE workspaces SET updated_at = ? WHERE id = ?").run(nowIso(), workspaceId);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    return next;
  };

  const listReplayCollections = (workspaceId: string) => {
    const rows = db
      .prepare("SELECT collection_json FROM workspace_replay_collections WHERE workspace_id = ? ORDER BY position ASC")
      .all(workspaceId) as Array<{ collection_json: string }>;
    return normalizeReplayCollections(rows.map((row) => parseJsonObject(row.collection_json, null)).filter(Boolean));
  };

  const setReplayCollections = (workspaceId: string, collections: ReplayCollection[]) => {
    const next = normalizeReplayCollections(collections);
    db.exec("BEGIN IMMEDIATE");
    try {
      db.prepare("DELETE FROM workspace_replay_collections WHERE workspace_id = ?").run(workspaceId);
      const insert = db.prepare(
        "INSERT INTO workspace_replay_collections (workspace_id, position, collection_json) VALUES (?, ?, ?)"
      );
      next.forEach((collection, index) => insert.run(workspaceId, index, JSON.stringify(collection)));
      db.prepare("UPDATE workspaces SET updated_at = ? WHERE id = ?").run(nowIso(), workspaceId);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    return next;
  };

  const listAutomatePayloadSets = (workspaceId: string) => {
    const rows = db
      .prepare("SELECT payload_set_json FROM workspace_automate_payload_sets WHERE workspace_id = ? ORDER BY position ASC")
      .all(workspaceId) as Array<{ payload_set_json: string }>;
    return normalizeAutomatePayloadSets(
      rows.map((row) => parseJsonObject<AutomatePayloadSet | null>(row.payload_set_json, null)).filter(Boolean)
    );
  };

  const setAutomatePayloadSets = (workspaceId: string, payloadSets: AutomatePayloadSet[]) => {
    const next = normalizeAutomatePayloadSets(payloadSets);
    db.exec("BEGIN IMMEDIATE");
    try {
      db.prepare("DELETE FROM workspace_automate_payload_sets WHERE workspace_id = ?").run(workspaceId);
      const insert = db.prepare(
        "INSERT INTO workspace_automate_payload_sets (workspace_id, position, payload_set_json) VALUES (?, ?, ?)"
      );
      next.forEach((payloadSet, index) => insert.run(workspaceId, index, JSON.stringify(payloadSet)));
      db.prepare("UPDATE workspaces SET updated_at = ? WHERE id = ?").run(nowIso(), workspaceId);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    return next;
  };

  const listAutomateSessions = (sessionId: string, limit = 25) => {
    const rows = db
      .prepare(
        "SELECT session_json FROM session_automate_sessions WHERE session_id = ? ORDER BY updated_at DESC, id DESC LIMIT ?"
      )
      .all(sessionId, Math.max(1, Math.min(Number(limit) || 25, MAX_AUTOMATE_SESSIONS))) as Array<{
      session_json: string;
    }>;
    return rows
      .map((row) => normalizeAutomateSession(parseJsonObject<AutomateSession | null>(row.session_json, null)))
      .filter((session): session is AutomateSession => Boolean(session));
  };

  const getAutomateSession = (sessionId: string, automateSessionId: string) => {
    const row = db
      .prepare("SELECT session_json FROM session_automate_sessions WHERE session_id = ? AND id = ?")
      .get(sessionId, automateSessionId) as { session_json: string } | undefined;
    return row ? normalizeAutomateSession(parseJsonObject<AutomateSession | null>(row.session_json, null)) : null;
  };

  const upsertAutomateSession = (sessionId: string, input: AutomateSession) => {
    const session = normalizeAutomateSession(input);
    if (!session) {
      throw new Error("Automate session was invalid.");
    }
    db.prepare(`
      INSERT INTO session_automate_sessions (session_id, id, updated_at, session_json)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(session_id, id) DO UPDATE SET
        updated_at = excluded.updated_at,
        session_json = excluded.session_json
    `).run(sessionId, session.id, session.updatedAt, JSON.stringify(session));
    db.prepare("UPDATE sessions SET updated_at = ? WHERE id = ?").run(session.updatedAt, sessionId);
    return session;
  };

  const listEvidenceAnnotations = (sessionId: string) => {
    const rows = db
      .prepare(
        "SELECT evidence_id, kind, tags_json, comment, updated_at FROM session_evidence_annotations WHERE session_id = ? ORDER BY updated_at DESC"
      )
      .all(sessionId) as Array<{
      evidence_id: string;
      kind: "capture" | "websocket";
      tags_json: string;
      comment: string;
      updated_at: string;
    }>;
    return normalizeEvidenceAnnotations(
      rows.map((row) => ({
        evidenceId: row.evidence_id,
        kind: row.kind,
        tags: parseJsonObject<string[]>(row.tags_json, []),
        comment: row.comment,
        updatedAt: row.updated_at
      }))
    );
  };

  const saveEvidenceAnnotation = (sessionId: string, input: Partial<EvidenceAnnotation>) => {
    const annotation = normalizeEvidenceAnnotation(input);
    if (!annotation) {
      throw new Error("Evidence annotation was invalid.");
    }
    db.prepare(`
      INSERT INTO session_evidence_annotations (session_id, evidence_id, kind, tags_json, comment, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(session_id, evidence_id, kind) DO UPDATE SET
        tags_json = excluded.tags_json,
        comment = excluded.comment,
        updated_at = excluded.updated_at
    `).run(
      sessionId,
      annotation.evidenceId,
      annotation.kind,
      JSON.stringify(annotation.tags),
      annotation.comment,
      annotation.updatedAt
    );
    db.prepare("UPDATE sessions SET updated_at = ? WHERE id = ?").run(annotation.updatedAt, sessionId);
    return annotation;
  };

  const saveEvidenceAnnotations = (sessionId: string, inputs: Partial<EvidenceAnnotation>[]) => {
    const updatedAt = nowIso();
    const next = inputs
      .map((input) => normalizeEvidenceAnnotation(input, updatedAt))
      .filter((item): item is EvidenceAnnotation => Boolean(item));
    db.exec("BEGIN IMMEDIATE");
    try {
      const upsert = db.prepare(`
        INSERT INTO session_evidence_annotations (session_id, evidence_id, kind, tags_json, comment, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(session_id, evidence_id, kind) DO UPDATE SET
          tags_json = excluded.tags_json,
          comment = excluded.comment,
          updated_at = excluded.updated_at
      `);
      for (const annotation of next) {
        upsert.run(
          sessionId,
          annotation.evidenceId,
          annotation.kind,
          JSON.stringify(annotation.tags),
          annotation.comment,
          annotation.updatedAt
        );
      }
      db.prepare("UPDATE sessions SET updated_at = ? WHERE id = ?").run(updatedAt, sessionId);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    return listEvidenceAnnotations(sessionId);
  };

  const upsertCapture = (sessionId: string, capture: CapturedRequest) => {
    db.prepare(`
      INSERT INTO captures (
        session_id, id, started_at, method, url, host, path,
        request_headers_json, request_body, status, status_text, mime_type, resource_type,
        response_headers_json, response_body, duration_ms, encoded_data_length, allowed,
        source, agent_run_id, navigation_id, frame_url, initiator, tls_json, intercept_json, rewrite_json, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(session_id, id) DO UPDATE SET
        started_at = excluded.started_at,
        method = excluded.method,
        url = excluded.url,
        host = excluded.host,
        path = excluded.path,
        request_headers_json = excluded.request_headers_json,
        request_body = excluded.request_body,
        status = excluded.status,
        status_text = excluded.status_text,
        mime_type = excluded.mime_type,
        resource_type = excluded.resource_type,
        response_headers_json = excluded.response_headers_json,
        response_body = excluded.response_body,
        duration_ms = excluded.duration_ms,
        encoded_data_length = excluded.encoded_data_length,
        allowed = excluded.allowed,
        source = excluded.source,
        agent_run_id = excluded.agent_run_id,
        navigation_id = excluded.navigation_id,
        frame_url = excluded.frame_url,
        initiator = excluded.initiator,
        tls_json = excluded.tls_json,
        intercept_json = excluded.intercept_json,
        rewrite_json = excluded.rewrite_json,
        updated_at = excluded.updated_at
    `).run(
      sessionId,
      capture.id,
      capture.startedAt,
      capture.method,
      capture.url,
      capture.host,
      capture.path,
      JSON.stringify(capture.requestHeaders),
      capture.requestBody,
      capture.status,
      capture.statusText,
      capture.mimeType,
      capture.type,
      JSON.stringify(capture.responseHeaders),
      capture.responseBody,
      capture.durationMs,
      capture.encodedDataLength ?? null,
      capture.allowed ? 1 : 0,
      capture.source,
      capture.agentRunId || null,
      capture.navigationId || null,
      capture.frameUrl || null,
      capture.initiator || null,
      capture.tls ? JSON.stringify(capture.tls) : null,
      capture.intercept ? JSON.stringify(capture.intercept) : null,
      capture.rewrites ? JSON.stringify(capture.rewrites) : null,
      nowIso()
    );
    db.prepare("UPDATE sessions SET updated_at = ? WHERE id = ?").run(nowIso(), sessionId);
  };

  const listCaptures = (sessionId: string, limit = 400) => {
    const rows = db
      .prepare("SELECT * FROM captures WHERE session_id = ? ORDER BY started_at DESC, id DESC LIMIT ?")
      .all(sessionId, Math.max(1, Math.min(Number(limit) || 400, 2000))) as CaptureRow[];
    return rows.map(toCapture);
  };

  const clearCaptures = (sessionId: string) => {
    db.prepare("DELETE FROM captures WHERE session_id = ?").run(sessionId);
    db.prepare("UPDATE sessions SET updated_at = ? WHERE id = ?").run(nowIso(), sessionId);
  };

  const deleteCapture = (sessionId: string, captureId: string) => {
    db.prepare("DELETE FROM captures WHERE session_id = ? AND id = ?").run(sessionId, captureId);
    db.prepare("UPDATE sessions SET updated_at = ? WHERE id = ?").run(nowIso(), sessionId);
  };

  const insertSslEvent = (sessionId: string, event: SslEvent) => {
    db.prepare(`
      INSERT OR REPLACE INTO ssl_events (
        session_id, id, url, error, trusted, subject_name, issuer_name, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      sessionId,
      event.id,
      event.url,
      event.error,
      event.trusted ? 1 : 0,
      event.subjectName ?? null,
      event.issuerName ?? null,
      event.createdAt
    );
  };

  const listSslEvents = (sessionId: string, limit = 80) => {
    const rows = db
      .prepare("SELECT * FROM ssl_events WHERE session_id = ? ORDER BY created_at DESC, id DESC LIMIT ?")
      .all(sessionId, Math.max(1, Math.min(Number(limit) || 80, 1000))) as SslEventRow[];
    return rows.map(toSslEvent);
  };

  const insertWebSocketEvent = (sessionId: string, event: WebSocketEvent) => {
    db.prepare(`
      INSERT OR REPLACE INTO websocket_events (
        session_id, id, request_id, created_at, url, host, direction, opcode, payload_data, size,
        status, status_text, error, request_headers_json, response_headers_json, initiator, allowed
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      sessionId,
      event.id,
      event.requestId,
      event.createdAt,
      event.url,
      event.host,
      event.direction,
      event.opcode ?? null,
      event.payloadData,
      event.size,
      event.status ?? null,
      event.statusText ?? null,
      event.error ?? null,
      JSON.stringify(event.requestHeaders || {}),
      JSON.stringify(event.responseHeaders || {}),
      event.initiator ?? null,
      event.allowed ? 1 : 0
    );
    db.prepare("UPDATE sessions SET updated_at = ? WHERE id = ?").run(nowIso(), sessionId);
  };

  const listWebSocketEvents = (sessionId: string, limit = 1000) => {
    const rows = db
      .prepare("SELECT * FROM websocket_events WHERE session_id = ? ORDER BY created_at DESC, id DESC LIMIT ?")
      .all(sessionId, Math.max(1, Math.min(Number(limit) || 1000, 5000))) as WebSocketEventRow[];
    return rows.map(toWebSocketEvent);
  };

  const clearWebSocketEvents = (sessionId: string) => {
    db.prepare("DELETE FROM websocket_events WHERE session_id = ?").run(sessionId);
    db.prepare("UPDATE sessions SET updated_at = ? WHERE id = ?").run(nowIso(), sessionId);
  };

  const saveAiModels = (provider: string, models: AiModelOption[]) => {
    const nextProvider = provider.trim();
    if (!nextProvider) {
      return [];
    }

    db.exec("BEGIN IMMEDIATE");
    try {
      db.prepare("DELETE FROM ai_models WHERE provider = ?").run(nextProvider);
      const insert = db.prepare(
        "INSERT INTO ai_models (provider, model_id, label, position, updated_at) VALUES (?, ?, ?, ?, ?)"
      );
      const updatedAt = nowIso();
      models.forEach((model, index) => {
        const cleaned = sanitizeModelOption(model);
        const id = cleaned.id;
        if (!id) {
          return;
        }
        insert.run(nextProvider, id, cleaned.label || id, index, updatedAt);
      });
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }

    return listAiModels(nextProvider);
  };

  const listAiModels = (provider: string) => {
    const rows = db
      .prepare("SELECT model_id, label FROM ai_models WHERE provider = ? ORDER BY position ASC")
      .all(provider.trim()) as Array<{ model_id: string; label: string }>;
    return rows.map((row) => sanitizeModelOption({ id: row.model_id, label: row.label }));
  };

  const upsertAgentRun = (sessionId: string, run: AgentRun) => {
    db.prepare(`
      INSERT INTO agent_runs (
        session_id, id, created_at, updated_at, goal, status, policy_json, timeline_json, findings_json, error
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(session_id, id) DO UPDATE SET
        updated_at = excluded.updated_at,
        goal = excluded.goal,
        status = excluded.status,
        policy_json = excluded.policy_json,
        timeline_json = excluded.timeline_json,
        findings_json = excluded.findings_json,
        error = excluded.error
    `).run(
      sessionId,
      run.id,
      run.createdAt,
      run.updatedAt,
      run.goal,
      run.status,
      JSON.stringify(run.policy),
      JSON.stringify(run.timeline),
      JSON.stringify(run.findings),
      run.error ?? null
    );
    db.prepare("UPDATE sessions SET updated_at = ? WHERE id = ?").run(run.updatedAt, sessionId);
    return run;
  };

  const getAgentRun = (sessionId: string, runId: string) => {
    const row = db
      .prepare("SELECT * FROM agent_runs WHERE session_id = ? AND id = ?")
      .get(sessionId, runId) as AgentRunRow | undefined;
    return row ? toAgentRun(row) : null;
  };

  const listAgentRuns = (sessionId: string, limit = 25) => {
    const rows = db
      .prepare("SELECT * FROM agent_runs WHERE session_id = ? ORDER BY updated_at DESC, created_at DESC LIMIT ?")
      .all(sessionId, Math.max(1, Math.min(Number(limit) || 25, 100))) as AgentRunRow[];
    return rows.map(toAgentRun);
  };

  const close = () => {
    db.close();
  };

  return {
    getActiveContext,
    listProfiles,
    createProfileContext,
    updateProfile,
    loadProfile,
    listSessions,
    createSession,
    updateSession,
    loadSession,
    getTargets,
    setTargets,
    listInterceptRules,
    setInterceptRules,
    listMatchReplaceRules,
    setMatchReplaceRules,
    listProxyProfiles,
    saveProxyProfile,
    listSavedFilters,
    setSavedFilters,
    getReplayTabState,
    setReplayTabState,
    listReplayEnvironments,
    setReplayEnvironments,
    listReplayCollections,
    setReplayCollections,
    listAutomatePayloadSets,
    setAutomatePayloadSets,
    listAutomateSessions,
    getAutomateSession,
    upsertAutomateSession,
    listEvidenceAnnotations,
    saveEvidenceAnnotation,
    saveEvidenceAnnotations,
    upsertCapture,
    listCaptures,
    deleteCapture,
    clearCaptures,
    insertSslEvent,
    listSslEvents,
    insertWebSocketEvent,
    listWebSocketEvents,
    clearWebSocketEvents,
    saveAiModels,
    listAiModels,
    upsertAgentRun,
    getAgentRun,
    listAgentRuns,
    close
  };
}
