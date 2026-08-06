import type {
  AgentRun,
  AgentRunCheckpoint,
  AgentToolCall
} from "../../shared/agent-types.js";
import {
  checkpointFromCounters,
  withUpdate
} from "./runState.js";
import { timeline } from "./runtimeClock.js";
import type { AgentRuntimeDeps, RunCounters } from "./runtimeTypes.js";

type ResumeCheckpointInput = {
  run: AgentRun;
  counters: RunCounters;
  pendingRecovery: AgentRunCheckpoint["pendingRecovery"];
  pendingCapabilityCall: AgentToolCall | undefined;
  deps: AgentRuntimeDeps;
  callTool: (
    run: AgentRun,
    counters: RunCounters,
    call: AgentToolCall,
    operationId?: string
  ) => Promise<AgentRun>;
};

type ResumeCheckpointResult = {
  run: AgentRun;
  paused: boolean;
};

function toolResultRequiresPause(run: AgentRun) {
  const result = run.timeline.at(-1);
  return result?.phase === "failure" || result?.phase === "policy-block";
}

export async function resumeCheckpoint({
  run,
  counters,
  pendingRecovery,
  pendingCapabilityCall,
  deps,
  callTool
}: ResumeCheckpointInput): Promise<ResumeCheckpointResult> {
  let nextRun = run;

  if (pendingRecovery) {
    if (pendingRecovery.action === "retry-with-evidence") {
      nextRun = withUpdate(nextRun, deps.saveRun, {
        checkpoint: checkpointFromCounters(
          counters,
          pendingRecovery,
          pendingCapabilityCall
        ),
        timeline: [
          ...nextRun.timeline,
          timeline(
            "Refreshed scoped captures and project context before recovery.",
            { phase: "status" }
          )
        ]
      });
    }

    if (pendingRecovery.call) {
      nextRun = await callTool(nextRun, counters, pendingRecovery.call);
      if (toolResultRequiresPause(nextRun)) {
        nextRun = withUpdate(nextRun, deps.saveRun, {
          status: "paused",
          checkpoint: checkpointFromCounters(counters),
          timeline: [
            ...nextRun.timeline,
            timeline(
              "Recovery retry failed. The run is paused for operator direction.",
              { phase: "status" }
            )
          ]
        });
        return { run: nextRun, paused: true };
      }
    }

    nextRun = withUpdate(nextRun, deps.saveRun, {
      checkpoint: checkpointFromCounters(
        counters,
        undefined,
        pendingCapabilityCall
      ),
      timeline: [
        ...nextRun.timeline,
        timeline("Recovery completed; autonomous planning resumed.", {
          phase: "status"
        })
      ]
    });
  }

  if (!pendingCapabilityCall) {
    return { run: nextRun, paused: false };
  }

  nextRun = await callTool(nextRun, counters, pendingCapabilityCall);
  if (toolResultRequiresPause(nextRun)) {
    const capabilityResult = nextRun.timeline.at(-1);
    nextRun = withUpdate(nextRun, deps.saveRun, {
      status: "paused",
      checkpoint: checkpointFromCounters(
        counters,
        undefined,
        pendingCapabilityCall
      ),
      timeline: [
        ...nextRun.timeline,
        timeline(
          "Capability-gated action remains paused. Review or amend the lease before retrying.",
          {
            phase: "status",
            target: capabilityResult?.target
          }
        )
      ]
    });
    return { run: nextRun, paused: true };
  }

  nextRun = withUpdate(nextRun, deps.saveRun, {
    checkpoint: checkpointFromCounters(counters),
    timeline: [
      ...nextRun.timeline,
      timeline(
        "Granted capability action completed; autonomous planning resumed.",
        { phase: "status" }
      )
    ]
  });
  return { run: nextRun, paused: false };
}
