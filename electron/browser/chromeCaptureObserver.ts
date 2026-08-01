import { randomUUID } from "node:crypto";
import { toCaptureEntry } from "../../shared/capture.js";
import type {
  CapturedRequest,
  WebSocketDirection,
  WebSocketEvent
} from "../../shared/domain.js";
import { MAX_REPLAY_BODY } from "../../shared/draft.js";
import { safeJsonHeaders } from "../../shared/headers.js";
import { truncateText } from "../../shared/text.js";
import type { CdpListEntry } from "../chromeDebugging.js";
import type { DebuggerWebSocketEventInput } from "./electronDebuggerCapture.js";

export type CdpSocket = {
  readyState: number;
  send: (text: string) => void;
  close: () => void;
  addEventListener: (
    event: string,
    listener: (event: { data?: unknown }) => void,
    options?: { once?: boolean }
  ) => void;
  removeEventListener: (event: string, listener: (event: { data?: unknown }) => void) => void;
};

type CaptureAttribution = Pick<
  WebSocketEvent,
  | "agentRunId"
  | "navigationId"
  | "actionId"
  | "identityId"
  | "activationId"
  | "sequenceRunId"
  | "experimentId"
>;

type ChromeCaptureObserverOptions = {
  waitForDebugger: (endpoint: string, timeoutMs: number) => Promise<CdpListEntry[]>;
  currentSessionId: () => string;
  allowlist: () => string[];
  attribution: () => CaptureAttribution;
  bindCaptureToSession: (capture: CapturedRequest, sessionId: string) => void;
  captureById: (captureId: string) => CapturedRequest | undefined;
  rememberCapture: (capture: CapturedRequest) => void;
  createWebSocketEvent: (input: DebuggerWebSocketEventInput) => WebSocketEvent;
  rememberWebSocketEvent: (event: WebSocketEvent) => void;
  createSocket?: (url: string) => CdpSocket;
};

type PendingCommand = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
};

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function defaultSocketFactory(url: string) {
  const WebSocketCtor = (globalThis as unknown as { WebSocket?: new (socketUrl: string) => CdpSocket })
    .WebSocket;
  if (!WebSocketCtor) {
    throw new Error("WebSocket support is not available in this runtime.");
  }
  return new WebSocketCtor(url);
}

export function createChromeCaptureObserver({
  waitForDebugger,
  currentSessionId,
  allowlist,
  attribution,
  bindCaptureToSession,
  captureById,
  rememberCapture,
  createWebSocketEvent,
  rememberWebSocketEvent,
  createSocket = defaultSocketFactory
}: ChromeCaptureObserverOptions) {
  let socket: CdpSocket | null = null;
  let observerInstanceId = "";
  let observerSessionId = "";
  let commandId = 0;
  const requestIds = new Map<string, string>();
  const webSockets = new Map<string, { url: string } & CaptureAttribution>();
  const pendingCommands = new Map<number, PendingCommand>();

  function stop() {
    for (const pending of pendingCommands.values()) {
      clearTimeout(pending.timeout);
      pending.reject(new Error("Chrome observer stopped."));
    }
    pendingCommands.clear();
    requestIds.clear();
    webSockets.clear();
    observerInstanceId = "";
    observerSessionId = "";
    try {
      socket?.close();
    } catch {
      /* Shutdown remains best-effort after pending work is rejected. */
    }
    socket = null;
  }

  function sendCommand(method: string, params: Record<string, unknown> = {}) {
    const activeSocket = socket;
    if (!activeSocket || activeSocket.readyState !== 1) {
      return Promise.reject(new Error("Chrome observer is not connected."));
    }
    commandId += 1;
    const id = commandId;
    return new Promise<unknown>((resolve, reject) => {
      const timeout = setTimeout(() => {
        pendingCommands.delete(id);
        reject(new Error(`Chrome observer command timed out: ${method}`));
      }, 5_000);
      pendingCommands.set(id, { resolve, reject, timeout });
      activeSocket.send(JSON.stringify({ id, method, params }));
    });
  }

  async function handleEvent(method: string, rawParams: unknown) {
    const params = recordValue(rawParams);
    const rawRequestId = String(params.requestId || "");
    if (!rawRequestId) return;
    const captureId = requestIds.get(rawRequestId) || `chrome_${observerInstanceId}_${rawRequestId}`;

    if (method === "Network.webSocketCreated") {
      const context = { url: String(params.url || ""), ...attribution() };
      webSockets.set(rawRequestId, context);
      rememberWebSocketEvent({
        ...createWebSocketEvent({
          requestId: rawRequestId,
          url: context.url,
          direction: "handshake",
          payloadData: "WebSocket created",
          initiator: "chrome-cdp"
        }),
        ...context
      });
      return;
    }

    const webSocketContext = webSockets.get(rawRequestId);
    if (webSocketContext && method.startsWith("Network.webSocket")) {
      const frame = recordValue(params.response);
      const request = recordValue(params.request);
      const response = recordValue(params.response);
      const direction: WebSocketDirection =
        method === "Network.webSocketFrameSent"
          ? "sent"
          : method === "Network.webSocketFrameReceived"
            ? "received"
            : method === "Network.webSocketFrameError"
              ? "error"
              : method === "Network.webSocketClosed"
                ? "closed"
                : "handshake";
      const event = createWebSocketEvent({
        requestId: rawRequestId,
        url: webSocketContext.url,
        direction,
        opcode: typeof frame.opcode === "number" ? frame.opcode : undefined,
        payloadData:
          String(frame.payloadData || params.errorMessage || "") ||
          (direction === "closed"
            ? "WebSocket closed"
            : direction === "handshake"
              ? "WebSocket handshake"
              : ""),
        status: typeof response.status === "number" ? response.status : undefined,
        statusText: String(response.statusText || ""),
        error:
          direction === "error"
            ? String(params.errorMessage || "WebSocket frame error")
            : undefined,
        requestHeaders: recordValue(request.headers),
        responseHeaders: recordValue(response.headers),
        initiator: "chrome-cdp"
      });
      rememberWebSocketEvent({ ...event, ...webSocketContext });
      if (direction === "closed") webSockets.delete(rawRequestId);
      return;
    }

    if (method === "Network.requestWillBeSent") {
      const request = recordValue(params.request);
      const initiator = recordValue(params.initiator);
      const next = toCaptureEntry({
        requestId: captureId,
        request: {
          method: String(request.method || "GET"),
          url: String(request.url || ""),
          headers: recordValue(request.headers),
          postData: String(request.postData || ""),
          frameUrl: String(params.documentURL || params.frameId || ""),
          initiator: String(initiator.type || "")
        },
        rules: allowlist()
      });
      bindCaptureToSession(next, observerSessionId);
      requestIds.set(rawRequestId, captureId);
      rememberCapture(next);
      return;
    }

    const entry = captureById(captureId);
    if (!entry) return;
    if (method === "Network.responseReceived") {
      const response = recordValue(params.response);
      const securityDetails = recordValue(response.securityDetails);
      const timing = recordValue(response.timing);
      entry.status = typeof response.status === "number" ? response.status : null;
      entry.statusText = String(response.statusText || "");
      entry.mimeType = String(response.mimeType || "");
      entry.type = String(params.type || "Other");
      entry.responseHeaders = safeJsonHeaders(recordValue(response.headers));
      entry.tls = Object.keys(securityDetails).length
        ? {
            protocol: String(securityDetails.protocol || ""),
            issuer: String(securityDetails.issuer || ""),
            subjectName: String(securityDetails.subjectName || ""),
            validFrom: Number(securityDetails.validFrom || 0),
            validTo: Number(securityDetails.validTo || 0)
          }
        : null;
      if (typeof timing.receiveHeadersEnd === "number") {
        entry.durationMs = Math.max(0, Math.round(timing.receiveHeadersEnd));
      }
      rememberCapture(entry);
      return;
    }
    if (method === "Network.loadingFinished") {
      try {
        const bodyResult = recordValue(
          await sendCommand("Network.getResponseBody", { requestId: rawRequestId })
        );
        const body = String(bodyResult.body || "");
        entry.responseBody = truncateText(
          bodyResult.base64Encoded ? Buffer.from(body, "base64").toString("utf8") : body
        );
      } catch {
        entry.responseBody = "";
      }
      if (typeof params.encodedDataLength === "number") {
        entry.encodedDataLength = params.encodedDataLength;
      }
      rememberCapture(entry);
      return;
    }
    if (method === "Network.loadingFailed") {
      entry.statusText = String(params.errorText || "Failed");
      rememberCapture(entry);
    }
  }

  async function start(endpoint: string) {
    stop();
    const targets = await waitForDebugger(endpoint, 8_000);
    const target =
      targets.find((item) => item.type === "page" && item.webSocketDebuggerUrl) ||
      targets.find((item) => item.webSocketDebuggerUrl);
    if (!target?.webSocketDebuggerUrl) {
      throw new Error("No debuggable Chrome page is available for causal capture.");
    }
    const nextSocket = createSocket(target.webSocketDebuggerUrl);
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("Timed out connecting the Chrome causal observer.")),
        5_000
      );
      nextSocket.addEventListener(
        "open",
        () => {
          clearTimeout(timeout);
          resolve();
        },
        { once: true }
      );
      nextSocket.addEventListener(
        "error",
        () => {
          clearTimeout(timeout);
          reject(new Error("Chrome causal observer connection failed."));
        },
        { once: true }
      );
    });
    socket = nextSocket;
    observerInstanceId = randomUUID();
    observerSessionId = currentSessionId();
    nextSocket.addEventListener("message", (event) => {
      let message: Record<string, unknown>;
      try {
        message = recordValue(JSON.parse(String(event.data || "{}")));
      } catch {
        return;
      }
      if (typeof message.id === "number") {
        const pending = pendingCommands.get(message.id);
        if (!pending) return;
        clearTimeout(pending.timeout);
        pendingCommands.delete(message.id);
        const error = recordValue(message.error);
        if (Object.keys(error).length) {
          pending.reject(new Error(String(error.message || "Chrome observer command failed.")));
        } else {
          pending.resolve(message.result);
        }
        return;
      }
      if (typeof message.method === "string") {
        void handleEvent(message.method, message.params);
      }
    });
    await sendCommand("Network.enable", { maxPostDataSize: MAX_REPLAY_BODY });
  }

  return {
    start,
    stop,
    instanceId: () => observerInstanceId
  };
}
