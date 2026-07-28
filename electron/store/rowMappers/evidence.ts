import type {
  CapturedRequest,
  SslEvent,
  WebSocketEvent
} from "../../../shared/domain.js";
import {
  parseInterceptJson,
  parseRecordJson,
  parseRewriteJson,
  parseTlsJson
} from "../json.js";
import type { CaptureRow, SslEventRow, WebSocketEventRow } from "../rows.js";

export function toCapture(row: CaptureRow): CapturedRequest {
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
    actionId: row.action_id || undefined,
    identityId: row.identity_id || undefined,
    activationId: row.activation_id || undefined,
    sequenceRunId: row.sequence_run_id || undefined,
    experimentId: row.experiment_id || undefined,
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

export function toSslEvent(row: SslEventRow): SslEvent {
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

export function toWebSocketEvent(row: WebSocketEventRow): WebSocketEvent {
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
    agentRunId: row.agent_run_id || undefined,
    navigationId: row.navigation_id || undefined,
    actionId: row.action_id || undefined,
    identityId: row.identity_id || undefined,
    activationId: row.activation_id || undefined,
    sequenceRunId: row.sequence_run_id || undefined,
    experimentId: row.experiment_id || undefined,
    allowed: row.allowed === 1
  };
}
