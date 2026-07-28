import type {
  AgentRun,
  AgentToolCall
} from "../../shared/agent-types.js";
import {
  checkpointFromCounters,
  countersFromRun,
  elapsedCheckpoint,
  normalizedCheckpoint,
  withUpdate
} from "./runState.js";
import { timeline } from "./runtimeClock.js";
import type { AgentRuntimeDeps, RunCounters } from "./runtimeTypes.js";
import {
  recoveryActionsForFailure
} from "./toolMetadata.js";
import { resumeCheckpoint } from "./executionRecovery.js";
import { executePlanningStep } from "./planningStep.js";

export type AgentExecutionLifecycle = {
  running: Set<string>;
  stopped: Set<string>;
  requestedRunStatus: Map<string, "paused" | "stopped">;
};

type ExecuteRunLoopInput = {
  runId: string;
  deps: AgentRuntimeDeps;
  lifecycle: AgentExecutionLifecycle;
  isStopped: (runId: string) => boolean;
  callTool: (run: AgentRun, counters: RunCounters, call: AgentToolCall) => Promise<AgentRun>;
  waitForSettle: (ms: number) => Promise<void>;
  currentAuthFingerprint: () => Promise<string>;
};

export async function executeRunLoop({
  runId,
  deps,
  lifecycle,
  isStopped,
  callTool,
  waitForSettle,
  currentAuthFingerprint
}: ExecuteRunLoopInput) {
  if (lifecycle.running.has(runId)) {
    return;
  }
  lifecycle.running.add(runId);
  let counters: RunCounters | null = null;

  try {
    let run = deps.loadRun(runId);
    if (
      !run ||
      run.status === "completed" ||
      run.status === "stopped" ||
      run.status === "paused" ||
      run.status === "failed"
    ) {
      return;
    }

    counters = countersFromRun(run);
    const checkpoint = normalizedCheckpoint(run);
    deps.setActiveRunId?.(run.id);
    run = withUpdate(run, deps.saveRun, {
      status: "running",
      checkpoint: checkpointFromCounters(
        counters,
        checkpoint.pendingRecovery,
        checkpoint.pendingCapabilityCall
      ),
      timeline: [
        ...run.timeline,
        timeline("Run started. Scope and policy checks are active.", {
          phase: "status"
        })
      ]
    });

    if (isStopped(runId)) {
      return;
    }

    const resumed = await resumeCheckpoint({
      run,
      counters,
      pendingRecovery: checkpoint.pendingRecovery,
      pendingCapabilityCall: checkpoint.pendingCapabilityCall,
      deps,
      callTool
    });
    run = resumed.run;
    if (resumed.paused) {
      return;
    }

    while (!isStopped(runId)) {
      if (Date.now() - counters.startedAt > run.policy.maxRuntimeMs) {
        throw new Error(
          "Agent exceeded its runtime budget before returning finish."
        );
      }
      if (counters.stepCount >= run.policy.maxSteps) {
        throw new Error(
          "Agent exhausted its tool-call budget before returning finish."
        );
      }

      const step = await executePlanningStep({
        run,
        runId,
        counters,
        deps,
        lifecycle,
        isStopped,
        callTool,
        waitForSettle,
        currentAuthFingerprint,
      });
      run = step.run;
      if (step.ended) {
        return;
      }
    }
  } catch (error) {
    const run = deps.loadRun(runId);
    if (run) {
      const message =
        error instanceof Error ? error.message : "Agent run failed.";
      withUpdate(run, deps.saveRun, {
        status: "failed",
        error: message,
        checkpoint: counters
          ? checkpointFromCounters(counters)
          : elapsedCheckpoint(run),
        timeline: [
          ...run.timeline,
          timeline(`Run failed: ${message}`, {
            phase: "failure",
            summary: message,
            recoveryActions: recoveryActionsForFailure()
          })
        ]
      });
    }
  } finally {
    deps.setActiveActionContext?.(null);
    deps.setActiveRunId?.(null);
    lifecycle.running.delete(runId);
    lifecycle.stopped.delete(runId);
    lifecycle.requestedRunStatus.delete(runId);
  }
}
