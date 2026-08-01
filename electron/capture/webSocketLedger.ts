import { randomUUID } from "node:crypto";
import type {
  CompletedRequest,
  CompletedResponse,
  WebSocketClose,
  WebSocketMessage
} from "mockttp";
import { isAllowedTarget } from "../../shared/allowlist.js";
import type {
  WebSocketDirection,
  WebSocketEvent
} from "../../shared/domain.js";
import { safeJsonHeaders } from "../../shared/headers.js";
import { truncateText } from "../../shared/text.js";

export const HOT_WEBSOCKET_LIMIT = 1_000;

export type WebSocketEventInput = {
  requestId: string;
  url: string;
  direction: WebSocketDirection;
  opcode?: number;
  payloadData?: string;
  size?: number;
  status?: number;
  statusText?: string;
  error?: string;
  requestHeaders?: Record<string, unknown>;
  responseHeaders?: Record<string, unknown>;
  initiator?: string;
};

type WebSocketAttribution = Pick<
  WebSocketEvent,
  | "agentRunId"
  | "navigationId"
  | "actionId"
  | "identityId"
  | "activationId"
  | "sequenceRunId"
  | "experimentId"
>;

type WebSocketLedgerOptions = {
  currentSessionId: () => string;
  allowlist: () => string[];
  attribution: () => WebSocketAttribution;
  persist: (sessionId: string, event: WebSocketEvent) => void;
  load: (sessionId: string, limit: number) => WebSocketEvent[] | null;
  clearPersisted: (sessionId: string) => void;
};

function websocketHost(url: string) {
  try {
    return new URL(url).host;
  } catch {
    return url || "websocket";
  }
}

function proxyMessagePayload(message: WebSocketMessage) {
  const buffer = Buffer.from(message.content);
  if (!message.isBinary) return buffer.toString("utf8");
  return buffer.length === 0
    ? "[binary 0 bytes]"
    : `[binary ${buffer.length} bytes]\n${buffer.toString("base64")}`;
}

export function createWebSocketLedger({
  currentSessionId,
  allowlist,
  attribution,
  persist,
  load,
  clearPersisted
}: WebSocketLedgerOptions) {
  const events: WebSocketEvent[] = [];
  const connections = new Map<string, { url: string; initiator: string }>();
  const sessionIds = new Map<string, string>();

  function createEvent({
    requestId,
    url,
    direction,
    opcode,
    payloadData = "",
    size,
    status,
    statusText,
    error,
    requestHeaders,
    responseHeaders,
    initiator
  }: WebSocketEventInput): WebSocketEvent {
    return {
      id: `ws_${requestId}_${Date.now()}_${randomUUID()}`,
      requestId,
      createdAt: new Date().toISOString(),
      url,
      host: websocketHost(url),
      direction,
      opcode,
      payloadData: truncateText(payloadData || ""),
      size: typeof size === "number" ? size : Buffer.byteLength(payloadData || "", "utf8"),
      status,
      statusText,
      error,
      requestHeaders: safeJsonHeaders(requestHeaders || {}),
      responseHeaders: safeJsonHeaders(responseHeaders || {}),
      initiator,
      allowed: isAllowedTarget(url, allowlist())
    };
  }

  function rememberEvent(event: WebSocketEvent) {
    const activeSessionId = currentSessionId();
    const boundSessionId = sessionIds.get(event.requestId) || activeSessionId;
    if (boundSessionId && !sessionIds.has(event.requestId)) {
      sessionIds.set(event.requestId, boundSessionId);
    }
    const isActiveSession = Boolean(boundSessionId && boundSessionId === activeSessionId);
    if (event.initiator !== "proxy" && isActiveSession) {
      const context = attribution();
      event.agentRunId ||= context.agentRunId;
      event.navigationId ||= context.navigationId;
      event.actionId ||= context.actionId;
      event.identityId ||= context.identityId;
      event.activationId ||= context.activationId;
      event.sequenceRunId ||= context.sequenceRunId;
      event.experimentId ||= context.experimentId;
    }
    if (isActiveSession) {
      events.unshift(event);
      events.splice(HOT_WEBSOCKET_LIMIT);
    }
    if (boundSessionId) persist(boundSessionId, event);
  }

  function rememberConnection(requestId: string, url: string, initiator = "") {
    connections.set(requestId, { url, initiator });
    const sessionId = currentSessionId();
    if (sessionId && !sessionIds.has(requestId)) sessionIds.set(requestId, sessionId);
    while (connections.size > HOT_WEBSOCKET_LIMIT) {
      const oldest = connections.keys().next().value;
      if (!oldest) break;
      connections.delete(oldest);
    }
  }

  function connectionFor(requestId: string) {
    return connections.get(requestId) || { url: "", initiator: "proxy" };
  }

  function rememberProxyRequest(request: CompletedRequest) {
    rememberConnection(request.id, request.url, "proxy");
    rememberEvent(
      createEvent({
        requestId: request.id,
        url: request.url,
        direction: "handshake",
        payloadData: "Client handshake",
        requestHeaders: request.headers || {},
        initiator: "proxy"
      })
    );
  }

  function rememberProxyAccepted(response: CompletedResponse) {
    const connection = connectionFor(response.id);
    rememberEvent(
      createEvent({
        requestId: response.id,
        url: connection.url,
        direction: "handshake",
        payloadData: "Server handshake",
        status: response.statusCode,
        statusText: response.statusMessage || "",
        responseHeaders: response.headers || {},
        initiator: connection.initiator
      })
    );
  }

  function rememberProxyMessage(message: WebSocketMessage) {
    const connection = connectionFor(message.streamId);
    rememberEvent(
      createEvent({
        requestId: message.streamId,
        url: connection.url,
        direction: message.direction === "received" ? "sent" : "received",
        opcode: message.isBinary ? 2 : 1,
        payloadData: proxyMessagePayload(message),
        size: Buffer.from(message.content).length,
        initiator: connection.initiator
      })
    );
  }

  function rememberProxyClose(close: WebSocketClose) {
    const connection = connectionFor(close.streamId);
    rememberEvent(
      createEvent({
        requestId: close.streamId,
        url: connection.url,
        direction: "closed",
        payloadData: close.closeReason || "WebSocket closed",
        status: close.closeCode,
        initiator: connection.initiator
      })
    );
    connections.delete(close.streamId);
  }

  function hydrate(storedEvents: WebSocketEvent[], sessionId: string) {
    for (const event of storedEvents) sessionIds.set(event.requestId, sessionId);
    events.splice(0, events.length, ...storedEvents);
  }

  function list(limit = HOT_WEBSOCKET_LIMIT) {
    const sessionId = currentSessionId();
    const storedEvents = sessionId ? load(sessionId, limit) : null;
    return storedEvents || events.slice(0, limit);
  }

  function clear() {
    events.splice(0, events.length);
    const sessionId = currentSessionId();
    if (sessionId) clearPersisted(sessionId);
  }

  return {
    createEvent,
    rememberEvent,
    rememberProxyRequest,
    rememberProxyAccepted,
    rememberProxyMessage,
    rememberProxyClose,
    hydrate,
    list,
    eventMap: () => new Map(list().map((event) => [event.id, event])),
    clear
  };
}
