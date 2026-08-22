import { createHash } from "node:crypto";
import type {
  AgentCapabilityActionRequest,
  AgentFinding,
  AgentRun,
  AgentMissionSteeringRequest,
  AgentRunRecoveryAction,
  AgentRunRecoveryRequest,
  AgentRunRequest,
  AgentTimelineEntry,
  AgentToolCall
} from "../../shared/agent-types.js";
import {
  applyAgentMissionSteering,
  applyAgentMissionUpdates,
  createAgentMission,
  missionHasOpenQuestion,
  validateAgentMissionEvidence
} from "../../shared/agentMission.js";
import {
  createAgentCapabilityState,
  expandAgentCapabilityLeaseForMatchingActions,
  grantAgentCapabilityLease,
  normalizeAgentCapabilityActionRequest,
  proposeAgentCapabilityLease,
  revokeAgentCapabilityLease,
  revokeGrantedAgentCapabilities
} from "../../shared/agentCapabilities.js";
import {
  createArmedAssessmentState,
  defaultAssessmentContract,
  normalizeAssessmentContract
} from "../../shared/agentAssessment.js";
import { firstUrlFromText, originFromUrl } from "../../shared/url.js";
import { getAgentRunProfile, normalizeAgentRunProfileId } from "../../shared/agentProfiles.js";
import { assessmentLeaseFromContract } from "./assessment/armContract.js";
import { stopAssessmentTraffic } from "./assessment/stopController.js";
import { authFingerprint } from "./capabilityRuntime.js";
import { runtimeEvidenceCatalog } from "./evidenceContext.js";
import { executeRunLoop } from "./executionLoop.js";
import { DEFAULT_AGENT_POLICY, normalizeAgentPolicy } from "./policy.js";
import {
  capabilityStateFromRun,
  elapsedCheckpoint,
  missionFromRun,
  normalizedCheckpoint,
  withUpdate
} from "./runState.js";
import { createId, nowIso, timeline } from "./runtimeClock.js";
import type { AgentRuntimeDeps, RunCounters } from "./runtimeTypes.js";
import { runToolCall } from "./toolExecution/runToolCall.js";
import {
  isRetryableAgentTool,
  recoveryActionsForFailure,
  tutorialOrientation
} from "./toolMetadata.js";



const running = new Set<string>();
const stopped = new Set<string>();
const scheduled = new Set<string>();
const requestedRunStatus = new Map<string, "paused" | "stopped">();





function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function pendingCapabilityGrant(run: AgentRun) {
  const capabilities = capabilityStateFromRun(run);
  const call = normalizedCheckpoint(run).pendingCapabilityCall;
  if (!call) {
    const draft = capabilities.leases.find((lease) => lease.status === "draft");
    return draft
      ? { tool: draft.tools[0] || "pending action", draft }
      : null;
  }
  const granted = capabilities.leases.some(
    (lease) => lease.status === "granted" && lease.tools.includes(call.tool)
  );
  if (granted) {
    return null;
  }
  return {
    tool: call.tool,
    draft: capabilities.leases.find(
      (lease) => lease.status === "draft" && lease.tools.includes(call.tool)
    )
  };
}

function capabilityGrantError(tool: string, leaseName?: string) {
  return leaseName
    ? `Approve the pending capability lease "${leaseName}" before resuming ${tool}.`
    : `Grant a matching capability lease before retrying ${tool}. Retry cannot grant authority.`;
}

function correctUnavailableRetry({
  run,
  entry,
  call,
  recoveryActions,
  note,
  saveRun
}: {
  run: AgentRun;
  entry: AgentTimelineEntry;
  call: AgentToolCall;
  recoveryActions: AgentRunRecoveryAction[];
  note: string;
  saveRun: AgentRuntimeDeps["saveRun"];
}) {
  return withUpdate(run, saveRun, {
    timeline: [
      ...run.timeline.map((item) =>
        item.id === entry.id ? { ...item, recoveryActions } : item
      ),
      timeline(note, {
        phase: "policy-block",
        summary: `Automatic retry unavailable for ${call.tool}`,
        target: entry.target
      })
    ]
  });
}



export class AgentRuntime {
  constructor(private readonly deps: AgentRuntimeDeps) {}

  private waitForSettle(ms: number) {
    return this.deps.waitForSettle ? this.deps.waitForSettle(ms) : sleep(ms);
  }

  private async currentAuthFingerprint() {
    try {
      return authFingerprint(await this.deps.getStorageState());
    } catch {
      const browser = this.deps.getBrowserState();
      return createHash("sha256")
        .update(JSON.stringify({ open: browser.open, url: browser.url || "", engine: browser.engine }))
        .digest("hex");
    }
  }

  private resumeBlockReason(run: AgentRun) {
    if (running.has(run.id)) {
      return "Agent run is still pausing. Retry resume after the active step settles.";
    }
    const checkpoint = elapsedCheckpoint(run);
    if (checkpoint.elapsedMs >= run.policy.maxRuntimeMs) {
      return `Agent runtime budget exhausted (${Math.ceil(checkpoint.elapsedMs / 1000)}s used / ${Math.ceil(run.policy.maxRuntimeMs / 1000)}s allowed). Resume never resets safety budgets; start a continuation run with a fresh bounded budget.`;
    }
    if (checkpoint.stepCount >= run.policy.maxSteps) {
      return `Agent tool-call budget exhausted (${checkpoint.stepCount} used / ${run.policy.maxSteps} allowed). Resume never resets safety budgets; start a continuation run with a fresh bounded budget.`;
    }
    if (missionHasOpenQuestion(missionFromRun(run))) {
      return "Answer or dismiss the open mission question before resuming this run.";
    }
    const pendingGrant = pendingCapabilityGrant(run);
    if (pendingGrant) {
      return capabilityGrantError(pendingGrant.tool, pendingGrant.draft?.name);
    }
    return null;
  }

  async updateCapabilities(runId: string, rawRequest: AgentCapabilityActionRequest) {
    const run = this.deps.loadRun(runId);
    if (!run) {
      return null;
    }
    if (running.has(runId) || run.status === "running" || run.status === "queued") {
      throw new Error("Pause the run and wait for the active step to settle before changing capability leases.");
    }
    if (run.status === "completed" || run.status === "stopped") {
      throw new Error("Completed or stopped capability ledgers are read-only.");
    }
    const request = normalizeAgentCapabilityActionRequest(rawRequest);
    if (!request) {
      throw new Error("Capability lease action was invalid.");
    }
    const state = capabilityStateFromRun(run);
    if (request.expectedRevision !== state.revision) {
      throw new Error(
        `Capability lease action expected revision ${request.expectedRevision}, but current revision is ${state.revision}.`
      );
    }

    let nextState = state;
    let note = "Capability ledger updated.";
    let checkpoint = run.checkpoint;
    if (request.action === "propose") {
      const result = proposeAgentCapabilityLease(state, request.lease, createId("lease"), nowIso());
      if (!result.ok) {
        throw new Error(result.error);
      }
      nextState = result.state;
      note = `Operator proposed capability lease ${result.lease.id}: ${result.lease.name}`;
    } else if (request.action === "grant") {
      const profile = getAgentRunProfile(run.profileId);
      let grantState = state;
      if (request.approval === "all-matching") {
        const expanded = expandAgentCapabilityLeaseForMatchingActions(
          state,
          request.leaseId,
          profile.capabilityCeiling,
          nowIso()
        );
        if (!expanded.ok) {
          throw new Error(expanded.error);
        }
        grantState = expanded.state;
      }
      const result = grantAgentCapabilityLease(grantState, request.leaseId, {
        allowlist: this.deps.allowlist(),
        allowedTools: profile.allowedTools,
        ceiling: profile.capabilityCeiling,
        authFingerprint: await this.currentAuthFingerprint(),
        now: nowIso()
      });
      if (!result.ok) {
        throw new Error(result.error);
      }
      nextState = result.state;
      note = request.approval === "all-matching"
        ? `Operator approved all matching ${result.lease.tools.join(" + ")} actions on the granted origin until ${result.lease.expiresAt}.`
        : `Operator granted capability lease ${result.lease.id} until ${result.lease.expiresAt}.`;
      const currentCheckpoint = normalizedCheckpoint(run);
      if (!currentCheckpoint.pendingCapabilityCall) {
        const blockedCall = [...run.timeline]
          .reverse()
          .find(
            (entry) =>
              entry.createdAt >= result.lease.createdAt &&
              entry.summary === `Capability lease blocked ${entry.toolCall?.tool || ""}` &&
              Boolean(
                entry.toolCall &&
                result.lease.tools.includes(entry.toolCall.tool)
              )
          )
          ?.toolCall;
        if (blockedCall) {
          checkpoint = {
            ...currentCheckpoint,
            pendingCapabilityCall: blockedCall,
            pendingRecovery: undefined
          };
        }
      }
    } else {
      const result = revokeAgentCapabilityLease(
        state,
        request.leaseId,
        request.reason || "Revoked by operator.",
        nowIso()
      );
      if (!result.ok) {
        throw new Error(result.error);
      }
      nextState = result.state;
      note = `Operator revoked capability lease ${result.lease.id}: ${result.lease.revocationReason}`;
      const pendingCall = normalizedCheckpoint(run).pendingCapabilityCall;
      if (pendingCall && result.lease.tools.includes(pendingCall.tool)) {
        checkpoint = { ...normalizedCheckpoint(run), pendingCapabilityCall: undefined };
      }
    }
    const updated = withUpdate(run, this.deps.saveRun, {
      capabilities: nextState,
      checkpoint,
      timeline: [
        ...run.timeline,
        timeline(note, {
          phase: "status",
          summary: `Capability ledger advanced to revision ${nextState.revision}`
        })
      ]
    });
    if (request.action !== "grant" || !request.resumeAfterApproval) {
      return updated;
    }
    const blockReason = this.resumeBlockReason(updated);
    if (blockReason) {
      return withUpdate(updated, this.deps.saveRun, {
        timeline: [
          ...updated.timeline,
          timeline(`Capability approved, but automatic resume stayed paused: ${blockReason}`, {
            phase: "status",
            summary: "Approval saved; automatic resume unavailable"
          })
        ]
      });
    }
    return this.resume(runId);
  }

  revokeAllGrantedLeases(reason: string) {
    const now = nowIso();
    const updated: AgentRun[] = [];
    for (const run of this.deps.listRuns()) {
      const current = capabilityStateFromRun(run);
      const capabilities = revokeGrantedAgentCapabilities(current, reason, now);
      if (capabilities.revision === current.revision) {
        continue;
      }
      updated.push(
        withUpdate(run, this.deps.saveRun, {
          capabilities,
          timeline: [...run.timeline, timeline(`All granted capability leases revoked: ${reason}`, { phase: "status" })]
        })
      );
    }
    return updated;
  }

  private queueExecution(runId: string) {
    if (scheduled.has(runId)) {
      return;
    }
    scheduled.add(runId);
    void (async () => {
      try {
        while (running.has(runId)) {
          await sleep(25);
        }
        scheduled.delete(runId);
        await this.execute(runId);
      } finally {
        scheduled.delete(runId);
      }
    })();
  }

  start(request: AgentRunRequest) {
    const continuationOf = String(request.continuationOf || "").trim().slice(0, 128);
    const sourceRun = continuationOf ? this.deps.loadRun(continuationOf) : null;
    if (continuationOf && !sourceRun) {
      throw new Error("The source run for this continuation no longer exists.");
    }
    if (sourceRun && sourceRun.sessionId !== this.deps.currentSessionId()) {
      throw new Error("A continuation must remain in the source run's local session.");
    }
    if (sourceRun && (sourceRun.status === "queued" || sourceRun.status === "running")) {
      throw new Error("An active run cannot be used as a continuation source.");
    }
    const goal = String(sourceRun?.goal || request.goal || "").trim();
    if (!goal) {
      throw new Error("Agent goal is required.");
    }

    const createdAt = nowIso();
    const profileId = sourceRun?.profileId || normalizeAgentRunProfileId(request.profileId);
    const startUrl = firstUrlFromText(goal) || request.startUrl || sourceRun?.checkpoint?.startUrl || "";
    const profilePolicy = normalizeAgentPolicy({}, profileId);
    const tutorialMode = sourceRun?.policy.tutorialMode === true ||
      request.tutorialMode === true ||
      request.policy?.tutorialMode === true;
    const policy = normalizeAgentPolicy(sourceRun
      ? {
          maxRuntimeMs: profilePolicy.maxRuntimeMs,
          maxSteps: Math.min(sourceRun.policy.maxSteps, profilePolicy.maxSteps),
          maxReplay: Math.min(sourceRun.policy.maxReplay, profilePolicy.maxReplay),
          maxWorkflowRequests: Math.min(sourceRun.policy.maxWorkflowRequests, profilePolicy.maxWorkflowRequests),
          maxCaptureSample: Math.min(sourceRun.policy.maxCaptureSample, profilePolicy.maxCaptureSample),
          allowRawContext: sourceRun.policy.allowRawContext && profilePolicy.allowRawContext,
          tutorialMode
        }
      : { ...request.policy, tutorialMode }, profileId);
    const run: AgentRun = {
      id: createId("agent"),
      sessionId: this.deps.currentSessionId(),
      createdAt,
      updatedAt: createdAt,
      goal,
      profileId,
      status: "queued",
      policy,
      checkpoint: {
        startUrl,
        targetOrigin: startUrl ? originFromUrl(startUrl) : "",
        stepCount: 0,
        replayCount: 0,
        workflowRequestCount: 0,
        probeRequestCount: 0,
        elapsedMs: 0,
        lastResumedAt: createdAt,
        activeIdentity: "current"
      },
      mission: createAgentMission(goal, startUrl, createdAt),
      capabilities: createAgentCapabilityState(),
      timeline: [
        timeline(
          continuationOf
            ? `Continuation queued from ${continuationOf}; the source transcript remains preserved.`
            : "Run queued from AI-First goal prompt.",
          {
            phase: "status",
            summary: continuationOf
              ? `Continuation queued with ${profileId} profile${policy.tutorialMode ? " in Tutorial Mode" : ""}`
              : `Queued with ${profileId} profile${policy.tutorialMode ? " in Tutorial Mode" : ""}`,
            ...(policy.tutorialMode ? { tutorial: tutorialOrientation() } : {})
          }
        )
      ],
      findings: []
    };

    if (profileId === "autonomous-assessment") {
      const contract = normalizeAssessmentContract(request.assessmentContract) || defaultAssessmentContract();
      run.assessment = createArmedAssessmentState(contract);
      const proposed = proposeAgentCapabilityLease(
        run.capabilities || createAgentCapabilityState(),
        assessmentLeaseFromContract({
          contract,
          allowlist: this.deps.allowlist(),
          reason: "Arm & Run confirmed the Autonomous Assessment contract."
        }),
        createId("lease"),
        createdAt
      );
      if (proposed.ok) {
        const granted = grantAgentCapabilityLease(proposed.state, proposed.lease.id, {
          allowlist: this.deps.allowlist(),
          allowedTools: getAgentRunProfile(profileId).allowedTools,
          authFingerprint: "current",
          ceiling: getAgentRunProfile(profileId).capabilityCeiling,
          now: createdAt
        });
        if (granted.ok) {
          run.capabilities = granted.state;
          run.timeline = [
            ...run.timeline,
            timeline("Assessment contract armed. Matching read-only experiments will not pause for another lease.", {
              phase: "status",
              summary: "Arm & Run granted the assessment capability lease"
            })
          ];
        }
      }
    }

    this.deps.saveRun(run);
    this.queueExecution(run.id);
    return run;
  }

  pause(runId: string) {
    const run = this.deps.loadRun(runId);
    if (!run) {
      return null;
    }
    if (run.status !== "queued" && run.status !== "running") {
      return run;
    }
    stopped.add(runId);
    requestedRunStatus.set(runId, "paused");
    const next = withUpdate(run, this.deps.saveRun, {
      status: "paused",
      checkpoint: elapsedCheckpoint(run),
      timeline: [...run.timeline, timeline("Run paused by operator. Budgets and checkpoint were preserved.", { phase: "status" })]
    });
    if (!running.has(runId)) {
      stopped.delete(runId);
      requestedRunStatus.delete(runId);
    }
    return next;
  }

  resume(runId: string) {
    const run = this.deps.loadRun(runId);
    if (!run) {
      return null;
    }
    if (run.status !== "paused" && run.status !== "failed") {
      return run;
    }
    const blockReason = this.resumeBlockReason(run);
    if (blockReason) {
      throw new Error(blockReason);
    }
    const checkpoint = elapsedCheckpoint(run);
    stopped.delete(runId);
    requestedRunStatus.delete(runId);
    const next = withUpdate(run, this.deps.saveRun, {
      status: "queued",
      error: undefined,
      checkpoint: { ...checkpoint, pendingRecovery: undefined, lastResumedAt: nowIso() },
      timeline: [...run.timeline, timeline("Run queued to resume from its durable checkpoint.", { phase: "status" })]
    });
    this.queueExecution(runId);
    return next;
  }

  recover(runId: string, request: AgentRunRecoveryRequest) {
    const run = this.deps.loadRun(runId);
    if (!run) {
      return null;
    }
    const requestedAction = String(request?.action || "") as AgentRunRecoveryAction;
    if (requestedAction === "stop-run") {
      return this.stop(runId);
    }
    if (running.has(runId)) {
      throw new Error("Agent run is still settling its active step. Retry recovery momentarily.");
    }
    const entry = request.entryId
      ? run.timeline.find((item) => item.id === request.entryId)
      : [...run.timeline].reverse().find((item) => item.recoveryActions?.length);
    if (!entry || !entry.recoveryActions?.includes(requestedAction)) {
      throw new Error("The requested recovery action is not available for this run step.");
    }

    if (requestedAction === "draft-finding") {
      const toolName = entry.toolCall?.tool || entry.toolResult?.tool || "agent step";
      const error = entry.toolResult && !entry.toolResult.ok ? entry.toolResult.error : entry.note || "The agent step failed.";
      const evidenceRefs = entry.target?.evidenceId ? [entry.target.evidenceId] : [];
      const draft: AgentFinding = {
        id: createId("agent-finding"),
        createdAt: nowIso(),
        title: `Review failed ${toolName} step`,
        confidence: "low",
        evidenceRefs,
        notes: `Operator-created draft from recovery: ${error}`,
        affectedAssets: entry.target?.browserUrl ? [entry.target.browserUrl] : [],
        reproductionNotes: `Review timeline entry ${entry.id} and retry the bounded ${toolName} operation if appropriate.`,
        severityRationale: "A failed tool step is operational evidence only and does not establish a security impact.",
        remediation: "Resolve the tool or target precondition, then repeat the scoped observation.",
        uncertainties: ["The failed step did not produce complete security evidence."]
      };
      return withUpdate(run, this.deps.saveRun, {
        findings: [...run.findings, draft],
        timeline: [
          ...run.timeline,
          timeline("Operator requested a draft finding from the failed step.", {
            phase: "status",
            target: entry.target
          })
        ]
      });
    }

    const checkpoint = elapsedCheckpoint(run);
    if (requestedAction === "skip-and-continue") {
      stopped.delete(runId);
      requestedRunStatus.delete(runId);
      const next = withUpdate(run, this.deps.saveRun, {
        status: "queued",
        error: undefined,
        checkpoint: { ...checkpoint, pendingRecovery: undefined, lastResumedAt: nowIso() },
        timeline: [
          ...run.timeline,
          timeline(`Skipped failed step ${entry.id} and queued the run to continue.`, {
            phase: "status",
            target: entry.target
          })
        ]
      });
      this.queueExecution(runId);
      return next;
    }

    const entryIndex = run.timeline.findIndex((item) => item.id === entry.id);
    const call =
      entry.toolCall ||
      run.timeline
        .slice(0, entryIndex + 1)
        .reverse()
        .find((item) => item.toolCall && (!entry.toolResult || item.toolCall.tool === entry.toolResult.tool))
        ?.toolCall;
    const capabilityReceipt = entry.capabilityReceiptId
      ? capabilityStateFromRun(run).receipts.find((receipt) => receipt.id === entry.capabilityReceiptId)
      : undefined;
    const capabilityBlockedBeforeDispatch = Boolean(
      capabilityReceipt && capabilityReceipt.decision !== "allowed" && capabilityReceipt.status === "decided"
    );
    if (requestedAction === "retry-tool" && capabilityBlockedBeforeDispatch) {
      const capabilities = capabilityStateFromRun(run);
      const granted = call
        ? capabilities.leases.some(
            (lease) => lease.status === "granted" && lease.tools.includes(call.tool)
          )
        : false;
      if (!granted) {
        const draft = call
          ? capabilities.leases.find(
              (lease) => lease.status === "draft" && lease.tools.includes(call.tool)
            )
          : undefined;
        if (call) {
          return correctUnavailableRetry({
            run,
            entry,
            call,
            recoveryActions: ["skip-and-continue", "stop-run"],
            note: `${capabilityGrantError(call.tool, draft?.name)} The outdated retry option was removed; choose an available recovery action instead.`,
            saveRun: this.deps.saveRun
          });
        }
      }
    }
    if (
      requestedAction === "retry-tool" &&
      call &&
      !isRetryableAgentTool(call) &&
      !capabilityBlockedBeforeDispatch
    ) {
      return correctUnavailableRetry({
        run,
        entry,
        call,
        recoveryActions: recoveryActionsForFailure(call) || [],
        note: `${call.tool} was not retried because its first attempt may have produced effects. The outdated retry option was removed; choose Skip / Continue to re-plan from current evidence, or stop the run.`,
        saveRun: this.deps.saveRun
      });
    }
    if (requestedAction === "retry-tool" && !call) {
      throw new Error("The failed tool call could not be recovered from the transcript.");
    }
    const recoveryCall =
      requestedAction === "retry-with-evidence" &&
      call &&
      !isRetryableAgentTool(call)
        ? undefined
        : call;
    stopped.delete(runId);
    requestedRunStatus.delete(runId);
    const next = withUpdate(run, this.deps.saveRun, {
      status: "queued",
      error: undefined,
      checkpoint: {
        ...checkpoint,
        lastResumedAt: nowIso(),
        pendingRecovery: {
          action: requestedAction,
          entryId: entry.id,
          call: recoveryCall
        }
      },
      timeline: [
        ...run.timeline,
        timeline(
          requestedAction === "retry-with-evidence"
            ? "Queued recovery with a fresh scoped evidence snapshot."
            : `Queued safe retry for ${recoveryCall?.tool || "the failed planner step"}.`,
          { phase: "status", target: entry.target }
        )
      ]
    });
    this.queueExecution(runId);
    return next;
  }

  stopTrafficNow(reason = "Stop Traffic Now") {
    stopAssessmentTraffic();
    return this.revokeAllGrantedLeases(reason);
  }

  stop(runId: string) {
    stopAssessmentTraffic();
    const run = this.deps.loadRun(runId);
    if (!run) {
      return null;
    }
    if (run.status === "completed" || run.status === "stopped") {
      return run;
    }
    stopped.add(runId);
    requestedRunStatus.set(runId, "stopped");
    const mission = applyAgentMissionUpdates(
      missionFromRun(run),
      [{ kind: "mission-status", status: "stopped", stopReason: "Stopped by operator." }],
      nowIso()
    );
    const next = withUpdate(run, this.deps.saveRun, {
      status: "stopped",
      mission,
      capabilities: revokeGrantedAgentCapabilities(
        capabilityStateFromRun(run),
        "Run stopped by operator.",
        nowIso()
      ),
      checkpoint: elapsedCheckpoint(run),
      timeline: [...run.timeline, timeline("Stop requested by operator.", { phase: "status" })]
    });
    if (!running.has(runId)) {
      stopped.delete(runId);
      requestedRunStatus.delete(runId);
    }
    return next;
  }

  steerMission(runId: string, request: AgentMissionSteeringRequest) {
    const run = this.deps.loadRun(runId);
    if (!run) {
      return null;
    }
    if (running.has(runId) || run.status === "running" || run.status === "queued") {
      throw new Error("Pause the run and wait for the active step to settle before steering the mission.");
    }
    if (run.status === "completed" || run.status === "stopped") {
      throw new Error("Completed or stopped mission graphs are read-only.");
    }
    const result = applyAgentMissionSteering(missionFromRun(run), request, nowIso());
    if (!result.ok) {
      throw new Error(result.error);
    }
    const evidenceErrors = validateAgentMissionEvidence(result.mission, runtimeEvidenceCatalog(this.deps));
    if (evidenceErrors.length > 0) {
      throw new Error(`Mission steering failed evidence validation: ${evidenceErrors.join(", ")}`);
    }
    return withUpdate(run, this.deps.saveRun, {
      mission: result.mission,
      status: result.shouldPause ? "paused" : run.status,
      timeline: [
        ...run.timeline,
        timeline(result.summary, {
          phase: "status",
          summary: `Mission graph advanced to revision ${result.mission.revision}`
        })
      ]
    });
  }

  get(runId: string) {
    return this.deps.loadRun(runId);
  }

  list() {
    return this.deps.listRuns();
  }

  private isStopped(runId: string) {
    const persisted = this.deps.loadRun(runId);
    return stopped.has(runId) || persisted?.status === "stopped" || persisted?.status === "paused";
  }

  private callTool(run: AgentRun, counters: RunCounters, call: AgentToolCall, operationId?: string) {
    return runToolCall({
      run,
      counters,
      call,
      operationId,
      deps: this.deps,
      currentAuthFingerprint: () => this.currentAuthFingerprint()
    });
  }

  private execute(runId: string) {
    return executeRunLoop({
      runId,
      deps: this.deps,
      lifecycle: { running, stopped, requestedRunStatus },
      isStopped: (id) => this.isStopped(id),
      callTool: (run, counters, call, operationId) => this.callTool(run, counters, call, operationId),
      waitForSettle: (ms) => this.waitForSettle(ms),
      currentAuthFingerprint: () => this.currentAuthFingerprint()
    });
  }
}

export { DEFAULT_AGENT_POLICY };
