import { describe, expect, it } from "vitest";
import { webSocketFrameToDraft, normalizeWebSocketReplayDraft } from "./websocketReplay.js";
import type { WebSocketEvent } from "./domain.js";

const frame: WebSocketEvent = {
  id: "ws-1",
  requestId: "req-1",
  createdAt: "2026-01-01T00:00:00.000Z",
  url: "wss://example.test/socket",
  host: "example.test",
  direction: "sent",
  opcode: 1,
  payloadData: '{"ping":true}',
  size: 13,
  requestHeaders: { Upgrade: "websocket" },
  responseHeaders: {},
  allowed: true
};

describe("websocketReplay", () => {
  it("builds a replay draft from sent frames", () => {
    expect(webSocketFrameToDraft(frame)).toEqual({
      url: "wss://example.test/socket",
      payload: '{"ping":true}',
      requestHeaders: { Upgrade: "websocket" },
      sourceFrameId: "ws-1",
      direction: "sent"
    });
  });

  it("rejects handshake frames", () => {
    expect(webSocketFrameToDraft({ ...frame, direction: "handshake", payloadData: "WebSocket created" })).toBeNull();
  });

  it("rejects frames without url or payload", () => {
    expect(webSocketFrameToDraft({ ...frame, url: "", payloadData: "ping" })).toBeNull();
    expect(webSocketFrameToDraft({ ...frame, payloadData: "" })).toBeNull();
  });

  it("normalizes replay drafts", () => {
    expect(
      normalizeWebSocketReplayDraft({
        url: "wss://example.test/socket",
        payload: "ping",
        requestHeaders: { Upgrade: "websocket" },
        sourceFrameId: "ws-1",
        direction: "sent"
      })?.payload
    ).toBe("ping");
    expect(normalizeWebSocketReplayDraft({ url: "", payload: "" })).toBeNull();
    expect(
      normalizeWebSocketReplayDraft({
        url: "wss://example.test/socket",
        payload: "pong",
        direction: "received",
        requestHeaders: ["bad"] as never
      })?.direction
    ).toBe("received");
  });
});
