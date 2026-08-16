import { describe, expect, it, vi } from "vitest";
import type { CdpSocket } from "./chromeCaptureObserver.js";
import { closeCdpBrowserForProfile, createCdpPageClient } from "./cdpClient.js";

type SocketEvent = { data?: unknown };

class FakeCdpSocket implements CdpSocket {
  readyState = 1;
  readonly close = vi.fn();
  readonly commands: Array<Record<string, unknown>> = [];
  private readonly listeners = new Map<string, Set<(event: SocketEvent) => void>>();

  constructor(
    private readonly resultFor: (command: Record<string, unknown>) => Record<string, unknown>
  ) {}

  send(text: string) {
    const command = JSON.parse(text) as Record<string, unknown>;
    this.commands.push(command);
    void Promise.resolve().then(() => {
      this.emit("message", {
        data: JSON.stringify({ id: command.id, ...this.resultFor(command) })
      });
    });
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

  private emit(event: string, value: SocketEvent) {
    for (const listener of this.listeners.get(event) || []) listener(value);
  }
}

describe("CDP page client", () => {
  it("evaluates against one resolved page target and always closes the socket", async () => {
    const socket = new FakeCdpSocket(() => ({ result: { result: { value: "page text" } } }));
    const client = createCdpPageClient({
      resolveTarget: async () => ({ webSocketDebuggerUrl: "ws://debug/page" }),
      createSocket: () => socket
    });

    await expect(client.evaluate<string>("document.body.innerText")).resolves.toBe("page text");
    expect(socket.commands[0]).toEqual(
      expect.objectContaining({
        method: "Runtime.evaluate",
        params: expect.objectContaining({ expression: "document.body.innerText" })
      })
    );
    expect(socket.close).toHaveBeenCalledOnce();
  });

  it("surfaces CDP command and page evaluation errors", async () => {
    const commandErrorSocket = new FakeCdpSocket(() => ({ error: { message: "command denied" } }));
    const commandErrorClient = createCdpPageClient({
      resolveTarget: async () => ({ webSocketDebuggerUrl: "ws://debug/page" }),
      createSocket: () => commandErrorSocket
    });
    await expect(
      commandErrorClient.withPage((sendCommand) => sendCommand("Runtime.evaluate"))
    ).rejects.toThrow("command denied");
    expect(commandErrorSocket.close).toHaveBeenCalledOnce();

    const pageErrorSocket = new FakeCdpSocket(() => ({
      result: { exceptionDetails: { text: "evaluation failed" } }
    }));
    const pageErrorClient = createCdpPageClient({
      resolveTarget: async () => ({ webSocketDebuggerUrl: "ws://debug/page" }),
      createSocket: () => pageErrorSocket
    });
    await expect(pageErrorClient.evaluate("throw new Error()"))
      .rejects.toThrow("evaluation failed");
  });

  it("fails closed when the selected target has no debugger socket", async () => {
    const client = createCdpPageClient({ resolveTarget: async () => ({ type: "page" }) });
    await expect(client.withPage(async () => undefined)).rejects.toThrow(
      "No Chrome debugger WebSocket URL"
    );
  });

  it("closes only a browser that owns the exact Radar profile directory", async () => {
    const ownedSocket = new FakeCdpSocket((command) =>
      command.method === "SystemInfo.getProcessInfo"
        ? { result: { processInfo: [{ type: "browser", id: 4_242 }] } }
        : { result: {} }
    );
    await expect(
      closeCdpBrowserForProfile({
        endpoint: "http://127.0.0.1:9223",
        profileDir: "/tmp/radar-profile",
        fetchVersion: async () => ({ webSocketDebuggerUrl: "ws://debug/browser" }),
        ownerProcessIds: () => [4_242],
        createSocket: () => ownedSocket
      })
    ).resolves.toBe(true);
    expect(ownedSocket.commands.map((command) => command.method)).toEqual([
      "SystemInfo.getProcessInfo",
      "Browser.close"
    ]);

    const unrelatedSocket = new FakeCdpSocket(() => ({
      result: { processInfo: [{ type: "browser", id: 8_888 }] }
    }));
    await expect(
      closeCdpBrowserForProfile({
        endpoint: "http://127.0.0.1:9224",
        profileDir: "/tmp/radar-profile",
        fetchVersion: async () => ({ webSocketDebuggerUrl: "ws://debug/unrelated" }),
        ownerProcessIds: () => [4_242],
        createSocket: () => unrelatedSocket
      })
    ).resolves.toBe(false);
    expect(unrelatedSocket.commands.map((command) => command.method)).toEqual([
      "SystemInfo.getProcessInfo"
    ]);
  });
});
