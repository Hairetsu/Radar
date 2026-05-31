import type { CapturedRequest, WebSocketEvent } from "../../shared/domain.js";
import { describe, expect, it } from "vitest";
import { redactHeaders, redactBody, buildContextPayload, formatWebSocketEvent } from "./context.js";

const sampleCapture: CapturedRequest = {
  id: "cap-1",
  startedAt: new Date().toISOString(),
  method: "POST",
  url: "http://localhost:3000/login",
  host: "localhost:3000",
  path: "/login",
  status: 200,
  statusText: "OK",
  durationMs: 42,
  allowed: true,
  source: "proxy",
  requestHeaders: { Authorization: "Bearer secret-token", Accept: "application/json" },
  responseHeaders: { "Set-Cookie": "session=abc" },
  requestBody: 'token="abc123"',
  responseBody: '{"ok":true}',
  mimeType: "",
  type: "",
  tls: { protocol: "TLS1.3", subjectName: "localhost", issuer: "Radar CA", validFrom: 0, validTo: 0 }
};

const sampleWebSocketEvent: WebSocketEvent = {
  id: "ws-1",
  requestId: "stream-1",
  createdAt: new Date().toISOString(),
  url: "wss://localhost:3000/socket",
  host: "localhost:3000",
  direction: "sent",
  opcode: 1,
  payloadData: 'token="abc123"',
  size: 14,
  requestHeaders: { Authorization: "Bearer secret-token" },
  responseHeaders: {},
  allowed: true
};

describe("context", () => {
  it("redacts sensitive headers", () => {
    expect(redactHeaders({ Authorization: "Bearer x", Accept: "json" })).toEqual({
      Authorization: "[REDACTED]",
      Accept: "json"
    });
    expect(redactHeaders(null as unknown as Record<string, string>)).toEqual({});
    expect(
      redactHeaders({
        Cookie: "session=abc",
        "Set-Cookie": "session=abc",
        "X-Api-Key": "secret",
        "X-Auth-Token": "secret",
        "Proxy-Authorization": "Basic x"
      })
    ).toEqual({
      Cookie: "[REDACTED]",
      "Set-Cookie": "[REDACTED]",
      "X-Api-Key": "[REDACTED]",
      "X-Auth-Token": "[REDACTED]",
      "Proxy-Authorization": "[REDACTED]"
    });
  });

  it("redacts token patterns in body", () => {
    expect(redactBody('api_key: "super-secret"')).toContain("[REDACTED]");
    expect(redactBody("")).toBe("");
  });

  it("builds context payload with redaction by default", () => {
    const payload = buildContextPayload({
      captures: [sampleCapture],
      targets: ["http://localhost:*"],
      browserUrl: "http://localhost:3000",
      includeRaw: false
    });

    expect(payload).toContain("RADAR AI CONTEXT");
    expect(payload).toContain("[REDACTED]");
    expect(payload).toContain("capture:cap-1");
  });

  it("includes raw values when requested", () => {
    const payload = buildContextPayload({
      captures: [sampleCapture],
      targets: [],
      browserUrl: "",
      includeRaw: true
    });

    expect(payload).toContain("Bearer secret-token");
    expect(payload).toContain("redacted: no");
  });

  it("handles captures without tls metadata", () => {
    const payload = buildContextPayload({
      captures: [{ ...sampleCapture, tls: null, requestBody: "", responseBody: "" }],
      targets: [],
      browserUrl: "",
      includeRaw: false
    });

    expect(payload).toContain("TLS: none");
    expect(payload).toContain("(empty)");
  });

  it("includes websocket events with redacted payloads", () => {
    const payload = buildContextPayload({
      captures: [],
      webSocketEvents: [sampleWebSocketEvent],
      targets: ["http://localhost:*"],
      browserUrl: "",
      includeRaw: false
    });

    expect(payload).toContain("websocket:ws-1");
    expect(payload).toContain("SENT wss://localhost:3000/socket");
    expect(payload).toContain("[REDACTED]");
  });

  it("formats captures with partial metadata and pending status", () => {
    const payload = buildContextPayload({
      captures: [
        {
          ...sampleCapture,
          status: null,
          statusText: "",
          durationMs: null,
          tls: { protocol: "", subjectName: "", issuer: "", validFrom: 0, validTo: 0 }
        }
      ],
      targets: [],
      browserUrl: "",
      includeRaw: false
    });

    expect(payload).toContain("status: pending");
    expect(payload).toContain("duration: —ms");
    expect(payload).toContain("TLS: ? | ? | ?");
    expect(payload).toContain("allowlist: (none)");
    expect(payload).toContain("browser_url: (none)");
  });

  it("formats websocket events with optional fields and raw payloads", () => {
    const formatted = formatWebSocketEvent(
      {
        ...sampleWebSocketEvent,
        host: "",
        allowed: false,
        status: 101,
        statusText: "Switching Protocols",
        initiator: "page",
        error: "connection reset",
        payloadData: "",
        requestHeaders: null as unknown as Record<string, string>,
        responseHeaders: null as unknown as Record<string, string>
      },
      false
    );

    expect(formatted).toContain("host: ?");
    expect(formatted).toContain("allowed: no");
    expect(formatted).toContain("status: 101 Switching Protocols");
    expect(formatted).toContain("initiator: page");
    expect(formatted).toContain("error: connection reset");
    expect(formatted).toContain("PAYLOAD:\n(empty)");
  });

  it("includes raw websocket payloads when requested", () => {
    const formatted = formatWebSocketEvent(sampleWebSocketEvent, true);

    expect(formatted).toContain('token="abc123"');
    expect(formatted).toContain("Bearer secret-token");
  });
});
