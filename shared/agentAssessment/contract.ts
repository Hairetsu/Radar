import {
  ASSESSMENT_CONTRACT_VERSION,
  DEFAULT_ASSESSMENT_DELAY_MS,
  DEFAULT_ASSESSMENT_PROBE_REQUESTS,
  DEFAULT_ASSESSMENT_REQUESTS_PER_ORIGIN,
  DEFAULT_ASSESSMENT_TIMEOUT_MS,
  MAX_ASSESSMENT_FAMILIES,
  MAX_ASSESSMENT_PATHS,
  MAX_ASSESSMENT_SEEDS,
  MAX_ASSESSMENT_VARIANTS,
  MIN_ASSESSMENT_DELAY_MS,
  MAX_ASSESSMENT_DELAY_MS
} from "./constants.js";
import { READ_ONLY_PROBE_FAMILY_IDS, authorityAllowsFamily, isProbeFamilyId } from "./families.js";
import type { AssessmentAuthorityLevel, AssessmentContract, ProbeFamilyId } from "./types.js";

const AUTHORITY_LEVELS: AssessmentAuthorityLevel[] = [
  "observe",
  "read-only-probes",
  "approved-active-probes",
  "manual-only"
];

function boundedText(value: unknown, max: number) {
  return String(value || "").trim().slice(0, max);
}

function clampNumber(value: unknown, fallback: number, min: number, max: number) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.min(Math.max(Math.round(numeric), min), max);
}

function uniqueStrings(value: unknown, maxItems: number, maxLength: number) {
  return Array.isArray(value)
    ? [...new Set(value.map((item) => boundedText(item, maxLength)).filter(Boolean))].slice(0, maxItems)
    : [];
}

function pathPrefixes(value: unknown) {
  return uniqueStrings(value, MAX_ASSESSMENT_PATHS, 300).map((path) => (path.startsWith("/") ? path : `/${path}`));
}

export function defaultAssessmentContract(input: {
  identity?: string;
  seedCaptureIds?: string[];
  includedPathPrefixes?: string[];
} = {}): AssessmentContract {
  return {
    version: ASSESSMENT_CONTRACT_VERSION,
    authorityLevel: "read-only-probes",
    families: [...READ_ONLY_PROBE_FAMILY_IDS],
    includedPathPrefixes: pathPrefixes(input.includedPathPrefixes).length > 0 ? pathPrefixes(input.includedPathPrefixes) : ["/"],
    excludedPathPrefixes: [],
    evidenceSeedCaptureIds: uniqueStrings(input.seedCaptureIds, MAX_ASSESSMENT_SEEDS, 120),
    identity: boundedText(input.identity, 100) || "current",
    maxProbeRequests: DEFAULT_ASSESSMENT_PROBE_REQUESTS,
    maxRequestsPerOrigin: DEFAULT_ASSESSMENT_REQUESTS_PER_ORIGIN,
    delayMs: DEFAULT_ASSESSMENT_DELAY_MS,
    timeoutMs: DEFAULT_ASSESSMENT_TIMEOUT_MS,
    maxRuntimeMs: 10 * 60_000,
    maxConcurrency: 1,
    maxPayloadBytes: 256 * 1024,
    allowRawContext: false,
    externalInteraction: "none"
  };
}

export function normalizeAssessmentContract(value: unknown): AssessmentContract | null {
  const input = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const authority = String(input.authorityLevel || "read-only-probes");
  if (!AUTHORITY_LEVELS.includes(authority as AssessmentAuthorityLevel)) {
    return null;
  }
  const families = uniqueStrings(input.families, MAX_ASSESSMENT_FAMILIES, 40).filter(isProbeFamilyId);
  const enabled = families.filter((family) => authorityAllowsFamily(authority as AssessmentAuthorityLevel, family));
  if (authority !== "observe" && enabled.length === 0) {
    return null;
  }
  const contract: AssessmentContract = {
    version: ASSESSMENT_CONTRACT_VERSION,
    authorityLevel: authority as AssessmentAuthorityLevel,
    families: enabled,
    includedPathPrefixes: pathPrefixes(input.includedPathPrefixes).length > 0 ? pathPrefixes(input.includedPathPrefixes) : ["/"],
    excludedPathPrefixes: pathPrefixes(input.excludedPathPrefixes),
    evidenceSeedCaptureIds: uniqueStrings(input.evidenceSeedCaptureIds, MAX_ASSESSMENT_SEEDS, 120),
    identity: boundedText(input.identity, 100) || "current",
    maxProbeRequests: clampNumber(input.maxProbeRequests, DEFAULT_ASSESSMENT_PROBE_REQUESTS, 1, 80),
    maxRequestsPerOrigin: clampNumber(input.maxRequestsPerOrigin, DEFAULT_ASSESSMENT_REQUESTS_PER_ORIGIN, 1, 40),
    delayMs: clampNumber(input.delayMs, DEFAULT_ASSESSMENT_DELAY_MS, MIN_ASSESSMENT_DELAY_MS, MAX_ASSESSMENT_DELAY_MS),
    timeoutMs: clampNumber(input.timeoutMs, DEFAULT_ASSESSMENT_TIMEOUT_MS, 1_000, 30_000),
    maxRuntimeMs: clampNumber(input.maxRuntimeMs, 10 * 60_000, 30_000, 10 * 60_000),
    maxConcurrency: 1,
    maxPayloadBytes: clampNumber(input.maxPayloadBytes, 256 * 1024, 1_024, 256 * 1024),
    allowRawContext: false,
    externalInteraction: "none"
  };
  if (contract.authorityLevel === "observe") {
    return { ...contract, families: [], maxProbeRequests: 0 };
  }
  return contract;
}

export function contractAllowsPath(contract: AssessmentContract, path: string) {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  if (contract.excludedPathPrefixes.some((prefix) => normalized.startsWith(prefix))) {
    return false;
  }
  return contract.includedPathPrefixes.some((prefix) => prefix === "/" || normalized.startsWith(prefix));
}

export function contractAllowsFamily(contract: AssessmentContract, family: ProbeFamilyId) {
  return contract.families.includes(family) && authorityAllowsFamily(contract.authorityLevel, family);
}

export function experimentRequestCost(variantCount: number) {
  const variants = Math.min(MAX_ASSESSMENT_VARIANTS, Math.max(0, Math.round(variantCount)));
  return 1 + variants;
}

export function emptyProbeLedger() {
  return { reserved: 0, consumed: 0, receipts: [] };
}

export function createArmedAssessmentState(contract: AssessmentContract) {
  return {
    contract,
    status: "armed" as const,
    queue: [],
    ledger: emptyProbeLedger()
  };
}
