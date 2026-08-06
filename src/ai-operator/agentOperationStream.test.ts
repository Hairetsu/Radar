import { describe, expect, it } from "vitest";
import type { AgentRun, AgentTimelineEntry } from "../types";
import { defaultExpandedOperationIds, projectAgentOperationStream } from "./agentOperationStream";

const policy = {
  maxRuntimeMs: 120_000,
  maxSteps: 8,
  maxReplay: 1,
  maxWorkflowRequests: 1,
  maxCaptureSample: 20,
  allowRawContext: false
};

function run(timeline: AgentTimelineEntry[], status: AgentRun["status"] = "running"): AgentRun {
  return {
    id: "run-1",
    sessionId: "session-1",
    createdAt: "2026-05-25T00:00:00.000Z",
    updatedAt: "2026-05-25T00:01:00.000Z",
    goal: "Inspect the account boundary",
    profileId: "browser-assessment",
    status,
    policy,
    timeline,
    findings: []
  };
}

function entry(id: string, value: Omit<AgentTimelineEntry, "id" | "createdAt">): AgentTimelineEntry {
  return { id, createdAt: `2026-05-25T00:00:${id.slice(-2)}.000Z`, ...value };
}

describe("agent operation stream projection", () => {
  it("groups explicit operation entries and keeps lifecycle markers separate", () => {
    const items = projectAgentOperationStream(run([
      entry("status-01", { phase: "status", summary: "Run started" }),
      entry("decision-02", { operationId: "operation-1", phase: "decision", summary: "Inspect dashboard", toolCall: { tool: "getPageText", input: {} } }),
      entry("call-03", { operationId: "operation-1", phase: "tool-call", toolCall: { tool: "getPageText", input: {} } }),
      entry("result-04", { operationId: "operation-1", phase: "tool-result", toolResult: { tool: "getPageText", ok: true, data: { url: "https://target.test", title: "Account", text: "Account" } } })
    ], "completed"));

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ kind: "operation", id: "operation-1", operation: { status: "completed", tool: "getPageText" } });
    if (items[0]?.kind === "operation") {
      expect(items[0].operation.entries.map((item) => item.id)).toEqual(["decision-02", "call-03", "result-04"]);
    }
    expect(items[1]).toMatchObject({ kind: "marker", id: "status-01" });
  });

  it("groups legacy decision, call, and result records by adjacent tool identity", () => {
    const items = projectAgentOperationStream(run([
      entry("decision-01", { phase: "decision", summary: "Read page", toolCall: { tool: "getPageText", input: {} } }),
      entry("call-02", { phase: "tool-call", toolCall: { tool: "getPageText", input: {} } }),
      entry("result-03", { phase: "tool-result", toolResult: { tool: "getPageText", ok: true, data: { url: "https://target.test", title: "Account", text: "Account" } } }),
      entry("decision-04", { phase: "decision", summary: "Inspect cookies", toolCall: { tool: "analyzeCookieFlags", input: {} } })
    ]));

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ kind: "operation", operation: { status: "active", tool: "analyzeCookieFlags" } });
    expect(items[1]).toMatchObject({ kind: "operation", operation: { status: "completed", tool: "getPageText" } });
    if (items[1]?.kind === "operation") {
      expect(items[1].operation.entries).toHaveLength(3);
    }
  });

  it("expands the current operation, newest completed operation, and every interruption", () => {
    const items = projectAgentOperationStream(run([
      entry("result-01", { phase: "tool-result", toolResult: { tool: "getCaptures", ok: true, data: { captures: [] } } }),
      entry("blocked-02", { phase: "policy-block", toolCall: { tool: "clickElement", input: { selector: "#submit" } }, toolResult: { tool: "clickElement", ok: false, error: "Blocked" } }),
      entry("decision-03", { phase: "decision", toolCall: { tool: "getPageText", input: {} } })
    ]));

    const expanded = defaultExpandedOperationIds(items);
    expect(expanded.size).toBe(3);
    for (const item of items) {
      if (item.kind === "operation") expect(expanded.has(item.id)).toBe(true);
    }
  });
});
