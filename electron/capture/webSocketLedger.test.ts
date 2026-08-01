import { describe, expect, it, vi } from "vitest";
import type {
  CompletedRequest,
  CompletedResponse,
  WebSocketClose,
  WebSocketMessage
} from "mockttp";
import type { WebSocketEvent } from "../../shared/domain.js";
import { createWebSocketLedger } from "./webSocketLedger.js";

function createLedger(overrides: {
  sessionId?: () => string;
  load?: (sessionId: string, limit: number) => WebSocketEvent[] | null;
} = {}) {
  const persist = vi.fn();
  const clearPersisted = vi.fn();
  const ledger = createWebSocketLedger({
    currentSessionId: overrides.sessionId || (() => "session-1"),
    allowlist: () => ["ws://localhost:*"],
    attribution: () => ({ agentRunId: "run-1", actionId: "action-1" }),
    persist,
    load: overrides.load || (() => null),
    clearPersisted
  });
  return { ledger, persist, clearPersisted };
}

describe("WebSocket ledger", () => {
  it("creates bounded, scoped events and applies causal attribution", () => {
    const { ledger, persist } = createLedger();
    const event = ledger.createEvent({
      requestId: "ws-1",
      url: "ws://localhost:3000/socket",
      direction: "received",
      payloadData: "hello",
      requestHeaders: { Authorization: "secret" },
      initiator: "chrome-cdp"
    });

    ledger.rememberEvent(event);

    expect(event).toEqual(
      expect.objectContaining({
        host: "localhost:3000",
        size: 5,
        allowed: true,
        agentRunId: "run-1",
        actionId: "action-1"
      })
    );
    expect(event.requestHeaders).toEqual({ Authorization: "secret" });
    expect(ledger.list()).toEqual([event]);
    expect(persist).toHaveBeenCalledWith("session-1", event);
  });

  it("keeps a request bound to its original session across context changes", () => {
    let sessionId = "session-1";
    const { ledger, persist } = createLedger({ sessionId: () => sessionId });
    ledger.rememberEvent(
      ledger.createEvent({
        requestId: "ws-1",
        url: "ws://localhost:3000/socket",
        direction: "handshake",
        initiator: "proxy"
      })
    );
    sessionId = "session-2";
    const lateEvent = ledger.createEvent({
      requestId: "ws-1",
      url: "ws://localhost:3000/socket",
      direction: "closed",
      initiator: "proxy"
    });
    ledger.rememberEvent(lateEvent);

    expect(persist).toHaveBeenLastCalledWith("session-1", lateEvent);
    expect(ledger.list()).toHaveLength(1);
  });

  it("hydrates, reads, maps, and clears the active session through explicit persistence ports", () => {
    const storedEvent = {
      id: "stored-1",
      requestId: "ws-stored",
      createdAt: "2026-07-31T00:00:00.000Z",
      url: "ws://localhost/socket",
      host: "localhost",
      direction: "handshake" as const,
      payloadData: "connected",
      size: 9,
      allowed: true
    };
    const { ledger, clearPersisted } = createLedger({ load: () => [storedEvent] });
    ledger.hydrate([storedEvent], "session-1");

    expect(ledger.list()).toEqual([storedEvent]);
    expect(ledger.eventMap().get("stored-1")).toEqual(storedEvent);

    ledger.clear();
    expect(clearPersisted).toHaveBeenCalledWith("session-1");
  });

  it("records the complete proxy WebSocket lifecycle", () => {
    const { ledger } = createLedger();
    ledger.rememberProxyRequest({
      id: "ws-proxy",
      url: "ws://localhost:3000/socket",
      headers: { Upgrade: "websocket" }
    } as unknown as CompletedRequest);
    ledger.rememberProxyAccepted({
      id: "ws-proxy",
      statusCode: 101,
      statusMessage: "Switching Protocols",
      headers: { Upgrade: "websocket" }
    } as unknown as CompletedResponse);
    ledger.rememberProxyMessage({
      streamId: "ws-proxy",
      direction: "received",
      isBinary: false,
      content: Buffer.from("hello")
    } as unknown as WebSocketMessage);
    ledger.rememberProxyClose({
      streamId: "ws-proxy",
      closeCode: 1000,
      closeReason: "done"
    } as unknown as WebSocketClose);

    expect(ledger.list().map((event) => event.direction)).toEqual([
      "closed",
      "sent",
      "handshake",
      "handshake"
    ]);
    expect(ledger.list()[1]).toEqual(
      expect.objectContaining({ payloadData: "hello", opcode: 1, initiator: "proxy" })
    );
  });
});
