import type { Debugger, WebContents } from "electron";
import { toCaptureEntry } from "../../shared/capture.js";
import type {
  CapturedRequest,
  WebSocketDirection,
  WebSocketEvent
} from "../../shared/domain.js";
import { MAX_REPLAY_BODY } from "../../shared/draft.js";
import { safeJsonHeaders } from "../../shared/headers.js";
import { truncateText } from "../../shared/text.js";

export type DebuggerWebSocketEventInput = {
  requestId: string;
  url: string;
  direction: WebSocketDirection;
  opcode?: number;
  payloadData?: string;
  status?: number;
  statusText?: string;
  error?: string;
  requestHeaders?: Record<string, unknown>;
  responseHeaders?: Record<string, unknown>;
  initiator?: string;
};

type ElectronDebuggerCaptureOptions = {
  resolveContents: (contentsId: number) => WebContents | undefined;
  allowlist: () => string[];
  captureById: (requestId: string) => CapturedRequest | undefined;
  rememberCapture: (capture: CapturedRequest) => void;
  createWebSocketEvent: (input: DebuggerWebSocketEventInput) => WebSocketEvent;
  rememberWebSocketEvent: (event: WebSocketEvent) => void;
};

export async function captureDebuggerResponseBody(
  debuggerApi: Pick<Debugger, "sendCommand">,
  requestId: string
) {
  try {
    const bodyResult = await debuggerApi.sendCommand("Network.getResponseBody", { requestId });
    const buffer = bodyResult.base64Encoded
      ? Buffer.from(bodyResult.body || "", "base64")
      : Buffer.from(bodyResult.body || "", "utf8");
    return truncateText(buffer.toString("utf8"));
  } catch {
    return "";
  }
}

export function createElectronDebuggerCapture({
  resolveContents,
  allowlist,
  captureById,
  rememberCapture,
  createWebSocketEvent,
  rememberWebSocketEvent
}: ElectronDebuggerCaptureOptions) {
  const attachedContents = new Set<number>();

  function attach(contentsId: number) {
    const id = Number(contentsId);
    const target = resolveContents(id);
    if (!target) {
      throw new Error("Browser surface was not found.");
    }

    if (attachedContents.has(id)) {
      return;
    }

    target.debugger.attach("1.3");
    void target.debugger.sendCommand("Network.enable", {
      maxPostDataSize: MAX_REPLAY_BODY
    });
    attachedContents.add(id);

    target.debugger.on("message", async (_event, method, params) => {
      if (method === "Network.requestWillBeSent") {
        rememberCapture(
          toCaptureEntry({
            requestId: params.requestId,
            request: {
              ...(params.request || {}),
              frameUrl: params.documentURL || params.frameId || "",
              initiator: params.initiator?.type || ""
            },
            rules: allowlist()
          })
        );
        return;
      }

      if (method === "Network.webSocketCreated") {
        rememberWebSocketEvent(
          createWebSocketEvent({
            requestId: params.requestId,
            url: params.url || "",
            direction: "handshake",
            payloadData: "WebSocket created",
            initiator: params.initiator?.type || ""
          })
        );
        return;
      }

      const entry = captureById(params.requestId);
      if (method === "Network.webSocketWillSendHandshakeRequest") {
        rememberWebSocketEvent(
          createWebSocketEvent({
            requestId: params.requestId,
            url: entry?.url || "",
            direction: "handshake",
            payloadData: "Client handshake",
            requestHeaders: params.request?.headers || {},
            initiator: entry?.initiator || ""
          })
        );
        return;
      }

      if (method === "Network.webSocketHandshakeResponseReceived") {
        const response = params.response || {};
        rememberWebSocketEvent(
          createWebSocketEvent({
            requestId: params.requestId,
            url: entry?.url || response.url || "",
            direction: "handshake",
            payloadData: "Server handshake",
            status: response.status,
            statusText: response.statusText || "",
            responseHeaders: response.headers || {},
            initiator: entry?.initiator || ""
          })
        );
        return;
      }

      if (method === "Network.webSocketFrameSent" || method === "Network.webSocketFrameReceived") {
        const frame = params.response || {};
        rememberWebSocketEvent(
          createWebSocketEvent({
            requestId: params.requestId,
            url: entry?.url || "",
            direction: method === "Network.webSocketFrameSent" ? "sent" : "received",
            opcode: frame.opcode,
            payloadData: frame.payloadData || "",
            initiator: entry?.initiator || ""
          })
        );
        return;
      }

      if (method === "Network.webSocketFrameError") {
        rememberWebSocketEvent(
          createWebSocketEvent({
            requestId: params.requestId,
            url: entry?.url || "",
            direction: "error",
            error: params.errorMessage || "WebSocket frame error",
            payloadData: params.errorMessage || "",
            initiator: entry?.initiator || ""
          })
        );
        return;
      }

      if (method === "Network.webSocketClosed") {
        rememberWebSocketEvent(
          createWebSocketEvent({
            requestId: params.requestId,
            url: entry?.url || "",
            direction: "closed",
            payloadData: "WebSocket closed",
            initiator: entry?.initiator || ""
          })
        );
        return;
      }

      if (!entry) {
        return;
      }

      if (method === "Network.responseReceived") {
        const response = params.response || {};
        const securityDetails = response.securityDetails || null;
        entry.status = response.status || null;
        entry.statusText = response.statusText || "";
        entry.mimeType = response.mimeType || "";
        entry.type = params.type || "Other";
        entry.responseHeaders = safeJsonHeaders(response.headers || {});
        entry.tls = securityDetails
          ? {
              protocol: securityDetails.protocol || "",
              issuer: securityDetails.issuer || "",
              subjectName: securityDetails.subjectName || "",
              validFrom: securityDetails.validFrom || 0,
              validTo: securityDetails.validTo || 0
            }
          : null;
        if (response.timing && typeof response.timing.receiveHeadersEnd === "number") {
          entry.durationMs = Math.max(0, Math.round(response.timing.receiveHeadersEnd));
        }
        rememberCapture(entry);
      }

      if (method === "Network.loadingFinished") {
        entry.responseBody = await captureDebuggerResponseBody(target.debugger, params.requestId);
        if (typeof params.encodedDataLength === "number") {
          entry.encodedDataLength = params.encodedDataLength;
        }
        rememberCapture(entry);
      }

      if (method === "Network.loadingFailed") {
        entry.statusText = params.errorText || "Failed";
        rememberCapture(entry);
      }
    });

    target.once("destroyed", () => {
      attachedContents.delete(id);
    });
  }

  return { attach };
}
