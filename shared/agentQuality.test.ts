import { describe, expect, it } from "vitest";
import { evaluateAgentFindingQuality, normalizeAgentFindingWithGate } from "./agentQuality.js";

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
      {
        title: "Weak CSP",
        confidence: "medium",
        evidenceRefs: ["capture:home"],
        affectedAssets: ["https://example.test"],
        reproductionNotes: "Open capture:home and inspect response headers.",
        severityRationale: "Missing policy increases browser hardening risk.",
        remediation: "Add a strict Content-Security-Policy.",
        notes: "Header absent in scoped evidence.",
        uncertainties: ["Policy may be set by an upstream route."]
      },
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
});
