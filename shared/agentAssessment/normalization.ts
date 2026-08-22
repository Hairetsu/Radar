import { MAX_ASSESSMENT_OBSERVED_IDS, MAX_ASSESSMENT_VARIANTS, MAX_MUTATION_VALUE_BYTES } from "./constants.js";
import { corsOriginPayloads, familyAllowsMutation, injectionSignalPayloads, isProbeFamilyId, reflectionCanary } from "./families.js";
import type { EncodingStep, ProbeFamilyId, ProbeMutation, ReplayExperimentRequest } from "./types.js";

const ENCODING_STEPS: EncodingStep[] = ["url", "json-escape", "base64", "case-variation"];

function objectValue(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function boundedText(value: unknown, max: number) {
  return String(value || "").trim().slice(0, max);
}

function boundedPayload(value: unknown) {
  return String(value ?? "").slice(0, MAX_MUTATION_VALUE_BYTES);
}

function encodingChain(value: unknown): EncodingStep[] {
  return Array.isArray(value)
    ? value
        .map((item) => String(item || "") as EncodingStep)
        .filter((item): item is EncodingStep => ENCODING_STEPS.includes(item))
        .slice(0, 4)
    : [];
}

export function normalizeProbeMutation(value: unknown): ProbeMutation | null {
  const input = objectValue(value);
  const kind = String(input.kind || "");
  const encoding = encodingChain(input.encoding);
  switch (kind) {
    case "replace-query":
    case "append-query":
    case "replace-form":
    case "replace-header":
    case "replace-cookie": {
      const name = boundedText(input.name, 80);
      if (!name) return null;
      return { kind, name, value: boundedPayload(input.value), ...(encoding.length > 0 ? { encoding } : {}) };
    }
    case "remove-query": {
      const name = boundedText(input.name, 80);
      return name ? { kind, name } : null;
    }
    case "replace-json": {
      const path = boundedText(input.path, 120);
      return path ? { kind, path, value: boundedPayload(input.value), ...(encoding.length > 0 ? { encoding } : {}) } : null;
    }
    case "replace-path-segment": {
      const index = Math.round(Number(input.index));
      if (!Number.isFinite(index) || index < 0 || index > 24) {
        return null;
      }
      return { kind, index, value: boundedPayload(input.value), ...(encoding.length > 0 ? { encoding } : {}) };
    }
    case "remove-authorization":
      return { kind };
    case "set-origin":
    case "set-host":
    case "set-method": {
      const next = boundedText(input.value, kind === "set-method" ? 12 : 200);
      return next || kind === "set-origin" ? { kind, value: next } : null;
    }
    default:
      return null;
  }
}

export function normalizeReplayExperimentRequest(value: unknown): ReplayExperimentRequest | null {
  const input = objectValue(value);
  const family = String(input.family || "");
  const captureId = boundedText(input.captureId, 120);
  const location = normalizeProbeMutation(input.location);
  if (!captureId || !isProbeFamilyId(family) || !location || !familyAllowsMutation(family, location)) {
    return null;
  }
  const values = Array.isArray(input.values)
    ? input.values.map((item) => boundedPayload(item)).filter((item) => item.length > 0).slice(0, MAX_ASSESSMENT_VARIANTS)
    : undefined;
  return {
    captureId,
    family,
    hypothesis: boundedText(input.hypothesis, 400) || `${family} experiment`,
    location,
    ...(values && values.length > 0 ? { values } : {}),
    ...(encodingChain(input.encoding).length > 0 ? { encoding: encodingChain(input.encoding) } : {}),
    ...(boundedText(input.tabId, 120) ? { tabId: boundedText(input.tabId, 120) } : {}),
    ...(boundedText(input.identity, 100) ? { identity: boundedText(input.identity, 100) } : {})
  };
}

export function variantMutationsForFamily(input: {
  family: ProbeFamilyId;
  location: ProbeMutation;
  values?: string[];
  expectedOrigin?: string;
  observedIds?: string[];
  canaryId: string;
  encoding?: EncodingStep[];
}): ProbeMutation[] {
  const encoding = input.encoding || [];
  switch (input.family) {
    case "cors-origin":
      return corsOriginPayloads(input.expectedOrigin || "").map((value) => ({ kind: "set-origin", value }));
    case "reflection-context": {
      if (input.location.kind === "replace-query" || input.location.kind === "append-query" || input.location.kind === "replace-form" || input.location.kind === "replace-header" || input.location.kind === "replace-cookie") {
        return [{ ...input.location, value: reflectionCanary(input.canaryId), encoding }];
      }
      if (input.location.kind === "replace-json") {
        return [{ ...input.location, value: reflectionCanary(input.canaryId), encoding }];
      }
      return [];
    }
    case "injection-signal": {
      const payloads = input.values && input.values.length > 0 ? input.values.slice(0, 2) : injectionSignalPayloads();
      if (input.location.kind === "replace-query" || input.location.kind === "replace-form") {
        return payloads.map((value) => ({ ...input.location, value, encoding }));
      }
      if (input.location.kind === "replace-json") {
        return payloads.map((value) => ({ ...input.location, value, encoding }));
      }
      return [];
    }
    case "authorization-omission":
      return [{ kind: "remove-authorization" }];
    case "resource-id": {
      const ids = (input.values && input.values.length > 0 ? input.values : input.observedIds || [])
        .map((value) => boundedPayload(value))
        .filter(Boolean)
        .slice(0, MAX_ASSESSMENT_OBSERVED_IDS);
      if (input.location.kind === "replace-query" || input.location.kind === "replace-form") {
        return ids.map((value) => ({ ...input.location, value, encoding }));
      }
      if (input.location.kind === "replace-json" || input.location.kind === "replace-path-segment") {
        return ids.map((value) => ({ ...input.location, value, encoding }));
      }
      return [];
    }
    default: {
      const _exhaustive: never = input.family;
      return _exhaustive;
    }
  }
}
