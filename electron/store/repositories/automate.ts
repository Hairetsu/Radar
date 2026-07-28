import type { DatabaseSync } from "node:sqlite";
import type { AutomatePayloadSet, AutomateSession } from "../../../shared/domain.js";
import {
  MAX_AUTOMATE_SESSIONS,
  normalizeAutomatePayloadSets,
  normalizeAutomateSession
} from "../../../shared/automate.js";
import { parseJsonObject } from "../json.js";

function nowIso() {
  return new Date().toISOString();
}

export function createAutomateRepository(db: DatabaseSync) {
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
  return {
    listAutomatePayloadSets,
    setAutomatePayloadSets,
    listAutomateSessions,
    getAutomateSession,
    upsertAutomateSession
  };
}

