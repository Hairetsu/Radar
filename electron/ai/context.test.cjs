import { describe, expect, it } from "vitest";
const { redactHeaders, redactBody, buildContextPayload } = require("./context.cjs");

const sampleCapture = {
  id: "cap-1",
  method: "POST",
  url: "http://localhost:3000/login",
  status: 200,
  statusText: "OK",
  durationMs: 42,
  source: "proxy",
  requestHeaders: { Authorization: "Bearer secret-token", Accept: "application/json" },
  responseHeaders: { "Set-Cookie": "session=abc" },
  requestBody: 'token="abc123"',
  responseBody: '{"ok":true}',
  tls: { protocol: "TLS1.3", subjectName: "localhost", issuer: "Radar CA" }
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
