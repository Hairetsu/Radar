import type {
  AgentCapabilityReceipt,
  AgentCapabilityState,
  AgentRiskTier
} from "../agent-types.js";
import { AGENT_CAPABILITY_LIMITS } from "./constants.js";
import { boundedText, normalizeAgentCapabilityState } from "./normalization.js";
import type { AgentCapabilityUse } from "./risk.js";

function useParts(use: AgentCapabilityUse) {
  try {
    const parsed = new URL(use.url);
    return { origin: parsed.origin, path: `${parsed.pathname}${parsed.search}` };
  } catch {
    return { origin: "", path: "" };
  }
}

export function appendCapabilityReceipt(state: AgentCapabilityState, receipt: AgentCapabilityReceipt) {
  return [...state.receipts, receipt].slice(-AGENT_CAPABILITY_LIMITS.receipts);
}

export function createCapabilityReceipt({
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
    reason,
    ...(use.experimentId ? { experimentId: use.experimentId } : {}),
    ...(use.probeFamily ? { probeFamily: use.probeFamily } : {}),
    ...(use.sourceCaptureId ? { sourceCaptureId: use.sourceCaptureId } : {})
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
