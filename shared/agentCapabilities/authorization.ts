import type {
  AgentCapabilityLease,
  AgentCapabilityReceipt,
  AgentCapabilityState,
  AgentRiskTier
} from "../agent-types.js";
import {
  normalizeAgentCapabilityState,
  sameStringSet,
  scopeSnapshot
} from "./normalization.js";
import {
  appendCapabilityReceipt,
  createCapabilityReceipt
} from "./receipts.js";
import {
  agentCapabilityRiskForUse,
  agentRiskRank,
  type AgentCapabilityUse
} from "./risk.js";

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
  if (!sameStringSet(lease.scopeSnapshot, scopeSnapshot(use.allowlist))) return "saved scope changed";
  if (lease.authFingerprint && lease.authFingerprint !== use.authFingerprint) return "auth state changed";
  if (agentRiskRank(lease.riskTier) < agentRiskRank(tier)) return "risk tier is too low";
  if (!lease.tools.includes(use.tool)) return "tool is not leased";
  const normalizedMethod = use.method.toUpperCase();
  const tupleGrants = lease.grants.filter(
    (grant) =>
      grant.origin === origin &&
      grant.method === normalizedMethod &&
      path.startsWith(grant.pathPrefix) &&
      grant.identity === use.identity
  );
  if (tupleGrants.length === 0) return "origin, method, path, and identity tuple does not match";
  const matchingGrant = tupleGrants.find(
    (grant) =>
      (!grant.probeFamily || grant.probeFamily === use.probeFamily) &&
      (!grant.sourceCaptureIds ||
        grant.sourceCaptureIds.length === 0 ||
        Boolean(use.sourceCaptureId && grant.sourceCaptureIds.includes(use.sourceCaptureId))) &&
      (!grant.endpointImpact || grant.endpointImpact === use.endpointImpact)
  );
  if (!matchingGrant) {
    if (tupleGrants.every((grant) => grant.probeFamily && grant.probeFamily !== use.probeFamily)) {
      return "probe family is not leased";
    }
    if (
      tupleGrants.every(
        (grant) =>
          grant.sourceCaptureIds &&
          grant.sourceCaptureIds.length > 0 &&
          (!use.sourceCaptureId || !grant.sourceCaptureIds.includes(use.sourceCaptureId))
      )
    ) {
      return "source capture is not leased";
    }
    return "endpoint impact is not leased";
  }
  if (use.concurrency > lease.maxConcurrency) return "concurrency exceeds lease";
  if (use.payloadBytes > lease.maxPayloadBytes) return "payload exceeds lease";
  if (lease.usedUses >= lease.maxUses) return "lease uses are exhausted";
  if (lease.usedRequests + use.requestCost > lease.maxRequests) return "lease request budget is exhausted";
  return "";
}

export function hasMatchingAgentCapabilityLease(
  current: AgentCapabilityState,
  use: AgentCapabilityUse,
  now = new Date().toISOString()
) {
  const tier = agentCapabilityRiskForUse(use);
  if (!tier) {
    return false;
  }
  const state = normalizeAgentCapabilityState(current, now);
  const nowMs = Date.parse(now);
  return state.leases.some((lease) => !matchingLeaseReason(lease, use, tier, nowMs));
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
    const receipt = createCapabilityReceipt({
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
        receipts: appendCapabilityReceipt(preflightState, receipt)
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
  const receipt = createCapabilityReceipt({ id: receiptId, leaseId: lease.id, use, tier, decision: "allowed", reason, now });
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
      receipts: appendCapabilityReceipt(preflightState, receipt)
    }
  };
}
