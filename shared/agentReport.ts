import type {
  AgentCompletionReport,
  AgentDecisionReport,
  AgentFinding,
  AgentMission,
  AgentReportObservation,
  AgentRun,
  AgentTimelineEntry
} from "./agent-types.js";
import { resolveAgentEvidenceRef, type AgentEvidenceCatalog } from "./agentEvidence.js";

const MAX_TEXT = 8_000;
const MAX_LINE = 320;
const MAX_LIST = 32;

function objectValue(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function cleanText(value: unknown, fallback = "") {
  return String(value || "").trim().slice(0, MAX_TEXT) || fallback;
}

function cleanLine(value: unknown, fallback = "") {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, MAX_LINE) || fallback;
}

function cleanList(value: unknown) {
  return (Array.isArray(value) ? value : [])
    .map((entry) => cleanLine(entry))
    .filter(Boolean)
    .slice(0, MAX_LIST);
}

function unique(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function normalizeConfidence(value: unknown): AgentReportObservation["confidence"] {
  return value === "high" || value === "medium" ? value : "low";
}

function normalizeStatus(value: unknown): AgentReportObservation["status"] {
  return value === "supported" || value === "contradicted" || value === "verified"
    ? value
    : "lead";
}

function normalizeObservations(value: unknown) {
  return (Array.isArray(value) ? value : [])
    .map((raw): AgentReportObservation | null => {
      const entry = objectValue(raw);
      const title = cleanLine(entry.title);
      const detail = cleanText(entry.detail);
      if (!title || !detail) return null;
      return {
        title,
        detail,
        status: normalizeStatus(entry.status),
        confidence: normalizeConfidence(entry.confidence),
        evidenceRefs: cleanList(entry.evidenceRefs)
      };
    })
    .filter((entry): entry is AgentReportObservation => Boolean(entry))
    .slice(0, MAX_LIST);
}

export function normalizeAgentDecisionReport(value: unknown): AgentDecisionReport | undefined {
  const input = objectValue(value);
  const report = {
    executiveSummary: cleanText(input.executiveSummary),
    scopeSummary: cleanText(input.scopeSummary),
    methodology: cleanList(input.methodology),
    observations: normalizeObservations(input.observations),
    limitations: cleanList(input.limitations),
    recommendations: cleanList(input.recommendations)
  };
  return Object.values(report).some((entry) => Array.isArray(entry) ? entry.length > 0 : Boolean(entry))
    ? report
    : undefined;
}

function operationCount(timeline: AgentTimelineEntry[], currentOperationId = "") {
  return new Set([
    ...timeline.map((entry) => entry.operationId).filter(Boolean),
    ...(currentOperationId ? [currentOperationId] : [])
  ]).size;
}

function methodologyFromTimeline(timeline: AgentTimelineEntry[]) {
  const tools = unique(
    timeline
      .map((entry) => entry.toolResult?.tool || entry.toolCall?.tool || "")
      .filter(Boolean)
  );
  const operations = operationCount(timeline);
  return [
    operations > 0
      ? `Completed ${operations} bounded operation${operations === 1 ? "" : "s"} with a durable decision, action, and observation trail.`
      : "Reviewed the durable mission state and retained evidence available to the run.",
    tools.length > 0 ? `Used Radar tools: ${tools.join(", ")}.` : "No bounded tools were recorded."
  ];
}

function observationsFromMission(mission: AgentMission) {
  return mission.claims.map((claim) => ({
    title: cleanLine(claim.statement, "Mission observation"),
    detail: cleanText(claim.statement),
    status: claim.status,
    confidence: claim.confidence,
    evidenceRefs: cleanList(claim.evidenceRefs)
  }));
}

function coverageLimitations(mission: AgentMission) {
  return mission.coverage
    .filter((cell) => cell.status !== "covered")
    .map((cell) => `${cell.dimension}: ${cell.label} remained ${cell.status}.`);
}

function validObservationEvidence(
  observations: AgentReportObservation[],
  evidenceCatalog?: AgentEvidenceCatalog
) {
  if (!evidenceCatalog) return observations;
  return observations
    .map((observation) => ({
      ...observation,
      evidenceRefs: observation.evidenceRefs.filter(
        (evidenceRef) => resolveAgentEvidenceRef(evidenceRef, evidenceCatalog).ok
      )
    }))
    .filter((observation) => observation.evidenceRefs.length > 0);
}

export function buildAgentCompletionReport({
  decisionReport,
  rationale,
  goal,
  allowlist,
  mission,
  findings,
  rejectedFindingCount,
  generatedAt,
  timeline,
  currentOperationId,
  evidenceCatalog
}: {
  decisionReport?: AgentDecisionReport;
  rationale: string;
  goal: string;
  allowlist: string[];
  mission: AgentMission;
  findings: AgentFinding[];
  rejectedFindingCount: number;
  generatedAt: string;
  timeline: AgentTimelineEntry[];
  currentOperationId?: string;
  evidenceCatalog?: AgentEvidenceCatalog;
}): AgentCompletionReport {
  const reportObservations = decisionReport?.observations.length
    ? decisionReport.observations
    : observationsFromMission(mission);
  const observations = validObservationEvidence(reportObservations, evidenceCatalog);
  const limitations = unique([
    ...(decisionReport?.limitations || []),
    ...coverageLimitations(mission),
    ...findings.flatMap((finding) => finding.uncertainties),
    ...(rejectedFindingCount > 0
      ? [`${rejectedFindingCount} proposed draft finding${rejectedFindingCount === 1 ? " was" : "s were"} rejected by the evidence quality gate; review the rejection events in the audit stream.`]
      : []),
    ...(findings.length === 0
      ? ["No evidence-backed draft vulnerability passed the finding quality gate; this does not prove the target is vulnerability-free."]
      : [])
  ]).slice(0, MAX_LIST);
  const recommendations = unique([
    ...(decisionReport?.recommendations || []),
    ...findings.map((finding) => finding.remediation),
    ...(findings.length === 0
      ? ["Review the retained observations and close the listed coverage gaps before treating the assessment as exhaustive."]
      : [])
  ]).slice(0, MAX_LIST);
  const evidenceRefs = unique([
    ...observations.flatMap((observation) => observation.evidenceRefs),
    ...findings.flatMap((finding) => finding.evidenceRefs)
  ]);
  return {
    generatedAt,
    outcome: findings.length > 0
      ? "draft-findings"
      : observations.length > 0
        ? "observations-only"
        : "no-evidence-backed-findings",
    findingCount: findings.length,
    rejectedFindingCount: Math.max(0, rejectedFindingCount),
    operationCount: operationCount(timeline, currentOperationId),
    evidenceRefs,
    executiveSummary: cleanText(
      decisionReport?.executiveSummary,
      cleanText(rationale, "Radar completed the bounded assessment.")
    ),
    scopeSummary: cleanText(
      decisionReport?.scopeSummary,
      `Objective: ${cleanLine(goal)}${allowlist.length ? ` Saved scope: ${allowlist.join(", ")}.` : ""}`
    ),
    methodology: decisionReport?.methodology.length
      ? decisionReport.methodology
      : methodologyFromTimeline(timeline),
    observations,
    limitations,
    recommendations
  };
}

export function completionReportForRun(run: AgentRun): AgentCompletionReport | null {
  for (let index = run.timeline.length - 1; index >= 0; index -= 1) {
    const report = run.timeline[index]?.completionReport;
    if (report) return report;
  }
  if (run.status !== "completed") return null;
  const mission = run.mission;
  if (!mission) return null;
  const completionEntry = [...run.timeline].reverse().find((entry) => entry.phase === "status");
  const rejectedFindingCount = run.timeline.filter(
    (entry) => entry.summary === "Draft finding rejected by quality gate"
  ).length;
  return buildAgentCompletionReport({
    rationale: completionEntry?.note || mission.stopReason || "Radar completed the bounded assessment.",
    goal: run.goal,
    allowlist: run.checkpoint?.targetOrigin ? [run.checkpoint.targetOrigin] : [],
    mission,
    findings: run.findings,
    rejectedFindingCount,
    generatedAt: run.updatedAt,
    timeline: run.timeline
  });
}
