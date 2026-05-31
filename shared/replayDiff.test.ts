import { describe, expect, it } from "vitest";
import { diffJson, diffReplayHistory, diffReplayResults } from "./replayDiff.js";

describe("replayDiff", () => {
  it("detects status and body changes", () => {
    const summary = diffReplayResults(
      {
        ok: true,
        status: 200,
        statusText: "OK",
        durationMs: 10,
        headers: { "Content-Type": "application/json" },
        body: '{"ok":true}',
        bytes: 11
      },
      {
        ok: false,
        status: 403,
        statusText: "Forbidden",
        durationMs: 20,
        headers: { "Content-Type": "application/json", "X-Trace": "1" },
        body: '{"ok":false}',
        bytes: 12
      }
    );

    expect(summary.statusChanged).toBe(true);
    expect(summary.latencyDeltaMs).toBe(10);
    expect(summary.headerDiffs.some((entry) => entry.key === "X-Trace" && entry.change === "added")).toBe(true);
    expect(summary.identical).toBe(false);
  });

  it("diffs json paths", () => {
    const diffs = diffJson('{"user":{"id":1}}', '{"user":{"id":2,"role":"admin"}}');
    expect(diffs.some((entry) => entry.path === "user.id" && entry.change === "changed")).toBe(true);
    expect(diffs.some((entry) => entry.path === "user.role" && entry.change === "added")).toBe(true);
  });

  it("marks identical replay results", () => {
    const result = {
      ok: true,
      status: 200,
      statusText: "OK",
      durationMs: 10,
      headers: { "Content-Type": "application/json" },
      body: '{"ok":true}',
      bytes: 11
    };
    expect(diffReplayResults(result, result).identical).toBe(true);
  });

  it("captures removed and added headers", () => {
    const diffs = diffReplayResults(
      {
        ok: true,
        status: 200,
        statusText: "OK",
        durationMs: 10,
        headers: { "X-Old": "1" },
        body: "a",
        bytes: 1
      },
      {
        ok: true,
        status: 200,
        statusText: "OK",
        durationMs: 10,
        headers: { "X-New": "2" },
        body: "b",
        bytes: 1
      }
    );
    expect(diffs.headerDiffs.some((entry) => entry.change === "removed")).toBe(true);
    expect(diffs.headerDiffs.some((entry) => entry.change === "added")).toBe(true);
  });

  it("returns empty json diffs for non-json bodies", () => {
    expect(diffJson("plain", "text")).toEqual([]);
    expect(diffJson('{"items":[1,2]}', '{"items":[1]}').some((entry) => entry.change === "removed")).toBe(true);
  });

  it("compares replay history entries", () => {
    const left = {
      id: "left",
      sentAt: "2026-01-01T00:00:00.000Z",
      draft: { method: "GET", url: "https://example.test", headers: {}, body: "" },
      result: { ok: true, status: 200, statusText: "OK", durationMs: 1, headers: {}, body: "a", bytes: 1 }
    };
    const right = {
      id: "right",
      sentAt: "2026-01-02T00:00:00.000Z",
      draft: { method: "GET", url: "https://example.test", headers: {}, body: "" },
      result: { ok: true, status: 403, statusText: "Forbidden", durationMs: 2, headers: {}, body: "b", bytes: 1 }
    };
    expect(diffReplayHistory(left, right).statusChanged).toBe(true);
  });

  it("keeps unchanged header and line diff rows", () => {
    const summary = diffReplayResults(
      {
        ok: true,
        status: 200,
        statusText: "OK",
        durationMs: 10,
        headers: { "Content-Type": "application/json", "X-Trace": "same" },
        body: "line-one\nline-two",
        bytes: 1
      },
      {
        ok: true,
        status: 200,
        statusText: "OK",
        durationMs: 10,
        headers: { "Content-Type": "application/json", "X-Trace": "same" },
        body: "line-one\nline-three",
        bytes: 1
      }
    );
    expect(summary.headerDiffs.every((entry) => entry.change === "same" || entry.key === "Content-Type")).toBe(true);
    expect(summary.bodyTextDiff.some((line) => line.startsWith("  line-one"))).toBe(true);
  });
});
