import type {
  AgentDecision,
  AgentTutorialCveReadiness,
  AgentTutorialDisposition,
  AgentTutorialGuidance,
  AgentTutorialStage
} from "./agent-types.js";

const STAGES = new Set<AgentTutorialStage>(["orient", "observe", "hypothesize", "validate", "triage", "report"]);
const DISPOSITIONS = new Set<AgentTutorialDisposition>([
  "learning-clue",
  "local-hardening",
  "vendor-report",
  "cve-review"
]);
const MAX_LIST_ITEMS = 6;
const MAX_TEXT = 700;

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function textValue(value: unknown, fallback = "", max = MAX_TEXT) {
  return String(value || fallback).trim().slice(0, max);
}

function textList(value: unknown, maxItems = MAX_LIST_ITEMS) {
  return (Array.isArray(value) ? value : [])
    .map((item) => textValue(item, "", 320))
    .filter(Boolean)
    .slice(0, maxItems);
}

function normalizeCveReadiness(value: unknown): AgentTutorialCveReadiness | undefined {
  const input = objectValue(value);
  const readiness: AgentTutorialCveReadiness = {
    product: textValue(input.product, "", 240),
    affectedVersions: textList(input.affectedVersions, 8),
    securityImpact: textValue(input.securityImpact),
    deploymentScope: textValue(input.deploymentScope),
    reproducibility: textValue(input.reproducibility)
  };
  return Object.values(readiness).every((item) => (Array.isArray(item) ? item.length > 0 : Boolean(item)))
    ? readiness
    : undefined;
}

function normalizedDisposition(value: unknown): AgentTutorialDisposition {
  const disposition = textValue(value) as AgentTutorialDisposition;
  return DISPOSITIONS.has(disposition) ? disposition : "learning-clue";
}

export function normalizeAgentTutorialGuidance(value: unknown): AgentTutorialGuidance | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const input = objectValue(value);
  const requestedDisposition = normalizedDisposition(input.disposition);
  const evidenceRefs = textList(input.evidenceRefs, 16);
  const cveReadiness = normalizeCveReadiness(input.cveReadiness);
  const disposition = requestedDisposition === "cve-review" && (!cveReadiness || evidenceRefs.length === 0)
    ? "vendor-report"
    : requestedDisposition;
  const stageValue = textValue(input.stage) as AgentTutorialStage;
  const guidance: AgentTutorialGuidance = {
    stage: STAGES.has(stageValue) ? stageValue : "observe",
    title: textValue(input.title, "Evidence checkpoint", 180),
    clue: textValue(input.clue, "Inspect the visible evidence before drawing a conclusion."),
    whyItMatters: textValue(input.whyItMatters, "A single signal is a lead, not proof of a vulnerability."),
    lookFor: textList(input.lookFor),
    strongerEvidence: textList(input.strongerEvidence),
    falsifiers: textList(input.falsifiers),
    safeNextStep: textValue(input.safeNextStep, "Review the cited evidence and continue with the next bounded observation."),
    disposition,
    dispositionRationale: textValue(
      input.dispositionRationale,
      disposition === "vendor-report"
        ? "Coordinate privately with the product owner before treating this as a CVE candidate."
        : "Keep this as an evidence-led learning clue until it is reproduced."
    ),
    evidenceRefs,
    ...(cveReadiness ? { cveReadiness } : {})
  };
  return guidance;
}

export function fallbackAgentTutorialGuidance(decision: AgentDecision): AgentTutorialGuidance {
  const action = decision.action === "tool" ? decision.call.tool : "finish";
  return {
    stage: decision.action === "finish" ? "triage" : "observe",
    title: decision.action === "finish" ? "Triage the evidence" : `Observe ${action}`,
    clue: decision.rationale || `Radar selected ${action} as the next bounded step.`,
    whyItMatters: "The useful lesson is the difference between an interesting signal and repeatable security impact.",
    lookFor: ["A concrete change in status, content, authorization, browser state, or server behavior."],
    strongerEvidence: ["A repeatable comparison tied to a capture, workflow result, or other durable evidence reference."],
    falsifiers: ["The same behavior is expected, documented, user-specific, or caused only by local configuration."],
    safeNextStep: decision.action === "finish"
      ? "Review the evidence and uncertainties before fixing locally or contacting a vendor."
      : "Inspect the visible result, then use Continue lesson when you are ready for the next step.",
    disposition: "learning-clue",
    dispositionRationale: "No product-level vulnerability classification is justified by this step alone.",
    evidenceRefs: []
  };
}
