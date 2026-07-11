import { describe, expect, it } from "vitest";
import { buildAgentEvidenceCatalog, resolveAgentEvidenceRef } from "./agentEvidence.js";
import { evaluateAgentFindingQuality, normalizeAgentFindingWithGate } from "./agentQuality.js";

const completeFinding = {
  title: "Weak CSP",
  confidence: "medium" as const,
  evidenceRefs: ["capture:home"],
  affectedAssets: ["https://example.test"],
  reproductionNotes: "Open capture:home and inspect response headers.",
  severityRationale: "Missing policy increases browser hardening risk.",
  remediation: "Add a strict Content-Security-Policy.",
  notes: "Header absent in scoped evidence.",
  uncertainties: ["Policy may be set by an upstream route."]
};

describe("agentQuality", () => {
  it("rejects findings without required evidence quality fields", () => {
    const gate = evaluateAgentFindingQuality({
      title: "Unsupported claim",
      confidence: "low",
      evidenceRefs: [],
      notes: "No citation."
    });
    expect(gate.ok).toBe(false);
    expect(gate.reasons).toContain("at least one evidence reference is required");
    expect(gate.reasons).toContain("uncertainty notes are required");
  });

  it("normalizes valid findings and appends draft uncertainty", () => {
    const gate = normalizeAgentFindingWithGate(
      completeFinding,
      "finding-1",
      "2026-05-25T00:00:00.000Z"
    );
    expect(gate.ok).toBe(true);
    expect(gate.finding).toEqual(
      expect.objectContaining({
        id: "finding-1",
        evidenceRefs: ["capture:home"],
        affectedAssets: ["https://example.test"],
        remediation: "Add a strict Content-Security-Policy."
      })
    );
    expect(gate.finding?.uncertainties).toContain("Agent findings are draft-only until manually reviewed.");
  });

  it("builds canonical keys for every durable agent evidence source", () => {
    const catalog = buildAgentEvidenceCatalog({
      captures: [{ id: "cap-1" }],
      webSocketEvents: [{ id: "ws-1" }],
      replayTabState: {
        tabs: [{ id: "tab-1", history: [{ id: "history-1" }] }]
      },
      automateSessions: [{ id: "automate-1", results: [{ id: "result-1" }] }],
      workflowRuns: [{ id: "workflow-run-1", results: [{ id: "workflow-result-1" }] }],
      agentRuns: [{ id: "agent-1", timeline: [{ id: "step-1" }] }]
    });

    expect([...catalog]).toEqual([
      "capture:cap-1",
      "websocket:ws-1",
      "replay:tab-1",
      "replay:history-1",
      "replay:tab-1:history-1",
      "automate:automate-1",
      "automate:automate-1:result-1",
      "workflow:workflow-run-1",
      "workflow:workflow-run-1:workflow-result-1",
      "ai:agent-1",
      "ai:agent-1:step-1"
    ]);
    expect(resolveAgentEvidenceRef(" replay:tab-1:history-1 ", catalog)).toEqual({
      ok: true,
      key: "replay:tab-1:history-1",
      kind: "replay"
    });
  });

  it("rejects malformed, unsupported, and missing refs against a catalog", () => {
    const catalog = buildAgentEvidenceCatalog({ captures: [{ id: "home" }] });
    const gate = evaluateAgentFindingQuality(
      {
        ...completeFinding,
        evidenceRefs: ["capture", "future:item", "capture:missing"]
      },
      catalog
    );

    expect(gate.ok).toBe(false);
    expect(gate.reasons).toContain('evidence reference "capture" is malformed');
    expect(gate.reasons).toContain('evidence reference "future:item" uses an unsupported kind');
    expect(gate.reasons).toContain(
      'evidence reference "capture:missing" is not present in the local evidence catalog'
    );
  });

  it("accepts only catalog-backed refs while preserving legacy behavior without a catalog", () => {
    const catalog = buildAgentEvidenceCatalog({
      captures: [{ id: "home" }],
      replayTabState: { tabs: [{ id: "tab-1", history: [{ id: "history-1" }] }] }
    });
    const backed = normalizeAgentFindingWithGate(
      {
        ...completeFinding,
        evidenceRefs: ["capture:home", "replay:history-1", "replay:tab-1:history-1"]
      },
      "finding-2",
      "2026-05-25T00:00:00.000Z",
      catalog
    );
    const legacy = evaluateAgentFindingQuality({ ...completeFinding, evidenceRefs: ["future:item"] });

    expect(backed.ok).toBe(true);
    expect(backed.finding?.evidenceRefs).toEqual([
      "capture:home",
      "replay:history-1",
      "replay:tab-1:history-1"
    ]);
    expect(legacy.ok).toBe(true);
  });
});
