import type {
  AgentDecision,
  AgentFinding,
  AgentRun
} from "../../shared/agent-types.js";
import {
  applyAgentMissionPatch,
  captureIdsFromEvidenceRefs,
  completeAgentMission,
  missionEvidenceRefs,
  missionHasOpenQuestion,
  reconcileAgentMissionEvidence
} from "../../shared/agentMission.js";
import {
  grantAgentCapabilityLease,
  hasMatchingAgentCapabilityLease,
  proposeAgentCapabilityLease,
  revokeGrantedAgentCapabilities
} from "../../shared/agentCapabilities.js";
import { isAllowedTarget } from "../../shared/allowlist.js";
import { getAgentRunProfile } from "../../shared/agentProfiles.js";
import { buildAgentCompletionReport } from "../../shared/agentReport.js";
import {
  capabilityLeaseRequestForUse,
  capabilityUseForCall
} from "./capabilityRuntime.js";
import {
  findingFromDecision,
  runtimeEvidenceCatalog
} from "./evidenceContext.js";
import {
  capabilityStateFromRun,
  checkpointFromCounters,
  missionFromRun,
  withUpdate
} from "./runState.js";
import { createId, nowIso, timeline } from "./runtimeClock.js";
import type { AgentRuntimeDeps, RunCounters } from "./runtimeTypes.js";
import {
  canAutoGrantScopedNavigation,
  visibleTargetForTool
} from "./toolMetadata.js";

type DecisionStepResult = {
  run: AgentRun;
  paused: boolean;
};

function mergeCompletionFindings(existing: AgentFinding[], generated: AgentFinding[]) {
  const keys = new Set(
    existing.map((finding) =>
      `${finding.title.trim().toLowerCase()}|${[...finding.evidenceRefs].sort().join("|")}`
    )
  );
  const merged = [...existing];
  for (const finding of generated) {
    const key = `${finding.title.trim().toLowerCase()}|${[...finding.evidenceRefs].sort().join("|")}`;
    if (keys.has(key)) continue;
    keys.add(key);
    merged.push(finding);
  }
  return merged;
}

function ignorePlannerMissionPatch({
  run,
  deps,
  operationId,
  reason
}: {
  run: AgentRun;
  deps: AgentRuntimeDeps;
  operationId: string;
  reason: string;
}): DecisionStepResult {
  const boundedReason = String(reason || "The patch was invalid.").trim().slice(0, 1200);
  return {
    run: withUpdate(run, deps.saveRun, {
      timeline: [
        ...run.timeline,
        timeline(
          `Planner mission update ignored: ${boundedReason} The selected action will continue without changing the Mission Graph.`,
          {
            operationId,
            phase: "decision",
            summary: "Mission update ignored; action continues"
          }
        )
      ]
    }),
    paused: false
  };
}

export function applyDecisionMissionPatch({
  run,
  counters,
  decision,
  deps,
  operationId
}: {
  run: AgentRun;
  counters: RunCounters;
  decision: AgentDecision;
  deps: AgentRuntimeDeps;
  operationId: string;
}): DecisionStepResult {
  if (decision.missionPatchWarning) {
    return ignorePlannerMissionPatch({
      run,
      deps,
      operationId,
      reason: decision.missionPatchWarning
    });
  }
  if (!decision.missionPatch) {
    return { run, paused: false };
  }

  const missionResult = applyAgentMissionPatch(
    missionFromRun(run),
    decision.missionPatch,
    nowIso()
  );
  if (!missionResult.ok) {
    return ignorePlannerMissionPatch({
      run,
      deps,
      operationId,
      reason: missionResult.error
    });
  }
  const catalog = runtimeEvidenceCatalog(
    deps,
    captureIdsFromEvidenceRefs(missionEvidenceRefs(missionResult.mission))
  );
  const reconciled = reconcileAgentMissionEvidence(missionResult.mission, catalog);
  if (
    decision.action === "tool" &&
    reconciled.mission.status !== "active" &&
    !missionHasOpenQuestion(reconciled.mission)
  ) {
    return ignorePlannerMissionPatch({
      run,
      deps,
      operationId,
      reason: `A tool decision cannot set mission status to ${missionResult.mission.status}.`
    });
  }

  const droppedNote = reconciled.droppedRefs.length
    ? ` Dropped ${reconciled.droppedRefs.length} stale evidence citation${
        reconciled.droppedRefs.length === 1 ? "" : "s"
      } that are no longer in the local catalog.`
    : "";
  const nextRun = withUpdate(run, deps.saveRun, {
    mission: reconciled.mission,
    timeline: [
      ...run.timeline,
      timeline(
        `Mission graph advanced to revision ${reconciled.mission.revision}.${droppedNote}`,
        {
          operationId,
          phase: "decision",
          summary: `${decision.missionPatch.updates.length} mission update${
            decision.missionPatch.updates.length === 1 ? "" : "s"
          }`
        }
      )
    ]
  });

  if (missionHasOpenQuestion(reconciled.mission)) {
    return {
      run: withUpdate(nextRun, deps.saveRun, {
        status: "paused",
        checkpoint: checkpointFromCounters(counters),
        timeline: [
          ...nextRun.timeline,
          timeline(
            "Run paused for an operator answer recorded in the Mission Graph.",
            {
              operationId,
              phase: "status",
              summary: "Operator input required"
            }
          )
        ]
      }),
      paused: true
    };
  }
  return { run: nextRun, paused: false };
}

export async function applyDecisionLease({
  run,
  counters,
  decision,
  deps,
  currentAuthFingerprint,
  tutorial,
  operationId
}: {
  run: AgentRun;
  counters: RunCounters;
  decision: Extract<AgentDecision, { action: "tool" }>;
  deps: AgentRuntimeDeps;
  currentAuthFingerprint: () => Promise<string>;
  tutorial: AgentDecision["tutorial"];
  operationId: string;
}): Promise<DecisionStepResult> {
  const capabilityUse = capabilityUseForCall(run, counters, decision.call, deps);
  if (!capabilityUse) {
    return { run, paused: false };
  }

  const profile = getAgentRunProfile(run.profileId);
  const authFingerprint = await currentAuthFingerprint();
  if (
    hasMatchingAgentCapabilityLease(
      capabilityStateFromRun(run),
      { ...capabilityUse, authFingerprint }
    )
  ) {
    return { run, paused: false };
  }

  const leaseRequest = capabilityLeaseRequestForUse(
    capabilityUse,
    decision.rationale
  );
  if (
    !leaseRequest ||
    !profile.allowedTools.includes(decision.call.tool) ||
    leaseRequest.grants.some(
      (grant) => !isAllowedTarget(grant.origin, deps.allowlist())
    )
  ) {
    return { run, paused: false };
  }

  const proposed = proposeAgentCapabilityLease(
    capabilityStateFromRun(run),
    leaseRequest,
    createId("lease"),
    nowIso()
  );
  if (!proposed.ok) {
    return { run, paused: false };
  }

  if (canAutoGrantScopedNavigation(leaseRequest)) {
    const granted = grantAgentCapabilityLease(
      proposed.state,
      proposed.lease.id,
      {
        allowlist: deps.allowlist(),
        allowedTools: profile.allowedTools,
        ceiling: profile.capabilityCeiling,
        authFingerprint,
        now: nowIso()
      }
    );
    if (!granted.ok) {
      throw new Error(granted.error);
    }
    return {
      run: withUpdate(run, deps.saveRun, {
        capabilities: granted.state,
        timeline: [
          ...run.timeline,
          timeline(
            `Scoped navigation authorized by ${
              run.policy.tutorialMode ? "Start Tutorial" : "Start Run"
            }.`,
            {
              operationId,
              phase: "decision",
              summary: `${decision.call.tool} can continue autonomously within saved Scope`,
              target: visibleTargetForTool(decision.call)
            }
          )
        ]
      }),
      paused: false
    };
  }

  return {
    run: withUpdate(run, deps.saveRun, {
      status: "paused",
      capabilities: proposed.state,
      checkpoint: checkpointFromCounters(
        counters,
        undefined,
        decision.call
      ),
      timeline: [
        ...run.timeline,
        timeline(`Capability lease review required: ${proposed.lease.name}`, {
          operationId,
          phase: "policy-block",
          summary: `${proposed.lease.riskTier} lease proposed for ${decision.call.tool}`,
          target: visibleTargetForTool(decision.call),
          toolCall: decision.call,
          ...(tutorial ? { tutorial } : {})
        })
      ]
    }),
    paused: true
  };
}

export function completeAgentRun({
  run,
  counters,
  decision,
  deps,
  tutorial,
  operationId
}: {
  run: AgentRun;
  counters: RunCounters;
  decision: Extract<AgentDecision, { action: "finish" }>;
  deps: AgentRuntimeDeps;
  tutorial: AgentDecision["tutorial"];
  operationId: string;
}) {
  const completedAt = nowIso();
  const evidenceCatalog = runtimeEvidenceCatalog(deps);
  const qualityResults = (decision.findings || []).map((finding) =>
    findingFromDecision(finding, evidenceCatalog)
  );
  const nextFindings = qualityResults
    .map((result) => result.finding)
    .filter((finding): finding is AgentFinding => Boolean(finding));
  const retainedFindings = mergeCompletionFindings(run.findings, nextFindings);
  const rejectedEntries = qualityResults
    .filter((result) => !result.ok)
    .map((result) =>
      timeline(`AI draft finding rejected: ${result.reasons.join(", ")}`, {
        operationId,
        phase: "failure",
        summary: "Draft finding rejected by quality gate",
        target: { view: "findings" },
        recoveryActions: [
          "retry-with-evidence",
          "draft-finding",
          "stop-run"
        ]
      })
    );
  const completedMission = completeAgentMission(
    missionFromRun(run),
    decision.rationale || "Agent completed the scoped mission.",
    completedAt
  );
  const completionReport = buildAgentCompletionReport({
    decisionReport: decision.report,
    rationale: decision.rationale || "Agent completed the scoped mission.",
    goal: run.goal,
    allowlist: deps.allowlist(),
    mission: completedMission,
    findings: retainedFindings,
    rejectedFindingCount: rejectedEntries.length,
    generatedAt: completedAt,
    timeline: [...run.timeline, ...rejectedEntries],
    currentOperationId: operationId,
    evidenceCatalog
  });

  return withUpdate(run, deps.saveRun, {
    status: "completed",
    mission: completedMission,
    capabilities: revokeGrantedAgentCapabilities(
      capabilityStateFromRun(run),
      "Run completed.",
      completedAt
    ),
    checkpoint: checkpointFromCounters(counters),
    findings: retainedFindings,
    timeline: [
      ...run.timeline,
      ...rejectedEntries,
      timeline(
        decision.rationale ||
          `Agent returned finish with ${retainedFindings.length} retained draft finding${
            retainedFindings.length === 1 ? "" : "s"
          }.`,
        {
          operationId,
          phase: "status",
          summary: "Completion report ready",
          completionReport,
          ...(tutorial ? { tutorial } : {})
        }
      )
    ]
  });
}
