import type {
  AgentCapabilityActionRequest,
  AgentCapabilityGrant,
  AgentCapabilityLease,
  AgentCapabilityLeaseRequest,
  AgentCapabilityReceipt,
  AgentCapabilityState,
  AgentRiskTier,
  AgentToolName
} from "../agent-types.js";
import { AGENT_CAPABILITY_LIMITS, LEASE_STATUSES, RISK_TIERS } from "./constants.js";
import { AGENT_HTTP_METHODS, agentRiskRank, agentToolRiskTier } from "./risk.js";

export function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export function boundedText(value: unknown, max: number) {
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
    .filter((method) => AGENT_HTTP_METHODS.includes(method as (typeof AGENT_HTTP_METHODS)[number]));
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
    (tool): tool is AgentToolName => Boolean(agentToolRiskTier(tool as AgentToolName))
  );
}

function normalizedIso(value: unknown, fallback: string) {
  const text = boundedText(value, 40);
  return Number.isFinite(Date.parse(text)) ? text : fallback;
}

export function scopeSnapshot(value: unknown) {
  return uniqueStrings(value, 40, 500).sort((left, right) => left.localeCompare(right));
}

export function sameStringSet(left: string[], right: string[]) {
  const normalizedLeft = [...new Set(left)].sort((a, b) => a.localeCompare(b));
  const normalizedRight = [...new Set(right)].sort((a, b) => a.localeCompare(b));
  return normalizedLeft.length === normalizedRight.length && normalizedLeft.every((item, index) => item === normalizedRight[index]);
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
  if (tools.some((tool) => agentRiskRank(agentToolRiskTier(tool) || "destructive") > agentRiskRank(tier))) {
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
    !agentToolRiskTier(tool) ||
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
    const approval = boundedText(input.approval, 30);
    if (approval && approval !== "once" && approval !== "all-matching") {
      return null;
    }
    if (
      input.resumeAfterApproval !== undefined &&
      typeof input.resumeAfterApproval !== "boolean"
    ) {
      return null;
    }
    return {
      action,
      expectedRevision,
      leaseId,
      ...(approval ? { approval: approval as "once" | "all-matching" } : {}),
      ...(typeof input.resumeAfterApproval === "boolean"
        ? { resumeAfterApproval: input.resumeAfterApproval }
        : {})
    };
  }
  if (action === "revoke" && leaseId) {
    const reason = boundedText(input.reason, 1200);
    return { action, expectedRevision, leaseId, ...(reason ? { reason } : {}) };
  }
  return null;
}
