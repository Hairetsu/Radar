import type {
  AgentDecisionContext,
  AgentRun,
  AgentToolCall
} from "../../shared/agent-types.js";
import {
  agentRunAllowsTool
} from "../../shared/agentProfiles.js";
import {
  fallbackAgentTutorialGuidance
} from "../../shared/agentTutorial.js";
import { findingFollowUpDigest } from "../../shared/agentFollowUp.js";
import {
  capturedTrafficContext,
  runCaptures,
  runtimeContextSummary
} from "./evidenceContext.js";
import {
  capabilityStateFromRun,
  checkpointFromCounters,
  missionFromRun,
  normalizedCheckpoint,
  withUpdate
} from "./runState.js";
import { createId, timeline } from "./runtimeClock.js";
import type {
  AgentExecutionLifecycle,
  AgentRuntimeDeps,
  RunCounters
} from "./runtimeTypes.js";
import { visibleTargetForTool } from "./toolMetadata.js";
import { availableToolNames } from "./tools.js";
import {
  applyDecisionLease,
  applyDecisionMissionPatch,
  completeAgentRun
} from "./executionDecision.js";
import { settleToolStep } from "./executionPostTool.js";

export function buildDecisionContext({
  run,
  counters,
  deps
}: {
  run: AgentRun;
  counters: RunCounters;
  deps: AgentRuntimeDeps;
}): AgentDecisionContext {
  const activeAllowlist = deps.allowlist();
  const captures = runCaptures(
    run,
    deps.getCaptures(),
    activeAllowlist,
    ""
  );
  const source = run.source;
  const sourceRun = source?.kind === "finding-follow-up" ? deps.loadRun(source.sourceRunId) : null;
  const findingFollowUp =
    source?.kind === "finding-follow-up" && sourceRun
      ? findingFollowUpDigest(sourceRun, source.sourceFindingId) || undefined
      : undefined;
  return {
    goal: run.goal,
    startUrl: counters.startUrl,
    targetOrigin: counters.targetOrigin,
    allowlist: activeAllowlist,
    browserState: deps.getBrowserState(),
    policy: run.policy,
    profile: run.profileId,
    stepCount: counters.stepCount,
    replayCount: counters.replayCount,
    workflowRequestCount: counters.workflowRequestCount,
    probeRequestCount: counters.probeRequestCount,
    availableTools: availableToolNames().filter((tool) =>
      agentRunAllowsTool(run.profileId, run.policy, tool)
    ),
    capturedTraffic: capturedTrafficContext(
      captures,
      run.policy.maxCaptureSample
    ),
    contextSummary: runtimeContextSummary({
      deps,
      allowlist: activeAllowlist,
      maxCaptureSample: run.policy.maxCaptureSample
    }),
    runMemory: deps.listRunMemory().slice(0, 16),
    mission: missionFromRun(run),
    capabilities: capabilityStateFromRun(run),
    tutorialMode: Boolean(run.policy.tutorialMode),
    timeline: run.timeline.slice(-16),
    ...(findingFollowUp ? { findingFollowUp } : {})
  };
}

export async function executePlanningStep({
  run,
  runId,
  counters,
  deps,
  lifecycle,
  isStopped,
  callTool,
  waitForSettle,
  currentAuthFingerprint
}: {
  run: AgentRun;
  runId: string;
  counters: RunCounters;
  deps: AgentRuntimeDeps;
  lifecycle: AgentExecutionLifecycle;
  isStopped: (runId: string) => boolean;
  callTool: (
    run: AgentRun,
    counters: RunCounters,
    call: AgentToolCall,
    operationId?: string
  ) => Promise<AgentRun>;
  waitForSettle: (ms: number) => Promise<void>;
  currentAuthFingerprint: () => Promise<string>;
}): Promise<{ run: AgentRun; ended: boolean }> {
  const plannerWaitStartedAt = Date.now();
  const decision = await deps.decideNextAction(
    buildDecisionContext({ run, counters, deps })
  ).finally(() => {
    // Provider inference is read-only deliberation. Keep the runtime budget focused
    // on autonomous app activity so a slow local model cannot consume it by waiting.
    counters.startedAt += Date.now() - plannerWaitStartedAt;
  });
  if (isStopped(runId)) {
    const current = deps.loadRun(runId) || run;
    const checkpoint = normalizedCheckpoint(current);
    return {
      run: withUpdate(current, deps.saveRun, {
        checkpoint: checkpointFromCounters(
          counters,
          checkpoint.pendingRecovery,
          checkpoint.pendingCapabilityCall
        )
      }),
      ended: true
    };
  }
  if (Date.now() - counters.startedAt > run.policy.maxRuntimeMs) {
    throw new Error(
      "Agent exceeded its runtime budget while waiting for the next planner decision."
    );
  }
  if (
    !decision ||
    (decision.action !== "tool" && decision.action !== "finish")
  ) {
    throw new Error(
      "Agent decision must choose either tool or finish."
    );
  }
  const operationId = createId("operation");

  const tutorial = run.policy.tutorialMode
    ? decision.tutorial ||
      fallbackAgentTutorialGuidance(decision)
    : undefined;
  const missionStep = applyDecisionMissionPatch({
    run,
    counters,
    decision,
    deps,
    operationId
  });
  let nextRun = missionStep.run;
  if (missionStep.paused) {
    return { run: nextRun, ended: true };
  }
  if (decision.action === "finish") {
    return {
      run: completeAgentRun({
        run: nextRun,
        counters,
        decision,
        deps,
        tutorial,
        operationId
      }),
      ended: true
    };
  }

  const leaseStep = await applyDecisionLease({
    run: nextRun,
    counters,
    decision,
    deps,
    currentAuthFingerprint,
    tutorial,
    operationId
  });
  nextRun = leaseStep.run;
  if (leaseStep.paused) {
    return { run: nextRun, ended: true };
  }
  if (decision.rationale || tutorial) {
    nextRun = withUpdate(nextRun, deps.saveRun, {
      timeline: [
        ...nextRun.timeline,
        timeline(
          `Agent selected ${decision.call.tool}: ${
            decision.rationale ||
            tutorial?.safeNextStep ||
            "Next tutorial step."
          }`,
          {
            operationId,
            phase: "decision",
            summary: decision.rationale || tutorial?.title,
            target: visibleTargetForTool(decision.call),
            toolCall: decision.call,
            ...(tutorial ? { tutorial } : {})
          }
        )
      ]
    });
  }

  nextRun = await callTool(nextRun, counters, decision.call, operationId);
  return settleToolStep({
    run: nextRun,
    runId,
    counters,
    decision,
    deps,
    lifecycle,
    waitForSettle,
    operationId
  });
}
