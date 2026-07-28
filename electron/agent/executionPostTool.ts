import type {
  AgentDecision,
  AgentRun
} from "../../shared/agent-types.js";
import {
  applyAgentMissionUpdates
} from "../../shared/agentMission.js";
import {
  revokeGrantedAgentCapabilities
} from "../../shared/agentCapabilities.js";
import {
  capabilityStateFromRun,
  checkpointFromCounters,
  missionFromRun,
  withUpdate
} from "./runState.js";
import { nowIso, timeline } from "./runtimeClock.js";
import type { AgentRuntimeDeps, RunCounters } from "./runtimeTypes.js";
import {
  toolMayEmitNetwork,
  tutorialPausesAfter,
  visibleTargetForTool
} from "./toolMetadata.js";
import type { AgentExecutionLifecycle } from "./executionLoop.js";

type PostToolResult = {
  run: AgentRun;
  ended: boolean;
};

export async function settleToolStep({
  run,
  runId,
  counters,
  decision,
  deps,
  lifecycle,
  waitForSettle
}: {
  run: AgentRun;
  runId: string;
  counters: RunCounters;
  decision: Extract<AgentDecision, { action: "tool" }>;
  deps: AgentRuntimeDeps;
  lifecycle: AgentExecutionLifecycle;
  waitForSettle: (ms: number) => Promise<void>;
}): Promise<PostToolResult> {
  if (toolMayEmitNetwork(decision.call)) {
    await waitForSettle(1200);
    deps.setActiveActionContext?.(null);
  }

  const interruptedStatus = lifecycle.requestedRunStatus.get(runId);
  if (interruptedStatus) {
    const interruptedMission =
      interruptedStatus === "stopped"
        ? applyAgentMissionUpdates(
            missionFromRun(run),
            [
              {
                kind: "mission-status",
                status: "stopped",
                stopReason: "Stopped by operator."
              }
            ],
            nowIso()
          )
        : missionFromRun(run);
    return {
      run: withUpdate(run, deps.saveRun, {
        status: interruptedStatus,
        mission: interruptedMission,
        capabilities:
          interruptedStatus === "stopped"
            ? revokeGrantedAgentCapabilities(
                capabilityStateFromRun(run),
                "Run stopped by operator.",
                nowIso()
              )
            : capabilityStateFromRun(run),
        checkpoint: checkpointFromCounters(counters),
        timeline: [
          ...run.timeline,
          timeline(
            interruptedStatus === "paused"
              ? "Pause completed after the active tool settled."
              : "Stop completed after the active tool settled.",
            { phase: "status" }
          )
        ]
      }),
      ended: true
    };
  }

  const lastToolEntry = run.timeline.at(-1);
  if (
    lastToolEntry?.phase === "failure" ||
    lastToolEntry?.phase === "policy-block"
  ) {
    return {
      run: withUpdate(run, deps.saveRun, {
        status: "paused",
        checkpoint: checkpointFromCounters(counters),
        timeline: [
          ...run.timeline,
          timeline(
            "Run paused after a failed or policy-blocked step. Choose a recovery action to continue.",
            {
              phase: "status",
              target: lastToolEntry.target
            }
          )
        ]
      }),
      ended: true
    };
  }

  if (run.policy.tutorialMode && tutorialPausesAfter(decision.call)) {
    return {
      run: withUpdate(run, deps.saveRun, {
        status: "paused",
        checkpoint: checkpointFromCounters(counters),
        timeline: [
          ...run.timeline,
          timeline(
            "Tutorial checkpoint reached. Inspect the visible result and continue when ready.",
            {
              phase: "status",
              summary: "Lesson checkpoint — waiting for operator",
              target: visibleTargetForTool(decision.call)
            }
          )
        ]
      }),
      ended: true
    };
  }

  return { run, ended: false };
}
