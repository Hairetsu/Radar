import type { ReplayDraft, ReplayEnvironment } from "./domain.js";
import { normalizeDraft } from "./draft.js";

export const MAX_ENVIRONMENTS = 20;
export const MAX_ENV_NAME = 60;
export const MAX_VARIABLE_KEY = 80;
export const MAX_VARIABLE_VALUE = 8000;

function cleanText(value: unknown, max: number) {
  return String(value || "").trim().slice(0, max);
}

function cleanVariables(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(input as Record<string, unknown>)
      .map(([key, value]) => [cleanText(key, MAX_VARIABLE_KEY), cleanText(value, MAX_VARIABLE_VALUE)])
      .filter(([key]) => Boolean(key))
      .slice(0, 100)
  );
}

export function normalizeReplayEnvironment(input: Partial<ReplayEnvironment>, fallbackId: string, now: string): ReplayEnvironment | null {
  const name = cleanText(input.name, MAX_ENV_NAME);
  if (!name) {
    return null;
  }
  return {
    id: cleanText(input.id, 80) || fallbackId,
    name,
    variables: cleanVariables(input.variables),
    createdAt: cleanText(input.createdAt, 80) || now,
    updatedAt: now
  };
}

export function normalizeReplayEnvironments(input: unknown, now = new Date().toISOString()) {
  if (!Array.isArray(input)) {
    return [];
  }
  return input
    .slice(0, MAX_ENVIRONMENTS)
    .map((item, index) =>
      item && typeof item === "object" && !Array.isArray(item)
        ? normalizeReplayEnvironment(item as Partial<ReplayEnvironment>, `env-${index + 1}`, now)
        : null
    )
    .filter((item): item is ReplayEnvironment => Boolean(item));
}

export function createReplayEnvironment(name: string, now = new Date().toISOString()): ReplayEnvironment {
  return {
    id: `env-${now.replace(/[:.]/g, "")}`,
    name: cleanText(name, MAX_ENV_NAME) || "Environment",
    variables: {},
    createdAt: now,
    updatedAt: now
  };
}

const VARIABLE_PATTERN = /\{\{([a-zA-Z0-9_.-]+)\}\}/g;

export function substituteVariables(text: string, variables: Record<string, string>) {
  return text.replace(VARIABLE_PATTERN, (match, key: string) => {
    if (!(key in variables)) {
      return match;
    }
    return variables[key] ?? match;
  });
}

export function substituteDraftVariables(draft: ReplayDraft, variables: Record<string, string>): ReplayDraft {
  const substituted = {
    method: draft.method,
    url: substituteVariables(draft.url, variables),
    headers: Object.fromEntries(Object.entries(draft.headers).map(([key, value]) => [key, substituteVariables(value, variables)])),
    body: substituteVariables(draft.body, variables)
  };
  return normalizeDraft(substituted);
}

export function resolveEnvironmentVariables(environments: ReplayEnvironment[], environmentId: string) {
  const environment = environments.find((item) => item.id === environmentId);
  return environment?.variables ?? {};
}

export function applyEnvironmentToDraft(draft: ReplayDraft, environments: ReplayEnvironment[], environmentId: string) {
  return substituteDraftVariables(draft, resolveEnvironmentVariables(environments, environmentId));
}

export function prepareReplayDraft(
  input: ReplayDraft | Parameters<typeof normalizeDraft>[0],
  environments: ReplayEnvironment[] = [],
  environmentId = ""
) {
  const normalized = normalizeDraft(input);
  if (!environmentId) {
    return normalized;
  }
  const prepared = applyEnvironmentToDraft(normalized, environments, environmentId);
  const unresolved = [prepared.url, ...Object.values(prepared.headers), prepared.body]
    .flatMap((value) => [...value.matchAll(VARIABLE_PATTERN)].map((match) => match[1]))
    .filter(Boolean);
  if (unresolved.length > 0) {
    throw new Error(`Missing environment variable: ${[...new Set(unresolved)].join(", ")}`);
  }
  return prepared;
}
