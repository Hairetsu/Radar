import { describe, expect, it } from "vitest";
import type { CapturedRequest } from "./domain.js";
import { diffSessionCaptures } from "./sessionDiff.js";

const capture = (overrides: Partial<CapturedRequest>): CapturedRequest => ({
  id: overrides.id || "cap-1",
  startedAt: overrides.startedAt || "2026-01-01T00:00:00.000Z",
  method: overrides.method || "GET",
  url: overrides.url || "https://allowed.test/api",
  host: overrides.host || "allowed.test",
  path: overrides.path || "/api",
  requestHeaders: overrides.requestHeaders || {},
  requestBody: overrides.requestBody || "",
  status: overrides.status ?? 200,
  statusText: overrides.statusText || "OK",
  mimeType: overrides.mimeType || "application/json",
  type: overrides.type || "fetch",
  responseHeaders: overrides.responseHeaders || { "content-type": "application/json" },
  responseBody: overrides.responseBody ?? '{"ok":true}',
  durationMs: overrides.durationMs ?? 10,
  allowed: overrides.allowed ?? true,
  source: overrides.source || "browser"
});

describe("diffSessionCaptures", () => {
  it("detects added and removed endpoints", () => {
    const baseline = [capture({ path: "/old" })];
    const comparison = [capture({ path: "/new" })];
    const diff = diffSessionCaptures(baseline, comparison);
    expect(diff.entries.some((entry) => entry.kind === "added")).toBe(true);
    expect(diff.entries.some((entry) => entry.kind === "removed")).toBe(true);
    expect(diff.baselineCount).toBe(1);
    expect(diff.comparisonCount).toBe(1);
  });

  it("detects status, header, and response shape changes", () => {
    const baseline = [
      capture({
        id: "base",
        path: "/api",
        status: 200,
        startedAt: "2026-01-01T00:00:00.000Z",
        responseHeaders: { "cache-control": "no-store" },
        responseBody: '{"ok":true}'
      })
    ];
    const comparison = [
      capture({
        id: "cmp",
        path: "/api",
        status: 403,
        startedAt: "2026-01-02T00:00:00.000Z",
        responseHeaders: { "cache-control": "private", "x-env": "prod" },
        responseBody: "<html>denied</html>"
      })
    ];
    const diff = diffSessionCaptures(baseline, comparison);
    expect(diff.entries.some((entry) => entry.kind === "status-changed")).toBe(true);
    expect(diff.entries.some((entry) => entry.kind === "header-changed")).toBe(true);
    expect(diff.entries.some((entry) => entry.kind === "response-changed")).toBe(true);
  });

  it("merges multiple captures for the same endpoint", () => {
    const baseline = [
      capture({ id: "a", path: "/api", status: 200, startedAt: "2026-01-01T00:00:00.000Z" }),
      capture({ id: "b", path: "/api", status: 500, startedAt: "2026-01-02T00:00:00.000Z", mimeType: "text/plain" })
    ];
    const diff = diffSessionCaptures(baseline, baseline);
    expect(diff.baselineCount).toBe(1);
    expect(diff.entries).toHaveLength(0);
  });

  it("classifies unknown status families and empty bodies", () => {
    const baseline = [capture({ status: null, responseBody: "" })];
    const comparison = [capture({ status: null, responseBody: "plain text body" })];
    const diff = diffSessionCaptures(baseline, comparison);
    expect(diff.entries.some((entry) => entry.kind === "response-changed")).toBe(true);
  });
});
