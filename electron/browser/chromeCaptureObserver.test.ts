import { describe, expect, it, vi } from "vitest";
import type { CapturedRequest, WebSocketEvent } from "../../shared/domain.js";
import {
  createChromeCaptureObserver,
  type CdpSocket
} from "./chromeCaptureObserver.js";
import type { DebuggerWebSocketEventInput } from "./electronDebuggerCapture.js";

type SocketEvent = { data?: unknown };

class FakeSocket implements CdpSocket {
  readyState = 1;
  readonly sent: Array<Record<string, unknown>> = [];
  readonly close = vi.fn();
  private readonly listeners = new Map<string, Set<(event: SocketEvent) => void>>();

  send(text: string) {
    const message = JSON.parse(text) as Record<string, unknown>;
    this.sent.push(message);
    void Promise.resolve().then(() =>
      this.emit("message", { data: JSON.stringify({ id: message.id, result: {} }) })
    );
  }

  addEventListener(event: string, listener: (event: SocketEvent) => void) {
    const listeners = this.listeners.get(event) || new Set();
    listeners.add(listener);
    this.listeners.set(event, listeners);
    if (event === "open") void Promise.resolve().then(() => listener({}));
  }

  removeEventListener(event: string, listener: (event: SocketEvent) => void) {
    this.listeners.get(event)?.delete(listener);
  }

  emit(event: string, value: SocketEvent) {
    for (const listener of this.listeners.get(event) || []) listener(value);
  }
}

function webSocketEvent(input: DebuggerWebSocketEventInput): WebSocketEvent {
  return {
    ...input,
    id: `event-${input.requestId}`,
    createdAt: "2026-07-31T00:00:00.000Z",
    host: "localhost",
    payloadData: input.payloadData || "",
    size: Buffer.byteLength(input.payloadData || ""),
    allowed: true
  };
}

describe("Chrome capture observer", () => {
  it("owns CDP request state and binds captures to the session active at connection time", async () => {
    const socket = new FakeSocket();
    const captures = new Map<string, CapturedRequest>();
    const bindCaptureToSession = vi.fn();
    const observer = createChromeCaptureObserver({
      waitForDebugger: vi.fn(async () => [
        { id: "page-1", type: "page", url: "http://localhost", webSocketDebuggerUrl: "ws://debug" }
      ]),
      currentSessionId: () => "session-1",
      allowlist: () => ["http://localhost:*"],
      attribution: () => ({ actionId: "action-1" }),
      bindCaptureToSession,
      captureById: (captureId) => captures.get(captureId),
      rememberCapture: (capture) => captures.set(capture.id, capture),
      createWebSocketEvent: webSocketEvent,
      rememberWebSocketEvent: vi.fn(),
      createSocket: () => socket
    });

    await observer.start("http://127.0.0.1:9223");
    socket.emit("message", {
      data: JSON.stringify({
        method: "Network.requestWillBeSent",
        params: {
          requestId: "cdp-1",
          request: { method: "GET", url: "http://localhost:3000/api", headers: {} },
          initiator: { type: "script" }
        }
      })
    });
    await Promise.resolve();

    const capture = [...captures.values()][0];
    expect(capture).toEqual(
      expect.objectContaining({ path: "/api", initiator: "script", allowed: true })
    );
    expect(bindCaptureToSession).toHaveBeenCalledWith(capture, "session-1");
    expect(socket.sent[0]).toEqual(
      expect.objectContaining({ method: "Network.enable", params: expect.any(Object) })
    );
    expect(observer.instanceId()).not.toBe("");

    observer.stop();
    expect(socket.close).toHaveBeenCalledOnce();
    expect(observer.instanceId()).toBe("");
  });

  it("records WebSocket events with causal attribution", async () => {
    const socket = new FakeSocket();
    const rememberWebSocketEvent = vi.fn();
    const observer = createChromeCaptureObserver({
      waitForDebugger: async () => [
        { id: "page-1", type: "page", url: "http://localhost", webSocketDebuggerUrl: "ws://debug" }
      ],
      currentSessionId: () => "session-1",
      allowlist: () => [],
      attribution: () => ({ agentRunId: "run-1", navigationId: "navigation-1" }),
      bindCaptureToSession: vi.fn(),
      captureById: () => undefined,
      rememberCapture: vi.fn(),
      createWebSocketEvent: webSocketEvent,
      rememberWebSocketEvent,
      createSocket: () => socket
    });
    await observer.start("http://127.0.0.1:9223");

    socket.emit("message", {
      data: JSON.stringify({
        method: "Network.webSocketCreated",
        params: { requestId: "ws-1", url: "ws://localhost:3000/socket" }
      })
    });
    await Promise.resolve();

    expect(rememberWebSocketEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: "ws-1",
        direction: "handshake",
        agentRunId: "run-1",
        navigationId: "navigation-1"
      })
    );
  });

  it("fails closed when no debuggable target exists", async () => {
    const observer = createChromeCaptureObserver({
      waitForDebugger: async () => [],
      currentSessionId: () => "",
      allowlist: () => [],
      attribution: () => ({}),
      bindCaptureToSession: vi.fn(),
      captureById: () => undefined,
      rememberCapture: vi.fn(),
      createWebSocketEvent: webSocketEvent,
      rememberWebSocketEvent: vi.fn()
    });

    await expect(observer.start("http://127.0.0.1:9223")).rejects.toThrow(
      "No debuggable Chrome page"
    );
  });
});
