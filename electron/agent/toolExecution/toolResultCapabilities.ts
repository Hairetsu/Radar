import type {
  AgentCapabilityLease,
  AgentCapabilityState,
  AgentToolCall,
  AgentToolResult
} from "../../../shared/agent-types.js";
import {
  finalizeAgentCapabilityReceipt,
  invalidateAgentCapabilityLease,
  revokeGrantedAgentCapabilities
} from "../../../shared/agentCapabilities.js";
import type {
  AgentCapabilityUse
} from "../../../shared/agentCapabilities.js";
import {
  capabilityOutcome,
  capabilityResultUrl,
  leaseAllowsObservedUrl
} from "../capabilityRuntime.js";
import { nowIso } from "../runtimeClock.js";
import type { RunCounters } from "../runtimeTypes.js";

function identityAfterTool(
  result: AgentToolResult,
  call: AgentToolCall
) {
  if (!result.ok) {
    return "";
  }
  switch (call.tool) {
    case "loadAuthState":
      return call.input.name;
    case "activateIdentityProfile":
    case "verifyIdentityProfile":
      return call.input.identityId;
    default:
      return "";
  }
}

function identityToolChangedAuthority(
  result: AgentToolResult,
  call: AgentToolCall
) {
  return (
    result.ok &&
    (call.tool === "activateIdentityProfile" ||
      call.tool === "verifyIdentityProfile")
  );
}

export async function finalizeToolCapabilities({
  capabilities,
  result,
  call,
  counters,
  capabilityUse,
  capabilityLease,
  capabilityReceiptId,
  preActionAuthFingerprint,
  currentAuthFingerprint
}: {
  capabilities: AgentCapabilityState;
  result: AgentToolResult;
  call: AgentToolCall;
  counters: RunCounters;
  capabilityUse: AgentCapabilityUse | null;
  capabilityLease: AgentCapabilityLease | null;
  capabilityReceiptId: string;
  preActionAuthFingerprint: string;
  currentAuthFingerprint: () => Promise<string>;
}) {
  let nextCapabilities = capabilities;
  let revocationNote = "";

  if (capabilityReceiptId && capabilityLease && capabilityUse) {
    const outcome = capabilityOutcome(result);
    nextCapabilities = finalizeAgentCapabilityReceipt(
      nextCapabilities,
      capabilityReceiptId,
      outcome.status,
      outcome.reason,
      nowIso()
    );
    const observedUrl = capabilityResultUrl(result);
    if (
      observedUrl &&
      !leaseAllowsObservedUrl(
        capabilityLease,
        observedUrl,
        capabilityUse.method,
        capabilityUse.identity
      )
    ) {
      revocationNote = `Observed browser target escaped lease bounds: ${observedUrl}`;
    } else if (
      outcome.status === "unknown" ||
      outcome.status === "failed"
    ) {
      revocationNote = `Capability outcome was ${outcome.status}: ${outcome.reason}`;
    } else if (
      call.tool !== "openBrowser" &&
      call.tool !== "loadAuthState" &&
      call.tool !== "activateIdentityProfile" &&
      call.tool !== "verifyIdentityProfile"
    ) {
      const postActionAuthFingerprint = await currentAuthFingerprint();
      if (postActionAuthFingerprint !== preActionAuthFingerprint) {
        revocationNote =
          "Auth state changed unexpectedly during the leased action.";
      }
    }
    if (revocationNote) {
      nextCapabilities = invalidateAgentCapabilityLease(
        nextCapabilities,
        capabilityLease.id,
        revocationNote,
        nowIso()
      );
    }
  }

  const nextIdentity = identityAfterTool(result, call);
  if (nextIdentity) {
    counters.activeIdentity = nextIdentity;
  }
  if (identityToolChangedAuthority(result, call)) {
    nextCapabilities = revokeGrantedAgentCapabilities(
      nextCapabilities,
      "Identity activation changed the controlled browser authority context.",
      nowIso()
    );
  }

  return { capabilities: nextCapabilities, revocationNote };
}
