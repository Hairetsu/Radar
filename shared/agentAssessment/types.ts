import type { ReplayDiffSummary } from "../replayDiff.js";
import type { ReplayDraft, ReplayResult } from "../domain.js";

export type ProbeFamilyId =
  | "cors-origin"
  | "reflection-context"
  | "injection-signal"
  | "authorization-omission"
  | "resource-id";

export type AssessmentAuthorityLevel =
  | "observe"
  | "read-only-probes"
  | "approved-active-probes"
  | "manual-only";

export type EndpointImpact = "read-only" | "authentication" | "state-changing" | "unknown";

export type ExperimentClassification =
  | "negative"
  | "inconclusive"
  | "supported"
  | "verification-required";

export type EncodingStep = "url" | "json-escape" | "base64" | "case-variation";

export type ProbeMutation =
  | { kind: "replace-query"; name: string; value: string; encoding?: EncodingStep[] }
  | { kind: "remove-query"; name: string }
  | { kind: "append-query"; name: string; value: string; encoding?: EncodingStep[] }
  | { kind: "replace-json"; path: string; value: string; encoding?: EncodingStep[] }
  | { kind: "replace-form"; name: string; value: string; encoding?: EncodingStep[] }
  | { kind: "replace-header"; name: string; value: string; encoding?: EncodingStep[] }
  | { kind: "replace-cookie"; name: string; value: string; encoding?: EncodingStep[] }
  | { kind: "replace-path-segment"; index: number; value: string; encoding?: EncodingStep[] }
  | { kind: "remove-authorization" }
  | { kind: "set-origin"; value: string }
  | { kind: "set-host"; value: string }
  | { kind: "set-method"; value: string };

export type ProbeFamilyDefinition = {
  id: ProbeFamilyId;
  label: string;
  minimumAuthority: AssessmentAuthorityLevel;
  allowedMutationKinds: ProbeMutation["kind"][];
  allowedMethods: string[];
  maxVariants: number;
  requestCostPerVariant: 1;
};

export type AssessmentContract = {
  version: 1;
  authorityLevel: AssessmentAuthorityLevel;
  families: ProbeFamilyId[];
  includedPathPrefixes: string[];
  excludedPathPrefixes: string[];
  evidenceSeedCaptureIds: string[];
  identity: string;
  maxProbeRequests: number;
  maxRequestsPerOrigin: number;
  delayMs: number;
  timeoutMs: number;
  maxRuntimeMs: number;
  maxConcurrency: 1;
  maxPayloadBytes: number;
  allowRawContext: boolean;
  externalInteraction: "none";
};

export type AppliedProbeMutation = {
  mutation: ProbeMutation;
  originalValueHash: string;
  payload: string;
  payloadSource: "family-template" | "reviewed-value";
};

export type ProbeReceipt = {
  id: string;
  experimentId: string;
  family: ProbeFamilyId;
  sourceCaptureId: string;
  origin: string;
  method: string;
  path: string;
  identity: string;
  role: "baseline" | "variant";
  payloadBytes: number;
  historyId: string;
  createdAt: string;
};

export type ProbeLedger = {
  reserved: number;
  consumed: number;
  receipts: ProbeReceipt[];
};

export type AssessmentCandidate = {
  captureId: string;
  origin: string;
  method: string;
  path: string;
  endpointImpact: EndpointImpact;
  identity: string;
  parameterNames: string[];
  applicableFamilies: ProbeFamilyId[];
  priorCoverage: ProbeFamilyId[];
  rank: number;
};

export type ExperimentVariantRecord = {
  mutation: AppliedProbeMutation;
  draft: ReplayDraft;
  result: ReplayResult;
  historyId: string;
  comparison: ReplayDiffSummary;
};

export type ReplayExperimentResult = {
  experimentId: string;
  family: ProbeFamilyId;
  hypothesis: string;
  sourceCaptureId: string;
  tabId: string;
  endpointImpact: EndpointImpact;
  classification: ExperimentClassification;
  rationale: string;
  requestCost: number;
  baselineHistoryId: string;
  variants: ExperimentVariantRecord[];
  stopReason?: string;
};

export type AssessmentExperimentSummary = {
  id: string;
  family: ProbeFamilyId;
  captureId: string;
  hypothesis: string;
  status: "queued" | "running" | "completed" | "skipped" | "blocked" | "ambiguous";
  classification?: ExperimentClassification;
  requestCost: number;
  tabId?: string;
  baselineHistoryId?: string;
  variantHistoryIds: string[];
  skipReason?: string;
};

export type AgentAssessmentState = {
  contract: AssessmentContract;
  status: "draft" | "armed" | "running" | "paused" | "stopped" | "completed";
  queue: AssessmentExperimentSummary[];
  ledger: ProbeLedger;
  currentExperimentId?: string;
  stopReason?: string;
};

export type ReplayExperimentRequest = {
  captureId: string;
  family: ProbeFamilyId;
  hypothesis: string;
  location: ProbeMutation;
  values?: string[];
  encoding?: EncodingStep[];
  tabId?: string;
  identity?: string;
};
