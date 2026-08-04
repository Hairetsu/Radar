import type { AgentReconWorkerReport, AgentRun } from "../../shared/agent-types.js";
import { checkpointFromCounters, normalizedCheckpoint, withUpdate } from "./runState.js";
import { createId, nowIso, timeline } from "./runtimeClock.js";
import type { AgentRuntimeDeps, RunCounters } from "./runtimeTypes.js";
import { buildDecisionContext } from "./planningStep.js";

function existingReports(run: AgentRun) {
  return run.timeline.flatMap((entry) => entry.reconReport ? [entry.reconReport] : []);
}

function coordinatorFailure(error: unknown): AgentReconWorkerReport {
  const now = nowIso();
  return {
    id: createId("recon"),
    focus: "recon-coordinator",
    label: "Recon coordinator",
    status: "failed",
    summary: "The recon wave could not start; the lead agent will continue from the shared evidence context.",
    observations: [],
    evidenceRefs: [],
    gaps: ["Lead agent should perform the initial evidence review."],
    startedAt: now,
    completedAt: now,
    error: error instanceof Error ? error.message.slice(0, 600) : "Recon coordinator failed."
  };
}

export async function runInitialRecon({
  run,
  counters,
  deps
}: {
  run: AgentRun;
  counters: RunCounters;
  deps: AgentRuntimeDeps;
}) {
  if (!deps.runReconWorkers || existingReports(run).length > 0) {
    return run;
  }

  const context = buildDecisionContext({ run, counters, deps });
  if (context.capturedTraffic.length === 0) {
    return run;
  }

  const workerCount = Math.min(Math.max(run.policy.maxParallelWorkers || 2, 1), 4);
  let nextRun = withUpdate(run, deps.saveRun, {
    timeline: [
      ...run.timeline,
      timeline(`Recon wave started with ${workerCount} read-only worker${workerCount === 1 ? "" : "s"}.`, {
        phase: "recon",
        summary: "Workers are reviewing separate evidence lanes in parallel; no worker can execute tools."
      })
    ]
  });

  let reports: AgentReconWorkerReport[];
  const reconWaitStartedAt = Date.now();
  try {
    reports = await deps.runReconWorkers(context, workerCount);
  } catch (error) {
    reports = [coordinatorFailure(error)];
  } finally {
    // Read-only parallel analysis is not autonomous target activity and therefore
    // does not consume the run's effect-bearing runtime budget.
    counters.startedAt += Date.now() - reconWaitStartedAt;
  }
  if (reports.length === 0) {
    reports = [coordinatorFailure(new Error("Recon coordinator returned no worker handoffs."))];
  }

  const current = deps.loadRun(run.id) || nextRun;
  const currentCheckpoint = normalizedCheckpoint(current);
  const reportEntries = reports.map((report) => timeline(
    `${report.label} recon ${report.status}: ${report.summary}`,
    {
      phase: "recon",
      summary: report.status === "completed"
        ? `${report.observations.length} observations · ${report.gaps.length} gaps`
        : report.error || report.summary,
      reconReport: report
    }
  ));
  nextRun = withUpdate(current, deps.saveRun, {
    ...(current.status === "paused" || current.status === "stopped"
      ? {
          checkpoint: checkpointFromCounters(
            counters,
            currentCheckpoint.pendingRecovery,
            currentCheckpoint.pendingCapabilityCall
          )
        }
      : {}),
    timeline: [
      ...current.timeline,
      ...reportEntries,
      timeline(`Lead agent received ${reports.length} compact recon handoff${reports.length === 1 ? "" : "s"}.`, {
        phase: "recon",
        summary: `${reports.filter((report) => report.status === "completed").length} completed · ${reports.filter((report) => report.status === "failed").length} failed`
      })
    ]
  });
  return nextRun;
}
