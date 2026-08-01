import type { AgentRiskTier, AgentToolName } from "../agent-types.js";

export const AGENT_HTTP_METHODS = [
  "GET",
  "HEAD",
  "OPTIONS",
  "POST",
  "PUT",
  "PATCH",
  "DELETE"
] as const;

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

export function agentRiskRank(tier: AgentRiskTier) {
  return RISK_RANK[tier];
}

export function agentToolRiskTier(tool: AgentToolName) {
  return TOOL_RISK[tool] || null;
}

export function agentToolRequiresCapabilityLease(tool: AgentToolName) {
  return Boolean(agentToolRiskTier(tool));
}

export function agentCapabilityRiskForUse(use: Pick<AgentCapabilityUse, "tool" | "method">) {
  const base = agentToolRiskTier(use.tool);
  if (!base) return null;
  const method = use.method.toUpperCase();
  if (
    (use.tool === "sendReplay" || use.tool === "runWorkflow") &&
    (method === "DELETE" || !AGENT_HTTP_METHODS.includes(method as (typeof AGENT_HTTP_METHODS)[number]))
  ) {
    return "destructive" as const;
  }
  return base;
}
