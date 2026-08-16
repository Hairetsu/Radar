import fs from "node:fs";
import path from "node:path";
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

type CdpBrowserVersion = {
  webSocketDebuggerUrl?: string;
};

export const MANAGED_BROWSER_OWNER_FILE = ".radar-managed-browser.json";

async function fetchCdpBrowserVersion(endpoint: string): Promise<CdpBrowserVersion> {
  const response = await fetch(`${endpoint.replace(/\/$/, "")}/json/version`, {
    signal: AbortSignal.timeout(750)
  });
  if (!response.ok) {
    throw new Error(`Chrome browser endpoint returned ${response.status}.`);
  }
  return (await response.json()) as CdpBrowserVersion;
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

function endpointPort(endpoint: string) {
  try {
    return Number(new URL(endpoint).port) || 0;
  } catch {
    return 0;
  }
}

function profileOwnerProcessIds(profileDir: string, endpoint: string) {
  const processIds = new Set<number>();
  try {
    const owner = JSON.parse(
      fs.readFileSync(path.join(profileDir, MANAGED_BROWSER_OWNER_FILE), "utf8")
    ) as { pid?: unknown; remoteDebuggingPort?: unknown };
    const pid = Math.round(Number(owner.pid));
    const port = Math.round(Number(owner.remoteDebuggingPort));
    if (Number.isInteger(pid) && pid > 0 && port === endpointPort(endpoint)) {
      processIds.add(pid);
    }
  } catch {
    /* A pre-owner-record browser can still be verified through Chrome's profile singleton. */
  }
  try {
    const singleton = fs.readlinkSync(path.join(profileDir, "SingletonLock"));
    const pid = Number(singleton.match(/-(\d+)$/)?.[1] || 0);
    if (Number.isInteger(pid) && pid > 0) {
      processIds.add(pid);
    }
  } catch {
    /* SingletonLock is platform-specific and may be unavailable after a clean exit. */
  }
  return [...processIds];
}

export async function closeCdpBrowserForProfile({
  endpoint,
  profileDir,
  fetchVersion = fetchCdpBrowserVersion,
  ownerProcessIds = profileOwnerProcessIds,
  createSocket
}: {
  endpoint: string;
  profileDir: string;
  fetchVersion?: (endpoint: string) => Promise<CdpBrowserVersion>;
  ownerProcessIds?: (profileDir: string, endpoint: string) => number[];
  createSocket?: (url: string) => CdpSocket;
}) {
  const expectedProcessIds = new Set(ownerProcessIds(profileDir, endpoint));
  if (expectedProcessIds.size === 0) {
    return false;
  }
  const version = await fetchVersion(endpoint);
  if (!version.webSocketDebuggerUrl) {
    return false;
  }
  const client = createCdpPageClient({
    resolveTarget: async () => ({ webSocketDebuggerUrl: version.webSocketDebuggerUrl }),
    ...(createSocket ? { createSocket } : {})
  });
  return client.withPage(async (sendCommand) => {
    const processInfo = (await sendCommand("SystemInfo.getProcessInfo")) as {
      processInfo?: Array<{ type?: unknown; id?: unknown }>;
    };
    const browserProcess = processInfo.processInfo?.find((process) => process.type === "browser");
    const ownsProfile = expectedProcessIds.has(Math.round(Number(browserProcess?.id)));
    if (!ownsProfile) {
      return false;
    }
    await sendCommand("Browser.close");
    return true;
  });
}
