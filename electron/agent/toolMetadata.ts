import type {
  AgentCapabilityLeaseRequest,
  AgentTimelineEntry,
  AgentToolCall,
  AgentTutorialGuidance
} from "../../shared/agent-types.js";

export function toolMayEmitNetwork(call: AgentToolCall) {
  return [
    "openBrowser",
    "navigateBrowser",
    "clickElement",
    "fillInput",
    "submitForm",
    "loadAuthState",
    "activateIdentityProfile",
    "verifyIdentityProfile",
    "sendReplay",
    "runReplayExperiment",
    "runWorkflow"
  ].includes(call.tool);
}

export function tutorialPausesAfter(call: AgentToolCall) {
  return call.tool !== "showView" && call.tool !== "waitForNetworkIdle";
}

export function canAutoGrantScopedNavigation(request: AgentCapabilityLeaseRequest) {
  const autoGrantTools = new Set(["openBrowser", "navigateBrowser"]);
  return (
    request.riskTier === "navigate" &&
    request.tools.length > 0 &&
    request.tools.every((tool) => autoGrantTools.has(tool)) &&
    request.grants.length > 0 &&
    request.grants.every((grant) => grant.method === "GET") &&
    request.maxConcurrency === 1 &&
    request.maxPayloadBytes === 0
  );
}

export function tutorialOrientation(): AgentTutorialGuidance {
  return {
    stage: "orient",
    title: "Begin with a clue, not a conclusion",
    clue: "Radar will inspect one bounded piece of visible evidence at a time.",
    whyItMatters: "Security signals become useful only when they are compared, reproduced, and tied to a concrete impact.",
    lookFor: ["Unexpected trust boundaries", "Differences between identities or states", "Server behavior that contradicts the intended control"],
    strongerEvidence: ["A repeatable result with durable capture or workflow evidence references"],
    falsifiers: ["Documented behavior, public data, local configuration, or a result that cannot be repeated"],
    safeNextStep: "Review each lesson card, inspect the visible evidence pane, then choose Continue lesson.",
    disposition: "learning-clue",
    dispositionRationale: "The run has not collected enough evidence to classify a security issue.",
    evidenceRefs: []
  };
}

export function visibleTargetForTool(call: AgentToolCall): AgentTimelineEntry["target"] {
  switch (call.tool) {
    case "showView":
      return { view: call.input.view };
    case "openBrowser":
    case "navigateBrowser":
      return { browserUrl: call.input.url };
    case "prepareTrafficQuery":
      return { view: "traffic", control: "traffic query" };
    case "getCaptures":
      return { view: "traffic" };
    case "getInterceptQueue":
    case "prepareInterceptEdit":
      return { view: "intercept", evidenceId: "id" in call.input ? call.input.id : undefined };
    case "sendReplay":
    case "runReplayExperiment":
    case "getReplayContext":
    case "prepareReplayTab":
    case "compareReplayResults":
    case "getAssessmentCandidates":
    case "getAssessmentProgress":
      return { view: "repeater" };
    case "getAutomateContext":
    case "prepareAutomateDraft":
    case "analyzeAutomateResults":
      return { view: "automate" };
    case "getWorkflowCatalog":
    case "runWorkflow":
    case "prepareWorkflowDraft":
      return { view: "workflows" };
    case "getAgentContextSummary":
      return { view: "sitemap", control: "AI context summary" };
    case "getPluginInventory":
      return { view: "plugins" };
    case "getAdvancedTestingSummary":
    case "getIdentityLabContext":
    case "analyzeSecurityHeaders":
    case "analyzeCookieFlags":
    case "checkCorsPolicy":
      return { view: "advanced" };
    case "activateIdentityProfile":
    case "verifyIdentityProfile":
      return { view: "advanced", control: "Identity Lab" };
    case "getSitemapCoverage":
      return { view: "sitemap" };
    case "proposeRunMemory":
      return { view: "advanced", control: "run memory" };
    default:
      return undefined;
  }
}

export function recoveryActionsForFailure(call?: AgentToolCall): AgentTimelineEntry["recoveryActions"] {
  if (!call) {
    return ["retry-with-evidence", "stop-run"];
  }
  if (!isRetryableAgentTool(call)) {
    return ["skip-and-continue", "stop-run", "draft-finding"];
  }
  return ["retry-tool", "retry-with-evidence", "skip-and-continue", "stop-run", "draft-finding"];
}

export function isRetryableAgentTool(call: AgentToolCall) {
  return ![
    "openBrowser",
    "navigateBrowser",
    "clickElement",
    "fillInput",
    "submitForm",
    "loadAuthState",
    "activateIdentityProfile",
    "verifyIdentityProfile",
    "saveAuthState",
    "prepareReplayTab",
    "sendReplay",
    "runReplayExperiment",
    "runWorkflow"
  ].includes(call.tool);
}

