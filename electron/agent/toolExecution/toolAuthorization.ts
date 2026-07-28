import type {
  AgentCapabilityLease,
  AgentRun,
  AgentToolCall
} from "../../../shared/agent-types.js";
import {
  authorizeAgentCapability
} from "../../../shared/agentCapabilities.js";
import type {
  AgentCapabilityUse
} from "../../../shared/agentCapabilities.js";
import {
  capabilityUseForCall
} from "../capabilityRuntime.js";
import {
  capabilityStateFromRun,
  checkpointFromCounters,
  withUpdate
} from "../runState.js";
import { createId, nowIso, timeline } from "../runtimeClock.js";
import type { AgentRuntimeDeps, RunCounters } from "../runtimeTypes.js";
import { visibleTargetForTool } from "../toolMetadata.js";

export type ToolAuthorizationResult = {
  run: AgentRun;
  blocked: boolean;
  capabilityUse: AgentCapabilityUse | null;
  capabilityLease: AgentCapabilityLease | null;
  capabilityReceiptId: string;
  preActionAuthFingerprint: string;
};

export async function authorizeToolCall({
  run,
  counters,
  call,
  deps,
  currentAuthFingerprint
}: {
  run: AgentRun;
  counters: RunCounters;
  call: AgentToolCall;
  deps: AgentRuntimeDeps;
  currentAuthFingerprint: () => Promise<string>;
}): Promise<ToolAuthorizationResult> {
  const capabilityUse = capabilityUseForCall(run, counters, call, deps);
  if (!capabilityUse) {
    return {
      run,
      blocked: false,
      capabilityUse: null,
      capabilityLease: null,
      capabilityReceiptId: "",
      preActionAuthFingerprint: ""
    };
  }

  const preActionAuthFingerprint = await currentAuthFingerprint();
  const authorization = authorizeAgentCapability(
    capabilityStateFromRun(run),
    { ...capabilityUse, authFingerprint: preActionAuthFingerprint },
    createId("receipt"),
    nowIso()
  );
  if (!authorization.required) {
    return {
      run,
      blocked: false,
      capabilityUse,
      capabilityLease: null,
      capabilityReceiptId: "",
      preActionAuthFingerprint
    };
  }

  const capabilityReceiptId = authorization.receipt.id;
  const capabilityLease = authorization.lease || null;
  const nextRun = withUpdate(run, deps.saveRun, {
    capabilities: authorization.state,
    timeline: [
      ...run.timeline,
      timeline(
        `${authorization.allowed ? "Capability allowed" : "Capability blocked"}: ${authorization.reason}`,
        {
          phase: authorization.allowed ? "decision" : "policy-block",
          summary: `${authorization.receipt.riskTier} ${call.tool} / ${authorization.receipt.decision}`,
          target: visibleTargetForTool(call),
          capabilityReceiptId
        }
      )
    ]
  });
  if (authorization.allowed) {
    return {
      run: nextRun,
      blocked: false,
      capabilityUse,
      capabilityLease,
      capabilityReceiptId,
      preActionAuthFingerprint
    };
  }

  counters.stepCount += 1;
  return {
    run: withUpdate(nextRun, deps.saveRun, {
      checkpoint: checkpointFromCounters(counters),
      timeline: [
        ...nextRun.timeline,
        timeline(authorization.reason, {
          phase: "policy-block",
          summary: `Capability lease blocked ${call.tool}`,
          target: visibleTargetForTool(call),
          recoveryActions: ["retry-tool", "skip-and-continue", "stop-run"],
          capabilityReceiptId,
          toolCall: call,
          toolResult: {
            tool: call.tool,
            ok: false,
            error: authorization.reason
          }
        })
      ]
    }),
    blocked: true,
    capabilityUse,
    capabilityLease,
    capabilityReceiptId,
    preActionAuthFingerprint
  };
}
