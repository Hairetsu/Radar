export const IDENTITY_LAB_LIMITS = {
  identities: 80,
  resources: 160,
  evidence: 2_000,
  matrixRows: 2_000,
  sequences: 160,
  stepsPerSequence: 240,
  evidenceRefs: 40,
  cookieNames: 80,
  storageKeys: 120,
  queryKeys: 80,
  responseBytes: 1_000_000_000,
  sequenceIndex: 100_000
} as const;

export type IdentityLabIdentityKind = "anonymous" | "user" | "admin" | "service";
export type IdentityLabIdentityHealth = "ready" | "stale" | "invalid" | "unknown";

export type IdentityLabIdentitySummary = {
  id: string;
  projectId: string;
  key: string;
  label: string;
  kind: IdentityLabIdentityKind;
  role: string;
  tenant: string;
  origin: string;
  health: IdentityLabIdentityHealth;
  cookieNames: string[];
  cookieCount: number;
  localStorageKeys: string[];
  localStorageKeyCount: number;
  sessionStorageKeys: string[];
  sessionStorageKeyCount: number;
  updatedAt: string;
};

export type IdentityLabResourceSummary = {
  id: string;
  projectId: string;
  key: string;
  label: string;
  type: string;
  tenant: string;
  origin: string;
  path: string;
  queryKeys: string[];
};

export type IdentityLabAccessOutcome = "allowed" | "denied" | "redirected" | "error" | "unknown";
export type IdentityLabActionName =
  | "navigate"
  | "click"
  | "fill"
  | "submit"
  | "replay"
  | "workflow"
  | "auth-load"
  | "auth-save"
  | "other";
export type IdentityLabActionOutcome = "succeeded" | "failed" | "blocked" | "unknown";

type IdentityLabEvidenceBase = {
  id: string;
  projectId: string;
  identityId: string;
  resourceId: string;
  occurredAt: string;
  origin: string;
  path: string;
  queryKeys: string[];
  evidenceRefs: string[];
  sequenceId?: string;
  sequenceIndex?: number;
  stateBefore?: string;
  stateAfter?: string;
};

export type IdentityLabRequestEvidence = IdentityLabEvidenceBase & {
  kind: "request";
  method: string;
  status: number | null;
  outcome: IdentityLabAccessOutcome;
  responseBytes: number | null;
  responseShapeHash: string;
};

export type IdentityLabActionEvidence = IdentityLabEvidenceBase & {
  kind: "action";
  action: IdentityLabActionName;
  method: string;
  outcome: IdentityLabActionOutcome;
  label: string;
};

export type IdentityLabEvidence = IdentityLabRequestEvidence | IdentityLabActionEvidence;

export type IdentityLabMatrixAccess = "allowed" | "denied" | "mixed" | "insufficient" | "not-observed";

export type IdentityLabMatrixRow = {
  id: string;
  projectId: string;
  role: string;
  tenant: string;
  identityIds: string[];
  resourceId: string;
  resourceLabel: string;
  resourceTenant: string;
  sameTenant: boolean | null;
  origin: string;
  path: string;
  observation: "observed" | "not-observed";
  access: IdentityLabMatrixAccess;
  requestCount: number;
  statusCodes: number[];
  outcomes: IdentityLabAccessOutcome[];
  evidenceRefs: string[];
};

export type IdentityLabInvariantState = "observed" | "not-observed" | "violated" | "insufficient";
export type IdentityLabInvariantExpectedAccess = "allow" | "deny";

export type IdentityLabSecurityInvariant = {
  id: string;
  projectId: string;
  title: string;
  description: string;
  role: string;
  tenant: string;
  resourceId: string;
  expected: IdentityLabInvariantExpectedAccess;
  state: IdentityLabInvariantState;
  reason: string;
  evidenceRefs: string[];
  evaluatedAt: string;
};

export type IdentityLabSequenceStep = {
  id: string;
  index: number | null;
  kind: IdentityLabEvidence["kind"];
  label: string;
  occurredAt: string;
  outcome: IdentityLabAccessOutcome | IdentityLabActionOutcome;
  stateBefore: string;
  stateAfter: string;
  evidenceRefs: string[];
};

export type IdentityLabStateTransitionSummary = {
  id: string;
  fromState: string;
  toState: string;
  triggerEvidenceId: string;
  triggerKind: IdentityLabEvidence["kind"];
  occurredAt: string;
  evidenceRefs: string[];
};

export type IdentityLabSequenceSummary = {
  id: string;
  projectId: string;
  sequenceId: string;
  identityId: string;
  startedAt: string;
  endedAt: string;
  ordered: boolean;
  initialState: string;
  finalState: string;
  steps: IdentityLabSequenceStep[];
  transitions: IdentityLabStateTransitionSummary[];
  evidenceRefs: string[];
};

export type IdentityLabDifferentialField =
  | "outcome"
  | "status"
  | "response-bytes"
  | "response-shape"
  | "state";

export type IdentityLabDifferentialSide = {
  identityId: string;
  outcome: IdentityLabAccessOutcome;
  status: number | null;
  responseBytes: number | null;
  responseShapeHash: string;
  stateAfter: string;
  evidenceRefs: string[];
};

export type IdentityLabDifferentialComparison = {
  id: string;
  projectId: string;
  resourceId: string;
  method: string;
  origin: string;
  path: string;
  state: "equivalent" | "different" | "insufficient";
  differences: IdentityLabDifferentialField[];
  comparableFields: IdentityLabDifferentialField[];
  left: IdentityLabDifferentialSide;
  right: IdentityLabDifferentialSide;
  reason: string;
  evidenceRefs: string[];
};

const IDENTITY_KINDS: IdentityLabIdentityKind[] = ["anonymous", "user", "admin", "service"];
const IDENTITY_HEALTH: IdentityLabIdentityHealth[] = ["ready", "stale", "invalid", "unknown"];
const ACCESS_OUTCOMES: IdentityLabAccessOutcome[] = ["allowed", "denied", "redirected", "error", "unknown"];
const ACTION_NAMES: IdentityLabActionName[] = [
  "navigate",
  "click",
  "fill",
  "submit",
  "replay",
  "workflow",
  "auth-load",
  "auth-save",
  "other"
];
const ACTION_OUTCOMES: IdentityLabActionOutcome[] = ["succeeded", "failed", "blocked", "unknown"];
const INVARIANT_STATES: IdentityLabInvariantState[] = ["observed", "not-observed", "violated", "insufficient"];
const HTTP_METHODS = ["GET", "HEAD", "OPTIONS", "POST", "PUT", "PATCH", "DELETE", "TRACE"];

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function boundedText(value: unknown, max: number) {
  return String(value || "").trim().slice(0, max);
}

function cleanLine(value: unknown, max: number) {
  return boundedText(value, max).replace(/\s+/g, " ");
}

function boundedId(value: unknown, max = 120) {
  return boundedText(value, max).replace(/[^a-zA-Z0-9_.:-]/g, "-");
}

function boundedNumber(value: unknown, min: number, max: number): number | null {
  const numeric = Math.round(Number(value));
  return Number.isFinite(numeric) ? Math.max(min, Math.min(numeric, max)) : null;
}

function uniqueStrings(value: unknown, maxItems: number, maxLength: number) {
  return Array.isArray(value)
    ? [...new Set(value.map((item) => cleanLine(item, maxLength)).filter(Boolean))].slice(0, maxItems)
    : [];
}

function validIso(value: unknown, fallback: string) {
  const text = boundedText(value, 40);
  return Number.isFinite(Date.parse(text)) ? text : fallback;
}

function stableHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function projectScopedId(projectId: string, prefix: string, seed: string) {
  return `${prefix}-${stableHash(`${projectId}\n${seed}`)}`;
}

function enumValue<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  const text = String(value || "");
  return allowed.includes(text as T) ? (text as T) : null;
}

function exactOrigin(value: unknown) {
  try {
    const parsed = new URL(boundedText(value, 600));
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.origin : "";
  } catch {
    return "";
  }
}

function pathParts(pathValue: unknown, queryValue?: unknown) {
  const rawPath = boundedText(pathValue, 800) || "/";
  try {
    const parsed = new URL(rawPath, "https://radar.invalid");
    const explicitQueryKeys = uniqueStrings(queryValue, IDENTITY_LAB_LIMITS.queryKeys, 120);
    const queryKeys = [...new Set([...parsed.searchParams.keys(), ...explicitQueryKeys])]
      .sort((left, right) => left.localeCompare(right))
      .slice(0, IDENTITY_LAB_LIMITS.queryKeys);
    return { path: parsed.pathname.slice(0, 500) || "/", queryKeys };
  } catch {
    return { path: "/", queryKeys: uniqueStrings(queryValue, IDENTITY_LAB_LIMITS.queryKeys, 120) };
  }
}

function urlParts(value: unknown, fallbackOrigin?: unknown, fallbackPath?: unknown, queryValue?: unknown) {
  try {
    const parsed = new URL(boundedText(value, 1_000));
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error("Unsupported URL protocol.");
    }
    return {
      origin: parsed.origin,
      ...pathParts(`${parsed.pathname}${parsed.search}`, queryValue)
    };
  } catch {
    return {
      origin: exactOrigin(fallbackOrigin),
      ...pathParts(fallbackPath, queryValue)
    };
  }
}

function cookieNames(input: Record<string, unknown>) {
  const direct = uniqueStrings(input.cookieNames, IDENTITY_LAB_LIMITS.cookieNames, 120);
  const cookies = input.cookies;
  const discovered = Array.isArray(cookies)
    ? cookies
        .map((cookie) => {
          if (typeof cookie === "string") return cleanLine(cookie, 120);
          return cleanLine(objectValue(cookie).name, 120);
        })
        .filter(Boolean)
    : Object.keys(objectValue(cookies)).map((name) => cleanLine(name, 120)).filter(Boolean);
  return [...new Set([...direct, ...discovered])].sort((left, right) => left.localeCompare(right)).slice(0, IDENTITY_LAB_LIMITS.cookieNames);
}

function storageKeys(value: unknown, explicitKeys: unknown) {
  const direct = uniqueStrings(explicitKeys, IDENTITY_LAB_LIMITS.storageKeys, 120);
  const discovered = Object.keys(objectValue(value)).map((key) => cleanLine(key, 120)).filter(Boolean);
  return [...new Set([...direct, ...discovered])].sort((left, right) => left.localeCompare(right)).slice(0, IDENTITY_LAB_LIMITS.storageKeys);
}

function evidenceRefs(input: Record<string, unknown>) {
  const single = cleanLine(input.evidenceRef, 180);
  return [...new Set([single, ...uniqueStrings(input.evidenceRefs, IDENTITY_LAB_LIMITS.evidenceRefs, 180)].filter(Boolean))]
    .slice(0, IDENTITY_LAB_LIMITS.evidenceRefs);
}

function normalizedMethod(value: unknown, fallback = "GET") {
  const method = boundedText(value, 20).toUpperCase() || fallback;
  return HTTP_METHODS.includes(method) ? method : fallback;
}

function inferredAccessOutcome(status: number | null): IdentityLabAccessOutcome {
  if (status === null) return "unknown";
  if (status >= 200 && status < 300) return "allowed";
  if (status >= 300 && status < 400) return "redirected";
  if (status === 401 || status === 403) return "denied";
  if (status >= 400) return "error";
  return "unknown";
}

function responseShapeHash(input: Record<string, unknown>) {
  const shape = boundedText(input.responseShape, 4_000);
  if (shape) return stableHash(shape);
  const persisted = boundedText(input.responseShapeHash, 20).toLowerCase();
  return /^[a-z0-9]{1,16}$/.test(persisted) ? persisted : "";
}

function sequenceFields(input: Record<string, unknown>) {
  const sequenceId = boundedId(input.sequenceId);
  const sequenceIndex = boundedNumber(input.sequenceIndex, 0, IDENTITY_LAB_LIMITS.sequenceIndex);
  const stateBefore = cleanLine(input.stateBefore, 160);
  const stateAfter = cleanLine(input.stateAfter, 160);
  return {
    ...(sequenceId ? { sequenceId } : {}),
    ...(sequenceIndex !== null ? { sequenceIndex } : {}),
    ...(stateBefore ? { stateBefore } : {}),
    ...(stateAfter ? { stateAfter } : {})
  };
}

export function normalizeIdentityLabIdentity(
  value: unknown,
  projectIdValue: string,
  now = new Date().toISOString()
): IdentityLabIdentitySummary | null {
  const projectId = boundedId(projectIdValue);
  const input = objectValue(value);
  const kind = enumValue(input.kind, IDENTITY_KINDS);
  const origin = exactOrigin(input.origin || input.url);
  if (!projectId || !kind || !origin) {
    return null;
  }
  const role = cleanLine(input.role, 100) || kind;
  const tenant = cleanLine(input.tenant, 120) || "unknown";
  const label = cleanLine(input.label || input.name, 160) || `${role} / ${tenant}`;
  const key = boundedId(input.key || input.id || label) || boundedId(`${kind}-${role}-${tenant}-${origin}`);
  if (!key) {
    return null;
  }
  const nestedStorage = objectValue(input.storage);
  const localStorageKeys = storageKeys(input.localStorage ?? nestedStorage.localStorage, input.localStorageKeys);
  const sessionStorageKeys = storageKeys(input.sessionStorage ?? nestedStorage.sessionStorage, input.sessionStorageKeys);
  const normalizedCookieNames = cookieNames(input);
  return {
    id: projectScopedId(projectId, "identity", key),
    projectId,
    key,
    label,
    kind,
    role,
    tenant,
    origin,
    health: enumValue(input.health, IDENTITY_HEALTH) || "unknown",
    cookieNames: normalizedCookieNames,
    cookieCount: normalizedCookieNames.length,
    localStorageKeys,
    localStorageKeyCount: localStorageKeys.length,
    sessionStorageKeys,
    sessionStorageKeyCount: sessionStorageKeys.length,
    updatedAt: validIso(input.updatedAt, now)
  };
}

export function normalizeIdentityLabIdentities(
  value: unknown,
  projectId: string,
  now = new Date().toISOString()
) {
  if (!Array.isArray(value)) return [];
  const ids = new Set<string>();
  return value
    .slice(0, IDENTITY_LAB_LIMITS.identities * 2)
    .map((item) => normalizeIdentityLabIdentity(item, projectId, now))
    .filter((item): item is IdentityLabIdentitySummary => Boolean(item))
    .filter((item) => {
      if (ids.has(item.id)) return false;
      ids.add(item.id);
      return true;
    })
    .slice(0, IDENTITY_LAB_LIMITS.identities);
}

export function normalizeIdentityLabResource(
  value: unknown,
  projectIdValue: string
): IdentityLabResourceSummary | null {
  const projectId = boundedId(projectIdValue);
  const input = objectValue(value);
  const target = urlParts(input.url, input.origin, input.path, input.queryKeys);
  const label = cleanLine(input.label || input.name, 180);
  const type = cleanLine(input.type, 100) || "resource";
  const tenant = cleanLine(input.tenant, 120) || "unknown";
  if (!projectId || !target.origin || !label) {
    return null;
  }
  const key = boundedId(input.key || input.id || `${type}-${tenant}-${target.origin}-${target.path}`);
  if (!key) return null;
  return {
    id: projectScopedId(projectId, "resource", key),
    projectId,
    key,
    label,
    type,
    tenant,
    origin: target.origin,
    path: target.path,
    queryKeys: target.queryKeys
  };
}

export function normalizeIdentityLabResources(value: unknown, projectId: string) {
  if (!Array.isArray(value)) return [];
  const ids = new Set<string>();
  return value
    .slice(0, IDENTITY_LAB_LIMITS.resources * 2)
    .map((item) => normalizeIdentityLabResource(item, projectId))
    .filter((item): item is IdentityLabResourceSummary => Boolean(item))
    .filter((item) => {
      if (ids.has(item.id)) return false;
      ids.add(item.id);
      return true;
    })
    .slice(0, IDENTITY_LAB_LIMITS.resources);
}

function normalizeRequestEvidence(
  input: Record<string, unknown>,
  projectId: string,
  now: string
): IdentityLabRequestEvidence | null {
  const identityId = boundedId(input.identityId);
  const resourceId = boundedId(input.resourceId);
  const refs = evidenceRefs(input);
  const target = urlParts(input.url, input.origin, input.path, input.queryKeys);
  if (!identityId || !resourceId || refs.length === 0 || !target.origin) return null;
  const method = normalizedMethod(input.method);
  const status = boundedNumber(input.status, 100, 599);
  const outcome = enumValue(input.outcome, ACCESS_OUTCOMES) || inferredAccessOutcome(status);
  const occurredAt = validIso(input.occurredAt || input.createdAt, now);
  const stableKey = boundedId(input.key || input.id || refs[0]) || `${method}-${occurredAt}`;
  return {
    id: projectScopedId(projectId, "request", `${identityId}\n${resourceId}\n${stableKey}`),
    projectId,
    identityId,
    resourceId,
    kind: "request",
    occurredAt,
    origin: target.origin,
    path: target.path,
    queryKeys: target.queryKeys,
    evidenceRefs: refs,
    method,
    status,
    outcome,
    responseBytes: boundedNumber(input.responseBytes, 0, IDENTITY_LAB_LIMITS.responseBytes),
    responseShapeHash: responseShapeHash(input),
    ...sequenceFields(input)
  };
}

function normalizeActionEvidence(
  input: Record<string, unknown>,
  projectId: string,
  now: string
): IdentityLabActionEvidence | null {
  const identityId = boundedId(input.identityId);
  const resourceId = boundedId(input.resourceId);
  const refs = evidenceRefs(input);
  const target = urlParts(input.url, input.origin, input.path, input.queryKeys);
  const action = enumValue(input.action, ACTION_NAMES);
  if (!identityId || !resourceId || refs.length === 0 || !target.origin || !action) return null;
  const occurredAt = validIso(input.occurredAt || input.createdAt, now);
  const stableKey = boundedId(input.key || input.id || refs[0]) || `${action}-${occurredAt}`;
  const fallbackMethod = action === "submit" ? "POST" : "GET";
  return {
    id: projectScopedId(projectId, "action", `${identityId}\n${resourceId}\n${stableKey}`),
    projectId,
    identityId,
    resourceId,
    kind: "action",
    occurredAt,
    origin: target.origin,
    path: target.path,
    queryKeys: target.queryKeys,
    evidenceRefs: refs,
    action,
    method: normalizedMethod(input.method, fallbackMethod),
    outcome: enumValue(input.outcome, ACTION_OUTCOMES) || "unknown",
    label: cleanLine(input.label || input.summary, 240) || action,
    ...sequenceFields(input)
  };
}

export function normalizeIdentityLabEvidence(
  value: unknown,
  projectIdValue: string,
  now = new Date().toISOString()
): IdentityLabEvidence | null {
  const projectId = boundedId(projectIdValue);
  const input = objectValue(value);
  if (!projectId) return null;
  if (input.kind === "request") return normalizeRequestEvidence(input, projectId, now);
  if (input.kind === "action") return normalizeActionEvidence(input, projectId, now);
  return null;
}

export function normalizeIdentityLabEvidenceList(
  value: unknown,
  projectId: string,
  now = new Date().toISOString()
) {
  if (!Array.isArray(value)) return [];
  const ids = new Set<string>();
  return value
    .slice(0, IDENTITY_LAB_LIMITS.evidence * 2)
    .map((item) => normalizeIdentityLabEvidence(item, projectId, now))
    .filter((item): item is IdentityLabEvidence => Boolean(item))
    .filter((item) => {
      if (ids.has(item.id)) return false;
      ids.add(item.id);
      return true;
    })
    .slice(0, IDENTITY_LAB_LIMITS.evidence);
}

function matrixAccess(requests: IdentityLabRequestEvidence[]): IdentityLabMatrixAccess {
  if (requests.length === 0) return "not-observed";
  const allowed = requests.some((request) => request.outcome === "allowed");
  const denied = requests.some((request) => request.outcome === "denied");
  if (allowed && denied) return "mixed";
  if (allowed) return "allowed";
  if (denied) return "denied";
  return "insufficient";
}

export function buildIdentityLabMatrix(
  projectIdValue: string,
  identitiesValue: readonly IdentityLabIdentitySummary[],
  resourcesValue: readonly IdentityLabResourceSummary[],
  evidenceValue: readonly IdentityLabEvidence[]
): IdentityLabMatrixRow[] {
  const projectId = boundedId(projectIdValue);
  if (!projectId) return [];
  const identities = identitiesValue
    .filter((identity) => identity.projectId === projectId)
    .slice(0, IDENTITY_LAB_LIMITS.identities);
  const resources = resourcesValue
    .filter((resource) => resource.projectId === projectId)
    .slice(0, IDENTITY_LAB_LIMITS.resources);
  const requests = evidenceValue
    .filter((item): item is IdentityLabRequestEvidence => item.projectId === projectId && item.kind === "request")
    .slice(0, IDENTITY_LAB_LIMITS.evidence);
  const roleTenants = new Map<string, { role: string; tenant: string; identityIds: string[] }>();
  for (const identity of identities) {
    const key = `${identity.role}\n${identity.tenant}`;
    const current = roleTenants.get(key) || { role: identity.role, tenant: identity.tenant, identityIds: [] };
    current.identityIds.push(identity.id);
    roleTenants.set(key, current);
  }
  const rows: IdentityLabMatrixRow[] = [];
  for (const roleTenant of [...roleTenants.values()].sort((left, right) =>
    `${left.role}\n${left.tenant}`.localeCompare(`${right.role}\n${right.tenant}`)
  )) {
    for (const resource of resources) {
      if (rows.length >= IDENTITY_LAB_LIMITS.matrixRows) return rows;
      const identityIds = [...new Set(roleTenant.identityIds)].sort((left, right) => left.localeCompare(right));
      const identityIdSet = new Set(identityIds);
      const matching = requests.filter(
        (request) => identityIdSet.has(request.identityId) && request.resourceId === resource.id
      );
      const outcomes = [...new Set(matching.map((request) => request.outcome))].sort((left, right) => left.localeCompare(right));
      const statusCodes = [...new Set(matching.map((request) => request.status).filter((status): status is number => status !== null))]
        .sort((left, right) => left - right);
      rows.push({
        id: projectScopedId(projectId, "matrix", `${roleTenant.role}\n${roleTenant.tenant}\n${resource.id}`),
        projectId,
        role: roleTenant.role,
        tenant: roleTenant.tenant,
        identityIds,
        resourceId: resource.id,
        resourceLabel: resource.label,
        resourceTenant: resource.tenant,
        sameTenant:
          roleTenant.tenant === "unknown" || resource.tenant === "unknown"
            ? null
            : roleTenant.tenant === resource.tenant,
        origin: resource.origin,
        path: resource.path,
        observation: matching.length > 0 ? "observed" : "not-observed",
        access: matrixAccess(matching),
        requestCount: matching.length,
        statusCodes,
        outcomes,
        evidenceRefs: [...new Set(matching.flatMap((request) => request.evidenceRefs))].slice(
          0,
          IDENTITY_LAB_LIMITS.evidenceRefs
        )
      });
    }
  }
  return rows;
}

export function normalizeIdentityLabInvariant(
  value: unknown,
  projectIdValue: string,
  now = new Date().toISOString()
): IdentityLabSecurityInvariant | null {
  const projectId = boundedId(projectIdValue);
  const input = objectValue(value);
  const title = cleanLine(input.title, 240);
  const role = cleanLine(input.role, 100);
  const tenant = cleanLine(input.tenant, 120);
  const resourceId = boundedId(input.resourceId);
  const expected = input.expected === "allow" || input.expected === "deny" ? input.expected : null;
  if (!projectId || !title || !role || !tenant || !resourceId || !expected) return null;
  const refs = evidenceRefs(input);
  let state = enumValue(input.state, INVARIANT_STATES) || "not-observed";
  let reason = cleanLine(input.reason, 500);
  if ((state === "observed" || state === "violated") && refs.length === 0) {
    state = "insufficient";
    reason = reason || "Observed and violated invariant states require evidence references.";
  }
  const key = boundedId(input.key || input.id || `${role}-${tenant}-${resourceId}-${expected}-${title}`);
  return {
    id: projectScopedId(projectId, "invariant", key),
    projectId,
    title,
    description: cleanLine(input.description, 1_200),
    role,
    tenant,
    resourceId,
    expected,
    state,
    reason,
    evidenceRefs: refs,
    evaluatedAt: validIso(input.evaluatedAt, now)
  };
}

export function evaluateIdentityLabInvariant(
  invariant: IdentityLabSecurityInvariant,
  matrixRows: readonly IdentityLabMatrixRow[],
  now = new Date().toISOString()
): IdentityLabSecurityInvariant {
  const matching = matrixRows.filter(
    (row) =>
      row.projectId === invariant.projectId &&
      row.role === invariant.role &&
      row.tenant === invariant.tenant &&
      row.resourceId === invariant.resourceId
  );
  if (matching.length === 0 || matching.every((row) => row.observation === "not-observed")) {
    return {
      ...invariant,
      state: "not-observed",
      reason: "No identity-attributed request was observed for this invariant.",
      evidenceRefs: [],
      evaluatedAt: now
    };
  }
  const refs = [...new Set(matching.flatMap((row) => row.evidenceRefs))].slice(0, IDENTITY_LAB_LIMITS.evidenceRefs);
  const accesses = matching.map((row) => row.access);
  const violation =
    invariant.expected === "allow"
      ? accesses.some((access) => access === "denied" || access === "mixed")
      : accesses.some((access) => access === "allowed" || access === "mixed");
  if (violation && refs.length > 0) {
    return {
      ...invariant,
      state: "violated",
      reason: `Observed access contradicted the expected ${invariant.expected} decision.`,
      evidenceRefs: refs,
      evaluatedAt: now
    };
  }
  const observed =
    invariant.expected === "allow"
      ? accesses.some((access) => access === "allowed")
      : accesses.some((access) => access === "denied");
  if (observed && refs.length > 0) {
    return {
      ...invariant,
      state: "observed",
      reason: `Observed access matched the expected ${invariant.expected} decision.`,
      evidenceRefs: refs,
      evaluatedAt: now
    };
  }
  return {
    ...invariant,
    state: "insufficient",
    reason: "Observed evidence did not establish an allow or deny decision.",
    evidenceRefs: refs,
    evaluatedAt: now
  };
}

function stepForEvidence(item: IdentityLabEvidence): IdentityLabSequenceStep {
  return {
    id: item.id,
    index: item.sequenceIndex ?? null,
    kind: item.kind,
    label: item.kind === "request" ? `${item.method} ${item.path}` : item.label,
    occurredAt: item.occurredAt,
    outcome: item.outcome,
    stateBefore: item.stateBefore || "",
    stateAfter: item.stateAfter || "",
    evidenceRefs: item.evidenceRefs
  };
}

function sequenceIsOrdered(steps: IdentityLabSequenceStep[]) {
  if (steps.some((step) => step.index === null)) return false;
  const indexes = steps.map((step) => step.index as number);
  if (new Set(indexes).size !== indexes.length) return false;
  return indexes.every((index, position) => position === 0 || index === indexes[position - 1]! + 1);
}

export function buildIdentityLabSequences(
  projectIdValue: string,
  evidenceValue: readonly IdentityLabEvidence[]
): IdentityLabSequenceSummary[] {
  const projectId = boundedId(projectIdValue);
  if (!projectId) return [];
  const groups = new Map<string, IdentityLabEvidence[]>();
  for (const item of evidenceValue.slice(0, IDENTITY_LAB_LIMITS.evidence)) {
    if (item.projectId !== projectId || !item.sequenceId) continue;
    const key = `${item.identityId}\n${item.sequenceId}`;
    groups.set(key, [...(groups.get(key) || []), item]);
  }
  return [...groups.values()]
    .slice(0, IDENTITY_LAB_LIMITS.sequences)
    .map((items) => {
      const sorted = [...items]
        .sort((left, right) => {
          const leftIndex = left.sequenceIndex ?? Number.MAX_SAFE_INTEGER;
          const rightIndex = right.sequenceIndex ?? Number.MAX_SAFE_INTEGER;
          return leftIndex - rightIndex || left.occurredAt.localeCompare(right.occurredAt) || left.id.localeCompare(right.id);
        })
        .slice(0, IDENTITY_LAB_LIMITS.stepsPerSequence);
      const steps = sorted.map(stepForEvidence);
      const identityId = sorted[0]?.identityId || "";
      const sequenceId = sorted[0]?.sequenceId || "";
      const transitions = steps
        .filter((step) => step.stateBefore && step.stateAfter && step.stateBefore !== step.stateAfter)
        .map((step) => ({
          id: projectScopedId(projectId, "transition", `${sequenceId}\n${step.id}\n${step.stateBefore}\n${step.stateAfter}`),
          fromState: step.stateBefore,
          toState: step.stateAfter,
          triggerEvidenceId: step.id,
          triggerKind: step.kind,
          occurredAt: step.occurredAt,
          evidenceRefs: step.evidenceRefs
        }));
      return {
        id: projectScopedId(projectId, "sequence", `${identityId}\n${sequenceId}`),
        projectId,
        sequenceId,
        identityId,
        startedAt: steps[0]?.occurredAt || "",
        endedAt: steps.at(-1)?.occurredAt || "",
        ordered: sequenceIsOrdered(steps),
        initialState: steps.find((step) => step.stateBefore)?.stateBefore || "",
        finalState: [...steps].reverse().find((step) => step.stateAfter)?.stateAfter || "",
        steps,
        transitions,
        evidenceRefs: [...new Set(steps.flatMap((step) => step.evidenceRefs))].slice(
          0,
          IDENTITY_LAB_LIMITS.evidenceRefs
        )
      };
    })
    .sort((left, right) => left.startedAt.localeCompare(right.startedAt) || left.id.localeCompare(right.id));
}

function differentialSide(request: IdentityLabRequestEvidence): IdentityLabDifferentialSide {
  return {
    identityId: request.identityId,
    outcome: request.outcome,
    status: request.status,
    responseBytes: request.responseBytes,
    responseShapeHash: request.responseShapeHash,
    stateAfter: request.stateAfter || "",
    evidenceRefs: request.evidenceRefs
  };
}

export function compareIdentityLabRequests(
  left: IdentityLabRequestEvidence,
  right: IdentityLabRequestEvidence
): IdentityLabDifferentialComparison | null {
  if (!left.projectId || left.projectId !== right.projectId) return null;
  const projectId = left.projectId;
  const sameTarget =
    left.resourceId === right.resourceId &&
    left.method === right.method &&
    left.origin === right.origin &&
    left.path === right.path;
  const leftSide = differentialSide(left);
  const rightSide = differentialSide(right);
  const evidence = [...new Set([...left.evidenceRefs, ...right.evidenceRefs])].slice(0, IDENTITY_LAB_LIMITS.evidenceRefs);
  const base: Omit<IdentityLabDifferentialComparison, "state" | "differences" | "comparableFields" | "reason"> = {
    id: projectScopedId(projectId, "differential", `${left.id}\n${right.id}`),
    projectId,
    resourceId: left.resourceId,
    method: left.method,
    origin: left.origin,
    path: left.path,
    left: leftSide,
    right: rightSide,
    evidenceRefs: evidence
  };
  if (!sameTarget || left.identityId === right.identityId) {
    return {
      ...base,
      state: "insufficient",
      differences: [],
      comparableFields: [],
      reason: sameTarget ? "Differential comparison requires two distinct identities." : "Request targets do not match."
    };
  }
  const comparableFields: IdentityLabDifferentialField[] = [];
  const differences: IdentityLabDifferentialField[] = [];
  const compare = (field: IdentityLabDifferentialField, available: boolean, changed: boolean) => {
    if (!available) return;
    comparableFields.push(field);
    if (changed) differences.push(field);
  };
  compare("outcome", left.outcome !== "unknown" && right.outcome !== "unknown", left.outcome !== right.outcome);
  compare("status", left.status !== null && right.status !== null, left.status !== right.status);
  compare(
    "response-bytes",
    left.responseBytes !== null && right.responseBytes !== null,
    left.responseBytes !== right.responseBytes
  );
  compare(
    "response-shape",
    Boolean(left.responseShapeHash && right.responseShapeHash),
    left.responseShapeHash !== right.responseShapeHash
  );
  compare("state", Boolean(left.stateAfter && right.stateAfter), left.stateAfter !== right.stateAfter);
  if (comparableFields.length === 0) {
    return {
      ...base,
      state: "insufficient",
      differences,
      comparableFields,
      reason: "Requests do not share any comparable response or state fields."
    };
  }
  return {
    ...base,
    state: differences.length > 0 ? "different" : "equivalent",
    differences,
    comparableFields,
    reason:
      differences.length > 0
        ? `Identity-attributed requests differ in: ${differences.join(", ")}.`
        : "Comparable identity-attributed request fields are equivalent."
  };
}
