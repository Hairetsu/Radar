import type { WebSocketEvent, WebSocketReplayDraft } from "./domain.js";

export const MAX_WEBSOCKET_REPLAY_PAYLOAD = 100_000;

function cleanText(value: unknown, max: number) {
  return String(value || "").trim().slice(0, max);
}

export function webSocketFrameToDraft(event: WebSocketEvent): WebSocketReplayDraft | null {
  if (event.direction !== "sent" && event.direction !== "received") {
    return null;
  }
  if (!event.url || !event.payloadData) {
    return null;
  }
  return {
    url: event.url,
    payload: cleanText(event.payloadData, MAX_WEBSOCKET_REPLAY_PAYLOAD),
    requestHeaders: event.requestHeaders || {},
    sourceFrameId: event.id,
    direction: event.direction
  };
}

export function normalizeWebSocketReplayDraft(input: Partial<WebSocketReplayDraft>): WebSocketReplayDraft | null {
  const url = cleanText(input.url, 2000);
  const payload = cleanText(input.payload, MAX_WEBSOCKET_REPLAY_PAYLOAD);
  if (!url || !payload) {
    return null;
  }
  const direction = input.direction === "received" ? "received" : "sent";
  const headers =
    input.requestHeaders && typeof input.requestHeaders === "object" && !Array.isArray(input.requestHeaders)
      ? Object.fromEntries(
          Object.entries(input.requestHeaders).map(([key, value]) => [cleanText(key, 120), cleanText(value, 4000)])
        )
      : {};
  return {
    url,
    payload,
    requestHeaders: headers,
    sourceFrameId: cleanText(input.sourceFrameId, 80),
    direction
  };
}
