import type { AgentCapabilityCeiling, AgentPolicy, AgentRunProfileId, AgentToolName } from "./agent-types.js";

export type AgentRunProfile = {
  id: AgentRunProfileId;
  label: string;
  description: string;
  policy: AgentPolicy;
  allowedTools: AgentToolName[];
  capabilityCeiling: AgentCapabilityCeiling;
};

export const DEFAULT_AGENT_CAPABILITY_CEILING: AgentCapabilityCeiling = {
  maxRiskTier: "active",
  maxDurationMs: 5 * 60_000,
  maxUses: 10,
  maxRequests: 20,
  maxConcurrency: 1,
  maxPayloadBytes: 256 * 1024
};

export const DEFAULT_AGENT_POLICY: AgentPolicy = {
  maxRuntimeMs: 300_000,
  maxSteps: 40,
  maxReplay: 1,
  maxWorkflowRequests: 1,
  maxCaptureSample: 100,
  allowRawContext: false
};

const passiveObserveTools: AgentToolName[] = [
  "showView",
  "getBrowserState",
  "getCaptures",
  "getPageText",
  "getDomSummary",
  "getCookies",
  "getStorageState",
  "analyzeSecurityHeaders",
  "analyzeCookieFlags",
  "checkCorsPolicy",
  "getSitemapCoverage",
  "prepareTrafficQuery",
  "getAgentContextSummary",
  "getReplayContext",
  "getAutomateContext",
  "analyzeAutomateResults",
  "getWorkflowCatalog",
  "getPluginInventory",
  "getAdvancedTestingSummary",
  "getIdentityLabContext",
  "proposeRunMemory"
];

const browserReviewTools: AgentToolName[] = [
  ...passiveObserveTools,
  "openBrowser",
  "navigateBrowser",
  "waitForNetworkIdle",
  "getClickableElements",
  "clickElement",
  "fillInput",
  "submitForm",
  "activateIdentityProfile",
  "verifyIdentityProfile"
];

const prepareReviewTools: AgentToolName[] = [
  ...browserReviewTools,
  "getInterceptQueue",
  "prepareInterceptEdit",
  "prepareReplayTab",
  "compareReplayResults",
  "prepareAutomateDraft",
  "prepareWorkflowDraft"
];

const activeReviewTools: AgentToolName[] = [
  ...prepareReviewTools,
  "sendReplay",
  "runWorkflow"
];

function uniqueTools(tools: AgentToolName[]) {
  return [...new Set(tools)];
}

function policy(patch: Partial<AgentPolicy>): AgentPolicy {
  return { ...DEFAULT_AGENT_POLICY, ...patch };
}

export const AGENT_RUN_PROFILES: AgentRunProfile[] = [
  {
    id: "passive-map",
    label: "Passive Map",
    description: "Read scoped traffic, sitemap coverage, local context, and passive evidence without replay or workflow execution.",
    policy: policy({ maxReplay: 0, maxWorkflowRequests: 0, maxSteps: 24, maxCaptureSample: 80 }),
    allowedTools: uniqueTools(passiveObserveTools),
    capabilityCeiling: { ...DEFAULT_AGENT_CAPABILITY_CEILING, maxRiskTier: "navigate", maxUses: 1, maxRequests: 1 }
  },
  {
    id: "auth-review",
    label: "Auth Review",
    description: "Inspect scoped browser state, cookies, storage, auth states, and prepared traffic queries.",
    policy: policy({ maxReplay: 0, maxWorkflowRequests: 0, maxSteps: 32, maxCaptureSample: 70 }),
    allowedTools: uniqueTools(browserReviewTools),
    capabilityCeiling: { ...DEFAULT_AGENT_CAPABILITY_CEILING, maxDurationMs: 3 * 60_000, maxUses: 8, maxRequests: 16 }
  },
  {
    id: "api-hardening",
    label: "API Hardening",
    description: "Review scoped API captures and prepare Repeater or Workflow drafts for manual approval.",
    policy: policy({ maxReplay: 0, maxWorkflowRequests: 0, maxSteps: 36, maxCaptureSample: 100 }),
    allowedTools: uniqueTools(prepareReviewTools),
    capabilityCeiling: { ...DEFAULT_AGENT_CAPABILITY_CEILING, maxDurationMs: 3 * 60_000, maxUses: 8, maxRequests: 16 }
  },
  {
    id: "header-cookie-review",
    label: "Header/Cookie Review",
    description: "Focus on browser hardening headers, cookie flags, CORS, and affected evidence references.",
    policy: policy({ maxReplay: 0, maxWorkflowRequests: 0, maxSteps: 28, maxCaptureSample: 100 }),
    allowedTools: uniqueTools([
      "showView",
      "getBrowserState",
      "getCaptures",
      "getCookies",
      "getStorageState",
      "analyzeSecurityHeaders",
      "analyzeCookieFlags",
      "checkCorsPolicy",
      "getSitemapCoverage",
      "prepareTrafficQuery",
      "getAgentContextSummary",
      "getAdvancedTestingSummary",
      "proposeRunMemory"
    ]),
    capabilityCeiling: { ...DEFAULT_AGENT_CAPABILITY_CEILING, maxRiskTier: "navigate", maxUses: 1, maxRequests: 1 }
  },
  {
    id: "advanced-api-review",
    label: "Advanced API Review",
    description: "Inspect Advanced API/auth summaries and run explicitly budgeted saved workflows when the operator selects an active profile.",
    policy: policy({ maxReplay: 2, maxWorkflowRequests: 2, maxSteps: 36, maxCaptureSample: 90 }),
    allowedTools: uniqueTools(activeReviewTools),
    capabilityCeiling: { ...DEFAULT_AGENT_CAPABILITY_CEILING }
  },
  {
    id: "report-from-evidence",
    label: "Report From Evidence",
    description: "Summarize scoped findings and evidence into quality-gated draft findings and run memory.",
    policy: policy({ maxReplay: 0, maxWorkflowRequests: 0, maxSteps: 24, maxCaptureSample: 80 }),
    allowedTools: uniqueTools([
      "showView",
      "getCaptures",
      "getSitemapCoverage",
      "getAgentContextSummary",
      "getWorkflowCatalog",
      "getPluginInventory",
      "getAdvancedTestingSummary",
      "prepareTrafficQuery",
      "proposeRunMemory"
    ]),
    capabilityCeiling: { ...DEFAULT_AGENT_CAPABILITY_CEILING, maxRiskTier: "navigate", maxUses: 1, maxRequests: 1 }
  }
];

const profileMap = new Map(AGENT_RUN_PROFILES.map((profileItem) => [profileItem.id, profileItem]));

function clampNumber(value: unknown, fallback: number, min: number, max: number) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.min(Math.max(Math.round(numeric), min), max);
}

export function normalizeAgentRunProfileId(value: unknown): AgentRunProfileId {
  const id = String(value || "").trim();
  return profileMap.has(id as AgentRunProfileId) ? (id as AgentRunProfileId) : "api-hardening";
}

export function getAgentRunProfile(value: unknown): AgentRunProfile {
  return profileMap.get(normalizeAgentRunProfileId(value)) || AGENT_RUN_PROFILES[0];
}

export function normalizeAgentPolicy(input: Partial<AgentPolicy> = {}, profileId?: AgentRunProfileId): AgentPolicy {
  const defaults = getAgentRunProfile(profileId).policy;
  return {
    maxRuntimeMs: clampNumber(input.maxRuntimeMs, defaults.maxRuntimeMs, 10_000, 10 * 60_000),
    maxSteps: clampNumber(input.maxSteps, defaults.maxSteps, 1, 40),
    maxReplay: clampNumber(input.maxReplay, defaults.maxReplay, 0, 10),
    maxWorkflowRequests: clampNumber(input.maxWorkflowRequests, defaults.maxWorkflowRequests, 0, 100),
    maxCaptureSample: clampNumber(input.maxCaptureSample, defaults.maxCaptureSample, 1, 100),
    allowRawContext: Boolean(input.allowRawContext && defaults.allowRawContext)
  };
}

export function agentProfileAllowsTool(profileId: AgentRunProfileId, tool: AgentToolName) {
  return getAgentRunProfile(profileId).allowedTools.includes(tool);
}

export function agentBudgetLabels(policy: AgentPolicy) {
  return [
    `steps ${policy.maxSteps}`,
    `replay ${policy.maxReplay}`,
    `workflow ${policy.maxWorkflowRequests}`,
    `captures ${policy.maxCaptureSample}`,
    `timeout ${Math.round(policy.maxRuntimeMs / 1000)}s`,
    policy.allowRawContext ? "raw context allowed" : "raw context off"
  ];
}
