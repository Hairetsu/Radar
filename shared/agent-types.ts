import type {
  BrowserState,
  AutomatePayloadSet,
  AutomateRule,
  AutomateSession,
  CapturedRequest,
  Finding,
  InstalledPlugin,
  InterceptQueueItem,
  InterceptResponseDraft,
  ProjectNote,
  ReplayDraft,
  ReplayResult,
  ReplayTabState,
  SavedView,
  WorkflowDefinition,
  WorkflowRun
} from "./domain.js";
import type { AdvancedTestingSummary } from "./advancedTesting.js";
import type { IdentityActivationRecord, IdentityProfile } from "./identityProfiles.js";

export type AppMode = "manual-first" | "ai-first";

export type AgentWorkbenchView =
  | "traffic"
  | "websocket"
  | "intercept"
  | "repeater"
  | "automate"
  | "findings"
  | "workflows"
  | "plugins"
  | "advanced"
  | "sitemap"
  | "scope"
  | "ssl";

export type AgentRunStatus = "queued" | "running" | "paused" | "stopped" | "completed" | "failed";

export type AgentTutorialStage = "orient" | "observe" | "hypothesize" | "validate" | "triage" | "report";

export type AgentTutorialDisposition =
  | "learning-clue"
  | "local-hardening"
  | "vendor-report"
  | "cve-review";

export type AgentTutorialCveReadiness = {
  product: string;
  affectedVersions: string[];
  securityImpact: string;
  deploymentScope: string;
  reproducibility: string;
};

export type AgentTutorialGuidance = {
  stage: AgentTutorialStage;
  title: string;
  clue: string;
  whyItMatters: string;
  lookFor: string[];
  strongerEvidence: string[];
  falsifiers: string[];
  safeNextStep: string;
  disposition: AgentTutorialDisposition;
  dispositionRationale: string;
  evidenceRefs: string[];
  cveReadiness?: AgentTutorialCveReadiness;
};

export type AgentRunRecoveryAction =
  | "retry-tool"
  | "retry-with-evidence"
  | "skip-and-continue"
  | "stop-run"
  | "draft-finding";

export type AgentRunProfileId =
  | "browser-assessment"
  | "passive-map"
  | "auth-review"
  | "api-hardening"
  | "header-cookie-review"
  | "advanced-api-review"
  | "report-from-evidence";

export type AgentToolName =
  | "showView"
  | "getBrowserState"
  | "openBrowser"
  | "navigateBrowser"
  | "getCaptures"
  | "getInterceptQueue"
  | "prepareInterceptEdit"
  | "sendReplay"
  | "waitForNetworkIdle"
  | "getPageText"
  | "getDomSummary"
  | "getClickableElements"
  | "clickElement"
  | "fillInput"
  | "submitForm"
  | "getCookies"
  | "getStorageState"
  | "saveAuthState"
  | "loadAuthState"
  | "listAuthStates"
  | "compareAuthStates"
  | "getIdentityLabContext"
  | "activateIdentityProfile"
  | "verifyIdentityProfile"
  | "analyzeSecurityHeaders"
  | "analyzeCookieFlags"
  | "checkCorsPolicy"
  | "getSitemapCoverage"
  | "prepareTrafficQuery"
  | "getReplayContext"
  | "prepareReplayTab"
  | "compareReplayResults"
  | "getAutomateContext"
  | "prepareAutomateDraft"
  | "analyzeAutomateResults"
  | "getWorkflowCatalog"
  | "getAgentContextSummary"
  | "runWorkflow"
  | "prepareWorkflowDraft"
  | "getPluginInventory"
  | "getAdvancedTestingSummary"
  | "proposeRunMemory";

export type AgentClickableElement = {
  selector: string;
  text: string;
  tag: string;
  role: string;
  href?: string;
  name?: string;
  placeholder?: string;
  disabled?: boolean;
};

export type AgentCookie = {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  expires?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: string;
};

export type AgentStorageState = {
  url: string;
  origin: string;
  cookies: AgentCookie[];
  localStorage: Record<string, string>;
  sessionStorage: Record<string, string>;
};

export type AgentAuthStateSummary = {
  name: string;
  origin: string;
  createdAt: string;
  cookieCount: number;
  localStorageKeys: string[];
  sessionStorageKeys: string[];
};

export type AgentEvidenceObservation = {
  captureId?: string;
  url?: string;
  name: string;
  value?: string;
  issue: string;
  severity: "info" | "low" | "medium" | "high";
};

export type AgentPluginInventoryItem = {
  id: string;
  name: string;
  version: string;
  status: InstalledPlugin["status"];
  requestedPermissions: string[];
  grantedPermissions: string[];
  panels: Array<{ id: string; title: string }>;
  warningCount: number;
};

export type AgentCapturedTrafficContext = {
  id: string;
  method: string;
  url: string;
  status: number | null;
  statusText: string;
  type: string;
  mimeType: string;
  source: CapturedRequest["source"];
  requestHeaders: Record<string, string>;
  responseHeaders: Record<string, string>;
  requestBodyPreview: string;
  responseBodyPreview: string;
  agentRunId?: string;
  navigationId?: string;
  frameUrl?: string;
  initiator?: string;
};

export type AgentToolCall =
  | { tool: "showView"; input: { view: AgentWorkbenchView; reason: string } }
  | { tool: "getBrowserState"; input: Record<string, never> }
  | { tool: "openBrowser"; input: { url: string } }
  | { tool: "navigateBrowser"; input: { url: string } }
  | { tool: "getCaptures"; input: { limit?: number; targetOrigin?: string } }
  | { tool: "getInterceptQueue"; input: { limit?: number } }
  | {
      tool: "prepareInterceptEdit";
      input: { id: string; draft?: ReplayDraft; response?: InterceptResponseDraft; note?: string };
    }
  | { tool: "sendReplay"; input: { draft: ReplayDraft } }
  | { tool: "waitForNetworkIdle"; input: { idleMs?: number; timeoutMs?: number } }
  | { tool: "getPageText"; input: Record<string, never> }
  | { tool: "getDomSummary"; input: Record<string, never> }
  | { tool: "getClickableElements"; input: Record<string, never> }
  | { tool: "clickElement"; input: { selector: string } }
  | { tool: "fillInput"; input: { selector: string; value: string } }
  | { tool: "submitForm"; input: { selector: string } }
  | { tool: "getCookies"; input: Record<string, never> }
  | { tool: "getStorageState"; input: Record<string, never> }
  | { tool: "saveAuthState"; input: { name: string } }
  | { tool: "loadAuthState"; input: { name: string } }
  | { tool: "listAuthStates"; input: Record<string, never> }
  | { tool: "compareAuthStates"; input: { left: string; right: string } }
  | { tool: "getIdentityLabContext"; input: Record<string, never> }
  | { tool: "activateIdentityProfile"; input: { identityId: string } }
  | { tool: "verifyIdentityProfile"; input: { identityId: string } }
  | { tool: "analyzeSecurityHeaders"; input: { targetOrigin?: string } }
  | { tool: "analyzeCookieFlags"; input: { targetOrigin?: string } }
  | { tool: "checkCorsPolicy"; input: { targetOrigin?: string } }
  | { tool: "getSitemapCoverage"; input: { limit?: number } }
  | { tool: "prepareTrafficQuery"; input: { query: string; reason: string } }
  | { tool: "getReplayContext"; input: Record<string, never> }
  | { tool: "prepareReplayTab"; input: { name?: string; draft: ReplayDraft; environmentId?: string; note?: string } }
  | { tool: "compareReplayResults"; input: { leftHistoryId: string; rightHistoryId: string; tabId?: string } }
  | { tool: "getAutomateContext"; input: Record<string, never> }
  | {
      tool: "prepareAutomateDraft";
      input: {
        draft: ReplayDraft;
        payloads: string[];
        rules?: AutomateRule[];
        name?: string;
        environmentId?: string;
        note?: string;
      };
    }
  | { tool: "analyzeAutomateResults"; input: { sessionId?: string } }
  | { tool: "getWorkflowCatalog"; input: Record<string, never> }
  | { tool: "getAgentContextSummary"; input: Record<string, never> }
  | { tool: "runWorkflow"; input: { workflowId: string; inputs?: Record<string, string> } }
  | { tool: "prepareWorkflowDraft"; input: { workflow: WorkflowDefinition; note?: string } }
  | { tool: "getPluginInventory"; input: Record<string, never> }
  | { tool: "getAdvancedTestingSummary"; input: Record<string, never> }
  | {
      tool: "proposeRunMemory";
      input: {
        kind: AgentRunMemoryKind;
        title: string;
        notes: string;
        evidenceRefs?: string[];
        dismissedReason?: string;
        retestState?: AgentRunMemoryRetestState;
      };
    };

export type AgentToolResult =
  | { tool: "showView"; ok: true; data: { view: AgentWorkbenchView } }
  | { tool: "getBrowserState"; ok: true; data: BrowserState }
  | { tool: "openBrowser"; ok: true; data: BrowserState }
  | { tool: "navigateBrowser"; ok: true; data: BrowserState }
  | { tool: "getCaptures"; ok: true; data: { captures: CapturedRequest[] } }
  | { tool: "getInterceptQueue"; ok: true; data: { queue: InterceptQueueItem[] } }
  | {
      tool: "prepareInterceptEdit";
      ok: true;
      data: { item: InterceptQueueItem; draft?: ReplayDraft; response?: InterceptResponseDraft; note: string };
    }
  | { tool: "sendReplay"; ok: true; data: ReplayResult }
  | { tool: "waitForNetworkIdle"; ok: true; data: { idle: boolean; waitedMs: number } }
  | { tool: "getPageText"; ok: true; data: { url: string; title: string; text: string } }
  | {
      tool: "getDomSummary";
      ok: true;
      data: {
        url: string;
        title: string;
        text: string;
        ariaSnapshot: string;
        links: Array<{ text: string; href: string }>;
        buttons: string[];
        forms: Array<{ action: string; method: string; inputs: string[] }>;
      };
    }
  | { tool: "getClickableElements"; ok: true; data: { url: string; elements: AgentClickableElement[] } }
  | { tool: "clickElement"; ok: true; data: { clicked: boolean; selector: string; url: string } }
  | { tool: "fillInput"; ok: true; data: { filled: boolean; selector: string } }
  | { tool: "submitForm"; ok: true; data: { submitted: boolean; selector: string; url: string } }
  | { tool: "getCookies"; ok: true; data: { cookies: AgentCookie[] } }
  | { tool: "getStorageState"; ok: true; data: AgentStorageState }
  | { tool: "saveAuthState"; ok: true; data: AgentAuthStateSummary }
  | { tool: "loadAuthState"; ok: true; data: AgentAuthStateSummary }
  | { tool: "listAuthStates"; ok: true; data: { states: AgentAuthStateSummary[] } }
  | { tool: "compareAuthStates"; ok: true; data: { left: string; right: string; observations: AgentEvidenceObservation[] } }
  | {
      tool: "getIdentityLabContext";
      ok: true;
      data: {
        identities: IdentityProfile[];
        activeIdentityId?: string;
        activeActivationId?: string;
        attributedCaptureCount: number;
      };
    }
  | {
      tool: "activateIdentityProfile";
      ok: true;
      data: { identity: IdentityProfile; activation: IdentityActivationRecord; url: string };
    }
  | { tool: "verifyIdentityProfile"; ok: true; data: { identity: IdentityProfile; url: string } }
  | { tool: "analyzeSecurityHeaders"; ok: true; data: { observations: AgentEvidenceObservation[] } }
  | { tool: "analyzeCookieFlags"; ok: true; data: { observations: AgentEvidenceObservation[] } }
  | { tool: "checkCorsPolicy"; ok: true; data: { observations: AgentEvidenceObservation[] } }
  | {
      tool: "getSitemapCoverage";
      ok: true;
      data: {
        hostCount: number;
        endpointCount: number;
        hosts: Array<{ host: string; requestCount: number; paths: string[] }>;
        suggestedQueries: string[];
      };
    }
  | { tool: "prepareTrafficQuery"; ok: true; data: { query: string; reason: string } }
  | {
      tool: "getReplayContext";
      ok: true;
      data: {
        tabState: ReplayTabState;
        environments: Array<{ id: string; name: string; variableCount: number }>;
        collections: Array<{ id: string; name: string; itemCount: number }>;
      };
    }
  | {
      tool: "prepareReplayTab";
      ok: true;
      data: { tabId: string; name: string; draft: ReplayDraft; environmentId: string; note: string };
    }
  | {
      tool: "compareReplayResults";
      ok: true;
      data: {
        statusChanged: boolean;
        statusBefore: number;
        statusAfter: number;
        latencyDeltaMs: number;
        bodyLengthDelta: number;
        identical: boolean;
      };
    }
  | {
      tool: "getAutomateContext";
      ok: true;
      data: {
        payloadSets: Array<Pick<AutomatePayloadSet, "id" | "name" | "source"> & { payloadCount: number; wordlistPath?: string }>;
        sessions: Array<{
          id: string;
          name: string;
          status: AutomateSession["status"];
          payloadCount: number;
          resultCount: number;
          clusterCount: number;
          matchCount: number;
          updatedAt: string;
        }>;
      };
    }
  | {
      tool: "prepareAutomateDraft";
      ok: true;
      data: {
        draft: ReplayDraft;
        payloads: string[];
        rules: AutomateRule[];
        name: string;
        environmentId: string;
        note: string;
      };
    }
  | {
      tool: "analyzeAutomateResults";
      ok: true;
      data: {
        sessionId: string;
        status: AutomateSession["status"];
        resultCount: number;
        failures: number;
        matches: number;
        clusters: AutomateSession["clusters"];
        outlierResultIds: string[];
      };
    }
  | {
      tool: "getWorkflowCatalog";
      ok: true;
      data: {
        workflows: Pick<WorkflowDefinition, "id" | "name" | "description" | "mode" | "inputs" | "scope" | "steps">[];
        recentRuns: Array<Pick<WorkflowRun, "id" | "workflowId" | "workflowName" | "status" | "mode" | "actionCount" | "startedAt"> & { resultCount: number }>;
      };
    }
  | { tool: "getAgentContextSummary"; ok: true; data: AgentContextSummary }
  | { tool: "getPluginInventory"; ok: true; data: { plugins: AgentPluginInventoryItem[] } }
  | { tool: "getAdvancedTestingSummary"; ok: true; data: AdvancedTestingSummary }
  | { tool: "runWorkflow"; ok: true; data: WorkflowRun }
  | { tool: "prepareWorkflowDraft"; ok: true; data: { workflow: WorkflowDefinition; note: string } }
  | { tool: "proposeRunMemory"; ok: true; data: { memory: AgentRunMemoryEntry; note: string } }
  | { tool: AgentToolName; ok: false; error: string };

export type AgentDecisionFinding = {
  title: string;
  confidence: "low" | "medium" | "high";
  evidenceRefs: string[];
  notes: string;
  affectedAssets?: string[];
  reproductionNotes?: string;
  severityRationale?: string;
  remediation?: string;
  uncertainties?: string[];
};

export type AgentMissionStatus = "active" | "awaiting-operator" | "completed" | "stopped";
export type AgentMissionPriority = 1 | 2 | 3 | 4 | 5;
export type AgentObjectiveStatus = "planned" | "active" | "blocked" | "completed" | "dismissed";
export type AgentHypothesisStatus = "open" | "testing" | "supported" | "rejected" | "blocked" | "stale";
export type AgentExperimentStatus = "planned" | "running" | "passed" | "failed" | "blocked" | "skipped";
export type AgentClaimStatus = "lead" | "supported" | "contradicted" | "verified";
export type AgentCoverageStatus = "untested" | "planned" | "testing" | "covered" | "blocked";
export type AgentCoverageDimension = "host" | "endpoint" | "identity" | "state" | "control";

export type AgentMissionObjective = {
  id: string;
  title: string;
  description: string;
  status: AgentObjectiveStatus;
  priority: AgentMissionPriority;
  createdAt: string;
  updatedAt: string;
};

export type AgentMissionHypothesis = {
  id: string;
  objectiveId?: string;
  statement: string;
  rationale: string;
  status: AgentHypothesisStatus;
  priority: AgentMissionPriority;
  pinned: boolean;
  evidenceRefs: string[];
  createdAt: string;
  updatedAt: string;
};

export type AgentMissionExperiment = {
  id: string;
  hypothesisId?: string;
  title: string;
  method: string;
  expectedObservation: string;
  status: AgentExperimentStatus;
  evidenceRefs: string[];
  createdAt: string;
  updatedAt: string;
};

export type AgentMissionClaim = {
  id: string;
  hypothesisId?: string;
  statement: string;
  status: AgentClaimStatus;
  confidence: "low" | "medium" | "high";
  evidenceRefs: string[];
  createdAt: string;
  updatedAt: string;
};

export type AgentMissionCoverageCell = {
  id: string;
  dimension: AgentCoverageDimension;
  label: string;
  status: AgentCoverageStatus;
  evidenceRefs: string[];
  createdAt: string;
  updatedAt: string;
};

export type AgentMissionOperatorQuestion = {
  id: string;
  prompt: string;
  status: "open" | "answered" | "dismissed";
  answer?: string;
  createdAt: string;
  updatedAt: string;
};

export type AgentMission = {
  version: 1;
  revision: number;
  goal: string;
  status: AgentMissionStatus;
  createdAt: string;
  updatedAt: string;
  stopReason?: string;
  objectives: AgentMissionObjective[];
  hypotheses: AgentMissionHypothesis[];
  experiments: AgentMissionExperiment[];
  claims: AgentMissionClaim[];
  coverage: AgentMissionCoverageCell[];
  operatorQuestions: AgentMissionOperatorQuestion[];
};

export type AgentMissionUpdate =
  | {
      kind: "objective";
      id?: string;
      title: string;
      description?: string;
      status?: AgentObjectiveStatus;
      priority?: AgentMissionPriority;
    }
  | {
      kind: "hypothesis";
      id?: string;
      objectiveId?: string;
      statement: string;
      rationale?: string;
      status?: AgentHypothesisStatus;
      priority?: AgentMissionPriority;
      evidenceRefs?: string[];
    }
  | {
      kind: "experiment";
      id?: string;
      hypothesisId?: string;
      title: string;
      method?: string;
      expectedObservation?: string;
      status?: AgentExperimentStatus;
      evidenceRefs?: string[];
    }
  | {
      kind: "claim";
      id?: string;
      hypothesisId?: string;
      statement: string;
      status?: AgentClaimStatus;
      confidence?: "low" | "medium" | "high";
      evidenceRefs?: string[];
    }
  | {
      kind: "coverage";
      id?: string;
      dimension: AgentCoverageDimension;
      label: string;
      status?: AgentCoverageStatus;
      evidenceRefs?: string[];
    }
  | { kind: "operator-question"; id?: string; prompt: string }
  | { kind: "mission-status"; status: AgentMissionStatus; stopReason?: string };

export type AgentMissionPatch = {
  baseRevision: number;
  updates: AgentMissionUpdate[];
};

export type AgentMissionEntityKind = "objective" | "hypothesis" | "experiment" | "claim" | "coverage";

export type AgentMissionSteeringAction =
  | { action: "add-objective"; title: string; description?: string; priority?: AgentMissionPriority }
  | {
      action: "add-hypothesis";
      statement: string;
      rationale?: string;
      objectiveId?: string;
      priority?: AgentMissionPriority;
    }
  | {
      action: "update-item";
      entity: AgentMissionEntityKind;
      id: string;
      status?: AgentObjectiveStatus | AgentHypothesisStatus | AgentExperimentStatus | AgentClaimStatus | AgentCoverageStatus;
      priority?: AgentMissionPriority;
      pinned?: boolean;
    }
  | { action: "ask-operator"; prompt: string }
  | { action: "answer-operator"; questionId: string; answer: string }
  | { action: "dismiss-operator"; questionId: string };

export type AgentMissionSteeringRequest = { expectedRevision: number } & AgentMissionSteeringAction;

export type AgentDecision =
  | {
      action: "tool";
      call: AgentToolCall;
      rationale?: string;
      tutorial?: AgentTutorialGuidance;
      missionPatch?: AgentMissionPatch;
      leaseRequest?: AgentCapabilityLeaseRequest;
    }
  | {
      action: "finish";
      rationale?: string;
      findings?: AgentDecisionFinding[];
      tutorial?: AgentTutorialGuidance;
      missionPatch?: AgentMissionPatch;
    };

export type AgentReconWorkerStatus = "completed" | "failed";

export type AgentReconWorkerReport = {
  id: string;
  focus: string;
  label: string;
  status: AgentReconWorkerStatus;
  summary: string;
  observations: string[];
  evidenceRefs: string[];
  gaps: string[];
  startedAt: string;
  completedAt: string;
  error?: string;
};

export type AgentDecisionContext = {
  goal: string;
  startUrl: string;
  targetOrigin: string;
  allowlist: string[];
  browserState: BrowserState;
  policy: AgentPolicy;
  profile: AgentRunProfileId;
  stepCount: number;
  replayCount: number;
  workflowRequestCount: number;
  availableTools: AgentToolName[];
  capturedTraffic: AgentCapturedTrafficContext[];
  contextSummary: AgentContextSummary;
  runMemory: AgentRunMemoryEntry[];
  mission: AgentMission;
  capabilities: AgentCapabilityState;
  reconReports?: AgentReconWorkerReport[];
  tutorialMode: boolean;
  timeline: AgentTimelineEntry[];
};

export type AgentTimelineEntry = {
  id: string;
  createdAt: string;
  note?: string;
  phase?: "status" | "recon" | "decision" | "tool-call" | "tool-result" | "policy-block" | "failure";
  summary?: string;
  target?: {
    view?: AgentWorkbenchView;
    evidenceId?: string;
    browserUrl?: string;
    control?: string;
  };
  recoveryActions?: AgentRunRecoveryAction[];
  capabilityReceiptId?: string;
  actionId?: string;
  identityId?: string;
  tutorial?: AgentTutorialGuidance;
  reconReport?: AgentReconWorkerReport;
  toolCall?: AgentToolCall;
  toolResult?: AgentToolResult;
};

export type AgentRunPendingRecovery = {
  action: "retry-tool" | "retry-with-evidence";
  entryId: string;
  call?: AgentToolCall;
};

export type AgentRunCheckpoint = {
  startUrl: string;
  targetOrigin: string;
  stepCount: number;
  replayCount: number;
  workflowRequestCount: number;
  elapsedMs: number;
  lastResumedAt: string;
  activeIdentity?: string;
  pendingCapabilityCall?: AgentToolCall;
  pendingRecovery?: AgentRunPendingRecovery;
};

export type AgentFinding = {
  id: string;
  createdAt: string;
  title: string;
  confidence: "low" | "medium" | "high";
  evidenceRefs: string[];
  notes: string;
  affectedAssets: string[];
  reproductionNotes: string;
  severityRationale: string;
  remediation: string;
  uncertainties: string[];
};

export type AgentPolicy = {
  maxRuntimeMs: number;
  maxSteps: number;
  maxReplay: number;
  maxWorkflowRequests: number;
  maxCaptureSample: number;
  maxParallelWorkers?: number;
  allowRawContext: boolean;
  tutorialMode?: boolean;
};

export type AgentRiskTier = "navigate" | "reversible" | "active" | "destructive";
export type AgentCapabilityLeaseStatus = "draft" | "granted" | "revoked" | "expired" | "exhausted";

export type AgentCapabilityCeiling = {
  maxRiskTier: Exclude<AgentRiskTier, "destructive">;
  maxDurationMs: number;
  maxUses: number;
  maxRequests: number;
  maxConcurrency: number;
  maxPayloadBytes: number;
};

export type AgentCapabilityGrant = {
  origin: string;
  method: string;
  pathPrefix: string;
  identity: string;
};

export type AgentCapabilityLeaseRequest = {
  name: string;
  riskTier: AgentRiskTier;
  tools: AgentToolName[];
  grants: AgentCapabilityGrant[];
  durationMs: number;
  maxUses: number;
  maxRequests: number;
  maxConcurrency: number;
  maxPayloadBytes: number;
  reason: string;
};

export type AgentCapabilityLease = AgentCapabilityLeaseRequest & {
  id: string;
  status: AgentCapabilityLeaseStatus;
  createdAt: string;
  updatedAt: string;
  grantedAt?: string;
  expiresAt?: string;
  revokedAt?: string;
  revocationReason?: string;
  usedUses: number;
  usedRequests: number;
  scopeSnapshot: string[];
  authFingerprint?: string;
};

export type AgentCapabilityReceipt = {
  id: string;
  leaseId?: string;
  createdAt: string;
  tool: AgentToolName;
  riskTier: AgentRiskTier;
  decision: "allowed" | "blocked" | "revoked";
  status: "decided" | "started" | "succeeded" | "failed" | "unknown";
  origin: string;
  method: string;
  path: string;
  identity: string;
  requestCost: number;
  payloadBytes: number;
  reason: string;
  finishedAt?: string;
  outcomeReason?: string;
};

export type AgentCapabilityState = {
  version: 1;
  revision: number;
  leases: AgentCapabilityLease[];
  receipts: AgentCapabilityReceipt[];
};

export type AgentCapabilityAction =
  | { action: "propose"; lease: AgentCapabilityLeaseRequest }
  | { action: "grant"; leaseId: string }
  | { action: "revoke"; leaseId: string; reason?: string };

export type AgentCapabilityActionRequest = { expectedRevision: number } & AgentCapabilityAction;

export type AgentRunRequest = {
  goal: string;
  startUrl?: string;
  profileId?: AgentRunProfileId;
  tutorialMode?: boolean;
  continuationOf?: string;
  policy?: Partial<AgentPolicy>;
};

export type AgentRunRecoveryRequest = {
  action: AgentRunRecoveryAction;
  entryId?: string;
};

export type AgentRun = {
  id: string;
  sessionId: string;
  createdAt: string;
  updatedAt: string;
  goal: string;
  profileId: AgentRunProfileId;
  status: AgentRunStatus;
  policy: AgentPolicy;
  checkpoint?: AgentRunCheckpoint;
  mission?: AgentMission;
  capabilities?: AgentCapabilityState;
  timeline: AgentTimelineEntry[];
  findings: AgentFinding[];
  error?: string;
};

export type AgentContextSummary = {
  generatedAt: string;
  sitemap: {
    hostCount: number;
    endpointCount: number;
    topHosts: Array<{ host: string; requestCount: number; paths: string[] }>;
  };
  findings: Array<Pick<Finding, "id" | "title" | "severity" | "status" | "confidence" | "affectedAssets"> & { evidenceRefs: string[] }>;
  advanced: {
    graphQlOperations: number;
    imports: number;
    authRows: number;
    parameters: number;
    secrets: number;
    headerSignals: number;
  };
  workflows: {
    definitions: Array<Pick<WorkflowDefinition, "id" | "name" | "mode"> & { stepCount: number; maxRequests: number }>;
    recentRuns: Array<Pick<WorkflowRun, "id" | "workflowId" | "workflowName" | "status" | "mode" | "actionCount" | "startedAt">>;
  };
  projectArtifacts: {
    notes: Array<Pick<ProjectNote, "id" | "title" | "updatedAt">>;
    savedViews: Array<Pick<SavedView, "id" | "name" | "view" | "updatedAt">>;
  };
  runMemory: Array<Pick<AgentRunMemoryEntry, "id" | "kind" | "status" | "title" | "updatedAt"> & { evidenceRefs: string[] }>;
};

export type AgentFindingQualityGate = {
  ok: boolean;
  reasons: string[];
  finding?: AgentFinding;
};

export type AgentRunMemoryKind = "hypothesis" | "dismissed-lead" | "retest-note";
export type AgentRunMemoryStatus = "proposed" | "confirmed" | "dismissed" | "retest-pending" | "retest-passed" | "retest-failed";
export type AgentRunMemoryRetestState = "not-started" | "pending" | "passed" | "failed";

export type AgentRunMemoryEntry = {
  id: string;
  createdAt: string;
  updatedAt: string;
  kind: AgentRunMemoryKind;
  status: AgentRunMemoryStatus;
  title: string;
  notes: string;
  sourceRunId?: string;
  evidenceRefs: string[];
  dismissedReason?: string;
  retestState?: AgentRunMemoryRetestState;
};
