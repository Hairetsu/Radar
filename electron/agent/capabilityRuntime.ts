import { createHash } from "node:crypto";
import type {
  AgentCapabilityLease,
  AgentCapabilityLeaseRequest,
  AgentRun,
  AgentStorageState,
  AgentToolCall,
  AgentToolResult
} from "../../shared/agent-types.js";
import {
  AGENT_CAPABILITY_LIMITS,
  agentCapabilityRiskForUse,
  type AgentCapabilityUse
} from "../../shared/agentCapabilities.js";
import { classifyEndpointImpact } from "../../shared/agentAssessment.js";
import type { AgentRuntimeDeps, RunCounters } from "./runtimeTypes.js";

function sortedRecord(input: Record<string, string>) {
  return Object.fromEntries(Object.entries(input).sort(([left], [right]) => left.localeCompare(right)));
}

export function authFingerprint(state: AgentStorageState) {
  const cookies = [...state.cookies]
    .map((cookie) => ({
      name: cookie.name,
      value: cookie.value,
      domain: cookie.domain || "",
      path: cookie.path || "",
      expires: cookie.expires || 0,
      httpOnly: Boolean(cookie.httpOnly),
      secure: Boolean(cookie.secure),
      sameSite: cookie.sameSite || ""
    }))
    .sort((left, right) =>
      `${left.domain}\n${left.path}\n${left.name}`.localeCompare(`${right.domain}\n${right.path}\n${right.name}`)
    );
  return createHash("sha256")
    .update(
      JSON.stringify({
        origin: state.origin,
        cookies,
        localStorage: sortedRecord(state.localStorage),
        sessionStorage: sortedRecord(state.sessionStorage)
      })
    )
    .digest("hex");
}

function browserContextUrl(counters: RunCounters, deps: AgentRuntimeDeps) {
  return deps.getBrowserState().url || counters.startUrl;
}

export function capabilityUseForCall(
  run: AgentRun,
  counters: RunCounters,
  call: AgentToolCall,
  deps: AgentRuntimeDeps
): AgentCapabilityUse | null {
  const currentUrl = browserContextUrl(counters, deps);
  const common = {
    identity: counters.activeIdentity,
    concurrency: 1,
    allowlist: deps.allowlist()
  };
  switch (call.tool) {
    case "openBrowser":
    case "navigateBrowser":
      return { ...common, tool: call.tool, url: call.input.url, method: "GET", requestCost: 1, payloadBytes: 0 };
    case "clickElement":
      return { ...common, tool: call.tool, url: currentUrl, method: "GET", requestCost: 1, payloadBytes: 0 };
    case "fillInput":
      return {
        ...common,
        tool: call.tool,
        url: currentUrl,
        method: "GET",
        requestCost: 0,
        payloadBytes: Buffer.byteLength(call.input.value)
      };
    case "submitForm":
      return { ...common, tool: call.tool, url: currentUrl, method: "POST", requestCost: 1, payloadBytes: 0 };
    case "saveAuthState":
      return { ...common, tool: call.tool, url: currentUrl, method: "GET", requestCost: 0, payloadBytes: 0 };
    case "loadAuthState":
      return {
        ...common,
        identity: call.input.name,
        tool: call.tool,
        url: currentUrl,
        method: "GET",
        requestCost: 0,
        payloadBytes: 0
      };
    case "activateIdentityProfile":
    case "verifyIdentityProfile": {
      const identity = deps.listIdentityProfiles().find((item) => item.id === call.input.identityId);
      return {
        ...common,
        identity: call.input.identityId,
        tool: call.tool,
        url: identity?.origin || currentUrl,
        method: "GET",
        requestCost: 1,
        payloadBytes: 0
      };
    }
    case "sendReplay":
      return {
        ...common,
        tool: call.tool,
        url: call.input.draft.url,
        method: call.input.draft.method,
        requestCost: 1,
        payloadBytes: Buffer.byteLength(call.input.draft.body)
      };
    case "runReplayExperiment": {
      const capture = deps.getCaptures().find((item) => item.id === call.input.captureId);
      const variantCount = Math.max(1, call.input.values?.length || 2);
      return {
        ...common,
        identity: call.input.identity || common.identity,
        tool: call.tool,
        url: capture?.url || currentUrl,
        method: capture?.method || "GET",
        requestCost: 1 + variantCount,
        payloadBytes: Buffer.byteLength(JSON.stringify(call.input.location)),
        probeFamily: call.input.family,
        sourceCaptureId: call.input.captureId,
        endpointImpact: capture
          ? classifyEndpointImpact({ method: capture.method, path: capture.path })
          : "unknown",
        experimentId: call.input.captureId
      };
    }
    case "runWorkflow": {
      const definition = deps.listWorkflows().find((workflow) => workflow.id === call.input.workflowId);
      if (definition?.mode === "passive") {
        return null;
      }
      const captureId = call.input.inputs?.["capture-id"] || "";
      const capture = captureId ? deps.getCaptures().find((item) => item.id === captureId) : null;
      const browserStep = definition?.steps.find((step) => step.kind === "browser-open");
      const urlInput = browserStep?.config.urlInput || "url";
      const browserUrl = call.input.inputs?.[urlInput] || "";
      return {
        ...common,
        tool: call.tool,
        url: capture?.url || browserUrl || currentUrl,
        method: capture?.method || (browserUrl ? "GET" : "POST"),
        requestCost: Math.max(1, definition?.scope.maxRequests || 1),
        payloadBytes: Buffer.byteLength(JSON.stringify(call.input.inputs || {}))
      };
    }
    default:
      return null;
  }
}

export function capabilityLeaseRequestForUse(
  use: AgentCapabilityUse,
  rationale = ""
): AgentCapabilityLeaseRequest | null {
  const riskTier = agentCapabilityRiskForUse(use);
  const maxRequests = Math.max(1, Math.round(use.requestCost));
  const maxConcurrency = Math.max(1, Math.round(use.concurrency));
  const maxPayloadBytes = Math.max(0, Math.round(use.payloadBytes));
  if (
    !riskTier ||
    riskTier === "destructive" ||
    maxRequests > AGENT_CAPABILITY_LIMITS.maxRequests ||
    maxConcurrency > AGENT_CAPABILITY_LIMITS.maxConcurrency ||
    maxPayloadBytes > AGENT_CAPABILITY_LIMITS.maxPayloadBytes
  ) {
    return null;
  }
  try {
    const url = new URL(use.url);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    const reason = String(rationale || "").trim();
    return {
      name: `Authorize ${use.tool}`,
      riskTier,
      tools: [use.tool],
      grants: [
        {
          origin: url.origin,
          method: use.method.toUpperCase(),
          pathPrefix: `${url.pathname}${url.search}` || "/",
          identity: use.identity || "current",
          ...(use.probeFamily ? { probeFamily: use.probeFamily } : {}),
          ...(use.sourceCaptureId ? { sourceCaptureIds: [use.sourceCaptureId] } : {}),
          ...(use.endpointImpact ? { endpointImpact: use.endpointImpact } : {})
        }
      ],
      durationMs: 2 * 60_000,
      maxUses: 1,
      maxRequests,
      maxConcurrency,
      maxPayloadBytes,
      reason: (
        reason
          ? `Radar bounded the selected ${use.tool} action: ${reason}`
          : `Radar bounded the selected ${use.tool} action to this exact target.`
      ).slice(0, 1200)
    };
  } catch {
    return null;
  }
}

export function leaseAllowsObservedUrl(
  lease: AgentCapabilityLease,
  url: string,
  method: string,
  identity: string
) {
  try {
    const parsed = new URL(url);
    const path = `${parsed.pathname}${parsed.search}`;
    return lease.grants.some(
      (grant) =>
        grant.origin === parsed.origin &&
        grant.method === method.toUpperCase() &&
        path.startsWith(grant.pathPrefix) &&
        grant.identity === identity
    );
  } catch {
    return false;
  }
}

export function capabilityResultUrl(result: AgentToolResult) {
  if (!result.ok) {
    return "";
  }
  switch (result.tool) {
    case "openBrowser":
    case "navigateBrowser":
    case "clickElement":
    case "submitForm":
      return result.data.url;
    case "activateIdentityProfile":
    case "verifyIdentityProfile":
      return result.data.url;
    default:
      return "";
  }
}

export function capabilityOutcome(result: AgentToolResult): {
  status: "succeeded" | "failed" | "unknown";
  reason: string;
} {
  if (!result.ok) {
    return { status: "unknown", reason: result.error };
  }
  if (result.tool === "sendReplay" && !result.data.ok) {
    return { status: "failed", reason: result.data.statusText || "Replay dispatch failed." };
  }
  if (result.tool === "runWorkflow" && result.data.status === "failed") {
    return { status: "failed", reason: result.data.error || "Workflow dispatch failed." };
  }
  return { status: "succeeded", reason: `${result.tool} completed.` };
}
