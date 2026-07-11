import type {
  AgentClaimStatus,
  AgentCoverageDimension,
  AgentCoverageStatus,
  AgentExperimentStatus,
  AgentHypothesisStatus,
  AgentMission,
  AgentMissionClaim,
  AgentMissionCoverageCell,
  AgentMissionEntityKind,
  AgentMissionExperiment,
  AgentMissionHypothesis,
  AgentMissionObjective,
  AgentMissionOperatorQuestion,
  AgentMissionPatch,
  AgentMissionPriority,
  AgentMissionStatus,
  AgentMissionSteeringRequest,
  AgentMissionUpdate,
  AgentObjectiveStatus
} from "./agent-types.js";
import { originFromUrl } from "./url.js";
import { resolveAgentEvidenceRef, type AgentEvidenceCatalog } from "./agentEvidence.js";

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

const OBJECTIVE_STATUSES: AgentObjectiveStatus[] = ["planned", "active", "blocked", "completed", "dismissed"];
const HYPOTHESIS_STATUSES: AgentHypothesisStatus[] = ["open", "testing", "supported", "rejected", "blocked", "stale"];
const EXPERIMENT_STATUSES: AgentExperimentStatus[] = ["planned", "running", "passed", "failed", "blocked", "skipped"];
const CLAIM_STATUSES: AgentClaimStatus[] = ["lead", "supported", "contradicted", "verified"];
const COVERAGE_STATUSES: AgentCoverageStatus[] = ["untested", "planned", "testing", "covered", "blocked"];
const COVERAGE_DIMENSIONS: AgentCoverageDimension[] = ["host", "endpoint", "identity", "state", "control"];
const MISSION_STATUSES: AgentMissionStatus[] = ["active", "awaiting-operator", "completed", "stopped"];
const ENTITY_KINDS: AgentMissionEntityKind[] = ["objective", "hypothesis", "experiment", "claim", "coverage"];
type AgentMissionItemStatus =
  | AgentObjectiveStatus
  | AgentHypothesisStatus
  | AgentExperimentStatus
  | AgentClaimStatus
  | AgentCoverageStatus;

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function boundedText(value: unknown, max: number) {
  return String(value || "").trim().slice(0, max);
}

function optionalText(value: unknown, max: number) {
  const text = boundedText(value, max);
  return text || undefined;
}

function enumValue<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  const normalized = String(value || "");
  return allowed.includes(normalized as T) ? (normalized as T) : fallback;
}

function optionalEnumValue<T extends string>(value: unknown, allowed: readonly T[]): T | undefined {
  const normalized = String(value || "");
  return allowed.includes(normalized as T) ? (normalized as T) : undefined;
}

function priorityValue(value: unknown, fallback: AgentMissionPriority = 3): AgentMissionPriority {
  const numeric = Math.round(Number(value));
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.max(1, Math.min(numeric, 5)) as AgentMissionPriority;
}

function evidenceRefs(value: unknown) {
  return Array.isArray(value)
    ? [...new Set(value.map((item) => boundedText(item, 180)).filter(Boolean))].slice(
        0,
        AGENT_MISSION_LIMITS.evidenceRefsPerItem
      )
    : [];
}

function stableHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function normalizedId(value: unknown, prefix: string, seed: string) {
  const explicit = boundedText(value, 100).replace(/[^a-zA-Z0-9_-]/g, "-");
  return explicit || `${prefix}-${stableHash(seed || prefix)}`;
}

function isoValue(value: unknown, fallback: string) {
  const text = boundedText(value, 40);
  return Number.isFinite(Date.parse(text)) ? text : fallback;
}

function normalizedObjective(value: unknown, now: string): AgentMissionObjective | null {
  const item = objectValue(value);
  const title = boundedText(item.title, 240);
  if (!title) {
    return null;
  }
  const createdAt = isoValue(item.createdAt, now);
  return {
    id: normalizedId(item.id, "obj", title),
    title,
    description: boundedText(item.description, 1200),
    status: enumValue(item.status, OBJECTIVE_STATUSES, "planned"),
    priority: priorityValue(item.priority),
    createdAt,
    updatedAt: isoValue(item.updatedAt, createdAt)
  };
}

function normalizedHypothesis(value: unknown, now: string): AgentMissionHypothesis | null {
  const item = objectValue(value);
  const statement = boundedText(item.statement, 500);
  if (!statement) {
    return null;
  }
  const createdAt = isoValue(item.createdAt, now);
  return {
    id: normalizedId(item.id, "hyp", statement),
    ...(optionalText(item.objectiveId, 100) ? { objectiveId: optionalText(item.objectiveId, 100) } : {}),
    statement,
    rationale: boundedText(item.rationale, 1200),
    status: enumValue(item.status, HYPOTHESIS_STATUSES, "open"),
    priority: priorityValue(item.priority),
    pinned: item.pinned === true,
    evidenceRefs: evidenceRefs(item.evidenceRefs),
    createdAt,
    updatedAt: isoValue(item.updatedAt, createdAt)
  };
}

function normalizedExperiment(value: unknown, now: string): AgentMissionExperiment | null {
  const item = objectValue(value);
  const title = boundedText(item.title, 300);
  if (!title) {
    return null;
  }
  const createdAt = isoValue(item.createdAt, now);
  return {
    id: normalizedId(item.id, "exp", title),
    ...(optionalText(item.hypothesisId, 100) ? { hypothesisId: optionalText(item.hypothesisId, 100) } : {}),
    title,
    method: boundedText(item.method, 1200),
    expectedObservation: boundedText(item.expectedObservation, 800),
    status: enumValue(item.status, EXPERIMENT_STATUSES, "planned"),
    evidenceRefs: evidenceRefs(item.evidenceRefs),
    createdAt,
    updatedAt: isoValue(item.updatedAt, createdAt)
  };
}

function normalizedClaim(value: unknown, now: string): AgentMissionClaim | null {
  const item = objectValue(value);
  const statement = boundedText(item.statement, 500);
  if (!statement) {
    return null;
  }
  const createdAt = isoValue(item.createdAt, now);
  return {
    id: normalizedId(item.id, "clm", statement),
    ...(optionalText(item.hypothesisId, 100) ? { hypothesisId: optionalText(item.hypothesisId, 100) } : {}),
    statement,
    status: enumValue(item.status, CLAIM_STATUSES, "lead"),
    confidence: enumValue(item.confidence, ["low", "medium", "high"] as const, "low"),
    evidenceRefs: evidenceRefs(item.evidenceRefs),
    createdAt,
    updatedAt: isoValue(item.updatedAt, createdAt)
  };
}

function normalizedCoverage(value: unknown, now: string): AgentMissionCoverageCell | null {
  const item = objectValue(value);
  const label = boundedText(item.label, 300);
  if (!label) {
    return null;
  }
  const dimension = enumValue(item.dimension, COVERAGE_DIMENSIONS, "control");
  const createdAt = isoValue(item.createdAt, now);
  return {
    id: normalizedId(item.id, "gap", `${dimension}:${label}`),
    dimension,
    label,
    status: enumValue(item.status, COVERAGE_STATUSES, "untested"),
    evidenceRefs: evidenceRefs(item.evidenceRefs),
    createdAt,
    updatedAt: isoValue(item.updatedAt, createdAt)
  };
}

function normalizedQuestion(value: unknown, now: string): AgentMissionOperatorQuestion | null {
  const item = objectValue(value);
  const prompt = boundedText(item.prompt, 800);
  if (!prompt) {
    return null;
  }
  const createdAt = isoValue(item.createdAt, now);
  const status = enumValue(item.status, ["open", "answered", "dismissed"] as const, "open");
  const answer = optionalText(item.answer, 1600);
  return {
    id: normalizedId(item.id, "ask", prompt),
    prompt,
    status,
    ...(answer ? { answer } : {}),
    createdAt,
    updatedAt: isoValue(item.updatedAt, createdAt)
  };
}

function normalizedList<T>(value: unknown, limit: number, normalize: (item: unknown) => T | null) {
  const seen = new Set<string>();
  return (Array.isArray(value) ? value : [])
    .map(normalize)
    .filter((item): item is T & { id: string } => Boolean(item && typeof item === "object" && "id" in item))
    .filter((item) => {
      if (seen.has(item.id)) {
        return false;
      }
      seen.add(item.id);
      return true;
    })
    .slice(0, limit) as T[];
}

export function createAgentMission(goal: string, startUrl = "", now = new Date().toISOString()): AgentMission {
  const normalizedGoal = boundedText(goal, 1600) || "Review the authorized target.";
  const objective = normalizedObjective(
    {
      id: "obj-primary",
      title: normalizedGoal,
      description: "Operator-provided AI-First mission objective.",
      status: "active",
      priority: 1,
      createdAt: now,
      updatedAt: now
    },
    now
  );
  const origin = startUrl ? originFromUrl(startUrl) : "";
  const coverage = origin
    ? [
        normalizedCoverage(
          {
            id: `gap-host-${stableHash(origin)}`,
            dimension: "host",
            label: origin,
            status: "planned",
            createdAt: now,
            updatedAt: now
          },
          now
        )
      ].filter((item): item is AgentMissionCoverageCell => Boolean(item))
    : [];
  return {
    version: 1,
    revision: 0,
    goal: normalizedGoal,
    status: "active",
    createdAt: now,
    updatedAt: now,
    objectives: objective ? [objective] : [],
    hypotheses: [],
    experiments: [],
    claims: [],
    coverage,
    operatorQuestions: []
  };
}

export function normalizeAgentMission(
  value: unknown,
  goal: string,
  startUrl = "",
  now = new Date().toISOString()
): AgentMission {
  const fallback = createAgentMission(goal, startUrl, now);
  const input = objectValue(value);
  if (input.version !== 1) {
    return fallback;
  }
  const createdAt = isoValue(input.createdAt, fallback.createdAt);
  const objectives = normalizedList(input.objectives, AGENT_MISSION_LIMITS.objectives, (item) =>
    normalizedObjective(item, now)
  );
  const questions = normalizedList(input.operatorQuestions, AGENT_MISSION_LIMITS.operatorQuestions, (item) =>
    normalizedQuestion(item, now)
  );
  const hasOpenQuestion = questions.some((question) => question.status === "open");
  const status = hasOpenQuestion
    ? "awaiting-operator"
    : enumValue(input.status, MISSION_STATUSES, fallback.status);
  return {
    version: 1,
    revision: Math.max(0, Math.round(Number(input.revision) || 0)),
    goal: boundedText(input.goal, 1600) || fallback.goal,
    status,
    createdAt,
    updatedAt: isoValue(input.updatedAt, createdAt),
    ...(optionalText(input.stopReason, 1200) ? { stopReason: optionalText(input.stopReason, 1200) } : {}),
    objectives: objectives.length > 0 ? objectives : fallback.objectives,
    hypotheses: normalizedList(input.hypotheses, AGENT_MISSION_LIMITS.hypotheses, (item) =>
      normalizedHypothesis(item, now)
    ),
    experiments: normalizedList(input.experiments, AGENT_MISSION_LIMITS.experiments, (item) =>
      normalizedExperiment(item, now)
    ),
    claims: normalizedList(input.claims, AGENT_MISSION_LIMITS.claims, (item) => normalizedClaim(item, now)),
    coverage: normalizedList(input.coverage, AGENT_MISSION_LIMITS.coverage, (item) => normalizedCoverage(item, now)),
    operatorQuestions: questions
  };
}

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

export function validateAgentMissionEvidence(mission: AgentMission, catalog: AgentEvidenceCatalog) {
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
      if (!resolution.ok) {
        errors.push(`${item.kind} ${item.id}: ${resolution.message}`);
      }
    }
  }
  for (const hypothesis of mission.hypotheses) {
    if (hypothesis.status === "supported" && hypothesis.evidenceRefs.length === 0) {
      errors.push(`hypothesis ${hypothesis.id}: supported status requires evidence`);
    }
  }
  for (const claim of mission.claims) {
    if ((claim.status === "supported" || claim.status === "verified") && claim.evidenceRefs.length === 0) {
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

export function normalizeAgentMissionSteeringRequest(value: unknown): AgentMissionSteeringRequest | null {
  const input = objectValue(value);
  const action = String(input.action || "");
  const expectedRevision = Math.max(0, Math.round(Number(input.expectedRevision) || 0));
  if (action === "add-objective") {
    const title = boundedText(input.title, 240);
    return title
      ? {
          action,
          expectedRevision,
          title,
          ...(optionalText(input.description, 1200) ? { description: optionalText(input.description, 1200) } : {}),
          ...(input.priority !== undefined ? { priority: priorityValue(input.priority) } : {})
        }
      : null;
  }
  if (action === "add-hypothesis") {
    const statement = boundedText(input.statement, 500);
    return statement
      ? {
          action,
          expectedRevision,
          statement,
          ...(optionalText(input.rationale, 1200) ? { rationale: optionalText(input.rationale, 1200) } : {}),
          ...(optionalText(input.objectiveId, 100) ? { objectiveId: optionalText(input.objectiveId, 100) } : {}),
          ...(input.priority !== undefined ? { priority: priorityValue(input.priority) } : {})
        }
      : null;
  }
  if (action === "update-item") {
    const entity = optionalEnumValue(input.entity, ENTITY_KINDS);
    const id = boundedText(input.id, 100);
    if (!entity || !id) {
      return null;
    }
    const status = optionalText(input.status, 40) as AgentMissionItemStatus | undefined;
    return {
      action,
      expectedRevision,
      entity,
      id,
      ...(status ? { status } : {}),
      ...(input.priority !== undefined ? { priority: priorityValue(input.priority) } : {}),
      ...(typeof input.pinned === "boolean" ? { pinned: input.pinned } : {})
    };
  }
  if (action === "ask-operator") {
    const prompt = boundedText(input.prompt, 800);
    return prompt ? { action, expectedRevision, prompt } : null;
  }
  if (action === "answer-operator") {
    const questionId = boundedText(input.questionId, 100);
    const answer = boundedText(input.answer, 1600);
    return questionId && answer ? { action, expectedRevision, questionId, answer } : null;
  }
  if (action === "dismiss-operator") {
    const questionId = boundedText(input.questionId, 100);
    return questionId ? { action, expectedRevision, questionId } : null;
  }
  return null;
}

export type AgentMissionSteeringResult =
  | { ok: true; mission: AgentMission; summary: string; shouldPause: boolean }
  | { ok: false; error: string };

function statusAllowed(entity: AgentMissionEntityKind, status: string) {
  const byEntity: Record<AgentMissionEntityKind, readonly string[]> = {
    objective: OBJECTIVE_STATUSES,
    hypothesis: HYPOTHESIS_STATUSES,
    experiment: EXPERIMENT_STATUSES,
    claim: CLAIM_STATUSES,
    coverage: COVERAGE_STATUSES
  };
  return byEntity[entity].includes(status);
}

export function applyAgentMissionSteering(
  current: AgentMission,
  rawRequest: unknown,
  now = new Date().toISOString()
): AgentMissionSteeringResult {
  const request = normalizeAgentMissionSteeringRequest(rawRequest);
  if (!request) {
    return { ok: false, error: "Mission steering request was invalid." };
  }
  if (request.expectedRevision !== current.revision) {
    return {
      ok: false,
      error: `Mission steering expected revision ${request.expectedRevision}, but current revision is ${current.revision}.`
    };
  }
  if (request.action === "add-objective") {
    const mission = applyAgentMissionUpdates(
      current,
      [{ kind: "objective", title: request.title, description: request.description, priority: request.priority, status: "planned" }],
      now
    );
    return { ok: true, mission, summary: `Operator added objective: ${request.title}`, shouldPause: false };
  }
  if (request.action === "add-hypothesis") {
    const mission = applyAgentMissionUpdates(
      current,
      [
        {
          kind: "hypothesis",
          statement: request.statement,
          rationale: request.rationale,
          objectiveId: request.objectiveId,
          priority: request.priority,
          status: "open"
        }
      ],
      now
    );
    return { ok: true, mission, summary: `Operator added hypothesis: ${request.statement}`, shouldPause: false };
  }
  if (request.action === "ask-operator") {
    const mission = applyAgentMissionUpdates(current, [{ kind: "operator-question", prompt: request.prompt }], now);
    return { ok: true, mission, summary: `Operator input requested: ${request.prompt}`, shouldPause: true };
  }
  if (request.action === "answer-operator" || request.action === "dismiss-operator") {
    const questionId = request.questionId;
    const question = current.operatorQuestions.find((item) => item.id === questionId);
    if (!question) {
      return { ok: false, error: "Mission operator question was not found." };
    }
    const operatorQuestions = current.operatorQuestions.map((item) =>
      item.id === questionId
        ? {
            ...item,
            status: request.action === "answer-operator" ? ("answered" as const) : ("dismissed" as const),
            ...(request.action === "answer-operator" ? { answer: request.answer } : {}),
            updatedAt: now
          }
        : item
    );
    const status = operatorQuestions.some((item) => item.status === "open") ? "awaiting-operator" : "active";
    return {
      ok: true,
      mission: { ...current, operatorQuestions, status, revision: current.revision + 1, updatedAt: now },
      summary:
        request.action === "answer-operator"
          ? `Operator answered mission question: ${question.prompt}`
          : `Operator dismissed mission question: ${question.prompt}`,
      shouldPause: false
    };
  }

  const collectionNames: Record<AgentMissionEntityKind, "objectives" | "hypotheses" | "experiments" | "claims" | "coverage"> = {
    objective: "objectives",
    hypothesis: "hypotheses",
    experiment: "experiments",
    claim: "claims",
    coverage: "coverage"
  };
  const collectionName = collectionNames[request.entity];
  const collection = current[collectionName] as Array<{ id: string; status: string; priority?: AgentMissionPriority; pinned?: boolean }>;
  const existing = collection.find((item) => item.id === request.id);
  if (!existing) {
    return { ok: false, error: "Mission item was not found." };
  }
  if (request.status && !statusAllowed(request.entity, request.status)) {
    return { ok: false, error: `Status ${request.status} is invalid for ${request.entity}.` };
  }
  if (request.priority !== undefined && request.entity !== "objective" && request.entity !== "hypothesis") {
    return { ok: false, error: "Only objectives and hypotheses have operator priorities." };
  }
  if (request.pinned !== undefined && request.entity !== "hypothesis") {
    return { ok: false, error: "Only hypotheses can be pinned." };
  }
  const nextCollection = collection.map((item) =>
    item.id === request.id
      ? {
          ...item,
          ...(request.status ? { status: request.status } : {}),
          ...(request.priority !== undefined ? { priority: request.priority } : {}),
          ...(request.pinned !== undefined ? { pinned: request.pinned } : {}),
          updatedAt: now
        }
      : item
  );
  return {
    ok: true,
    mission: { ...current, [collectionName]: nextCollection, revision: current.revision + 1, updatedAt: now } as AgentMission,
    summary: `Operator updated ${request.entity} ${request.id}.`,
    shouldPause: false
  };
}
