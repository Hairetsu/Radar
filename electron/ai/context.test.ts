import type { CapturedRequest } from "../../shared/domain.js";
import { describe, expect, it } from "vitest";
import { redactHeaders, redactBody, buildContextPayload } from "./context.js";

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

describe("context", () => {
  it("redacts sensitive headers", () => {
    expect(redactHeaders({ Authorization: "Bearer x", Accept: "json" })).toEqual({
      Authorization: "[REDACTED]",
      Accept: "json"
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
});
