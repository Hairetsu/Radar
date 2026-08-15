import type {
  AgentMission,
  AgentMissionClaim,
  AgentMissionCoverageCell,
  AgentMissionExperiment,
  AgentMissionHypothesis,
  AgentMissionObjective,
  AgentMissionOperatorQuestion,
  AgentMissionPriority
} from "../agent-types.js";
import { originFromUrl } from "../url.js";
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
import { reconcileCompletedAgentMission } from "./lifecycle.js";

export function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export function boundedText(value: unknown, max: number) {
  return String(value || "").trim().slice(0, max);
}

export function optionalText(value: unknown, max: number) {
  const text = boundedText(value, max);
  return text || undefined;
}

export function enumValue<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  const normalized = String(value || "");
  return allowed.includes(normalized as T) ? (normalized as T) : fallback;
}

export function optionalEnumValue<T extends string>(value: unknown, allowed: readonly T[]): T | undefined {
  const normalized = String(value || "");
  return allowed.includes(normalized as T) ? (normalized as T) : undefined;
}

export function priorityValue(value: unknown, fallback: AgentMissionPriority = 3): AgentMissionPriority {
  const numeric = Math.round(Number(value));
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.max(1, Math.min(numeric, 5)) as AgentMissionPriority;
}

export function evidenceRefs(value: unknown) {
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

export function normalizedId(value: unknown, prefix: string, seed: string) {
  const explicit = boundedText(value, 100).replace(/[^a-zA-Z0-9_-]/g, "-");
  return explicit || `${prefix}-${stableHash(seed || prefix)}`;
}

function isoValue(value: unknown, fallback: string) {
  const text = boundedText(value, 40);
  return Number.isFinite(Date.parse(text)) ? text : fallback;
}

export function normalizedObjective(value: unknown, now: string): AgentMissionObjective | null {
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

export function normalizedHypothesis(value: unknown, now: string): AgentMissionHypothesis | null {
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

export function normalizedExperiment(value: unknown, now: string): AgentMissionExperiment | null {
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

export function normalizedClaim(value: unknown, now: string): AgentMissionClaim | null {
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

export function normalizedCoverage(value: unknown, now: string): AgentMissionCoverageCell | null {
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

export function normalizedQuestion(value: unknown, now: string): AgentMissionOperatorQuestion | null {
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
  const requestedStatus = enumValue(input.status, MISSION_STATUSES, fallback.status);
  const hasOpenQuestion = questions.some((question) => question.status === "open");
  const status = requestedStatus === "completed"
    ? "completed"
    : hasOpenQuestion
      ? "awaiting-operator"
      : requestedStatus;
  const mission: AgentMission = {
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
  return status === "completed"
    ? reconcileCompletedAgentMission(mission, mission.updatedAt)
    : mission;
}
