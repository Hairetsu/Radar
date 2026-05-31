import { describe, expect, it } from "vitest";
import type { CapturedRequest } from "./domain";
import { applyMatchReplaceRules, normalizeMatchReplaceRules } from "./matchReplace";

const capture: CapturedRequest = {
  id: "cap-1",
  startedAt: "2026-05-25T00:00:00.000Z",
  method: "POST",
  url: "https://api.example.test/login",
  host: "api.example.test",
  path: "/login",
  requestHeaders: { Authorization: "Bearer old-token" },
  requestBody: "{\"role\":\"user\"}",
  status: 200,
  statusText: "OK",
  mimeType: "application/json",
  type: "Fetch",
  responseHeaders: { "x-env": "staging" },
  responseBody: "{\"role\":\"user\"}",
  durationMs: 20,
  allowed: true,
  source: "proxy",
  tls: null
};

describe("match replace", () => {
  it("normalizes rules and drops entries without a name or match", () => {
    expect(
      normalizeMatchReplaceRules([{ name: "Token", target: "header", match: "old", replace: "new" }, { name: "bad" }], "now")
    ).toEqual([
      expect.objectContaining({
        id: "rewrite-1",
        name: "Token",
        stage: "request",
        target: "header",
        updatedAt: "now"
      })
    ]);
  });

  it("applies request header and body rewrites", () => {
    const rules = normalizeMatchReplaceRules([
      { id: "token", name: "Token", stage: "request", target: "header", headerName: "authorization", match: "old-token", replace: "new-token" },
      { id: "role", name: "Role", stage: "request", target: "body", match: "\"user\"", replace: "\"admin\"" }
    ]);
    const result = applyMatchReplaceRules(rules, capture, "request");

    expect(result.changed).toBe(true);
    expect(result.capture.requestHeaders.Authorization).toBe("Bearer new-token");
    expect(result.capture.requestBody).toBe("{\"role\":\"admin\"}");
    expect(result.hits.map((hit) => hit.ruleId)).toEqual(["token", "role"]);
  });

  it("applies response rewrites without touching request fields", () => {
    const rules = normalizeMatchReplaceRules([
      { id: "env", name: "Env", stage: "response", target: "header", match: "staging", replace: "prod" },
      { id: "role", name: "Role", stage: "response", target: "body", match: "\"user\"", replace: "\"admin\"" }
    ]);
    const result = applyMatchReplaceRules(rules, capture, "response");

    expect(result.capture.responseHeaders["x-env"]).toBe("prod");
    expect(result.capture.responseBody).toBe("{\"role\":\"admin\"}");
    expect(result.capture.requestBody).toBe(capture.requestBody);
  });

  it("skips disabled, mismatched, and non-matching rules", () => {
    const rules = normalizeMatchReplaceRules([
      { id: "disabled", name: "Disabled", enabled: false, target: "body", match: "user", replace: "admin" },
      { id: "wrong-stage", name: "Wrong stage", stage: "response", target: "body", match: "user", replace: "admin" },
      { id: "no-hit", name: "No hit", target: "body", match: "missing", replace: "x" },
      { id: "header-scan", name: "Header scan", target: "header", match: "missing", replace: "x" }
    ]);
    expect(normalizeMatchReplaceRules("bad")).toEqual([]);
    const result = applyMatchReplaceRules(rules, capture, "request");
    expect(result.changed).toBe(false);
    expect(result.hits).toEqual([]);
  });
});
