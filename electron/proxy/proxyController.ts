import fs from "node:fs";
import path from "node:path";
import {
  generateCACertificate,
  generateSPKIFingerprint,
  getLocal,
  type CompletedRequest,
  type CompletedResponse,
  type WebSocketClose,
  type WebSocketMessage
} from "mockttp";
import { proxyRequestToCapture } from "../../shared/capture.js";
import type { CapturedRequest, ProxyState, SslEvent } from "../../shared/domain.js";
import { safeJsonHeaders } from "../../shared/headers.js";
import { MAX_CAPTURED_BODY, truncateText } from "../../shared/text.js";
import type {
  ProxyPassThroughResponse,
  ProxyRequestCallbackResult,
  ProxyResponseCallbackResult
} from "../intercept/interceptController.js";
import { trustProxyCa } from "../trustCa.js";

type ProxyControllerOptions = {
  userDataPath: string;
  regressionMode: boolean;
  defaultPort: number;
  currentSessionId: () => string;
  allowlist: () => string[];
  captureById: (captureId: string) => CapturedRequest | undefined;
  bindCaptureToCurrentSession: (captureId: string) => void;
  bindCaptureToSession: (capture: CapturedRequest, sessionId: string) => CapturedRequest;
  rememberCapture: (capture: CapturedRequest) => void;
  rememberSslEvent: (event: SslEvent) => void;
  rememberWebSocketRequest: (request: CompletedRequest) => void;
  rememberWebSocketAccepted: (response: CompletedResponse) => void;
  rememberWebSocketMessage: (message: WebSocketMessage) => void;
  rememberWebSocketClose: (close: WebSocketClose) => void;
  queueInterceptRequest: (request: CompletedRequest) => Promise<ProxyRequestCallbackResult>;
  queueInterceptResponse: (
    response: ProxyPassThroughResponse,
    request: CompletedRequest
  ) => Promise<ProxyResponseCallbackResult>;
};

export function createProxyController({
  userDataPath,
  regressionMode,
  defaultPort,
  currentSessionId,
  allowlist,
  captureById,
  bindCaptureToCurrentSession,
  bindCaptureToSession,
  rememberCapture,
  rememberSslEvent,
  rememberWebSocketRequest,
  rememberWebSocketAccepted,
  rememberWebSocketMessage,
  rememberWebSocketClose,
  queueInterceptRequest,
  queueInterceptResponse
}: ProxyControllerOptions) {
  let server: ReturnType<typeof getLocal> | undefined;
  let starting: Promise<ProxyState> | undefined;
  let state: ProxyState = {
    running: false,
    port: defaultPort,
    proxyUrl: `http://127.0.0.1:${defaultPort}`,
    caCertPath: "",
    caKeyPath: "",
    caFingerprint: ""
  };

  async function ensureCa() {
    const caDir = path.join(userDataPath, "proxy-ca");
    const caCertPath = path.join(caDir, "radar-ca.pem");
    const caKeyPath = path.join(caDir, "radar-ca-key.pem");
    fs.mkdirSync(caDir, { recursive: true });
    if (!fs.existsSync(caCertPath) || !fs.existsSync(caKeyPath)) {
      const ca = await generateCACertificate({
        subject: { commonName: "Radar Local Proxy CA", organizationName: "Radar" }
      });
      fs.writeFileSync(caCertPath, ca.cert, { mode: 0o600 });
      fs.writeFileSync(caKeyPath, ca.key, { mode: 0o600 });
    }
    const caFingerprint = await generateSPKIFingerprint(fs.readFileSync(caCertPath, "utf8"));
    if (!regressionMode) trustProxyCa(caCertPath, caDir);
    state = { ...state, caCertPath, caKeyPath, caFingerprint };
    return state;
  }

  async function startNewServer(port: number) {
    const ca = await ensureCa();
    const nextServer = getLocal({
      https: { keyPath: ca.caKeyPath, certPath: ca.caCertPath },
      http2: "fallback",
      passthrough: ["unknown-protocol"],
      recordTraffic: false,
      suggestChanges: false,
      maxBodySize: MAX_CAPTURED_BODY
    });
    try {
      await nextServer.start(Number(port) || defaultPort);
      await nextServer.on("request", async (request) => {
        const sessionId = currentSessionId();
        bindCaptureToCurrentSession(request.id);
        const text = await request.body
          .getText()
          .catch(() => `[truncated: request body exceeded ${MAX_CAPTURED_BODY} bytes]`);
        const capture = proxyRequestToCapture({
          req: request,
          bodyText: truncateText(text),
          rules: allowlist()
        });
        bindCaptureToSession(capture, sessionId);
        rememberCapture(capture);
      });
      await nextServer.on("response", async (response) => {
        const entry = captureById(response.id);
        if (!entry) return;
        const text = await response.body
          .getText()
          .catch(() => `[truncated: response body exceeded ${MAX_CAPTURED_BODY} bytes]`);
        const contentLengthHeader = response.headers?.["content-length"];
        const contentLength = Number(
          Array.isArray(contentLengthHeader) ? contentLengthHeader[0] : contentLengthHeader || 0
        );
        entry.status = response.statusCode;
        entry.statusText = response.statusMessage || "";
        entry.responseHeaders = safeJsonHeaders(response.headers || {});
        entry.responseBody =
          !text && Number.isFinite(contentLength) && contentLength > MAX_CAPTURED_BODY
            ? `[truncated: response body exceeded ${MAX_CAPTURED_BODY} bytes]`
            : truncateText(text || "");
        entry.durationMs =
          typeof response.timingEvents?.responseSentTimestamp === "number" &&
          typeof response.timingEvents?.startTimestamp === "number"
            ? Math.max(
                0,
                Math.round(
                  response.timingEvents.responseSentTimestamp - response.timingEvents.startTimestamp
                )
              )
            : null;
        rememberCapture(entry);
      });
      await nextServer.on("tls-client-error", (event) => {
        rememberSslEvent({
          id: `ssl_${Date.now()}`,
          url: event.remoteIpAddress || "tls-client",
          error: event.failureCause || "tls-client-error",
          trusted: false,
          createdAt: new Date().toISOString()
        });
      });
      await nextServer.on("websocket-request", rememberWebSocketRequest);
      await nextServer.on("websocket-accepted", rememberWebSocketAccepted);
      await nextServer.on("websocket-message-received", rememberWebSocketMessage);
      await nextServer.on("websocket-message-sent", rememberWebSocketMessage);
      await nextServer.on("websocket-close", rememberWebSocketClose);
      await nextServer.forAnyWebSocket().thenPassThrough();
      await nextServer.forAnyRequest().waitForRequestBody().thenPassThrough({
        beforeRequest: queueInterceptRequest,
        beforeResponse: queueInterceptResponse,
        ...(regressionMode ? { additionalTrustedCAs: [{ certPath: ca.caCertPath }] } : {})
      });
      server = nextServer;
      state = {
        ...ca,
        running: true,
        port: nextServer.port,
        proxyUrl: `http://127.0.0.1:${nextServer.port}`
      };
      return state;
    } catch (error) {
      await nextServer.stop().catch(() => undefined);
      throw error;
    }
  }

  async function start(port = defaultPort) {
    if (server) return state;
    if (starting) return starting;
    const pending = startNewServer(port);
    starting = pending;
    try {
      return await pending;
    } finally {
      if (starting === pending) {
        starting = undefined;
      }
    }
  }

  async function stop() {
    if (starting) {
      await starting.catch(() => undefined);
    }
    if (server) {
      await server.stop();
      server = undefined;
    }
    state = { ...state, running: false };
    return state;
  }

  return { ensureCa, start, stop, state: () => state };
}
