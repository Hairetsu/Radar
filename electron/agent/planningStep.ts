import type {
  AgentDecisionContext,
  AgentRun,
  AgentToolCall
} from "../../shared/agent-types.js";
import {
  agentProfileAllowsTool
} from "../../shared/agentProfiles.js";
import {
  fallbackAgentTutorialGuidance
} from "../../shared/agentTutorial.js";
import {
  capturedTrafficContext,
  runCaptures,
  runtimeContextSummary
} from "./evidenceContext.js";
import {
  capabilityStateFromRun,
  missionFromRun,
  withUpdate
} from "./runState.js";
import { timeline } from "./runtimeClock.js";
import type { AgentRuntimeDeps, RunCounters } from "./runtimeTypes.js";
import { visibleTargetForTool } from "./toolMetadata.js";
import { availableToolNames } from "./tools.js";
import {
  applyDecisionLease,
  applyDecisionMissionPatch,
  completeAgentRun
} from "./executionDecision.js";
import { settleToolStep } from "./executionPostTool.js";
import type {
  AgentExecutionLifecycle
} from "./executionLoop.js";

function decisionContext({
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
    availableTools: availableToolNames().filter((tool) =>
      agentProfileAllowsTool(run.profileId, tool)
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
    timeline: run.timeline.slice(-16)
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
    call: AgentToolCall
  ) => Promise<AgentRun>;
  waitForSettle: (ms: number) => Promise<void>;
  currentAuthFingerprint: () => Promise<string>;
}): Promise<{ run: AgentRun; ended: boolean }> {
  const decision = await deps.decideNextAction(
    decisionContext({ run, counters, deps })
  );
  if (isStopped(runId)) {
    return { run, ended: true };
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

  const tutorial = run.policy.tutorialMode
    ? decision.tutorial ||
      fallbackAgentTutorialGuidance(decision)
    : undefined;
  const missionStep = applyDecisionMissionPatch({
    run,
    counters,
    decision,
    deps
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
        tutorial
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
    tutorial
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

  nextRun = await callTool(nextRun, counters, decision.call);
  return settleToolStep({
    run: nextRun,
    runId,
    counters,
    decision,
    deps,
    lifecycle,
    waitForSettle
  });
}
