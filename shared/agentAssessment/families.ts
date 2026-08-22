import {
  MAX_ASSESSMENT_VARIANTS,
  READ_ONLY_METHODS,
  UNTRUSTED_CORS_ORIGIN
} from "./constants.js";
import type {
  AssessmentAuthorityLevel,
  ProbeFamilyDefinition,
  ProbeFamilyId,
  ProbeMutation
} from "./types.js";

export const PROBE_FAMILIES: ProbeFamilyDefinition[] = [
  {
    id: "cors-origin",
    label: "CORS origin handling",
    minimumAuthority: "read-only-probes",
    allowedMutationKinds: ["set-origin", "set-method"],
    allowedMethods: ["GET", "HEAD", "OPTIONS"],
    maxVariants: 3,
    requestCostPerVariant: 1
  },
  {
    id: "reflection-context",
    label: "Reflection context",
    minimumAuthority: "read-only-probes",
    allowedMutationKinds: ["replace-query", "append-query", "replace-form", "replace-json", "replace-header"],
    allowedMethods: [...READ_ONLY_METHODS],
    maxVariants: 4,
    requestCostPerVariant: 1
  },
  {
    id: "injection-signal",
    label: "Injection signals",
    minimumAuthority: "read-only-probes",
    allowedMutationKinds: ["replace-query", "replace-form", "replace-json"],
    allowedMethods: [...READ_ONLY_METHODS, "POST"],
    maxVariants: 4,
    requestCostPerVariant: 1
  },
  {
    id: "authorization-omission",
    label: "Authorization omission",
    minimumAuthority: "read-only-probes",
    allowedMutationKinds: ["remove-authorization"],
    allowedMethods: [...READ_ONLY_METHODS, "POST"],
    maxVariants: 1,
    requestCostPerVariant: 1
  },
  {
    id: "resource-id",
    label: "Resource ID substitution",
    minimumAuthority: "read-only-probes",
    allowedMutationKinds: ["replace-query", "replace-path-segment", "replace-json", "replace-form"],
    allowedMethods: [...READ_ONLY_METHODS],
    maxVariants: MAX_ASSESSMENT_VARIANTS,
    requestCostPerVariant: 1
  }
];

const familyMap = new Map(PROBE_FAMILIES.map((family) => [family.id, family]));

export const READ_ONLY_PROBE_FAMILY_IDS: ProbeFamilyId[] = PROBE_FAMILIES.map((family) => family.id);

export function isProbeFamilyId(value: unknown): value is ProbeFamilyId {
  return familyMap.has(String(value || "") as ProbeFamilyId);
}

export function getProbeFamily(id: ProbeFamilyId): ProbeFamilyDefinition {
  const family = familyMap.get(id);
  if (!family) {
    throw new Error(`Unknown probe family: ${id}`);
  }
  return family;
}

const AUTHORITY_RANK: Record<AssessmentAuthorityLevel, number> = {
  observe: 0,
  "read-only-probes": 1,
  "approved-active-probes": 2,
  "manual-only": 3
};

export function authorityAllowsFamily(level: AssessmentAuthorityLevel, familyId: ProbeFamilyId) {
  const family = familyMap.get(familyId);
  if (!family) {
    return false;
  }
  return AUTHORITY_RANK[level] >= AUTHORITY_RANK[family.minimumAuthority] && level !== "observe" && level !== "manual-only";
}

export function familyAllowsMutation(familyId: ProbeFamilyId, mutation: ProbeMutation) {
  const family = familyMap.get(familyId);
  return Boolean(family?.allowedMutationKinds.includes(mutation.kind));
}

export function familyAllowsMethod(familyId: ProbeFamilyId, method: string) {
  const family = familyMap.get(familyId);
  return Boolean(family?.allowedMethods.includes(method.toUpperCase()));
}

export function corsOriginPayloads(expectedOrigin: string) {
  return ["", expectedOrigin.trim(), UNTRUSTED_CORS_ORIGIN].filter((value, index, all) => all.indexOf(value) === index);
}

export function injectionSignalPayloads() {
  return ["'", "' OR '1'='1"];
}

export function reflectionCanary(canaryId: string) {
  const token = String(canaryId || "probe").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 24) || "probe";
  return `radar-canary-${token}`;
}
