import { isAllowedTarget } from "../allowlist.js";
import type {
  AgentCapabilityCeiling,
  AgentCapabilityLease,
  AgentCapabilityState,
  AgentToolName
} from "../agent-types.js";
import { AGENT_CAPABILITY_LIMITS } from "./constants.js";
import {
  boundedText,
  normalizeAgentCapabilityLeaseRequest,
  normalizeAgentCapabilityState,
  scopeSnapshot
} from "./normalization.js";
import { agentRiskRank } from "./risk.js";

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
    (agentRiskRank(lease.riskTier) > agentRiskRank(ceiling.maxRiskTier) ||
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

export function expandAgentCapabilityLeaseForMatchingActions(
  current: AgentCapabilityState,
  leaseId: string,
  ceiling: AgentCapabilityCeiling,
  now = new Date().toISOString()
): { ok: true; state: AgentCapabilityState; lease: AgentCapabilityLease } | { ok: false; error: string } {
  const state = normalizeAgentCapabilityState(current, now);
  const lease = state.leases.find((item) => item.id === leaseId);
  if (!lease || lease.status !== "draft") {
    return { ok: false, error: "Only a draft capability lease can be expanded." };
  }
  if (lease.tools.length !== 1 || lease.grants.length !== 1) {
    return {
      ok: false,
      error: "Approve All requires one tool and one exact origin, method, path, and identity tuple."
    };
  }
  const expanded: AgentCapabilityLease = {
    ...lease,
    name: boundedText(`Authorize all matching ${lease.tools.join(" + ")}`, 120),
    reason: boundedText(
      `${lease.reason} Operator approved matching actions for the same tool, origin, method, and identity across this origin, within the selected run profile and remaining budgets.`,
      1200
    ),
    grants: lease.grants.map((grant) => ({ ...grant, pathPrefix: "/" })),
    durationMs: ceiling.maxDurationMs,
    maxUses: ceiling.maxUses,
    maxRequests: ceiling.maxRequests,
    updatedAt: now
  };
  return {
    ok: true,
    lease: expanded,
    state: {
      ...state,
      leases: state.leases.map((item) => (item.id === leaseId ? expanded : item))
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
