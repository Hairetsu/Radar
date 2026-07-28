import type {
  AgentMission,
  AgentMissionEntityKind,
  AgentMissionPriority,
  AgentObjectiveStatus,
  AgentHypothesisStatus,
  AgentExperimentStatus,
  AgentClaimStatus,
  AgentCoverageStatus
} from "../types";

export type MissionNode = {
  key: string;
  entity: AgentMissionEntityKind;
  id: string;
  label: string;
  status: string;
  level: number;
  priority?: AgentMissionPriority;
  pinned?: boolean;
  evidenceRefs: string[];
};

export type MissionItemStatus =
  | AgentObjectiveStatus
  | AgentHypothesisStatus
  | AgentExperimentStatus
  | AgentClaimStatus
  | AgentCoverageStatus;

export const STATUS_OPTIONS: Record<AgentMissionEntityKind, string[]> = {
  objective: ["planned", "active", "blocked", "completed", "dismissed"],
  hypothesis: ["open", "testing", "supported", "rejected", "blocked", "stale"],
  experiment: ["planned", "running", "passed", "failed", "blocked", "skipped"],
  claim: ["lead", "supported", "contradicted", "verified"],
  coverage: ["untested", "planned", "testing", "covered", "blocked"]
};

export const ENTITY_LABELS: Record<AgentMissionEntityKind, string> = {
  objective: "OBJ",
  hypothesis: "HYP",
  experiment: "EXP",
  claim: "CLM",
  coverage: "GAP"
};

export function graphNodes(mission: AgentMission): MissionNode[] {
  const nodes: MissionNode[] = [];
  const seenHypotheses = new Set<string>();
  const seenExperiments = new Set<string>();
  const seenClaims = new Set<string>();
  for (const objective of [...mission.objectives].sort(
    (left, right) => left.priority - right.priority || left.id.localeCompare(right.id)
  )) {
    nodes.push({
      key: `objective:${objective.id}`,
      entity: "objective",
      id: objective.id,
      label: objective.title,
      status: objective.status,
      level: 1,
      priority: objective.priority,
      evidenceRefs: []
    });
    const hypotheses = mission.hypotheses
      .filter((item) => item.objectiveId === objective.id)
      .sort(
        (left, right) =>
          Number(right.pinned) - Number(left.pinned) || left.priority - right.priority || left.id.localeCompare(right.id)
      );
    for (const hypothesis of hypotheses) {
      seenHypotheses.add(hypothesis.id);
      nodes.push({
        key: `hypothesis:${hypothesis.id}`,
        entity: "hypothesis",
        id: hypothesis.id,
        label: hypothesis.statement,
        status: hypothesis.status,
        level: 2,
        priority: hypothesis.priority,
        pinned: hypothesis.pinned,
        evidenceRefs: hypothesis.evidenceRefs
      });
      for (const experiment of mission.experiments.filter((item) => item.hypothesisId === hypothesis.id)) {
        seenExperiments.add(experiment.id);
        nodes.push({
          key: `experiment:${experiment.id}`,
          entity: "experiment",
          id: experiment.id,
          label: experiment.title,
          status: experiment.status,
          level: 3,
          evidenceRefs: experiment.evidenceRefs
        });
      }
      for (const claim of mission.claims.filter((item) => item.hypothesisId === hypothesis.id)) {
        seenClaims.add(claim.id);
        nodes.push({
          key: `claim:${claim.id}`,
          entity: "claim",
          id: claim.id,
          label: claim.statement,
          status: claim.status,
          level: 3,
          evidenceRefs: claim.evidenceRefs
        });
      }
    }
  }
  for (const hypothesis of mission.hypotheses.filter((item) => !seenHypotheses.has(item.id))) {
    nodes.push({
      key: `hypothesis:${hypothesis.id}`,
      entity: "hypothesis",
      id: hypothesis.id,
      label: hypothesis.statement,
      status: hypothesis.status,
      level: 1,
      priority: hypothesis.priority,
      pinned: hypothesis.pinned,
      evidenceRefs: hypothesis.evidenceRefs
    });
  }
  for (const experiment of mission.experiments.filter((item) => !seenExperiments.has(item.id))) {
    nodes.push({
      key: `experiment:${experiment.id}`,
      entity: "experiment",
      id: experiment.id,
      label: experiment.title,
      status: experiment.status,
      level: 1,
      evidenceRefs: experiment.evidenceRefs
    });
  }
  for (const claim of mission.claims.filter((item) => !seenClaims.has(item.id))) {
    nodes.push({
      key: `claim:${claim.id}`,
      entity: "claim",
      id: claim.id,
      label: claim.statement,
      status: claim.status,
      level: 1,
      evidenceRefs: claim.evidenceRefs
    });
  }
  for (const cell of mission.coverage) {
    nodes.push({
      key: `coverage:${cell.id}`,
      entity: "coverage",
      id: cell.id,
      label: `${cell.dimension} / ${cell.label}`,
      status: cell.status,
      level: 1,
      evidenceRefs: cell.evidenceRefs
    });
  }
  return nodes;
}
