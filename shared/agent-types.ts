import type {
  BrowserState,
  AutomatePayloadSet,
  AutomateRule,
  AutomateSession,
  CapturedRequest,
  InterceptQueueItem,
  InterceptResponseDraft,
  ReplayDraft,
  ReplayResult,
  ReplayTabState
} from "./domain.js";

export type AppMode = "manual-first" | "ai-first";

export type AgentWorkbenchView = "traffic" | "websocket" | "intercept" | "repeater" | "automate" | "sitemap" | "scope" | "ssl";

export type AgentRunStatus = "queued" | "running" | "paused" | "stopped" | "completed" | "failed";

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
  | "analyzeAutomateResults";

export type AgentClickableElement = {
  selector: string;
  text: string;
  tag: string;
  role: string;
  href?: string;
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
  | { tool: "analyzeAutomateResults"; input: { sessionId?: string } };

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
  | { tool: AgentToolName; ok: false; error: string };

export type AgentDecisionFinding = {
  title: string;
  confidence: "low" | "medium" | "high";
  evidenceRefs: string[];
  notes: string;
  uncertainties?: string[];
};

export type AgentDecision =
  | { action: "tool"; call: AgentToolCall; rationale?: string }
  | { action: "finish"; rationale?: string; findings?: AgentDecisionFinding[] };

export type AgentDecisionContext = {
  goal: string;
  startUrl: string;
  targetOrigin: string;
  allowlist: string[];
  browserState: BrowserState;
  policy: AgentPolicy;
  stepCount: number;
  replayCount: number;
  availableTools: AgentToolName[];
  capturedTraffic: AgentCapturedTrafficContext[];
  timeline: AgentTimelineEntry[];
};

export type AgentTimelineEntry = {
  id: string;
  createdAt: string;
  note?: string;
  toolCall?: AgentToolCall;
  toolResult?: AgentToolResult;
};

export type AgentFinding = {
  id: string;
  createdAt: string;
  title: string;
  confidence: "low" | "medium" | "high";
  evidenceRefs: string[];
  notes: string;
  uncertainties: string[];
};

export type AgentPolicy = {
  maxRuntimeMs: number;
  maxSteps: number;
  maxReplay: number;
  maxCaptureSample: number;
  allowRawContext: boolean;
};

export type AgentRunRequest = {
  goal: string;
  startUrl?: string;
  policy?: Partial<AgentPolicy>;
};

export type AgentRun = {
  id: string;
  sessionId: string;
  createdAt: string;
  updatedAt: string;
  goal: string;
  status: AgentRunStatus;
  policy: AgentPolicy;
  timeline: AgentTimelineEntry[];
  findings: AgentFinding[];
  error?: string;
};
