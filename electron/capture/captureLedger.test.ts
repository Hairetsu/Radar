import { describe, expect, it, vi } from "vitest";
import type { CapturedRequest } from "../../shared/domain.js";
import { createCaptureLedger } from "./captureLedger.js";

function capture(id: string, overrides: Partial<CapturedRequest> = {}): CapturedRequest {
  return {
    id,
    startedAt: "2026-07-31T00:00:00.000Z",
    method: "GET",
    url: `https://${id}.example/path`,
    host: `${id}.example`,
    path: "/path",
    requestHeaders: {},
    requestBody: "",
    status: null,
    statusText: "",
    mimeType: "",
    type: "Other",
    responseHeaders: {},
    responseBody: "",
    durationMs: null,
    allowed: true,
    source: "browser",
    ...overrides
  };
}

function createLedger(overrides: {
  sessionId?: () => string;
  load?: (sessionId: string, limit: number) => CapturedRequest[] | null;
} = {}) {
  const persist = vi.fn();
  const deletePersisted = vi.fn();
  const clearPersisted = vi.fn();
  const ledger = createCaptureLedger({
    currentSessionId: overrides.sessionId || (() => "session-1"),
    attribution: () => ({ agentRunId: "run-1", actionId: "action-1" }),
    persist,
    load: overrides.load || (() => null),
    deletePersisted,
    clearPersisted
  });
  return { ledger, persist, deletePersisted, clearPersisted };
}

describe("capture ledger", () => {
  it("attributes active browser captures and preserves applied request rewrites", () => {
    const { ledger, persist } = createLedger();
    ledger.remember(
      capture("capture-1", {
        requestHeaders: { "x-rewritten": "true" },
        requestBody: "rewritten",
        rewrites: [
          {
            ruleId: "rule-1",
            name: "Rewrite request",
            stage: "request",
            target: "body",
            detail: "body changed"
          }
        ]
      })
    );
    ledger.remember(capture("capture-1", { status: 200, statusText: "OK" }));

    expect(ledger.captures.get("capture-1")).toEqual(
      expect.objectContaining({
        status: 200,
        requestBody: "rewritten",
        requestHeaders: { "x-rewritten": "true" },
        agentRunId: "run-1",
        actionId: "action-1"
      })
    );
    expect(persist).toHaveBeenLastCalledWith(
      "session-1",
      expect.objectContaining({ id: "capture-1", status: 200 })
    );
  });

  it("keeps late capture updates bound to their original session", () => {
    let sessionId = "session-1";
    const { ledger, persist } = createLedger({ sessionId: () => sessionId });
    const entry = ledger.bindEntryToSession(capture("capture-1"), "session-1");
    ledger.remember(entry);
    sessionId = "session-2";
    ledger.remember({ ...entry, status: 204 });

    expect(persist).toHaveBeenLastCalledWith(
      "session-1",
      expect.objectContaining({ status: 204 })
    );
    expect(ledger.captures.get("capture-1")?.status).toBeNull();
  });

  it("hydrates and delegates persisted list, delete, and clear operations", () => {
    const stored = [capture("http"), capture("socket", { url: "ws://socket.example" })];
    const { ledger, deletePersisted, clearPersisted } = createLedger({ load: () => stored });
    ledger.hydrate(stored, "session-1");

    expect(ledger.listHttp()).toEqual([stored[0]]);
    expect(ledger.remove("http")).toBe(true);
    expect(deletePersisted).toHaveBeenCalledWith("session-1", "http");
    expect(ledger.remove("")).toBe(false);

    ledger.clear();
    expect(clearPersisted).toHaveBeenCalledWith("session-1");
    expect(ledger.captures.size).toBe(0);
  });
});
