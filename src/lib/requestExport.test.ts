import { describe, expect, it } from "vitest";
import type { CapturedRequest } from "../../shared/domain";
import { formatCapturedRequest } from "./requestExport";

const capture = (overrides: Partial<CapturedRequest> = {}): CapturedRequest => ({
  id: "cap-1",
  startedAt: "2026-05-25T00:00:00.000Z",
  method: "POST",
  url: "https://example.test/api?q=1",
  host: "example.test",
  path: "/api",
  requestHeaders: {
    Accept: "application/json",
    "X-Name": "O'Malley"
  },
  requestBody: "{\"probe\":true}",
  status: 200,
  statusText: "OK",
  mimeType: "application/json",
  type: "Fetch",
  responseHeaders: {},
  responseBody: "",
  durationMs: 12,
  allowed: true,
  source: "browser",
  tls: null,
  ...overrides
});

describe("request export", () => {
  it("formats a captured request as a shell-safe curl command", () => {
    const text = formatCapturedRequest(capture(), "curl");

    expect(text).toContain("curl -i");
    expect(text).toContain("-X 'POST'");
    expect(text).toContain("-H 'X-Name: O'\\''Malley'");
    expect(text).toContain("--data-raw '{\"probe\":true}'");
    expect(text).toContain("'https://example.test/api?q=1'");
  });

  it("formats a captured request as a python requests script", () => {
    const text = formatCapturedRequest(capture(), "python");

    expect(text).toContain("import requests");
    expect(text).toContain('url = "https://example.test/api?q=1"');
    expect(text).toContain('"X-Name": "O\'Malley"');
    expect(text).toContain('data="{\\"probe\\":true}",');
  });

  it("formats a captured request as raw HTTP", () => {
    const text = formatCapturedRequest(capture(), "raw");

    expect(text).toContain("POST /api?q=1 HTTP/1.1");
    expect(text).toContain("Host: example.test");
    expect(text).toContain("Accept: application/json");
    expect(text.endsWith("{\"probe\":true}")).toBe(true);
  });
});
