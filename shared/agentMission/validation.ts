import type { AgentMission } from "../agent-types.js";
import {
  captureIdFromEvidenceRef,
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

export function missionEvidenceRefs(mission: AgentMission) {
  return [
    ...mission.hypotheses.flatMap((item) => item.evidenceRefs),
    ...mission.experiments.flatMap((item) => item.evidenceRefs),
    ...mission.claims.flatMap((item) => item.evidenceRefs),
    ...mission.coverage.flatMap((item) => item.evidenceRefs)
  ];
}

export function captureIdsFromEvidenceRefs(refs: string[]) {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const ref of refs) {
    const id = captureIdFromEvidenceRef(ref);
    if (!id || seen.has(id)) {
      continue;
    }
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

function keptEvidenceRefs(refs: string[], catalog: AgentEvidenceCatalog, droppedRefs: string[]) {
  const kept: string[] = [];
  for (const ref of refs) {
    const resolution = resolveAgentEvidenceRef(ref, catalog);
    if (resolution.ok) {
      kept.push(resolution.key);
      continue;
    }
    droppedRefs.push(ref);
  }
  return kept;
}

export function reconcileAgentMissionEvidence(
  mission: AgentMission,
  catalog: AgentEvidenceCatalog,
  now = mission.updatedAt
) {
  const droppedRefs: string[] = [];
  const hypotheses = mission.hypotheses.map((item) => {
    const evidenceRefs = keptEvidenceRefs(item.evidenceRefs, catalog, droppedRefs);
    if (item.status === "supported" && evidenceRefs.length === 0) {
      return { ...item, evidenceRefs, status: "open" as const, updatedAt: now };
    }
    return evidenceRefs.length === item.evidenceRefs.length && evidenceRefs.every((ref, index) => ref === item.evidenceRefs[index])
      ? item
      : { ...item, evidenceRefs, updatedAt: now };
  });
  const experiments = mission.experiments.map((item) => {
    const evidenceRefs = keptEvidenceRefs(item.evidenceRefs, catalog, droppedRefs);
    return evidenceRefs.length === item.evidenceRefs.length && evidenceRefs.every((ref, index) => ref === item.evidenceRefs[index])
      ? item
      : { ...item, evidenceRefs, updatedAt: now };
  });
  const claims = mission.claims.map((item) => {
    const evidenceRefs = keptEvidenceRefs(item.evidenceRefs, catalog, droppedRefs);
    if ((item.status === "supported" || item.status === "verified") && evidenceRefs.length === 0) {
      return { ...item, evidenceRefs, status: "lead" as const, updatedAt: now };
    }
    return evidenceRefs.length === item.evidenceRefs.length && evidenceRefs.every((ref, index) => ref === item.evidenceRefs[index])
      ? item
      : { ...item, evidenceRefs, updatedAt: now };
  });
  const coverage = mission.coverage.map((item) => {
    const evidenceRefs = keptEvidenceRefs(item.evidenceRefs, catalog, droppedRefs);
    if (item.status === "covered" && evidenceRefs.length === 0) {
      return { ...item, evidenceRefs, status: "untested" as const, updatedAt: now };
    }
    return evidenceRefs.length === item.evidenceRefs.length && evidenceRefs.every((ref, index) => ref === item.evidenceRefs[index])
      ? item
      : { ...item, evidenceRefs, updatedAt: now };
  });

  if (droppedRefs.length === 0) {
    return { mission, droppedRefs };
  }

  return {
    mission: {
      ...mission,
      hypotheses,
      experiments,
      claims,
      coverage,
      updatedAt: now
    },
    droppedRefs
  };
}

export function missionHasOpenQuestion(mission: AgentMission) {
  return mission.operatorQuestions.some((question) => question.status === "open");
}
