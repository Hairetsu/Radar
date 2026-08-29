import { createArmedAssessmentState, normalizeAssessmentContract } from "../../../shared/agentAssessment.js";
import { normalizeAgentCapabilityState } from "../../../shared/agentCapabilities.js";
import { normalizeAgentMission } from "../../../shared/agentMission.js";
import { normalizeAgentTutorialGuidance } from "../../../shared/agentTutorial.js";
import { normalizeAgentRunSource } from "../../../shared/agentFollowUp.js";
import type {
  AgentFinding,
  AgentPolicy,
  AgentRun,
  AgentRunCheckpoint,
  AgentTimelineEntry
} from "../../../shared/agent-types.js";
import { parseJsonArray, parseJsonObject } from "../json.js";
import type { AgentRunRow } from "../rows.js";

export function toAgentRun(row: AgentRunRow): AgentRun {
  const checkpointValue = parseJsonObject<Partial<AgentRunCheckpoint> | null>(
    row.checkpoint_json,
    null
  );
  const checkpoint =
    checkpointValue && typeof checkpointValue.startUrl === "string"
      ? (checkpointValue as AgentRunCheckpoint)
      : null;
  const mission = normalizeAgentMission(
    parseJsonObject(row.mission_json, null),
    row.goal,
    checkpoint?.startUrl || "",
    row.created_at
  );
  const capabilities = normalizeAgentCapabilityState(
    parseJsonObject(row.capabilities_json, null),
    row.created_at
  );
  const assessmentRecord = parseJsonObject<Record<string, unknown> | null>(row.assessment_json || "{}", null);
  const assessmentContract = normalizeAssessmentContract(assessmentRecord?.contract ?? assessmentRecord);
  const assessment = assessmentContract
    ? {
        ...createArmedAssessmentState(assessmentContract),
        ...(assessmentRecord || {}),
        contract: assessmentContract
      }
    : undefined;
  const source = normalizeAgentRunSource(parseJsonObject(row.source_json || "{}", null));
  const timeline = parseJsonArray<AgentTimelineEntry>(row.timeline_json).map((entry) => {
    const { tutorial: rawTutorial, ...rest } = entry;
    const tutorial = normalizeAgentTutorialGuidance(rawTutorial);
    return tutorial ? { ...rest, tutorial } : rest;
  });
  return {
    id: row.id,
    sessionId: row.session_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    goal: row.goal,
    profileId: row.profile_id || "passive-map",
    status: row.status,
    policy: parseJsonObject<AgentPolicy>(row.policy_json, {
      maxRuntimeMs: 0,
      maxSteps: 0,
      maxReplay: 0,
      maxWorkflowRequests: 0,
      maxCaptureSample: 0,
      allowRawContext: false
    }),
    timeline,
    findings: parseJsonArray<AgentFinding>(row.findings_json),
    mission,
    capabilities,
    ...(assessment ? { assessment } : {}),
    ...(checkpoint ? { checkpoint } : {}),
    ...(source ? { source } : {}),
    ...(row.error ? { error: row.error } : {})
  };
}
