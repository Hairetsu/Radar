import { isAllowedTarget } from "../../../shared/allowlist.js";
import {
  applyProbeMutation,
  classifyEndpointImpact,
  classifyReplayExperiment,
  contractAllowsFamily,
  contractAllowsPath,
  experimentRequestCost,
  familyAllowsMethod,
  familyAllowsMutation,
  impactAllowsReadOnlyProbes,
  originStayedFixed,
  originalValueHash,
  variantMutationsForFamily
} from "../../../shared/agentAssessment.js";
import type {
  AppliedProbeMutation,
  AssessmentContract,
  ExperimentVariantRecord,
  ProbeMutation,
  ReplayExperimentRequest,
  ReplayExperimentResult
} from "../../../shared/agentAssessment.js";
import { normalizeDraft } from "../../../shared/draft.js";
import type { CapturedRequest, ReplayDraft, ReplayResult, ReplayTabState } from "../../../shared/domain.js";
import { diffReplayResults } from "../../../shared/replayDiff.js";
import { appendReplayHistory, createReplayTab, normalizeReplayTabState } from "../../../shared/replayTabs.js";
import { originFromUrl } from "../../../shared/url.js";

export type VisibleReplayExperimentDeps = {
  send: (draft: ReplayDraft, options?: { timeoutMs?: number; signal?: AbortSignal }) => Promise<ReplayResult>;
  getTabState: () => ReplayTabState;
  setTabState: (state: ReplayTabState) => ReplayTabState;
  delay: (ms: number, signal?: AbortSignal) => Promise<void>;
  now: () => string;
  createId: (prefix: string) => string;
};

function draftFromCapture(capture: CapturedRequest): ReplayDraft {
  return normalizeDraft({
    method: capture.method,
    url: capture.url,
    headers: capture.requestHeaders,
    body: capture.requestBody
  });
}

function mutationPayload(mutation: ProbeMutation) {
  return "value" in mutation ? mutation.value : mutation.kind;
}

export async function runVisibleReplayExperiment(input: {
  request: ReplayExperimentRequest;
  capture: CapturedRequest;
  contract: AssessmentContract;
  allowlist: string[];
  deps: VisibleReplayExperimentDeps;
  signal?: AbortSignal;
}): Promise<ReplayExperimentResult> {
  const { request, capture, contract, allowlist, deps, signal } = input;
  if (signal?.aborted) {
    throw new Error("Stop Traffic Now aborted the experiment before dispatch.");
  }
  if (!capture.allowed || !isAllowedTarget(capture.url, allowlist)) {
    throw new Error("The source capture is outside saved Scope.");
  }
  if (!contractAllowsPath(contract, capture.path)) {
    throw new Error("The source capture path is outside the assessment contract.");
  }
  if (!contractAllowsFamily(contract, request.family)) {
    throw new Error(`Probe family ${request.family} is not in the approved assessment contract.`);
  }
  const impact = classifyEndpointImpact({ method: capture.method, path: capture.path });
  if (!impactAllowsReadOnlyProbes(impact)) {
    throw new Error(`Endpoint impact ${impact} is not autonomous under a read-only contract.`);
  }
  if (!familyAllowsMethod(request.family, capture.method) && request.family !== "cors-origin") {
    throw new Error(`Family ${request.family} does not allow ${capture.method}.`);
  }
  if (!familyAllowsMutation(request.family, request.location)) {
    throw new Error(`Family ${request.family} does not allow ${request.location.kind}.`);
  }

  const baselineDraft = draftFromCapture(capture);
  const mutations = variantMutationsForFamily({
    family: request.family,
    location: request.location,
    values: request.values,
    expectedOrigin: originFromUrl(capture.url),
    canaryId: deps.createId("canary").slice(-8),
    encoding: request.encoding
  });
  if (mutations.length === 0) {
    throw new Error("The selected family produced no approved mutations.");
  }

  const current = deps.getTabState();
  const existing = request.tabId ? current.tabs.find((tab) => tab.id === request.tabId) : undefined;
  const tab = existing || createReplayTab(request.hypothesis.slice(0, 40) || request.family, baselineDraft);
  let tabState = normalizeReplayTabState({
    tabs: existing ? current.tabs : [...current.tabs, tab],
    activeTabId: tab.id
  });
  deps.setTabState(tabState);

  const experimentId = deps.createId("experiment");
  const timeoutMs = contract.timeoutMs;
  const sendOne = async (draft: ReplayDraft) => {
    if (signal?.aborted) {
      throw new Error("Stop Traffic Now aborted an in-flight experiment.");
    }
    if (!isAllowedTarget(draft.url, allowlist)) {
      throw new Error(`Blocked out-of-scope replay URL: ${draft.url}`);
    }
    return deps.send(draft, { timeoutMs, signal });
  };

  const baselineResult = await sendOne(baselineDraft);
  const baselineTab = tabState.tabs.find((item) => item.id === tab.id) || tab;
  const withBaseline = appendReplayHistory(baselineTab, baselineDraft, baselineResult, deps.now());
  const baselineHistoryId = withBaseline.history[0]?.id || "";
  tabState = normalizeReplayTabState({
    ...tabState,
    tabs: tabState.tabs.map((item) => (item.id === withBaseline.id ? withBaseline : item)),
    activeTabId: withBaseline.id
  });
  deps.setTabState(tabState);
  await deps.delay(contract.delayMs, signal);

  const variants: ExperimentVariantRecord[] = [];
  for (const mutation of mutations) {
    if (signal?.aborted) {
      break;
    }
    const variantDraft = applyProbeMutation(baselineDraft, mutation);
    if (!originStayedFixed(baselineDraft, variantDraft)) {
      throw new Error("Mutation attempted to change the request origin.");
    }
    if (mutation.kind === "set-method" && mutation.value.toUpperCase() === "DELETE") {
      throw new Error("Assessment experiments cannot send DELETE.");
    }
    const result = await sendOne(variantDraft);
    const active = tabState.tabs.find((item) => item.id === tab.id) || withBaseline;
    const nextTab = appendReplayHistory(active, variantDraft, result, deps.now());
    const historyId = nextTab.history[0]?.id || "";
    tabState = normalizeReplayTabState({
      ...tabState,
      tabs: tabState.tabs.map((item) => (item.id === nextTab.id ? nextTab : item)),
      activeTabId: nextTab.id
    });
    deps.setTabState(tabState);
    const applied: AppliedProbeMutation = {
      mutation,
      originalValueHash: originalValueHash(baselineDraft, mutation),
      payload: mutationPayload(mutation),
      payloadSource: request.values && request.values.length > 0 ? "reviewed-value" : "family-template"
    };
    variants.push({
      mutation: applied,
      draft: variantDraft,
      result,
      historyId,
      comparison: diffReplayResults(baselineResult, result)
    });
    await deps.delay(contract.delayMs, signal);
  }

  const classification = classifyReplayExperiment({
    family: request.family,
    baselineStatus: baselineResult.status,
    baselineBody: baselineResult.body,
    variants: variants.map((variant) => ({
      payload: variant.mutation.payload,
      status: variant.result.status,
      body: variant.result.body,
      headers: variant.result.headers,
      comparison: variant.comparison
    }))
  });

  return {
    experimentId,
    family: request.family,
    hypothesis: request.hypothesis,
    sourceCaptureId: capture.id,
    tabId: tab.id,
    endpointImpact: impact,
    classification: classification.classification,
    rationale: classification.rationale,
    requestCost: experimentRequestCost(variants.length),
    baselineHistoryId,
    variants,
    ...(signal?.aborted ? { stopReason: "Stop Traffic Now" } : {})
  };
}
