import type {
  AgentClaimStatus,
  AgentCoverageDimension,
  AgentCoverageStatus,
  AgentExperimentStatus,
  AgentHypothesisStatus,
  AgentMissionEntityKind,
  AgentMissionStatus,
  AgentObjectiveStatus
} from "../agent-types.js";

export const AGENT_MISSION_LIMITS = {
  objectives: 16,
  hypotheses: 40,
  experiments: 60,
  claims: 60,
  coverage: 100,
  operatorQuestions: 16,
  updatesPerDecision: 20,
  evidenceRefsPerItem: 40
} as const;

export const OBJECTIVE_STATUSES: AgentObjectiveStatus[] = ["planned", "active", "blocked", "completed", "dismissed"];
export const HYPOTHESIS_STATUSES: AgentHypothesisStatus[] = ["open", "testing", "supported", "rejected", "blocked", "stale"];
export const EXPERIMENT_STATUSES: AgentExperimentStatus[] = ["planned", "running", "completed", "passed", "failed", "blocked", "skipped"];
export const CLAIM_STATUSES: AgentClaimStatus[] = ["lead", "supported", "contradicted", "verified"];
export const COVERAGE_STATUSES: AgentCoverageStatus[] = ["untested", "planned", "testing", "covered", "blocked"];
export const COVERAGE_DIMENSIONS: AgentCoverageDimension[] = ["host", "endpoint", "identity", "state", "control"];
export const MISSION_STATUSES: AgentMissionStatus[] = ["active", "awaiting-operator", "completed", "stopped"];
export const ENTITY_KINDS: AgentMissionEntityKind[] = ["objective", "hypothesis", "experiment", "claim", "coverage"];

export type AgentMissionItemStatus =
  | AgentObjectiveStatus
  | AgentHypothesisStatus
  | AgentExperimentStatus
  | AgentClaimStatus
  | AgentCoverageStatus;
