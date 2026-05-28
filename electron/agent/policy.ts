import { isAllowedTarget } from "../../shared/allowlist.js";
import type { AgentPolicy, AgentToolCall } from "../../shared/agent-types.js";

export const DEFAULT_AGENT_POLICY: AgentPolicy = {
  maxRuntimeMs: 300_000,
  maxSteps: 40,
  maxReplay: 1,
  maxCaptureSample: 100,
  allowRawContext: false
};

function clampNumber(value: unknown, fallback: number, min: number, max: number) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.min(Math.max(Math.round(numeric), min), max);
}

export function normalizeAgentPolicy(input: Partial<AgentPolicy> = {}): AgentPolicy {
  return {
    maxRuntimeMs: clampNumber(input.maxRuntimeMs, DEFAULT_AGENT_POLICY.maxRuntimeMs, 10_000, 10 * 60_000),
    maxSteps: clampNumber(input.maxSteps, DEFAULT_AGENT_POLICY.maxSteps, 1, 40),
    maxReplay: clampNumber(input.maxReplay, DEFAULT_AGENT_POLICY.maxReplay, 0, 10),
    maxCaptureSample: clampNumber(input.maxCaptureSample, DEFAULT_AGENT_POLICY.maxCaptureSample, 1, 100),
    allowRawContext: Boolean(input.allowRawContext)
  };
}

function urlForTool(call: AgentToolCall) {
  switch (call.tool) {
    case "openBrowser":
    case "navigateBrowser":
      return call.input.url;
    case "sendReplay":
      return call.input.draft.url;
    default:
      return "";
  }
}

export function blockedToolReason({
  call,
  allowlist,
  policy,
  replayCount,
  stepCount,
  startedAt
}: {
  call: AgentToolCall;
  allowlist: string[];
  policy: AgentPolicy;
  replayCount: number;
  stepCount: number;
  startedAt: number;
}) {
  if (Date.now() - startedAt > policy.maxRuntimeMs) {
    return "Autonomous run exceeded its runtime budget.";
  }

  if (stepCount >= policy.maxSteps) {
    return "Autonomous run exceeded its tool-call budget.";
  }

  if (call.tool === "sendReplay" && replayCount >= policy.maxReplay) {
    return "Autonomous run exceeded its replay budget.";
  }

  const url = urlForTool(call);
  if (url && !isAllowedTarget(url, allowlist)) {
    return `Blocked out-of-scope URL: ${url}`;
  }

  return "";
}
