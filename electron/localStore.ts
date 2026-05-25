import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { DEFAULT_ALLOWLIST } from "../shared/allowlist.js";
import type {
  CapturedRequest,
  LocalContext,
  LocalProfile,
  LocalSession,
  LocalWorkspace,
  SslEvent,
  TlsDetails
} from "../shared/domain.js";

const SCHEMA_VERSION = "1";
const DEFAULT_PROFILE_NAME = "Local Operator";
const DEFAULT_WORKSPACE_NAME = "Default Workspace";

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

function nowIso() {
  return new Date().toISOString();
}

function createId(prefix: string) {
  return `${prefix}_${randomUUID()}`;
}

function defaultSessionName(createdAt = nowIso()) {
  return `Session ${createdAt.slice(0, 16).replace("T", " ")}`;
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

    CREATE INDEX IF NOT EXISTS idx_captures_session_started
      ON captures(session_id, started_at DESC);
    CREATE INDEX IF NOT EXISTS idx_captures_session_host
      ON captures(session_id, host, started_at DESC);
    CREATE INDEX IF NOT EXISTS idx_ssl_events_session_created
      ON ssl_events(session_id, created_at DESC);
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
      name,
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
      name: name?.trim() || defaultSessionName(createdAt),
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

  const close = () => {
    db.close();
  };

  return {
    getActiveContext,
    createSession,
    getTargets,
    setTargets,
    upsertCapture,
    listCaptures,
    clearCaptures,
    insertSslEvent,
    listSslEvents,
    close
  };
}
