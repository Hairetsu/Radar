import type { AgentDecisionFinding, AgentFindingQualityGate } from "./agent-types.js";

const MAX_LIST = 24;
const MAX_TEXT = 4000;
const MAX_LINE = 180;

function cleanLine(value: unknown, fallback = "") {
  const text = String(value || "").trim().replace(/\s+/g, " ");
  return (text || fallback).slice(0, MAX_LINE);
}

function cleanText(value: unknown) {
  return String(value || "").trim().slice(0, MAX_TEXT);
}

function cleanList(value: unknown) {
  return (Array.isArray(value) ? value : [])
    .map((entry) => cleanLine(entry))
    .filter(Boolean)
    .slice(0, MAX_LIST);
}

export function evaluateAgentFindingQuality(input: AgentDecisionFinding): AgentFindingQualityGate {
  const evidenceRefs = cleanList(input.evidenceRefs);
  const affectedAssets = cleanList(input.affectedAssets);
  const reproductionNotes = cleanText(input.reproductionNotes);
  const severityRationale = cleanText(input.severityRationale);
  const remediation = cleanText(input.remediation);
  const uncertainties = cleanList(input.uncertainties);
  const notes = cleanText(input.notes);
  const reasons: string[] = [];

  if (!cleanLine(input.title)) {
    reasons.push("title is required");
  }
  if (evidenceRefs.length === 0) {
    reasons.push("at least one evidence reference is required");
  }
  if (affectedAssets.length === 0) {
    reasons.push("at least one affected asset is required");
  }
  if (!reproductionNotes) {
    reasons.push("reproduction notes are required");
  }
  if (!severityRationale) {
    reasons.push("severity rationale is required");
  }
  if (!remediation) {
    reasons.push("remediation guidance is required");
  }
  if (uncertainties.length === 0) {
    reasons.push("uncertainty notes are required");
  }

  return {
    ok: reasons.length === 0,
    reasons,
    finding:
      reasons.length === 0
        ? {
            id: "",
            createdAt: "",
            title: cleanLine(input.title, "Draft finding"),
            confidence: input.confidence === "high" || input.confidence === "medium" ? input.confidence : "low",
            evidenceRefs,
            notes,
            affectedAssets,
            reproductionNotes,
            severityRationale,
            remediation,
            uncertainties
          }
        : undefined
  };
}

export function normalizeAgentFindingWithGate(
  input: AgentDecisionFinding,
  id: string,
  createdAt: string
): AgentFindingQualityGate {
  const gate = evaluateAgentFindingQuality(input);
  if (!gate.ok || !gate.finding) {
    return gate;
  }
  return {
    ...gate,
    finding: {
      ...gate.finding,
      id,
      createdAt,
      uncertainties: [...gate.finding.uncertainties, "Agent findings are draft-only until manually reviewed."]
    }
  };
}
