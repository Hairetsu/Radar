import type {
  AgentCookie,
  AgentDecision,
  AgentDecisionContext,
  AgentEvidenceObservation,
  AgentRun,
  AgentRunMemoryEntry,
  AgentStorageState
} from "../../shared/agent-types.js";
import type {
  AutomatePayloadSet,
  AutomateSession,
  BrowserState,
  CapturedRequest,
  Finding,
  InstalledPlugin,
  InterceptState,
  ProjectNote,
  ReplayDraft,
  ReplayEnvironment,
  ReplayResult,
  ReplayTabState,
  SavedView,
  WebSocketEvent,
  WorkflowDefinition,
  WorkflowRun
} from "../../shared/domain.js";

export type AgentRuntimeDeps = {
  currentSessionId: () => string;
  allowlist: () => string[];
  saveRun: (run: AgentRun) => void;
  loadRun: (runId: string) => AgentRun | null;
  listRuns: () => AgentRun[];
  getBrowserState: () => BrowserState;
  openBrowser: (url: string) => Promise<BrowserState>;
  navigateBrowser: (url: string) => Promise<BrowserState>;
  getCaptures: () => CapturedRequest[];
  getCaptureById?: (id: string) => CapturedRequest | null;
  getWebSocketEvents: () => WebSocketEvent[];
  getInterceptState: () => InterceptState;
  getReplayTabState: () => ReplayTabState;
  setReplayTabState: (state: ReplayTabState) => ReplayTabState;
  listReplayEnvironments: () => ReplayEnvironment[];
  listReplayCollections: () => Array<{ id: string; name: string; items: unknown[] }>;
  listAutomatePayloadSets: () => AutomatePayloadSet[];
  listAutomateSessions: () => AutomateSession[];
  listWorkflows: () => WorkflowDefinition[];
  listWorkflowRuns: () => WorkflowRun[];
  listFindings: () => Finding[];
  listProjectNotes: () => ProjectNote[];
  listSavedViews: () => SavedView[];
  listRunMemory: () => AgentRunMemoryEntry[];
  listPlugins: () => InstalledPlugin[];
  runWorkflow: (input: { workflowId: string; inputs?: Record<string, string>; source?: "manual" | "ai" }) => Promise<WorkflowRun>;
  sendReplay: (
    draft: ReplayDraft | { draft: ReplayDraft; environmentId?: string },
    options?: { timeoutMs?: number; signal?: AbortSignal }
  ) => Promise<ReplayResult>;
  waitForNetworkIdle: (input: { idleMs?: number; timeoutMs?: number }) => Promise<{ idle: boolean; waitedMs: number }>;
  getPageText: () => Promise<{ url: string; title: string; text: string }>;
  getDomSummary: () => Promise<{
    url: string;
    title: string;
    text: string;
    ariaSnapshot: string;
    links: Array<{ text: string; href: string }>;
    buttons: string[];
    forms: Array<{ action: string; method: string; inputs: string[] }>;
  }>;
  getClickableElements: () => Promise<{ url: string; elements: Array<{ selector: string; text: string; tag: string; role: string; href?: string }> }>;
  clickElement: (input: { selector: string }) => Promise<{ clicked: boolean; selector: string; url: string }>;
  fillInput: (input: { selector: string; value: string }) => Promise<{ filled: boolean; selector: string }>;
  submitForm: (input: { selector: string }) => Promise<{ submitted: boolean; selector: string; url: string }>;
  getCookies: () => Promise<{ cookies: AgentCookie[] }>;
  getStorageState: () => Promise<AgentStorageState>;
  saveAuthState: (input: { name: string }) => Promise<{
    name: string;
    origin: string;
    createdAt: string;
    cookieCount: number;
    localStorageKeys: string[];
    sessionStorageKeys: string[];
  }>;
  loadAuthState: (input: { name: string }) => Promise<{
    name: string;
    origin: string;
    createdAt: string;
    cookieCount: number;
    localStorageKeys: string[];
    sessionStorageKeys: string[];
  }>;
  listAuthStates: () => Promise<{
    states: Array<{
      name: string;
      origin: string;
      createdAt: string;
      cookieCount: number;
      localStorageKeys: string[];
      sessionStorageKeys: string[];
    }>;
  }>;
  compareAuthStates: (input: { left: string; right: string }) => Promise<{ left: string; right: string; observations: AgentEvidenceObservation[] }>;
  listIdentityProfiles: () => import("../../shared/identityProfiles.js").IdentityProfile[];
  getIdentityLabContext: () => Promise<{
    identities: import("../../shared/identityProfiles.js").IdentityProfile[];
    activeIdentityId?: string;
    activeActivationId?: string;
    attributedCaptureCount: number;
  }>;
  activateIdentityProfile: (input: { identityId: string }) => Promise<{
    identity: import("../../shared/identityProfiles.js").IdentityProfile;
    activation: import("../../shared/identityProfiles.js").IdentityActivationRecord;
    url: string;
  }>;
  verifyIdentityProfile: (input: { identityId: string }) => Promise<{
    identity: import("../../shared/identityProfiles.js").IdentityProfile;
    url: string;
  }>;
  decideNextAction: (context: AgentDecisionContext) => Promise<AgentDecision>;
  setActiveRunId?: (runId: string | null) => void;
  setActiveActionContext?: (context: { actionId: string; identityId?: string } | null) => void;
  waitForSettle?: (ms: number) => Promise<void>;
};

export type RunCounters = {
  startedAt: number;
  startUrl: string;
  targetOrigin: string;
  stepCount: number;
  replayCount: number;
  workflowRequestCount: number;
  probeRequestCount: number;
  activeIdentity: string;
};

export type AgentExecutionLifecycle = {
  running: Set<string>;
  stopped: Set<string>;
  requestedRunStatus: Map<string, "paused" | "stopped">;
};
