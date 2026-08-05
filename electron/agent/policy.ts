import { isAllowedTarget } from "../../shared/allowlist.js";
import type { AgentPolicy, AgentToolCall } from "../../shared/agent-types.js";
import type { AgentRunProfileId } from "../../shared/agent-types.js";
import {
  DEFAULT_AGENT_POLICY,
  agentProfileAllowsTool,
  agentRunAllowsTool,
  normalizeAgentPolicy
} from "../../shared/agentProfiles.js";

export { DEFAULT_AGENT_POLICY, normalizeAgentPolicy };

function urlForTool(call: AgentToolCall) {
  switch (call.tool) {
    case "openBrowser":
    case "navigateBrowser":
      return call.input.url;
    case "sendReplay":
      return call.input.draft.url;
    case "prepareInterceptEdit":
      return call.input.draft?.url || "";
    case "prepareAutomateDraft":
      return call.input.draft.url;
    default:
      return "";
  }
}

export function blockedToolReason({
  call,
  allowlist,
  policy,
  profileId,
  replayCount,
  workflowRequestCount,
  stepCount,
  startedAt
}: {
  call: AgentToolCall;
  allowlist: string[];
  policy: AgentPolicy;
  profileId: AgentRunProfileId;
  replayCount: number;
  workflowRequestCount: number;
  stepCount: number;
  startedAt: number;
}) {
  if (!agentProfileAllowsTool(profileId, call.tool)) {
    return `Profile ${profileId} does not allow ${call.tool}.`;
  }

  if (!agentRunAllowsTool(profileId, policy, call.tool)) {
    return `Run raw-context policy does not allow ${call.tool}.`;
  }

  if (Date.now() - startedAt > policy.maxRuntimeMs) {
    return "Autonomous run exceeded its runtime budget.";
  }

  if (stepCount >= policy.maxSteps) {
    return "Autonomous run exceeded its tool-call budget.";
  }

  if (call.tool === "sendReplay" && replayCount >= policy.maxReplay) {
    return "Autonomous run exceeded its replay budget.";
  }

  if (call.tool === "runWorkflow" && workflowRequestCount >= policy.maxWorkflowRequests) {
    return "Autonomous run exceeded its workflow request budget.";
  }

  const url = urlForTool(call);
  if (url && !isAllowedTarget(url, allowlist)) {
    return `Blocked out-of-scope URL: ${url}`;
  }

  return "";
}
