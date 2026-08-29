import type {
  AgentFinding,
  AgentFindingFollowUpDigest,
  AgentRun,
  AgentRunSource
} from "./agent-types.js";
import { completionReportForRun } from "./agentReport.js";

const MAX_ID = 128;
const MAX_PROMPT = 8_000;

function cleanId(value: unknown) {
  return String(value || "").trim().slice(0, MAX_ID);
}

export function normalizeAgentRunSource(input: unknown): AgentRunSource | undefined {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return undefined;
  }
  const record = input as Record<string, unknown>;
  const sourceRunId = cleanId(record.sourceRunId);
  if (!sourceRunId) {
    return undefined;
  }
  if (record.kind === "continuation") {
    return { kind: "continuation", sourceRunId };
  }
  if (record.kind === "finding-follow-up") {
    const sourceFindingId = cleanId(record.sourceFindingId);
    if (!sourceFindingId) {
      return undefined;
    }
    return { kind: "finding-follow-up", sourceRunId, sourceFindingId };
  }
  return undefined;
}

export function findingFollowUpSeedPrompt(finding: AgentFinding, startUrl = "") {
  const target =
    startUrl ||
    finding.affectedAssets.find((item) => /^https?:\/\//i.test(item)) ||
    "";
  return [
    target
      ? `Follow up on draft finding "${finding.title}" at ${target}.`
      : `Follow up on draft finding "${finding.title}".`,
    "Verify it with a confirming probe and record whether the original evidence still holds.",
    finding.evidenceRefs.length ? `Evidence: ${finding.evidenceRefs.join(", ")}.` : "",
    finding.uncertainties[0] ? `Uncertainty: ${finding.uncertainties[0]}` : ""
  ]
    .filter(Boolean)
    .join(" ")
    .slice(0, MAX_PROMPT);
}

export function findingFollowUpDigest(
  sourceRun: AgentRun,
  sourceFindingId: string
): AgentFindingFollowUpDigest | null {
  const finding = sourceRun.findings.find((item) => item.id === sourceFindingId);
  if (!finding) {
    return null;
  }
  const report = completionReportForRun(sourceRun);
  const evidence = new Set(finding.evidenceRefs);
  return {
    kind: "finding-follow-up",
    sourceRunId: sourceRun.id,
    sourceGoal: sourceRun.goal,
    sourceStatus: sourceRun.status,
    finding,
    completionSummary: report?.executiveSummary || "",
    relatedObservations: (report?.observations || [])
      .filter((observation) => observation.evidenceRefs.some((ref) => evidence.has(ref)))
      .map((observation) => ({
        title: observation.title,
        status: observation.status,
        confidence: observation.confidence,
        evidenceRefs: observation.evidenceRefs
      }))
  };
}
