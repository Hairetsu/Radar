import type {
  AgentMission,
  AgentMissionEntityKind,
  AgentMissionPriority,
  AgentMissionSteeringRequest
} from "../agent-types.js";
import {
  CLAIM_STATUSES,
  COVERAGE_STATUSES,
  ENTITY_KINDS,
  EXPERIMENT_STATUSES,
  HYPOTHESIS_STATUSES,
  OBJECTIVE_STATUSES,
  type AgentMissionItemStatus
} from "./constants.js";
import {
  boundedText,
  objectValue,
  optionalEnumValue,
  optionalText,
  priorityValue
} from "./normalization.js";
import { applyAgentMissionUpdates } from "./updates.js";

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
  const collection = current[collectionName] as Array<{
    id: string;
    status: string;
    priority?: AgentMissionPriority;
    pinned?: boolean;
  }>;
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
