import {
  consumeReservedProbeCost,
  createArmedAssessmentState,
  defaultAssessmentContract,
  experimentRequestCost,
  mutationPayloadBytes,
  normalizeAssessmentContract,
  rankAssessmentCandidates,
  releaseReservedProbeCost,
  remainingProbeBudget,
  reserveProbeCost
} from "../../../shared/agentAssessment.js";
import { normalizeReplayExperimentRequest } from "../../../shared/agentAssessment.js";
import { createId, nowIso } from "../runtimeClock.js";
import type { AgentToolFamilyExecutor } from "./types.js";
import { runVisibleReplayExperiment } from "../assessment/replayExperiment.js";
import { assessmentTrafficSignal, delayWithSignal } from "../assessment/stopController.js";

export const executeAssessmentTool: AgentToolFamilyExecutor = async ({ call, run, counters, deps }) => {
  switch (call.tool) {
    case "getAssessmentCandidates": {
      const contract =
        run.assessment?.contract ||
        normalizeAssessmentContract(defaultAssessmentContract()) ||
        defaultAssessmentContract();
      const covered = (run.assessment?.queue || [])
        .filter((item) => item.status === "completed" && item.classification)
        .map((item) => ({ captureId: item.captureId, family: item.family }));
      return {
        tool: call.tool,
        ok: true,
        data: {
          candidates: rankAssessmentCandidates({
            captures: deps.getCaptures(),
            contract,
            covered
          }),
          remainingProbeRequests: remainingProbeBudget(run.assessment?.ledger || { reserved: 0, consumed: 0, receipts: [] }, contract.maxProbeRequests),
          families: contract.families
        }
      };
    }
    case "getAssessmentProgress":
      return {
        tool: call.tool,
        ok: true,
        data: run.assessment || createArmedAssessmentState(defaultAssessmentContract())
      };
    case "runReplayExperiment": {
      const request = normalizeReplayExperimentRequest(call.input);
      if (!request) {
        throw new Error("runReplayExperiment requires a capture, approved family, and matching mutation.");
      }
      const contract =
        run.assessment?.contract ||
        normalizeAssessmentContract(defaultAssessmentContract()) ||
        defaultAssessmentContract();
      const capture = deps.getCaptures().find((item) => item.id === request.captureId);
      if (!capture) {
        throw new Error("The source capture was not found in the active session.");
      }
      const variantCount = Math.max(1, request.values?.length || 2);
      const cost = experimentRequestCost(variantCount);
      const reserved = reserveProbeCost(
        run.assessment?.ledger || { reserved: 0, consumed: 0, receipts: [] },
        cost,
        contract.maxProbeRequests
      );
      if (!reserved.ok) {
        throw new Error(reserved.reason);
      }
      const experimentId = createId("experiment");
      const authorityLeaseId = run.assessment?.authorityLeaseId;
      const queue = [
        ...(run.assessment?.queue || []),
        {
          id: experimentId,
          family: request.family,
          captureId: request.captureId,
          hypothesis: request.hypothesis,
          status: "running" as const,
          requestCost: cost,
          variantHistoryIds: []
        }
      ];
      run.assessment = {
        contract,
        authorityLeaseId,
        status: "running",
        queue,
        ledger: reserved.ledger,
        currentExperimentId: experimentId
      };
      try {
        const result = await runVisibleReplayExperiment({
          request,
          capture,
          contract,
          allowlist: deps.allowlist(),
          signal: assessmentTrafficSignal(),
          deps: {
            send: (draft, options) => deps.sendReplay({ draft, environmentId: "" }, options),
            getTabState: deps.getReplayTabState,
            setTabState: deps.setReplayTabState,
            delay: delayWithSignal,
            now: nowIso,
            createId
          }
        });
        counters.probeRequestCount += result.requestCost;
        counters.replayCount += result.requestCost;
        const receipts = [
          {
            id: createId("probe"),
            experimentId: result.experimentId,
            family: result.family,
            sourceCaptureId: result.sourceCaptureId,
            origin: new URL(capture.url).origin,
            method: capture.method.toUpperCase(),
            path: capture.path,
            identity: request.identity || contract.identity,
            role: "baseline" as const,
            payloadBytes: 0,
            historyId: result.baselineHistoryId,
            createdAt: nowIso()
          },
          ...result.variants.map((variant) => ({
            id: createId("probe"),
            experimentId: result.experimentId,
            family: result.family,
            sourceCaptureId: result.sourceCaptureId,
            origin: new URL(capture.url).origin,
            method: variant.draft.method,
            path: new URL(variant.draft.url).pathname,
            identity: request.identity || contract.identity,
            role: "variant" as const,
            payloadBytes: mutationPayloadBytes(variant.mutation.mutation),
            historyId: variant.historyId,
            createdAt: nowIso()
          }))
        ];
        run.assessment = {
          contract,
          authorityLeaseId,
          status: "armed",
          currentExperimentId: undefined,
          queue: queue.map((item) =>
            item.id === experimentId
              ? {
                  ...item,
                  id: result.experimentId,
                  status: result.stopReason ? "ambiguous" : "completed",
                  classification: result.classification,
                  requestCost: result.requestCost,
                  tabId: result.tabId,
                  baselineHistoryId: result.baselineHistoryId,
                  variantHistoryIds: result.variants.map((variant) => variant.historyId),
                  skipReason: result.stopReason
                }
              : item
          ),
          ledger: consumeReservedProbeCost(reserved.ledger, result.requestCost, receipts)
        };
        return { tool: call.tool, ok: true, data: result };
      } catch (error) {
        run.assessment = {
          contract,
          authorityLeaseId,
          status: "armed",
          currentExperimentId: undefined,
          queue: queue.map((item) =>
            item.id === experimentId
              ? {
                  ...item,
                  status: "blocked",
                  skipReason: error instanceof Error ? error.message : "Experiment failed."
                }
              : item
          ),
          ledger: releaseReservedProbeCost(reserved.ledger, cost)
        };
        throw error;
      }
    }
    default:
      return null;
  }
};
