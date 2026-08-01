import type { AgentMission } from "../agent-types.js";
import {
  resolveAgentEvidenceRef,
  type AgentEvidenceCatalog
} from "../agentEvidence.js";

export function validateAgentMissionReferences(mission: AgentMission) {
  const objectiveIds = new Set(mission.objectives.map((item) => item.id));
  const hypothesisIds = new Set(mission.hypotheses.map((item) => item.id));
  const errors: string[] = [];
  for (const hypothesis of mission.hypotheses) {
    if (hypothesis.objectiveId && !objectiveIds.has(hypothesis.objectiveId)) {
      errors.push(`hypothesis ${hypothesis.id} -> objective ${hypothesis.objectiveId}`);
    }
  }
  for (const experiment of mission.experiments) {
    if (experiment.hypothesisId && !hypothesisIds.has(experiment.hypothesisId)) {
      errors.push(`experiment ${experiment.id} -> hypothesis ${experiment.hypothesisId}`);
    }
  }
  for (const claim of mission.claims) {
    if (claim.hypothesisId && !hypothesisIds.has(claim.hypothesisId)) {
      errors.push(`claim ${claim.id} -> hypothesis ${claim.hypothesisId}`);
    }
  }
  return errors;
}

export function validateAgentMissionEvidence(
  mission: AgentMission,
  catalog: AgentEvidenceCatalog
) {
  const errors: string[] = [];
  const evidenceBearingItems = [
    ...mission.hypotheses.map((item) => ({ kind: "hypothesis", id: item.id, refs: item.evidenceRefs })),
    ...mission.experiments.map((item) => ({ kind: "experiment", id: item.id, refs: item.evidenceRefs })),
    ...mission.claims.map((item) => ({ kind: "claim", id: item.id, refs: item.evidenceRefs })),
    ...mission.coverage.map((item) => ({ kind: "coverage", id: item.id, refs: item.evidenceRefs }))
  ];
  for (const item of evidenceBearingItems) {
    for (const ref of item.refs) {
      const resolution = resolveAgentEvidenceRef(ref, catalog);
      if (!resolution.ok) errors.push(`${item.kind} ${item.id}: ${resolution.message}`);
    }
  }
  for (const hypothesis of mission.hypotheses) {
    if (hypothesis.status === "supported" && hypothesis.evidenceRefs.length === 0) {
      errors.push(`hypothesis ${hypothesis.id}: supported status requires evidence`);
    }
  }
  for (const claim of mission.claims) {
    if (
      (claim.status === "supported" || claim.status === "verified") &&
      claim.evidenceRefs.length === 0
    ) {
      errors.push(`claim ${claim.id}: ${claim.status} status requires evidence`);
    }
  }
  for (const cell of mission.coverage) {
    if (cell.status === "covered" && cell.evidenceRefs.length === 0) {
      errors.push(`coverage ${cell.id}: covered status requires evidence`);
    }
  }
  return errors;
}

export function missionHasOpenQuestion(mission: AgentMission) {
  return mission.operatorQuestions.some((question) => question.status === "open");
}
