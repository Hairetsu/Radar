import { describe, expect, it } from "vitest";
import type { CapturedRequest } from "./domain";
import { matchingInterceptRules, normalizeInterceptRules } from "./interceptRules";

const capture: CapturedRequest = {
  id: "cap-1",
  startedAt: "2026-05-25T00:00:00.000Z",
  method: "POST",
  url: "https://api.example.test/login",
  host: "api.example.test",
  path: "/login",
  requestHeaders: { "Content-Type": "application/json", Authorization: "Bearer token" },
  requestBody: "{\"email\":\"operator@example.test\"}",
  status: 401,
  statusText: "Unauthorized",
  mimeType: "application/json",
  type: "Fetch",
  responseHeaders: { "content-type": "application/json", "www-authenticate": "Bearer" },
  responseBody: "{\"error\":\"unauthorized\"}",
  durationMs: 24,
  allowed: true,
  source: "proxy",
  tls: null
};

describe("intercept rules", () => {
  it("normalizes rule arrays and drops invalid entries", () => {
    const rules = normalizeInterceptRules([{ name: "Login JSON", method: "post", stage: "request" }, { method: "GET" }], "now");

    expect(rules).toEqual([
      expect.objectContaining({
        id: "rule-1",
        name: "Login JSON",
        method: "POST",
        stage: "request",
        enabled: true,
        updatedAt: "now"
      })
    ]);
  });

  it("matches request rules by method, host, path, header, and body", () => {
    const rules = normalizeInterceptRules([
      {
        id: "login",
        name: "Login request",
        stage: "request",
        method: "POST",
        host: "api.example",
        path: "/login",
        requestHeader: "authorization",
        body: "operator@example"
      }
    ]);

    expect(matchingInterceptRules(rules, capture, "request")).toEqual([
      {
        ruleId: "login",
        name: "Login request",
        reason: "method=POST, host~api.example, path~/login, request-header~authorization, body~operator@example"
      }
    ]);
  });

  it("matches response rules by status and response body", () => {
    const rules = normalizeInterceptRules([
      {
        id: "auth-response",
        name: "Auth response",
        stage: "response",
        status: 401,
        responseHeader: "www-authenticate",
        body: "unauthorized"
      }
    ]);

    expect(matchingInterceptRules(rules, capture, "response")).toEqual([
      {
        ruleId: "auth-response",
        name: "Auth response",
        reason: "status=401, response-header~www-authenticate, body~unauthorized"
      }
    ]);
  });

  it("ignores disabled, mismatched, and out-of-stage rules", () => {
    const rules = normalizeInterceptRules([
      { id: "disabled", name: "Disabled", enabled: false, stage: "both" },
      { id: "wrong-stage", name: "Wrong stage", stage: "response" },
      { id: "wrong-method", name: "Wrong method", stage: "request", method: "GET" },
      { id: "wrong-host", name: "Wrong host", stage: "request", host: "missing.test" },
      { id: "wrong-status-on-request", name: "Wrong status", stage: "request", status: 401 },
      { id: "catch-all", name: "Catch all", stage: "both" }
    ]);

    expect(matchingInterceptRules(rules, capture, "request")).toEqual([
      {
        ruleId: "catch-all",
        name: "Catch all",
        reason: "enabled catch-all"
      }
    ]);
    expect(normalizeInterceptRules("bad")).toEqual([]);
  });

  it("matches content type and initiator filters", () => {
    const rules = normalizeInterceptRules([
      {
        id: "typed",
        name: "Typed",
        stage: "request",
        contentType: "json",
        initiator: "fetch"
      }
    ]);
    expect(matchingInterceptRules(rules, { ...capture, initiator: "fetch" }, "request")).toHaveLength(1);
    expect(matchingInterceptRules(rules, { ...capture, initiator: "other" }, "request")).toHaveLength(0);
  });
});
