import type {
  AgentDecision,
  AgentFinding,
  AgentRun
} from "../../shared/agent-types.js";
import {
  applyAgentMissionPatch,
  applyAgentMissionUpdates,
  missionHasOpenQuestion,
  validateAgentMissionEvidence
} from "../../shared/agentMission.js";
import {
  grantAgentCapabilityLease,
  proposeAgentCapabilityLease,
  revokeGrantedAgentCapabilities
} from "../../shared/agentCapabilities.js";
import { isAllowedTarget } from "../../shared/allowlist.js";
import { getAgentRunProfile } from "../../shared/agentProfiles.js";
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

export function applyDecisionMissionPatch({
  run,
  counters,
  decision,
  deps
}: {
  run: AgentRun;
  counters: RunCounters;
  decision: AgentDecision;
  deps: AgentRuntimeDeps;
}): DecisionStepResult {
  if (!decision.missionPatch) {
    return { run, paused: false };
  }

  const missionResult = applyAgentMissionPatch(
    missionFromRun(run),
    decision.missionPatch,
    nowIso()
  );
  if (!missionResult.ok) {
    throw new Error(missionResult.error);
  }
  const evidenceErrors = validateAgentMissionEvidence(
    missionResult.mission,
    runtimeEvidenceCatalog(deps)
  );
  if (evidenceErrors.length > 0) {
    throw new Error(
      `Mission patch failed evidence validation: ${evidenceErrors.join(", ")}`
    );
  }

  const nextRun = withUpdate(run, deps.saveRun, {
    mission: missionResult.mission,
    timeline: [
      ...run.timeline,
      timeline(
        `Mission graph advanced to revision ${missionResult.mission.revision}.`,
        {
          phase: "decision",
          summary: `${decision.missionPatch.updates.length} mission update${
            decision.missionPatch.updates.length === 1 ? "" : "s"
          }`
        }
      )
    ]
  });

  if (missionHasOpenQuestion(missionResult.mission)) {
    return {
      run: withUpdate(nextRun, deps.saveRun, {
        status: "paused",
        checkpoint: checkpointFromCounters(counters),
        timeline: [
          ...nextRun.timeline,
          timeline(
            "Run paused for an operator answer recorded in the Mission Graph.",
            {
              phase: "status",
              summary: "Operator input required"
            }
          )
        ]
      }),
      paused: true
    };
  }
  if (
    decision.action === "tool" &&
    missionResult.mission.status !== "active"
  ) {
    throw new Error(
      `Agent cannot call a tool while mission status is ${missionResult.mission.status}.`
    );
  }
  return { run: nextRun, paused: false };
}

export async function applyDecisionLease({
  run,
  counters,
  decision,
  deps,
  currentAuthFingerprint,
  tutorial
}: {
  run: AgentRun;
  counters: RunCounters;
  decision: Extract<AgentDecision, { action: "tool" }>;
  deps: AgentRuntimeDeps;
  currentAuthFingerprint: () => Promise<string>;
  tutorial: AgentDecision["tutorial"];
}): Promise<DecisionStepResult> {
  if (!decision.leaseRequest) {
    return { run, paused: false };
  }

  const profile = getAgentRunProfile(run.profileId);
  if (!decision.leaseRequest.tools.includes(decision.call.tool)) {
    throw new Error("Agent leaseRequest must include the selected tool.");
  }
  if (
    decision.leaseRequest.tools.some(
      (tool) => !profile.allowedTools.includes(tool)
    )
  ) {
    throw new Error("Agent leaseRequest exceeds the selected run profile.");
  }
  if (
    decision.leaseRequest.grants.some(
      (grant) => !isAllowedTarget(grant.origin, deps.allowlist())
    )
  ) {
    throw new Error("Agent leaseRequest contains an out-of-scope origin.");
  }

  const proposed = proposeAgentCapabilityLease(
    capabilityStateFromRun(run),
    decision.leaseRequest,
    createId("lease"),
    nowIso()
  );
  if (!proposed.ok) {
    throw new Error(proposed.error);
  }

  if (canAutoGrantScopedNavigation(decision.leaseRequest)) {
    const granted = grantAgentCapabilityLease(
      proposed.state,
      proposed.lease.id,
      {
        allowlist: deps.allowlist(),
        allowedTools: profile.allowedTools,
        ceiling: profile.capabilityCeiling,
        authFingerprint: await currentAuthFingerprint(),
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
  tutorial
}: {
  run: AgentRun;
  counters: RunCounters;
  decision: Extract<AgentDecision, { action: "finish" }>;
  deps: AgentRuntimeDeps;
  tutorial: AgentDecision["tutorial"];
}) {
  const evidenceCatalog = runtimeEvidenceCatalog(deps);
  const qualityResults = (decision.findings || []).map((finding) =>
    findingFromDecision(finding, evidenceCatalog)
  );
  const nextFindings = qualityResults
    .map((result) => result.finding)
    .filter((finding): finding is AgentFinding => Boolean(finding));
  const rejectedEntries = qualityResults
    .filter((result) => !result.ok)
    .map((result) =>
      timeline(`AI draft finding rejected: ${result.reasons.join(", ")}`, {
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

  return withUpdate(run, deps.saveRun, {
    status: "completed",
    mission: applyAgentMissionUpdates(
      missionFromRun(run),
      [
        {
          kind: "mission-status",
          status: "completed",
          stopReason:
            decision.rationale || "Agent completed the scoped mission."
        }
      ],
      nowIso()
    ),
    capabilities: revokeGrantedAgentCapabilities(
      capabilityStateFromRun(run),
      "Run completed.",
      nowIso()
    ),
    checkpoint: checkpointFromCounters(counters),
    findings: nextFindings,
    timeline: [
      ...run.timeline,
      ...rejectedEntries,
      timeline(
        decision.rationale ||
          `Agent returned finish with ${nextFindings.length} draft finding${
            nextFindings.length === 1 ? "" : "s"
          }.`,
        { phase: "status", ...(tutorial ? { tutorial } : {}) }
      )
    ]
  });
}
