import type { CdpListEntry } from "../chromeDebugging.js";
import type { CdpSocket } from "./chromeCaptureObserver.js";

export type CdpSendCommand = (
  method: string,
  params?: Record<string, unknown>
) => Promise<unknown>;

type CdpRuntimeEvaluation<T> = {
  result?: { value?: T; description?: string };
  exceptionDetails?: {
    text?: string;
    exception?: { description?: string; value?: unknown };
  };
};

function defaultSocketFactory(url: string) {
  const WebSocketCtor = (globalThis as unknown as { WebSocket?: new (socketUrl: string) => CdpSocket })
    .WebSocket;
  if (!WebSocketCtor) throw new Error("WebSocket support is not available in this runtime.");
  return new WebSocketCtor(url);
}

export async function fetchCdpTargets(endpoint: string) {
  const response = await fetch(`${endpoint.replace(/\/$/, "")}/json/list`);
  if (!response.ok) throw new Error(`Chrome debugging endpoint returned ${response.status}.`);
  return (await response.json()) as CdpListEntry[];
}

export async function waitForChromeDebugger(endpoint: string, timeoutMs = 8_000) {
  const started = Date.now();
  let lastError: unknown;
  while (Date.now() - started < timeoutMs) {
    try {
      return await fetchCdpTargets(endpoint);
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("Chrome debugging endpoint is unavailable.");
}

export function createCdpPageClient({
  resolveTarget,
  createSocket = defaultSocketFactory
}: {
  resolveTarget: () => Promise<CdpListEntry>;
  createSocket?: (url: string) => CdpSocket;
}) {
  async function withPage<T>(callback: (sendCommand: CdpSendCommand) => Promise<T>) {
    const target = await resolveTarget();
    if (!target.webSocketDebuggerUrl) {
      throw new Error("No Chrome debugger WebSocket URL is available.");
    }
    const socket = createSocket(target.webSocketDebuggerUrl);
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("Timed out connecting to Chrome debugger.")),
        5_000
      );
      socket.addEventListener(
        "open",
        () => {
          clearTimeout(timeout);
          resolve();
        },
        { once: true }
      );
      socket.addEventListener(
        "error",
        () => {
          clearTimeout(timeout);
          reject(new Error("Chrome debugger connection failed."));
        },
        { once: true }
      );
    });

    let id = 0;
    const sendCommand: CdpSendCommand = (method, params = {}) => {
      id += 1;
      const commandId = id;
      return new Promise<unknown>((resolve, reject) => {
        const timeout = setTimeout(() => {
          socket.removeEventListener("message", onMessage);
          reject(new Error(`Chrome debugger command timed out: ${method}`));
        }, 5_000);
        const onMessage = (event: { data?: unknown }) => {
          const payload = JSON.parse(String(event.data || "{}")) as {
            id?: number;
            result?: unknown;
            error?: { message?: string };
          };
          if (payload.id !== commandId) return;
          clearTimeout(timeout);
          socket.removeEventListener("message", onMessage);
          if (payload.error) {
            reject(new Error(payload.error.message || `Chrome debugger command failed: ${method}`));
            return;
          }
          resolve(payload.result);
        };
        socket.addEventListener("message", onMessage);
        socket.send(JSON.stringify({ id: commandId, method, params }));
      });
    };

    try {
      return await callback(sendCommand);
    } finally {
      socket.close();
    }
  }

  async function evaluate<T>(expression: string) {
    const result = (await withPage((sendCommand) =>
      sendCommand("Runtime.evaluate", {
        expression,
        returnByValue: true,
        awaitPromise: true
      })
    )) as CdpRuntimeEvaluation<T>;
    if (result.exceptionDetails) {
      throw new Error(
        result.exceptionDetails.exception?.description ||
          result.exceptionDetails.text ||
          "Chrome page evaluation failed."
      );
    }
    return result.result?.value;
  }

  return { withPage, evaluate };
}
