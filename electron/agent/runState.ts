import type { AgentRun, AgentRunCheckpoint } from "../../shared/agent-types.js";
import { normalizeAgentCapabilityState } from "../../shared/agentCapabilities.js";
import { normalizeAgentMission } from "../../shared/agentMission.js";
import { firstUrlFromText, originFromUrl } from "../../shared/url.js";
import { nowIso } from "./runtimeClock.js";
import type { RunCounters } from "./runtimeTypes.js";

export function normalizedCheckpoint(run: AgentRun): AgentRunCheckpoint {
  const checkpoint = run.checkpoint;
  const startUrl = String(checkpoint?.startUrl || firstUrlFromText(run.goal) || "").trim();
  const lastResumedAt = String(checkpoint?.lastResumedAt || run.updatedAt || run.createdAt || nowIso());
  return {
    startUrl,
    targetOrigin: String(checkpoint?.targetOrigin || (startUrl ? originFromUrl(startUrl) : "")),
    stepCount: Math.max(0, Math.round(Number(checkpoint?.stepCount) || 0)),
    replayCount: Math.max(0, Math.round(Number(checkpoint?.replayCount) || 0)),
    workflowRequestCount: Math.max(0, Math.round(Number(checkpoint?.workflowRequestCount) || 0)),
    probeRequestCount: Math.max(0, Math.round(Number(checkpoint?.probeRequestCount) || 0)),
    elapsedMs: Math.max(0, Math.round(Number(checkpoint?.elapsedMs) || 0)),
    lastResumedAt,
    activeIdentity: String(checkpoint?.activeIdentity || "current").trim().slice(0, 100) || "current",
    pendingCapabilityCall: checkpoint?.pendingCapabilityCall,
    pendingRecovery: checkpoint?.pendingRecovery
  };
}

export function elapsedCheckpoint(run: AgentRun) {
  const checkpoint = normalizedCheckpoint(run);
  if (run.status !== "running") {
    return checkpoint;
  }
  const resumedAt = Date.parse(checkpoint.lastResumedAt);
  const additionalMs = Number.isFinite(resumedAt) ? Math.max(0, Date.now() - resumedAt) : 0;
  return {
    ...checkpoint,
    elapsedMs: checkpoint.elapsedMs + additionalMs,
    lastResumedAt: nowIso()
  };
}

export function countersFromRun(run: AgentRun): RunCounters {
  const checkpoint = normalizedCheckpoint(run);
  return {
    startedAt: Date.now() - checkpoint.elapsedMs,
    startUrl: checkpoint.startUrl,
    targetOrigin: checkpoint.targetOrigin,
    stepCount: checkpoint.stepCount,
    replayCount: checkpoint.replayCount,
    workflowRequestCount: checkpoint.workflowRequestCount,
    probeRequestCount: checkpoint.probeRequestCount || 0,
    activeIdentity: checkpoint.activeIdentity || "current"
  };
}

export function missionFromRun(run: AgentRun) {
  const checkpoint = normalizedCheckpoint(run);
  return normalizeAgentMission(run.mission, run.goal, checkpoint.startUrl, run.createdAt);
}

export function capabilityStateFromRun(run: AgentRun) {
  return normalizeAgentCapabilityState(run.capabilities, run.createdAt);
}

export function checkpointFromCounters(
  counters: RunCounters,
  pendingRecovery?: AgentRunCheckpoint["pendingRecovery"],
  pendingCapabilityCall?: AgentRunCheckpoint["pendingCapabilityCall"]
): AgentRunCheckpoint {
  return {
    startUrl: counters.startUrl,
    targetOrigin: counters.targetOrigin,
    stepCount: counters.stepCount,
    replayCount: counters.replayCount,
    workflowRequestCount: counters.workflowRequestCount,
    probeRequestCount: counters.probeRequestCount,
    elapsedMs: Math.max(0, Date.now() - counters.startedAt),
    lastResumedAt: nowIso(),
    activeIdentity: counters.activeIdentity,
    pendingCapabilityCall,
    pendingRecovery
  };
}


export function withUpdate(run: AgentRun, saveRun: (run: AgentRun) => void, update: Partial<AgentRun>) {
  const next = {
    ...run,
    ...update,
    updatedAt: nowIso()
  };
  saveRun(next);
  return next;
}

