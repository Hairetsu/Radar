import type { AgentCapabilityLease, AgentRiskTier } from "../agent-types.js";

export const AGENT_CAPABILITY_LIMITS = {
  leases: 32,
  receipts: 240,
  tools: 12,
  origins: 12,
  methods: 12,
  paths: 48,
  identities: 12,
  minDurationMs: 60_000,
  maxDurationMs: 60 * 60_000,
  maxUses: 50,
  maxRequests: 100,
  maxConcurrency: 4,
  maxPayloadBytes: 1_048_576
} as const;

export const RISK_TIERS: AgentRiskTier[] = ["navigate", "reversible", "active", "destructive"];
export const LEASE_STATUSES: AgentCapabilityLease["status"][] = ["draft", "granted", "revoked", "expired", "exhausted"];
