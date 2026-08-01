import type { AgentMission, AgentMissionPatch, AgentMissionUpdate } from "../agent-types.js";
import {
  AGENT_MISSION_LIMITS,
  CLAIM_STATUSES,
  COVERAGE_DIMENSIONS,
  COVERAGE_STATUSES,
  EXPERIMENT_STATUSES,
  HYPOTHESIS_STATUSES,
  MISSION_STATUSES,
  OBJECTIVE_STATUSES
} from "./constants.js";
import {
  boundedText,
  enumValue,
  evidenceRefs,
  normalizeAgentMission,
  normalizedClaim,
  normalizedCoverage,
  normalizedExperiment,
  normalizedHypothesis,
  normalizedId,
  normalizedObjective,
  normalizedQuestion,
  objectValue,
  optionalEnumValue,
  optionalText,
  priorityValue
} from "./normalization.js";
import { validateAgentMissionReferences } from "./validation.js";

export function normalizeAgentMissionUpdates(value: unknown): AgentMissionUpdate[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const updates: AgentMissionUpdate[] = [];
  for (const raw of value.slice(0, AGENT_MISSION_LIMITS.updatesPerDecision)) {
    const input = objectValue(raw);
    const kind = String(input.kind || "");
    if (kind === "objective") {
      const title = boundedText(input.title, 240);
      if (title) {
        updates.push({
          kind,
          ...(optionalText(input.id, 100) ? { id: optionalText(input.id, 100) } : {}),
          title,
          ...(optionalText(input.description, 1200) ? { description: optionalText(input.description, 1200) } : {}),
          ...(optionalEnumValue(input.status, OBJECTIVE_STATUSES) ? { status: optionalEnumValue(input.status, OBJECTIVE_STATUSES) } : {}),
          ...(input.priority !== undefined ? { priority: priorityValue(input.priority) } : {})
        });
      }
    } else if (kind === "hypothesis") {
      const statement = boundedText(input.statement, 500);
      if (statement) {
        updates.push({
          kind,
          ...(optionalText(input.id, 100) ? { id: optionalText(input.id, 100) } : {}),
          ...(optionalText(input.objectiveId, 100) ? { objectiveId: optionalText(input.objectiveId, 100) } : {}),
          statement,
          ...(optionalText(input.rationale, 1200) ? { rationale: optionalText(input.rationale, 1200) } : {}),
          ...(optionalEnumValue(input.status, HYPOTHESIS_STATUSES) ? { status: optionalEnumValue(input.status, HYPOTHESIS_STATUSES) } : {}),
          ...(input.priority !== undefined ? { priority: priorityValue(input.priority) } : {}),
          ...(Array.isArray(input.evidenceRefs) ? { evidenceRefs: evidenceRefs(input.evidenceRefs) } : {})
        });
      }
    } else if (kind === "experiment") {
      const title = boundedText(input.title, 300);
      if (title) {
        updates.push({
          kind,
          ...(optionalText(input.id, 100) ? { id: optionalText(input.id, 100) } : {}),
          ...(optionalText(input.hypothesisId, 100) ? { hypothesisId: optionalText(input.hypothesisId, 100) } : {}),
          title,
          ...(optionalText(input.method, 1200) ? { method: optionalText(input.method, 1200) } : {}),
          ...(optionalText(input.expectedObservation, 800)
            ? { expectedObservation: optionalText(input.expectedObservation, 800) }
            : {}),
          ...(optionalEnumValue(input.status, EXPERIMENT_STATUSES) ? { status: optionalEnumValue(input.status, EXPERIMENT_STATUSES) } : {}),
          ...(Array.isArray(input.evidenceRefs) ? { evidenceRefs: evidenceRefs(input.evidenceRefs) } : {})
        });
      }
    } else if (kind === "claim") {
      const statement = boundedText(input.statement, 500);
      if (statement) {
        updates.push({
          kind,
          ...(optionalText(input.id, 100) ? { id: optionalText(input.id, 100) } : {}),
          ...(optionalText(input.hypothesisId, 100) ? { hypothesisId: optionalText(input.hypothesisId, 100) } : {}),
          statement,
          ...(optionalEnumValue(input.status, CLAIM_STATUSES) ? { status: optionalEnumValue(input.status, CLAIM_STATUSES) } : {}),
          confidence: enumValue(input.confidence, ["low", "medium", "high"] as const, "low"),
          ...(Array.isArray(input.evidenceRefs) ? { evidenceRefs: evidenceRefs(input.evidenceRefs) } : {})
        });
      }
    } else if (kind === "coverage") {
      const label = boundedText(input.label, 300);
      if (label) {
        updates.push({
          kind,
          ...(optionalText(input.id, 100) ? { id: optionalText(input.id, 100) } : {}),
          dimension: enumValue(input.dimension, COVERAGE_DIMENSIONS, "control"),
          label,
          ...(optionalEnumValue(input.status, COVERAGE_STATUSES) ? { status: optionalEnumValue(input.status, COVERAGE_STATUSES) } : {}),
          ...(Array.isArray(input.evidenceRefs) ? { evidenceRefs: evidenceRefs(input.evidenceRefs) } : {})
        });
      }
    } else if (kind === "operator-question") {
      const prompt = boundedText(input.prompt, 800);
      if (prompt) {
        updates.push({
          kind,
          ...(optionalText(input.id, 100) ? { id: optionalText(input.id, 100) } : {}),
          prompt
        });
      }
    } else if (kind === "mission-status") {
      const status = optionalEnumValue(input.status, MISSION_STATUSES);
      if (status) {
        updates.push({
          kind,
          status,
          ...(optionalText(input.stopReason, 1200) ? { stopReason: optionalText(input.stopReason, 1200) } : {})
        });
      }
    }
  }
  return updates;
}

function upsertById<T extends { id: string }>(items: T[], item: T, limit: number) {
  const index = items.findIndex((candidate) => candidate.id === item.id);
  if (index < 0) {
    return [...items, item].slice(0, limit);
  }
  return items.map((candidate, position) => (position === index ? item : candidate));
}

export function applyAgentMissionUpdates(
  current: AgentMission,
  rawUpdates: AgentMissionUpdate[],
  now = new Date().toISOString()
): AgentMission {
  const updates = normalizeAgentMissionUpdates(rawUpdates);
  let mission = normalizeAgentMission(current, current.goal, "", now);
  for (const update of updates) {
    if (update.kind === "objective") {
      const id = normalizedId(update.id, "obj", update.title);
      const existing = mission.objectives.find((item) => item.id === id);
      const item = normalizedObjective(
        {
          ...existing,
          ...update,
          id,
          priority: existing?.priority ?? update.priority,
          createdAt: existing?.createdAt || now,
          updatedAt: now
        },
        now
      );
      if (item) {
        mission = { ...mission, objectives: upsertById(mission.objectives, item, AGENT_MISSION_LIMITS.objectives) };
      }
    } else if (update.kind === "hypothesis") {
      const id = normalizedId(update.id, "hyp", update.statement);
      const existing = mission.hypotheses.find((item) => item.id === id);
      const item = normalizedHypothesis(
        {
          ...existing,
          ...update,
          id,
          priority: existing?.priority ?? update.priority,
          pinned: existing?.pinned || false,
          createdAt: existing?.createdAt || now,
          updatedAt: now
        },
        now
      );
      if (item) {
        mission = { ...mission, hypotheses: upsertById(mission.hypotheses, item, AGENT_MISSION_LIMITS.hypotheses) };
      }
    } else if (update.kind === "experiment") {
      const id = normalizedId(update.id, "exp", update.title);
      const existing = mission.experiments.find((item) => item.id === id);
      const item = normalizedExperiment(
        { ...existing, ...update, id, createdAt: existing?.createdAt || now, updatedAt: now },
        now
      );
      if (item) {
        mission = { ...mission, experiments: upsertById(mission.experiments, item, AGENT_MISSION_LIMITS.experiments) };
      }
    } else if (update.kind === "claim") {
      const id = normalizedId(update.id, "clm", update.statement);
      const existing = mission.claims.find((item) => item.id === id);
      const item = normalizedClaim(
        { ...existing, ...update, id, createdAt: existing?.createdAt || now, updatedAt: now },
        now
      );
      if (item) {
        mission = { ...mission, claims: upsertById(mission.claims, item, AGENT_MISSION_LIMITS.claims) };
      }
    } else if (update.kind === "coverage") {
      const id = normalizedId(update.id, "gap", `${update.dimension}:${update.label}`);
      const existing = mission.coverage.find((item) => item.id === id);
      const item = normalizedCoverage(
        { ...existing, ...update, id, createdAt: existing?.createdAt || now, updatedAt: now },
        now
      );
      if (item) {
        mission = { ...mission, coverage: upsertById(mission.coverage, item, AGENT_MISSION_LIMITS.coverage) };
      }
    } else if (update.kind === "operator-question") {
      const id = normalizedId(update.id, "ask", update.prompt);
      const existing = mission.operatorQuestions.find((item) => item.id === id);
      const item = normalizedQuestion(
        { ...existing, id, prompt: update.prompt, status: "open", createdAt: existing?.createdAt || now, updatedAt: now },
        now
      );
      if (item) {
        mission = {
          ...mission,
          status: "awaiting-operator",
          operatorQuestions: upsertById(
            mission.operatorQuestions,
            item,
            AGENT_MISSION_LIMITS.operatorQuestions
          )
        };
      }
    } else {
      mission = {
        ...mission,
        status: update.status,
        ...(update.stopReason ? { stopReason: update.stopReason } : {})
      };
    }
  }
  return updates.length > 0 ? { ...mission, revision: mission.revision + 1, updatedAt: now } : mission;
}

export function normalizeAgentMissionPatch(value: unknown): AgentMissionPatch | undefined {
  const input = objectValue(value);
  if (!Array.isArray(input.updates)) {
    return undefined;
  }
  const baseRevision = Math.max(0, Math.round(Number(input.baseRevision) || 0));
  const updates = normalizeAgentMissionUpdates(input.updates);
  return updates.length > 0 ? { baseRevision, updates } : undefined;
}

export function applyAgentMissionPatch(
  current: AgentMission,
  rawPatch: unknown,
  now = new Date().toISOString()
): { ok: true; mission: AgentMission } | { ok: false; error: string } {
  const patch = normalizeAgentMissionPatch(rawPatch);
  if (!patch) {
    return { ok: false, error: "Mission patch was invalid or empty." };
  }
  if (patch.baseRevision !== current.revision) {
    return {
      ok: false,
      error: `Mission patch expected revision ${patch.baseRevision}, but current revision is ${current.revision}.`
    };
  }
  const mission = applyAgentMissionUpdates(current, patch.updates, now);
  const referenceErrors = validateAgentMissionReferences(mission);
  return referenceErrors.length > 0
    ? { ok: false, error: `Mission patch has invalid references: ${referenceErrors.join(", ")}` }
    : { ok: true, mission };
}
