import { EventEmitter } from "node:events";
import type { Debugger, WebContents } from "electron";
import { describe, expect, it, vi } from "vitest";
import type { WebSocketEvent } from "../../shared/domain.js";
import {
  captureDebuggerResponseBody,
  createElectronDebuggerCapture,
  type DebuggerWebSocketEventInput
} from "./electronDebuggerCapture.js";

class FakeDebugger extends EventEmitter {
  readonly attach = vi.fn();
  readonly sendCommand = vi.fn(async (method: string) => {
    if (method === "Network.getResponseBody") {
      return { body: Buffer.from("response text").toString("base64"), base64Encoded: true };
    }
    return {};
  });
}

class FakeContents extends EventEmitter {
  readonly debugger = new FakeDebugger();
}

function webSocketEvent(input: DebuggerWebSocketEventInput): WebSocketEvent {
  return {
    ...input,
    id: `event-${input.requestId}`,
    createdAt: "2026-07-31T00:00:00.000Z",
    host: "localhost",
    payloadData: input.payloadData || "",
    size: Buffer.byteLength(input.payloadData || ""),
    allowed: true,
    requestHeaders: {},
    responseHeaders: {}
  };
}

describe("electron debugger capture", () => {
  it("decodes response bodies and fails closed when CDP cannot return one", async () => {
    const debuggerApi = new FakeDebugger();
    await expect(
      captureDebuggerResponseBody(debuggerApi as unknown as Pick<Debugger, "sendCommand">, "request-1")
    ).resolves.toBe("response text");

    debuggerApi.sendCommand.mockRejectedValueOnce(new Error("body unavailable"));
    await expect(
      captureDebuggerResponseBody(debuggerApi as unknown as Pick<Debugger, "sendCommand">, "request-2")
    ).resolves.toBe("");
  });

  it("attaches once per live surface and records CDP requests", () => {
    const contents = new FakeContents();
    const rememberCapture = vi.fn();
    const capture = createElectronDebuggerCapture({
      resolveContents: () => contents as unknown as WebContents,
      allowlist: () => ["http://localhost:*"],
      captureById: () => undefined,
      rememberCapture,
      createWebSocketEvent: webSocketEvent,
      rememberWebSocketEvent: vi.fn()
    });

    capture.attach(7);
    capture.attach(7);
    contents.debugger.emit("message", {}, "Network.requestWillBeSent", {
      requestId: "request-1",
      request: {
        method: "GET",
        url: "http://localhost:3000/health",
        headers: {}
      },
      documentURL: "http://localhost:3000/"
    });

    expect(contents.debugger.attach).toHaveBeenCalledTimes(1);
    expect(contents.debugger.sendCommand).toHaveBeenCalledWith("Network.enable", {
      maxPostDataSize: expect.any(Number)
    });
    expect(rememberCapture).toHaveBeenCalledWith(
      expect.objectContaining({ id: "request-1", path: "/health", allowed: true })
    );

    contents.emit("destroyed");
    capture.attach(7);
    expect(contents.debugger.attach).toHaveBeenCalledTimes(2);
  });

  it("rejects missing browser surfaces", () => {
    const capture = createElectronDebuggerCapture({
      resolveContents: () => undefined,
      allowlist: () => [],
      captureById: () => undefined,
      rememberCapture: vi.fn(),
      createWebSocketEvent: webSocketEvent,
      rememberWebSocketEvent: vi.fn()
    });

    expect(() => capture.attach(999)).toThrow("Browser surface was not found.");
  });
});
