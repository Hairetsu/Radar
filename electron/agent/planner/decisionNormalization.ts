import type {
  AgentDecision,
  AgentDecisionFinding
} from "../../../shared/agent-types.js";
import { normalizeAgentCapabilityLeaseRequest } from "../../../shared/agentCapabilities.js";
import { normalizeAgentMissionPatch } from "../../../shared/agentMission.js";
import { normalizeAgentTutorialGuidance } from "../../../shared/agentTutorial.js";
import { normalizeUnknownAgentToolCall } from "../tools.js";

function objectValue(value: unknown) {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function normalizeConfidence(value: unknown) {
  const confidence = String(value || "low");
  return confidence === "medium" || confidence === "high" ? confidence : "low";
}

function normalizeFindings(value: unknown): AgentDecisionFinding[] {
  return Array.isArray(value)
    ? value.map((item) => {
        const entry = objectValue(item);
        return {
          title: String(entry.title || "Draft finding"),
          confidence: normalizeConfidence(entry.confidence),
          evidenceRefs: Array.isArray(entry.evidenceRefs) ? entry.evidenceRefs.map(String) : [],
          notes: String(entry.notes || ""),
          affectedAssets: Array.isArray(entry.affectedAssets) ? entry.affectedAssets.map(String) : [],
          reproductionNotes: String(entry.reproductionNotes || ""),
          severityRationale: String(entry.severityRationale || ""),
          remediation: String(entry.remediation || ""),
          uncertainties: Array.isArray(entry.uncertainties) ? entry.uncertainties.map(String) : []
        };
      })
    : [];
}

function normalizeToolCall(parsed: Record<string, unknown>) {
  const call = objectValue(parsed.call);
  const rawInput = objectValue(parsed.input || call.input);
  const input = {
    ...rawInput,
    ...(String(parsed.tool || call.tool || "") === "showView"
      ? { reason: String(rawInput.reason || parsed.rationale || "") }
      : {})
  };
  return normalizeUnknownAgentToolCall(parsed.tool || call.tool, input);
}

export function normalizeAgentDecision(parsed: Record<string, unknown>): AgentDecision {
  const action = String(parsed.action || "").toLowerCase();
  const missionPatch = normalizeAgentMissionPatch(parsed.missionPatch);
  const leaseRequest = normalizeAgentCapabilityLeaseRequest(parsed.leaseRequest);
  const tutorial = normalizeAgentTutorialGuidance(parsed.tutorial);
  if (parsed.missionPatch !== undefined && !missionPatch) {
    throw new Error("Agent missionPatch was invalid or empty.");
  }
  if (parsed.leaseRequest !== undefined && !leaseRequest) {
    throw new Error("Agent leaseRequest was invalid or insufficiently bounded.");
  }
  if (action === "finish") {
    if (leaseRequest) {
      throw new Error("Agent finish decisions cannot request a capability lease.");
    }
    return {
      action: "finish",
      rationale: String(parsed.rationale || ""),
      findings: normalizeFindings(parsed.findings),
      ...(tutorial ? { tutorial } : {}),
      ...(missionPatch ? { missionPatch } : {})
    };
  }

  if (action === "tool") {
    return {
      action: "tool",
      call: normalizeToolCall(parsed),
      rationale: String(parsed.rationale || ""),
      ...(tutorial ? { tutorial } : {}),
      ...(missionPatch ? { missionPatch } : {}),
      ...(leaseRequest ? { leaseRequest } : {})
    };
  }

  throw new Error("Agent decision must return action=tool or action=finish.");
}
