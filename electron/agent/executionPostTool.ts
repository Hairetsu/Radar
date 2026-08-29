import type {
  AgentDecision,
  AgentRun
} from "../../shared/agent-types.js";
import { getProbeFamily } from "../../shared/agentAssessment.js";
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
import type {
  AgentExecutionLifecycle,
  AgentRuntimeDeps,
  RunCounters
} from "./runtimeTypes.js";
import {
  toolMayEmitNetwork,
  tutorialPausesAfter,
  visibleTargetForTool
} from "./toolMetadata.js";
import { completeAgentRun } from "./executionDecision.js";

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
  waitForSettle,
  operationId
}: {
  run: AgentRun;
  runId: string;
  counters: RunCounters;
  decision: Extract<AgentDecision, { action: "tool" }>;
  deps: AgentRuntimeDeps;
  lifecycle: AgentExecutionLifecycle;
  waitForSettle: (ms: number) => Promise<void>;
  operationId: string;
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
            { operationId, phase: "status" }
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
    const pauseReason =
      lastToolEntry.toolResult && !lastToolEntry.toolResult.ok
        ? lastToolEntry.toolResult.error
        : lastToolEntry.note || lastToolEntry.summary || "The previous step did not complete safely.";
    return {
      run: withUpdate(run, deps.saveRun, {
        status: "paused",
        checkpoint: checkpointFromCounters(counters),
        timeline: [
          ...run.timeline,
          timeline(
            `Run paused: ${pauseReason} Choose a recovery action to continue.`,
            {
              operationId,
              phase: "status",
              summary: lastToolEntry.summary || "Recovery action required",
              target: lastToolEntry.target
            }
          )
        ]
      }),
      ended: true
    };
  }

  if (
    run.profileId === "autonomous-assessment" &&
    lastToolEntry?.toolResult?.ok &&
    lastToolEntry.toolResult.tool === "runReplayExperiment" &&
    (lastToolEntry.toolResult.data.classification === "supported" ||
      lastToolEntry.toolResult.data.classification === "verification-required")
  ) {
    const result = lastToolEntry.toolResult.data;
    const family = getProbeFamily(result.family);
    const replayEvidence = [
      `capture:${result.sourceCaptureId}`,
      `replay:${result.baselineHistoryId}`,
      ...result.variants.map((variant) => `replay:${variant.historyId}`)
    ];
    const untestedCount = Math.max(
      0,
      (run.assessment?.queue.length || 0) -
        (run.assessment?.queue.filter((item) => item.status === "completed").length || 0)
    );
    return {
      run: completeAgentRun({
        run,
        counters,
        decision: {
          action: "finish",
          rationale: `Autonomous assessment stopped at the first ${result.classification} result.`,
          findings: [],
          report: {
            executiveSummary: `${family.label} produced the first ${result.classification} result. Radar stopped the continuous run and retained the full baseline and variant history for review.`,
            scopeSummary: `The run stayed inside saved Scope and the armed read-only assessment contract for ${new URL(result.variants[0]?.draft.url || run.checkpoint?.startUrl || "http://localhost").origin}.`,
            methodology: [
              "Ranked retained in-scope captures by uncovered probe family and usable mutation source.",
              `Ran one visible Repeater baseline and ${result.variants.length} sequential typed variant${result.variants.length === 1 ? "" : "s"} for ${family.label}.`,
              "Stopped when the first supported signal met the autonomous stop condition."
            ],
            observations: [{
              title: family.label,
              detail: result.rationale,
              status: result.classification === "supported" ? "supported" : "lead",
              confidence: result.classification === "supported" ? "medium" : "low",
              evidenceRefs: replayEvidence
            }],
            limitations: [
              "The stop-on-first-result rule leaves later candidates untested.",
              ...(untestedCount > 0 ? [`${untestedCount} queued experiment${untestedCount === 1 ? " was" : "s were"} not run.`] : [])
            ],
            recommendations: ["Review the retained Repeater comparison before deciding whether a separate confirming assessment is needed."]
          }
        },
        deps,
        tutorial: undefined,
        operationId
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
              operationId,
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
