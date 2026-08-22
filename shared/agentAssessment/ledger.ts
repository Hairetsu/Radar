import { MAX_PROBE_RECEIPTS } from "./constants.js";
import type { ProbeLedger, ProbeReceipt } from "./types.js";

export function reserveProbeCost(ledger: ProbeLedger, cost: number, remaining: number) {
  const nextCost = Math.max(0, Math.round(cost));
  if (nextCost <= 0) {
    return { ok: false as const, reason: "Experiment cost must be at least one request." };
  }
  if (ledger.consumed + ledger.reserved + nextCost > remaining) {
    return { ok: false as const, reason: "The next experiment exceeds the remaining probe-request budget." };
  }
  return {
    ok: true as const,
    ledger: {
      ...ledger,
      reserved: ledger.reserved + nextCost
    }
  };
}

export function consumeReservedProbeCost(ledger: ProbeLedger, cost: number, receipts: ProbeReceipt[]) {
  const nextCost = Math.max(0, Math.round(cost));
  return {
    reserved: Math.max(0, ledger.reserved - nextCost),
    consumed: ledger.consumed + nextCost,
    receipts: [...ledger.receipts, ...receipts].slice(-MAX_PROBE_RECEIPTS)
  };
}

export function releaseReservedProbeCost(ledger: ProbeLedger, cost: number) {
  const nextCost = Math.max(0, Math.round(cost));
  return {
    ...ledger,
    reserved: Math.max(0, ledger.reserved - nextCost)
  };
}

export function remainingProbeBudget(ledger: ProbeLedger, maxProbeRequests: number) {
  return Math.max(0, maxProbeRequests - ledger.consumed - ledger.reserved);
}
