import type { DatabaseSync } from "node:sqlite";
import type { CapturedRequest, SslEvent, WebSocketEvent } from "../../../shared/domain.js";
import { toCapture, toSslEvent, toWebSocketEvent } from "../rowMappers/evidence.js";
import type { CaptureRow, SslEventRow, WebSocketEventRow } from "../rows.js";

function nowIso() {
  return new Date().toISOString();
}

export function createEvidenceRepository(db: DatabaseSync) {
  const upsertCapture = (sessionId: string, capture: CapturedRequest) => {
    db.prepare(`
      INSERT INTO captures (
        session_id, id, started_at, method, url, host, path,
        request_headers_json, request_body, status, status_text, mime_type, resource_type,
        response_headers_json, response_body, duration_ms, encoded_data_length, allowed,
        source, agent_run_id, navigation_id, action_id, identity_id, activation_id, sequence_run_id, experiment_id,
        frame_url, initiator, tls_json, intercept_json, rewrite_json, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        action_id = excluded.action_id,
        identity_id = excluded.identity_id,
        activation_id = excluded.activation_id,
        sequence_run_id = excluded.sequence_run_id,
        experiment_id = excluded.experiment_id,
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
      capture.actionId || null,
      capture.identityId || null,
      capture.activationId || null,
      capture.sequenceRunId || null,
      capture.experimentId || null,
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
        status, status_text, error, request_headers_json, response_headers_json, initiator,
        agent_run_id, navigation_id, action_id, identity_id, activation_id, sequence_run_id, experiment_id, allowed
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      event.agentRunId ?? null,
      event.navigationId ?? null,
      event.actionId ?? null,
      event.identityId ?? null,
      event.activationId ?? null,
      event.sequenceRunId ?? null,
      event.experimentId ?? null,
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
  return {
    upsertCapture,
    listCaptures,
    clearCaptures,
    deleteCapture,
    insertSslEvent,
    listSslEvents,
    insertWebSocketEvent,
    listWebSocketEvents,
    clearWebSocketEvents
  };
}

