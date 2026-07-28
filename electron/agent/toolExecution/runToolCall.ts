import type { AgentRun, AgentToolCall } from "../../../shared/agent-types.js";
import { blockedToolReason } from "../policy.js";
import {
  capabilityStateFromRun,
  checkpointFromCounters,
  withUpdate
} from "../runState.js";
import { createId, timeline } from "../runtimeClock.js";
import type { AgentRuntimeDeps, RunCounters } from "../runtimeTypes.js";
import {
  recoveryActionsForFailure,
  toolMayEmitNetwork,
  visibleTargetForTool
} from "../toolMetadata.js";
import { normalizeAgentToolCall } from "../tools.js";
import { authorizeToolCall } from "./toolAuthorization.js";
import { executeAgentTool } from "./executeAgentTool.js";
import { finalizeToolCapabilities } from "./toolResultCapabilities.js";

type RunToolCallInput = {
  run: AgentRun;
  counters: RunCounters;
  call: AgentToolCall;
  deps: AgentRuntimeDeps;
  currentAuthFingerprint: () => Promise<string>;
};

export async function runToolCall({
  run,
  counters,
  call,
  deps,
  currentAuthFingerprint
}: RunToolCallInput) {
    const normalizedCall = normalizeAgentToolCall(call);
    const blocked = blockedToolReason({
      call: normalizedCall,
      allowlist: deps.allowlist(),
      policy: run.policy,
      profileId: run.profileId,
      replayCount: counters.replayCount,
      workflowRequestCount: counters.workflowRequestCount,
      stepCount: counters.stepCount,
      startedAt: counters.startedAt
    });
    if (blocked) {
      counters.stepCount += 1;
      return withUpdate(run, deps.saveRun, {
        checkpoint: checkpointFromCounters(counters),
        timeline: [
          ...run.timeline,
          timeline(blocked, {
            phase: "policy-block",
            summary: `Policy blocked ${normalizedCall.tool}`,
            target: visibleTargetForTool(normalizedCall),
            recoveryActions: recoveryActionsForFailure(normalizedCall),
            toolCall: normalizedCall,
            toolResult: { tool: normalizedCall.tool, ok: false, error: blocked }
          })
        ]
      });
    }

    const authorization = await authorizeToolCall({
      run,
      counters,
      call: normalizedCall,
      deps,
      currentAuthFingerprint
    });
    run = authorization.run;
    if (authorization.blocked) {
      return run;
    }

    counters.stepCount += 1;
    const actionId = toolMayEmitNetwork(normalizedCall) ? createId("action") : "";
    if (actionId) {
      deps.setActiveActionContext?.({
        actionId,
        identityId: counters.activeIdentity || undefined
      });
    }
    let next = withUpdate(run, deps.saveRun, {
      checkpoint: checkpointFromCounters(counters),
      timeline: [
        ...run.timeline,
        timeline(`Tool call: ${normalizedCall.tool}`, {
          phase: "tool-call",
          summary: `${normalizedCall.tool} requested`,
          target: visibleTargetForTool(normalizedCall),
          actionId: actionId || undefined,
          identityId: counters.activeIdentity || undefined,
          toolCall: normalizedCall
        })
      ]
    });

    const result = await executeAgentTool({
      run,
      counters,
      call: normalizedCall,
      deps: deps
    });
    const finalized = await finalizeToolCapabilities({
      capabilities: capabilityStateFromRun(next),
      result,
      call: normalizedCall,
      counters,
      capabilityUse: authorization.capabilityUse,
      capabilityLease: authorization.capabilityLease,
      capabilityReceiptId: authorization.capabilityReceiptId,
      preActionAuthFingerprint: authorization.preActionAuthFingerprint,
      currentAuthFingerprint
    });

    next = withUpdate(next, deps.saveRun, {
      checkpoint: checkpointFromCounters(counters),
      capabilities: finalized.capabilities,
      timeline: [
        ...next.timeline,
        timeline(`Tool result: ${normalizedCall.tool}`, {
          phase: result.ok ? "tool-result" : "failure",
          summary: result.ok ? `${normalizedCall.tool} completed` : `${normalizedCall.tool} failed`,
          target: visibleTargetForTool(normalizedCall),
          recoveryActions: result.ok ? undefined : recoveryActionsForFailure(normalizedCall),
          capabilityReceiptId:
            authorization.capabilityReceiptId || undefined,
          actionId: actionId || undefined,
          identityId: counters.activeIdentity || undefined,
          toolCall: normalizedCall,
          toolResult: result
        }),
        ...(finalized.revocationNote
          ? [
              timeline(
                `Capability lease revoked: ${finalized.revocationNote}`,
                {
                  phase: "policy-block" as const,
                  summary: "Unexpected effect revoked capability lease",
                  target: visibleTargetForTool(normalizedCall),
                  capabilityReceiptId: authorization.capabilityReceiptId
                }
              )
            ]
          : [])
      ]
    });
    return next;
}
