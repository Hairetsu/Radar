import { isAllowedTarget } from "./allowlist.js";
import type {
  AgentCapabilityActionRequest,
  AgentCapabilityCeiling,
  AgentCapabilityGrant,
  AgentCapabilityLease,
  AgentCapabilityLeaseRequest,
  AgentCapabilityReceipt,
  AgentCapabilityState,
  AgentRiskTier,
  AgentToolName
} from "./agent-types.js";

export const AGENT_CAPABILITY_LIMITS = {
  leases: 32,
  receipts: 240,
  tools: 12,
  origins: 12,
  methods: 12,
  paths: 24,
  identities: 12,
  minDurationMs: 60_000,
  maxDurationMs: 60 * 60_000,
  maxUses: 50,
  maxRequests: 100,
  maxConcurrency: 4,
  maxPayloadBytes: 1_048_576
} as const;

const RISK_TIERS: AgentRiskTier[] = ["navigate", "reversible", "active", "destructive"];
const LEASE_STATUSES: AgentCapabilityLease["status"][] = ["draft", "granted", "revoked", "expired", "exhausted"];
const HTTP_METHODS = ["GET", "HEAD", "OPTIONS", "POST", "PUT", "PATCH", "DELETE"];

const TOOL_RISK: Partial<Record<AgentToolName, AgentRiskTier>> = {
  openBrowser: "navigate",
  navigateBrowser: "navigate",
  saveAuthState: "reversible",
  loadAuthState: "reversible",
  activateIdentityProfile: "reversible",
  verifyIdentityProfile: "navigate",
  fillInput: "reversible",
  clickElement: "active",
  submitForm: "active",
  sendReplay: "active",
  runWorkflow: "active"
};

const RISK_RANK: Record<AgentRiskTier, number> = {
  navigate: 1,
  reversible: 2,
  active: 3,
  destructive: 4
};

export type AgentCapabilityUse = {
  tool: AgentToolName;
  url: string;
  method: string;
  identity: string;
  requestCost: number;
  concurrency: number;
  payloadBytes: number;
  allowlist: string[];
  authFingerprint?: string;
};

export type AgentCapabilityAuthorization =
  | { required: false; allowed: true; state: AgentCapabilityState }
  | {
      required: true;
      allowed: boolean;
      state: AgentCapabilityState;
      receipt: AgentCapabilityReceipt;
      lease?: AgentCapabilityLease;
      reason: string;
    };

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function boundedText(value: unknown, max: number) {
  return String(value || "").trim().slice(0, max);
}

function boundedNumber(value: unknown, fallback: number, min: number, max: number) {
  const numeric = Math.round(Number(value));
  return Number.isFinite(numeric) ? Math.max(min, Math.min(numeric, max)) : fallback;
}

function uniqueStrings(value: unknown, maxItems: number, maxLength: number) {
  return Array.isArray(value)
    ? [...new Set(value.map((item) => boundedText(item, maxLength)).filter(Boolean))].slice(0, maxItems)
    : [];
}

function riskTier(value: unknown): AgentRiskTier | null {
  const normalized = String(value || "");
  return RISK_TIERS.includes(normalized as AgentRiskTier) ? (normalized as AgentRiskTier) : null;
}

function exactOrigin(value: unknown) {
  try {
    const parsed = new URL(boundedText(value, 500));
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.origin : "";
  } catch {
    return "";
  }
}

function normalizedMethods(value: unknown) {
  return uniqueStrings(value, AGENT_CAPABILITY_LIMITS.methods, 20)
    .map((method) => method.toUpperCase())
    .filter((method) => HTTP_METHODS.includes(method));
}

function normalizedPaths(value: unknown) {
  return uniqueStrings(value, AGENT_CAPABILITY_LIMITS.paths, 300).map((path) =>
    path.startsWith("/") ? path : `/${path}`
  );
}

function normalizedGrants(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  const seen = new Set<string>();
  const grants: AgentCapabilityGrant[] = [];
  for (const raw of value.slice(0, AGENT_CAPABILITY_LIMITS.paths)) {
    const input = objectValue(raw);
    const origin = exactOrigin(input.origin);
    const method = normalizedMethods([input.method])[0] || "";
    const pathPrefix = normalizedPaths([input.pathPrefix])[0] || "";
    const identity = boundedText(input.identity, 100) || "current";
    if (!origin || !method || !pathPrefix) {
      continue;
    }
    const key = `${origin}\n${method}\n${pathPrefix}\n${identity}`;
    if (!seen.has(key)) {
      seen.add(key);
      grants.push({ origin, method, pathPrefix, identity });
    }
  }
  return grants;
}

function normalizedTools(value: unknown) {
  return uniqueStrings(value, AGENT_CAPABILITY_LIMITS.tools, 80).filter(
    (tool): tool is AgentToolName => Boolean(TOOL_RISK[tool as AgentToolName])
  );
}

function normalizedIso(value: unknown, fallback: string) {
  const text = boundedText(value, 40);
  return Number.isFinite(Date.parse(text)) ? text : fallback;
}

function scopeSnapshot(value: unknown) {
  return uniqueStrings(value, 40, 500).sort((left, right) => left.localeCompare(right));
}

function sameStringSet(left: string[], right: string[]) {
  const normalizedLeft = [...new Set(left)].sort((a, b) => a.localeCompare(b));
  const normalizedRight = [...new Set(right)].sort((a, b) => a.localeCompare(b));
  return normalizedLeft.length === normalizedRight.length && normalizedLeft.every((item, index) => item === normalizedRight[index]);
}

export function agentToolRiskTier(tool: AgentToolName) {
  return TOOL_RISK[tool] || null;
}

export function agentToolRequiresCapabilityLease(tool: AgentToolName) {
  return Boolean(agentToolRiskTier(tool));
}

export function agentCapabilityRiskForUse(use: Pick<AgentCapabilityUse, "tool" | "method">) {
  const base = agentToolRiskTier(use.tool);
  if (!base) {
    return null;
  }
  const method = use.method.toUpperCase();
  if ((use.tool === "sendReplay" || use.tool === "runWorkflow") && (method === "DELETE" || !HTTP_METHODS.includes(method))) {
    return "destructive" as const;
  }
  return base;
}

export function normalizeAgentCapabilityLeaseRequest(value: unknown): AgentCapabilityLeaseRequest | null {
  const input = objectValue(value);
  const tier = riskTier(input.riskTier);
  const tools = normalizedTools(input.tools);
  const grants = normalizedGrants(input.grants);
  const name = boundedText(input.name, 120);
  const reason = boundedText(input.reason, 1200);
  if (!tier || tier === "destructive" || !name || !reason || tools.length === 0 || grants.length === 0) {
    return null;
  }
  if (grants.some((grant) => grant.method === "DELETE")) {
    return null;
  }
  if (tools.some((tool) => RISK_RANK[agentToolRiskTier(tool) || "destructive"] > RISK_RANK[tier])) {
    return null;
  }
  return {
    name,
    riskTier: tier,
    tools,
    grants,
    durationMs: boundedNumber(
      input.durationMs,
      2 * 60_000,
      AGENT_CAPABILITY_LIMITS.minDurationMs,
      AGENT_CAPABILITY_LIMITS.maxDurationMs
    ),
    maxUses: boundedNumber(input.maxUses, 1, 1, AGENT_CAPABILITY_LIMITS.maxUses),
    maxRequests: boundedNumber(input.maxRequests, 1, 1, AGENT_CAPABILITY_LIMITS.maxRequests),
    maxConcurrency: boundedNumber(input.maxConcurrency, 1, 1, AGENT_CAPABILITY_LIMITS.maxConcurrency),
    maxPayloadBytes: boundedNumber(input.maxPayloadBytes, 64 * 1024, 0, AGENT_CAPABILITY_LIMITS.maxPayloadBytes),
    reason
  };
}

function normalizedReceipt(value: unknown, fallbackNow: string): AgentCapabilityReceipt | null {
  const input = objectValue(value);
  const tool = boundedText(input.tool, 80) as AgentToolName;
  const tier = riskTier(input.riskTier);
  const decision = boundedText(input.decision, 20);
  const status = boundedText(input.status, 20);
  const id = boundedText(input.id, 120);
  if (
    !id ||
    !tier ||
    !TOOL_RISK[tool] ||
    !["allowed", "blocked", "revoked"].includes(decision) ||
    !["decided", "started", "succeeded", "failed", "unknown"].includes(status)
  ) {
    return null;
  }
  return {
    id,
    ...(boundedText(input.leaseId, 120) ? { leaseId: boundedText(input.leaseId, 120) } : {}),
    createdAt: normalizedIso(input.createdAt, fallbackNow),
    tool,
    riskTier: tier,
    decision: decision as AgentCapabilityReceipt["decision"],
    status: status as AgentCapabilityReceipt["status"],
    origin: exactOrigin(input.origin),
    method: boundedText(input.method, 20).toUpperCase(),
    path: boundedText(input.path, 300),
    identity: boundedText(input.identity, 100),
    requestCost: boundedNumber(input.requestCost, 0, 0, AGENT_CAPABILITY_LIMITS.maxRequests),
    payloadBytes: boundedNumber(input.payloadBytes, 0, 0, AGENT_CAPABILITY_LIMITS.maxPayloadBytes),
    reason: boundedText(input.reason, 1200),
    ...(boundedText(input.finishedAt, 40) ? { finishedAt: normalizedIso(input.finishedAt, fallbackNow) } : {}),
    ...(boundedText(input.outcomeReason, 1200) ? { outcomeReason: boundedText(input.outcomeReason, 1200) } : {})
  };
}

function normalizedLease(value: unknown, fallbackNow: string): AgentCapabilityLease | null {
  const input = objectValue(value);
  const request = normalizeAgentCapabilityLeaseRequest(input);
  const id = boundedText(input.id, 120);
  const status = boundedText(input.status, 20) as AgentCapabilityLease["status"];
  if (!request || !id || !LEASE_STATUSES.includes(status)) {
    return null;
  }
  const createdAt = normalizedIso(input.createdAt, fallbackNow);
  return {
    ...request,
    id,
    status,
    createdAt,
    updatedAt: normalizedIso(input.updatedAt, createdAt),
    ...(boundedText(input.grantedAt, 40) ? { grantedAt: normalizedIso(input.grantedAt, createdAt) } : {}),
    ...(boundedText(input.expiresAt, 40) ? { expiresAt: normalizedIso(input.expiresAt, createdAt) } : {}),
    ...(boundedText(input.revokedAt, 40) ? { revokedAt: normalizedIso(input.revokedAt, createdAt) } : {}),
    ...(boundedText(input.revocationReason, 1200) ? { revocationReason: boundedText(input.revocationReason, 1200) } : {}),
    usedUses: boundedNumber(input.usedUses, 0, 0, request.maxUses),
    usedRequests: boundedNumber(input.usedRequests, 0, 0, request.maxRequests),
    scopeSnapshot: scopeSnapshot(input.scopeSnapshot),
    ...(boundedText(input.authFingerprint, 200) ? { authFingerprint: boundedText(input.authFingerprint, 200) } : {})
  };
}

export function createAgentCapabilityState(): AgentCapabilityState {
  return { version: 1, revision: 0, leases: [], receipts: [] };
}

export function normalizeAgentCapabilityState(
  value: unknown,
  now = new Date().toISOString()
): AgentCapabilityState {
  const input = objectValue(value);
  if (input.version !== 1) {
    return createAgentCapabilityState();
  }
  const leaseIds = new Set<string>();
  const leases = (Array.isArray(input.leases) ? input.leases : [])
    .map((item) => normalizedLease(item, now))
    .filter((item): item is AgentCapabilityLease => Boolean(item))
    .filter((item) => {
      if (leaseIds.has(item.id)) return false;
      leaseIds.add(item.id);
      return true;
    })
    .slice(0, AGENT_CAPABILITY_LIMITS.leases);
  const receiptIds = new Set<string>();
  const receipts = (Array.isArray(input.receipts) ? input.receipts : [])
    .map((item) => normalizedReceipt(item, now))
    .filter((item): item is AgentCapabilityReceipt => Boolean(item))
    .filter((item) => {
      if (receiptIds.has(item.id)) return false;
      receiptIds.add(item.id);
      return true;
    })
    .slice(-AGENT_CAPABILITY_LIMITS.receipts);
  return {
    version: 1,
    revision: boundedNumber(input.revision, 0, 0, Number.MAX_SAFE_INTEGER),
    leases,
    receipts
  };
}

export function normalizeAgentCapabilityActionRequest(value: unknown): AgentCapabilityActionRequest | null {
  const input = objectValue(value);
  const expectedRevision = boundedNumber(input.expectedRevision, 0, 0, Number.MAX_SAFE_INTEGER);
  const action = boundedText(input.action, 20);
  if (action === "propose") {
    const lease = normalizeAgentCapabilityLeaseRequest(input.lease);
    return lease ? { action, expectedRevision, lease } : null;
  }
  const leaseId = boundedText(input.leaseId, 120);
  if (action === "grant" && leaseId) {
    return { action, expectedRevision, leaseId };
  }
  if (action === "revoke" && leaseId) {
    const reason = boundedText(input.reason, 1200);
    return { action, expectedRevision, leaseId, ...(reason ? { reason } : {}) };
  }
  return null;
}

function appendReceipt(state: AgentCapabilityState, receipt: AgentCapabilityReceipt) {
  return [...state.receipts, receipt].slice(-AGENT_CAPABILITY_LIMITS.receipts);
}

export function proposeAgentCapabilityLease(
  current: AgentCapabilityState,
  requestValue: unknown,
  id: string,
  now = new Date().toISOString()
): { ok: true; state: AgentCapabilityState; lease: AgentCapabilityLease } | { ok: false; error: string } {
  const state = normalizeAgentCapabilityState(current, now);
  const request = normalizeAgentCapabilityLeaseRequest(requestValue);
  if (!request) {
    return { ok: false, error: "Capability lease request was invalid or insufficiently bounded." };
  }
  const lease: AgentCapabilityLease = {
    ...request,
    id: boundedText(id, 120),
    status: "draft",
    createdAt: now,
    updatedAt: now,
    usedUses: 0,
    usedRequests: 0,
    scopeSnapshot: []
  };
  if (!lease.id) {
    return { ok: false, error: "Capability lease id is required." };
  }
  return {
    ok: true,
    lease,
    state: {
      ...state,
      revision: state.revision + 1,
      leases: [...state.leases.filter((item) => item.id !== lease.id), lease].slice(-AGENT_CAPABILITY_LIMITS.leases)
    }
  };
}

export function grantAgentCapabilityLease(
  current: AgentCapabilityState,
  leaseId: string,
  context: {
    allowlist: string[];
    allowedTools: AgentToolName[];
    authFingerprint: string;
    ceiling?: AgentCapabilityCeiling;
    now?: string;
  }
): { ok: true; state: AgentCapabilityState; lease: AgentCapabilityLease } | { ok: false; error: string } {
  const now = context.now || new Date().toISOString();
  const state = normalizeAgentCapabilityState(current, now);
  const lease = state.leases.find((item) => item.id === leaseId);
  if (!lease || lease.status !== "draft") {
    return { ok: false, error: "Only a draft capability lease can be granted." };
  }
  if (lease.tools.some((tool) => !context.allowedTools.includes(tool))) {
    return { ok: false, error: "Capability lease exceeds the selected run profile." };
  }
  const ceiling = context.ceiling;
  if (
    ceiling &&
    (RISK_RANK[lease.riskTier] > RISK_RANK[ceiling.maxRiskTier] ||
      lease.durationMs > ceiling.maxDurationMs ||
      lease.maxUses > ceiling.maxUses ||
      lease.maxRequests > ceiling.maxRequests ||
      lease.maxConcurrency > ceiling.maxConcurrency ||
      lease.maxPayloadBytes > ceiling.maxPayloadBytes)
  ) {
    return { ok: false, error: "Capability lease exceeds the selected run profile ceiling." };
  }
  if (lease.grants.some((grant) => !isAllowedTarget(grant.origin, context.allowlist))) {
    return { ok: false, error: "Capability lease origin is outside the current saved scope." };
  }
  if (lease.grants.some((grant) => Boolean(grant.identity)) && !context.authFingerprint) {
    return { ok: false, error: "Identity-bound capability leases require a current auth fingerprint." };
  }
  const granted: AgentCapabilityLease = {
    ...lease,
    status: "granted",
    grantedAt: now,
    expiresAt: new Date(Date.parse(now) + lease.durationMs).toISOString(),
    updatedAt: now,
    scopeSnapshot: scopeSnapshot(context.allowlist),
    authFingerprint: context.authFingerprint
  };
  return {
    ok: true,
    lease: granted,
    state: {
      ...state,
      revision: state.revision + 1,
      leases: state.leases.map((item) => (item.id === leaseId ? granted : item))
    }
  };
}

export function revokeAgentCapabilityLease(
  current: AgentCapabilityState,
  leaseId: string,
  reason: string,
  now = new Date().toISOString()
): { ok: true; state: AgentCapabilityState; lease: AgentCapabilityLease } | { ok: false; error: string } {
  const state = normalizeAgentCapabilityState(current, now);
  const lease = state.leases.find((item) => item.id === leaseId);
  if (!lease) {
    return { ok: false, error: "Capability lease was not found." };
  }
  if (lease.status === "revoked" || lease.status === "expired" || lease.status === "exhausted") {
    return { ok: false, error: `Capability lease is already ${lease.status}.` };
  }
  const revoked: AgentCapabilityLease = {
    ...lease,
    status: "revoked",
    revokedAt: now,
    revocationReason: boundedText(reason, 1200) || "Revoked by operator.",
    updatedAt: now
  };
  return {
    ok: true,
    lease: revoked,
    state: {
      ...state,
      revision: state.revision + 1,
      leases: state.leases.map((item) => (item.id === leaseId ? revoked : item))
    }
  };
}

export function invalidateAgentCapabilityLease(
  current: AgentCapabilityState,
  leaseId: string,
  reason: string,
  now = new Date().toISOString()
) {
  const state = normalizeAgentCapabilityState(current, now);
  const lease = state.leases.find((item) => item.id === leaseId);
  if (!lease) {
    return state;
  }
  const invalidated: AgentCapabilityLease = {
    ...lease,
    status: "revoked",
    revokedAt: now,
    revocationReason: boundedText(reason, 1200) || "Unexpected action effect invalidated the lease.",
    updatedAt: now
  };
  return {
    ...state,
    revision: state.revision + 1,
    leases: state.leases.map((item) => (item.id === leaseId ? invalidated : item))
  };
}

export function revokeGrantedAgentCapabilities(
  current: AgentCapabilityState,
  reason: string,
  now = new Date().toISOString()
) {
  const state = normalizeAgentCapabilityState(current, now);
  const granted = state.leases.filter((lease) => lease.status === "granted");
  if (granted.length === 0) {
    return state;
  }
  const grantedIds = new Set(granted.map((lease) => lease.id));
  return {
    ...state,
    revision: state.revision + 1,
    leases: state.leases.map((lease) =>
      grantedIds.has(lease.id)
        ? {
            ...lease,
            status: "revoked" as const,
            revokedAt: now,
            revocationReason: boundedText(reason, 1200),
            updatedAt: now
          }
        : lease
    )
  };
}

function useParts(use: AgentCapabilityUse) {
  try {
    const parsed = new URL(use.url);
    return { origin: parsed.origin, path: `${parsed.pathname}${parsed.search}` };
  } catch {
    return { origin: "", path: "" };
  }
}

function matchingLeaseReason(lease: AgentCapabilityLease, use: AgentCapabilityUse, tier: AgentRiskTier, nowMs: number) {
  const { origin, path } = useParts(use);
  if (lease.status !== "granted") return "lease is not granted";
  if (!lease.expiresAt || nowMs >= Date.parse(lease.expiresAt)) return "lease is expired";
  if (RISK_RANK[lease.riskTier] < RISK_RANK[tier]) return "risk tier is too low";
  if (!lease.tools.includes(use.tool)) return "tool is not leased";
  const normalizedMethod = use.method.toUpperCase();
  const matchingGrant = lease.grants.find(
    (grant) =>
      grant.origin === origin &&
      grant.method === normalizedMethod &&
      path.startsWith(grant.pathPrefix) &&
      grant.identity === use.identity
  );
  if (!matchingGrant) return "origin, method, path, and identity tuple does not match";
  if (use.concurrency > lease.maxConcurrency) return "concurrency exceeds lease";
  if (use.payloadBytes > lease.maxPayloadBytes) return "payload exceeds lease";
  if (lease.usedUses >= lease.maxUses) return "lease uses are exhausted";
  if (lease.usedRequests + use.requestCost > lease.maxRequests) return "lease request budget is exhausted";
  return "";
}

function capabilityReceipt({
  id,
  leaseId,
  use,
  tier,
  decision,
  reason,
  now
}: {
  id: string;
  leaseId?: string;
  use: AgentCapabilityUse;
  tier: AgentRiskTier;
  decision: AgentCapabilityReceipt["decision"];
  reason: string;
  now: string;
}): AgentCapabilityReceipt {
  const { origin, path } = useParts(use);
  return {
    id,
    ...(leaseId ? { leaseId } : {}),
    createdAt: now,
    tool: use.tool,
    riskTier: tier,
    decision,
    status: decision === "allowed" ? "started" : "decided",
    origin,
    method: use.method.toUpperCase(),
    path,
    identity: use.identity,
    requestCost: Math.max(0, Math.round(use.requestCost)),
    payloadBytes: Math.max(0, Math.round(use.payloadBytes)),
    reason
  };
}

export function finalizeAgentCapabilityReceipt(
  current: AgentCapabilityState,
  receiptId: string,
  status: "succeeded" | "failed" | "unknown",
  outcomeReason: string,
  now = new Date().toISOString()
) {
  const state = normalizeAgentCapabilityState(current, now);
  if (!state.receipts.some((receipt) => receipt.id === receiptId)) {
    return state;
  }
  return {
    ...state,
    revision: state.revision + 1,
    receipts: state.receipts.map((receipt) =>
      receipt.id === receiptId
        ? {
            ...receipt,
            status,
            finishedAt: now,
            outcomeReason: boundedText(outcomeReason, 1200)
          }
        : receipt
    )
  };
}

export function authorizeAgentCapability(
  current: AgentCapabilityState,
  use: AgentCapabilityUse,
  receiptId: string,
  now = new Date().toISOString()
): AgentCapabilityAuthorization {
  const tier = agentCapabilityRiskForUse(use);
  const initial = normalizeAgentCapabilityState(current, now);
  if (!tier) {
    return { required: false, allowed: true, state: initial };
  }
  const nowMs = Date.parse(now);
  let changed = false;
  let leases = initial.leases.map((lease) => {
    if (lease.status !== "granted") return lease;
    if (!lease.expiresAt || nowMs >= Date.parse(lease.expiresAt)) {
      changed = true;
      return { ...lease, status: "expired" as const, updatedAt: now, revocationReason: "Lease expired." };
    }
    if (!sameStringSet(lease.scopeSnapshot, scopeSnapshot(use.allowlist))) {
      changed = true;
      return {
        ...lease,
        status: "revoked" as const,
        revokedAt: now,
        updatedAt: now,
        revocationReason: "Saved scope changed after this lease was granted."
      };
    }
    if (lease.authFingerprint && lease.authFingerprint !== use.authFingerprint) {
      changed = true;
      return {
        ...lease,
        status: "revoked" as const,
        revokedAt: now,
        updatedAt: now,
        revocationReason: "Auth state changed after this lease was granted."
      };
    }
    return lease;
  });
  const preflightState = changed ? { ...initial, revision: initial.revision + 1, leases } : initial;
  const matches = leases.filter((lease) => !matchingLeaseReason(lease, use, tier, nowMs));
  const lease = matches.sort((left, right) => Date.parse(left.expiresAt || "") - Date.parse(right.expiresAt || ""))[0];
  if (!lease) {
    const invalidated = leases.find(
      (item) =>
        item.revocationReason &&
        item.updatedAt === now &&
        (item.status === "revoked" || item.status === "expired")
    );
    const reason = invalidated?.revocationReason || "No granted capability lease matches this normalized action.";
    const receipt = capabilityReceipt({
      id: receiptId,
      ...(invalidated ? { leaseId: invalidated.id } : {}),
      use,
      tier,
      decision: invalidated ? "revoked" : "blocked",
      reason,
      now
    });
    return {
      required: true,
      allowed: false,
      reason,
      receipt,
      ...(invalidated ? { lease: invalidated } : {}),
      state: {
        ...preflightState,
        revision: preflightState.revision + 1,
        receipts: appendReceipt(preflightState, receipt)
      }
    };
  }
  const usedUses = lease.usedUses + 1;
  const usedRequests = lease.usedRequests + Math.max(0, Math.round(use.requestCost));
  const exhausted = usedUses >= lease.maxUses || usedRequests >= lease.maxRequests;
  const consumed: AgentCapabilityLease = {
    ...lease,
    usedUses,
    usedRequests,
    status: exhausted ? "exhausted" : "granted",
    updatedAt: now
  };
  leases = leases.map((item) => (item.id === lease.id ? consumed : item));
  const reason = exhausted ? "Action allowed; capability lease is now exhausted." : "Action allowed by bounded capability lease.";
  const receipt = capabilityReceipt({ id: receiptId, leaseId: lease.id, use, tier, decision: "allowed", reason, now });
  return {
    required: true,
    allowed: true,
    lease: consumed,
    reason,
    receipt,
    state: {
      ...preflightState,
      revision: preflightState.revision + 1,
      leases,
      receipts: appendReceipt(preflightState, receipt)
    }
  };
}
