import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { DEFAULT_ALLOWLIST } from "../shared/allowlist.js";
import type { AgentFinding, AgentPolicy, AgentRun, AgentRunStatus, AgentTimelineEntry } from "../shared/agent-types.js";
import type { AiModelOption } from "../shared/ai-types.js";
import { sanitizeModelOption } from "../shared/ai-models.js";
import type {
  CapturedRequest,
  LocalContext,
  LocalProfile,
  LocalSession,
  LocalSessionSummary,
  LocalWorkspace,
  SslEvent,
  TlsDetails
} from "../shared/domain.js";

const SCHEMA_VERSION = "2";
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
  tls_json: string | null;
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
  return {
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
    tls: parseTlsJson(row.tls_json)
  };
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
      tls_json TEXT,
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

    CREATE INDEX IF NOT EXISTS idx_captures_session_started
      ON captures(session_id, started_at DESC);
    CREATE INDEX IF NOT EXISTS idx_captures_session_host
      ON captures(session_id, host, started_at DESC);
    CREATE INDEX IF NOT EXISTS idx_ssl_events_session_created
      ON ssl_events(session_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_agent_runs_session_updated
      ON agent_runs(session_id, updated_at DESC);
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

  const upsertCapture = (sessionId: string, capture: CapturedRequest) => {
    db.prepare(`
      INSERT INTO captures (
        session_id, id, started_at, method, url, host, path,
        request_headers_json, request_body, status, status_text, mime_type, resource_type,
        response_headers_json, response_body, duration_ms, encoded_data_length, allowed,
        source, tls_json, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        tls_json = excluded.tls_json,
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
      capture.tls ? JSON.stringify(capture.tls) : null,
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
    upsertCapture,
    listCaptures,
    deleteCapture,
    clearCaptures,
    insertSslEvent,
    listSslEvents,
    saveAiModels,
    listAiModels,
    upsertAgentRun,
    getAgentRun,
    listAgentRuns,
    close
  };
}
