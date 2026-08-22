import {
  defaultAssessmentContract,
  normalizeAssessmentContract,
  normalizeReplayExperimentRequest
} from "../../../shared/agentAssessment.js";
import type { ReplayExperimentRequest, ReplayExperimentResult } from "../../../shared/agentAssessment.js";
import type { CapturedRequest } from "../../../shared/domain.js";
import { createId, nowIso } from "../runtimeClock.js";
import { runVisibleReplayExperiment } from "./replayExperiment.js";
import { assessmentTrafficSignal, delayWithSignal } from "./stopController.js";
import type { VisibleReplayExperimentDeps } from "./replayExperiment.js";

export async function runManualReplayExperiment(input: {
  request: unknown;
  captures: CapturedRequest[];
  allowlist: string[];
  contract?: unknown;
  deps: VisibleReplayExperimentDeps;
}): Promise<ReplayExperimentResult> {
  const request = normalizeReplayExperimentRequest(input.request);
  if (!request) {
    throw new Error("Replay experiment requires a capture, approved family, and matching mutation.");
  }
  const capture = input.captures.find((item) => item.id === request.captureId);
  if (!capture) {
    throw new Error("The source capture was not found in the active session.");
  }
  return runVisibleReplayExperiment({
    request,
    capture,
    contract: normalizeAssessmentContract(input.contract) || defaultAssessmentContract(),
    allowlist: input.allowlist,
    signal: assessmentTrafficSignal(),
    deps: {
      ...input.deps,
      delay: input.deps.delay || delayWithSignal,
      now: input.deps.now || nowIso,
      createId: input.deps.createId || createId
    }
  });
}

export type { ReplayExperimentRequest };
