import { createHash, randomUUID } from "node:crypto";
import type {
  AgentCookie,
  AgentCapabilityActionRequest,
  AgentCapabilityLease,
  AgentCapturedTrafficContext,
  AgentContextSummary,
  AgentDecision,
  AgentDecisionContext,
  AgentDecisionFinding,
  AgentEvidenceObservation,
  AgentFinding,
  AgentRunMemoryEntry,
  AgentRun,
  AgentRunCheckpoint,
  AgentMissionSteeringRequest,
  AgentRunRecoveryAction,
  AgentRunRecoveryRequest,
  AgentRunRequest,
  AgentStorageState,
  AgentTimelineEntry,
  AgentToolCall,
  AgentToolResult
} from "../../shared/agent-types.js";
import type {
  AutomatePayloadSet,
  AutomateSession,
  BrowserState,
  CapturedRequest,
  Finding,
  InstalledPlugin,
  InterceptResponseDraft,
  InterceptState,
  ProjectNote,
  ReplayDraft,
  ReplayEnvironment,
  ReplayResult,
  SavedView,
  ReplayTabState,
  WebSocketEvent,
  WorkflowDefinition,
  WorkflowRun
} from "../../shared/domain.js";
import { buildAdvancedTestingSummary } from "../../shared/advancedTesting.js";
import { buildAgentContextSummary, emptyAgentContextSummary } from "../../shared/agentContext.js";
import { buildAgentEvidenceCatalog, type AgentEvidenceCatalog } from "../../shared/agentEvidence.js";
import {
  applyAgentMissionPatch,
  applyAgentMissionSteering,
  applyAgentMissionUpdates,
  createAgentMission,
  missionHasOpenQuestion,
  normalizeAgentMission,
  validateAgentMissionEvidence
} from "../../shared/agentMission.js";
import {
  authorizeAgentCapability,
  createAgentCapabilityState,
  finalizeAgentCapabilityReceipt,
  grantAgentCapabilityLease,
  invalidateAgentCapabilityLease,
  normalizeAgentCapabilityActionRequest,
  normalizeAgentCapabilityState,
  proposeAgentCapabilityLease,
  revokeAgentCapabilityLease,
  revokeGrantedAgentCapabilities,
  type AgentCapabilityUse
} from "../../shared/agentCapabilities.js";
import { firstUrlFromText, originFromUrl } from "../../shared/url.js";
import { isAllowedTarget } from "../../shared/allowlist.js";
import { normalizeDraft } from "../../shared/draft.js";
import { summarizeAutomateSession } from "../../shared/automate.js";
import { buildSitemap } from "../../shared/sitemap.js";
import { diffReplayHistory } from "../../shared/replayDiff.js";
import { createReplayTab, normalizeReplayTabState } from "../../shared/replayTabs.js";
import { parseTrafficQuery } from "../../shared/trafficQuery.js";
import { normalizeAgentFindingWithGate } from "../../shared/agentQuality.js";
import { normalizeAgentRunMemory } from "../../shared/agentMemory.js";
import { agentProfileAllowsTool, getAgentRunProfile, normalizeAgentRunProfileId } from "../../shared/agentProfiles.js";
import { normalizeWorkflowDefinition } from "../../shared/workflows.js";
import { DEFAULT_AGENT_POLICY, blockedToolReason, normalizeAgentPolicy } from "./policy.js";
import { availableToolNames, normalizeAgentToolCall } from "./tools.js";

type AgentRuntimeDeps = {
  currentSessionId: () => string;
  allowlist: () => string[];
  saveRun: (run: AgentRun) => void;
  loadRun: (runId: string) => AgentRun | null;
  listRuns: () => AgentRun[];
  getBrowserState: () => BrowserState;
  openBrowser: (url: string) => Promise<BrowserState>;
  navigateBrowser: (url: string) => Promise<BrowserState>;
  getCaptures: () => CapturedRequest[];
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
  sendReplay: (draft: ReplayDraft | { draft: ReplayDraft; environmentId?: string }) => Promise<ReplayResult>;
  waitForNetworkIdle: (input: { idleMs?: number; timeoutMs?: number }) => Promise<{ idle: boolean; waitedMs: number }>;
  getPageText: () => Promise<{ url: string; title: string; text: string }>;
  getDomSummary: () => Promise<{
    url: string;
    title: string;
    text: string;
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

type RunCounters = {
  startedAt: number;
  startUrl: string;
  targetOrigin: string;
  stepCount: number;
  replayCount: number;
  workflowRequestCount: number;
  activeIdentity: string;
};

const running = new Set<string>();
const stopped = new Set<string>();
const scheduled = new Set<string>();
const requestedRunStatus = new Map<string, "paused" | "stopped">();

function nowIso() {
  return new Date().toISOString();
}

function createId(prefix: string) {
  return `${prefix}_${randomUUID()}`;
}

function timeline(note: string, extra: Partial<AgentTimelineEntry> = {}): AgentTimelineEntry {
  return {
    id: createId("step"),
    createdAt: nowIso(),
    note,
    ...extra
  };
}

function toolMayEmitNetwork(call: AgentToolCall) {
  return [
    "openBrowser",
    "navigateBrowser",
    "clickElement",
    "fillInput",
    "submitForm",
    "loadAuthState",
    "activateIdentityProfile",
    "verifyIdentityProfile",
    "sendReplay",
    "runWorkflow"
  ].includes(call.tool);
}

function visibleTargetForTool(call: AgentToolCall): AgentTimelineEntry["target"] {
  switch (call.tool) {
    case "showView":
      return { view: call.input.view };
    case "openBrowser":
    case "navigateBrowser":
      return { browserUrl: call.input.url };
    case "prepareTrafficQuery":
      return { view: "traffic", control: "traffic query" };
    case "getCaptures":
      return { view: "traffic" };
    case "getInterceptQueue":
    case "prepareInterceptEdit":
      return { view: "intercept", evidenceId: "id" in call.input ? call.input.id : undefined };
    case "sendReplay":
    case "getReplayContext":
    case "prepareReplayTab":
    case "compareReplayResults":
      return { view: "repeater" };
    case "getAutomateContext":
    case "prepareAutomateDraft":
    case "analyzeAutomateResults":
      return { view: "automate" };
    case "getWorkflowCatalog":
    case "runWorkflow":
    case "prepareWorkflowDraft":
      return { view: "workflows" };
    case "getAgentContextSummary":
      return { view: "sitemap", control: "AI context summary" };
    case "getPluginInventory":
      return { view: "plugins" };
    case "getAdvancedTestingSummary":
    case "getIdentityLabContext":
    case "analyzeSecurityHeaders":
    case "analyzeCookieFlags":
    case "checkCorsPolicy":
      return { view: "advanced" };
    case "activateIdentityProfile":
    case "verifyIdentityProfile":
      return { view: "advanced", control: "Identity Lab" };
    case "getSitemapCoverage":
      return { view: "sitemap" };
    case "proposeRunMemory":
      return { view: "advanced", control: "run memory" };
    default:
      return undefined;
  }
}

function recoveryActionsForFailure(call?: AgentToolCall): AgentTimelineEntry["recoveryActions"] {
  if (!call) {
    return ["retry-with-evidence", "stop-run"];
  }
  if (!isRetryableAgentTool(call)) {
    return ["skip-and-continue", "stop-run", "draft-finding"];
  }
  return ["retry-tool", "retry-with-evidence", "skip-and-continue", "stop-run", "draft-finding"];
}

function isRetryableAgentTool(call: AgentToolCall) {
  return ![
    "openBrowser",
    "navigateBrowser",
    "clickElement",
    "fillInput",
    "submitForm",
    "loadAuthState",
    "activateIdentityProfile",
    "verifyIdentityProfile",
    "saveAuthState",
    "prepareReplayTab",
    "sendReplay",
    "runWorkflow"
  ].includes(call.tool);
}

function normalizedCheckpoint(run: AgentRun): AgentRunCheckpoint {
  const checkpoint = run.checkpoint;
  const startUrl = String(checkpoint?.startUrl || firstUrlFromText(run.goal) || "").trim();
  const lastResumedAt = String(checkpoint?.lastResumedAt || run.updatedAt || run.createdAt || nowIso());
  return {
    startUrl,
    targetOrigin: String(checkpoint?.targetOrigin || (startUrl ? originFromUrl(startUrl) : "")),
    stepCount: Math.max(0, Math.round(Number(checkpoint?.stepCount) || 0)),
    replayCount: Math.max(0, Math.round(Number(checkpoint?.replayCount) || 0)),
    workflowRequestCount: Math.max(0, Math.round(Number(checkpoint?.workflowRequestCount) || 0)),
    elapsedMs: Math.max(0, Math.round(Number(checkpoint?.elapsedMs) || 0)),
    lastResumedAt,
    activeIdentity: String(checkpoint?.activeIdentity || "current").trim().slice(0, 100) || "current",
    pendingCapabilityCall: checkpoint?.pendingCapabilityCall,
    pendingRecovery: checkpoint?.pendingRecovery
  };
}

function elapsedCheckpoint(run: AgentRun) {
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

function countersFromRun(run: AgentRun): RunCounters {
  const checkpoint = normalizedCheckpoint(run);
  return {
    startedAt: Date.now() - checkpoint.elapsedMs,
    startUrl: checkpoint.startUrl,
    targetOrigin: checkpoint.targetOrigin,
    stepCount: checkpoint.stepCount,
    replayCount: checkpoint.replayCount,
    workflowRequestCount: checkpoint.workflowRequestCount,
    activeIdentity: checkpoint.activeIdentity || "current"
  };
}

function missionFromRun(run: AgentRun) {
  const checkpoint = normalizedCheckpoint(run);
  return normalizeAgentMission(run.mission, run.goal, checkpoint.startUrl, run.createdAt);
}

function capabilityStateFromRun(run: AgentRun) {
  return normalizeAgentCapabilityState(run.capabilities, run.createdAt);
}

function sortedRecord(input: Record<string, string>) {
  return Object.fromEntries(Object.entries(input).sort(([left], [right]) => left.localeCompare(right)));
}

function authFingerprint(state: AgentStorageState) {
  const cookies = [...state.cookies]
    .map((cookie) => ({
      name: cookie.name,
      value: cookie.value,
      domain: cookie.domain || "",
      path: cookie.path || "",
      expires: cookie.expires || 0,
      httpOnly: Boolean(cookie.httpOnly),
      secure: Boolean(cookie.secure),
      sameSite: cookie.sameSite || ""
    }))
    .sort((left, right) =>
      `${left.domain}\n${left.path}\n${left.name}`.localeCompare(`${right.domain}\n${right.path}\n${right.name}`)
    );
  return createHash("sha256")
    .update(
      JSON.stringify({
        origin: state.origin,
        cookies,
        localStorage: sortedRecord(state.localStorage),
        sessionStorage: sortedRecord(state.sessionStorage)
      })
    )
    .digest("hex");
}

function browserContextUrl(counters: RunCounters, deps: AgentRuntimeDeps) {
  return deps.getBrowserState().url || counters.startUrl;
}

function capabilityUseForCall(
  run: AgentRun,
  counters: RunCounters,
  call: AgentToolCall,
  deps: AgentRuntimeDeps
): AgentCapabilityUse | null {
  const currentUrl = browserContextUrl(counters, deps);
  const common = {
    identity: counters.activeIdentity,
    concurrency: 1,
    allowlist: deps.allowlist()
  };
  switch (call.tool) {
    case "openBrowser":
    case "navigateBrowser":
      return { ...common, tool: call.tool, url: call.input.url, method: "GET", requestCost: 1, payloadBytes: 0 };
    case "clickElement":
      return { ...common, tool: call.tool, url: currentUrl, method: "GET", requestCost: 1, payloadBytes: 0 };
    case "fillInput":
      return {
        ...common,
        tool: call.tool,
        url: currentUrl,
        method: "GET",
        requestCost: 0,
        payloadBytes: Buffer.byteLength(call.input.value)
      };
    case "submitForm":
      return { ...common, tool: call.tool, url: currentUrl, method: "POST", requestCost: 1, payloadBytes: 0 };
    case "saveAuthState":
      return { ...common, tool: call.tool, url: currentUrl, method: "GET", requestCost: 0, payloadBytes: 0 };
    case "loadAuthState":
      return {
        ...common,
        identity: call.input.name,
        tool: call.tool,
        url: currentUrl,
        method: "GET",
        requestCost: 0,
        payloadBytes: 0
      };
    case "activateIdentityProfile":
    case "verifyIdentityProfile": {
      const identity = deps.listIdentityProfiles().find((item) => item.id === call.input.identityId);
      return {
        ...common,
        identity: call.input.identityId,
        tool: call.tool,
        url: identity?.origin || currentUrl,
        method: "GET",
        requestCost: 1,
        payloadBytes: 0
      };
    }
    case "sendReplay":
      return {
        ...common,
        tool: call.tool,
        url: call.input.draft.url,
        method: call.input.draft.method,
        requestCost: 1,
        payloadBytes: Buffer.byteLength(call.input.draft.body)
      };
    case "runWorkflow": {
      const definition = deps.listWorkflows().find((workflow) => workflow.id === call.input.workflowId);
      if (definition?.mode === "passive") {
        return null;
      }
      const captureId = call.input.inputs?.["capture-id"] || "";
      const capture = captureId ? deps.getCaptures().find((item) => item.id === captureId) : null;
      const browserStep = definition?.steps.find((step) => step.kind === "browser-open");
      const urlInput = browserStep?.config.urlInput || "url";
      const browserUrl = call.input.inputs?.[urlInput] || "";
      return {
        ...common,
        tool: call.tool,
        url: capture?.url || browserUrl || currentUrl,
        method: capture?.method || (browserUrl ? "GET" : "POST"),
        requestCost: Math.max(1, definition?.scope.maxRequests || 1),
        payloadBytes: Buffer.byteLength(JSON.stringify(call.input.inputs || {}))
      };
    }
    default:
      return null;
  }
}

function leaseAllowsObservedUrl(
  lease: AgentCapabilityLease,
  url: string,
  method: string,
  identity: string
) {
  try {
    const parsed = new URL(url);
    const path = `${parsed.pathname}${parsed.search}`;
    return lease.grants.some(
      (grant) =>
        grant.origin === parsed.origin &&
        grant.method === method.toUpperCase() &&
        path.startsWith(grant.pathPrefix) &&
        grant.identity === identity
    );
  } catch {
    return false;
  }
}

function capabilityResultUrl(result: AgentToolResult) {
  if (!result.ok) {
    return "";
  }
  switch (result.tool) {
    case "openBrowser":
    case "navigateBrowser":
    case "clickElement":
    case "submitForm":
      return result.data.url;
    case "activateIdentityProfile":
    case "verifyIdentityProfile":
      return result.data.url;
    default:
      return "";
  }
}

function capabilityOutcome(result: AgentToolResult): {
  status: "succeeded" | "failed" | "unknown";
  reason: string;
} {
  if (!result.ok) {
    return { status: "unknown", reason: result.error };
  }
  if (result.tool === "sendReplay" && !result.data.ok) {
    return { status: "failed", reason: result.data.statusText || "Replay dispatch failed." };
  }
  if (result.tool === "runWorkflow" && result.data.status === "failed") {
    return { status: "failed", reason: result.data.error || "Workflow dispatch failed." };
  }
  return { status: "succeeded", reason: `${result.tool} completed.` };
}

function checkpointFromCounters(
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
    elapsedMs: Math.max(0, Date.now() - counters.startedAt),
    lastResumedAt: nowIso(),
    activeIdentity: counters.activeIdentity,
    pendingCapabilityCall,
    pendingRecovery
  };
}

function browserStateMatchesRequestedUrl(state: BrowserState, requestedUrl: string) {
  if (!state.open || !state.url) {
    return false;
  }
  try {
    return new URL(state.url).href === new URL(requestedUrl).href;
  } catch {
    return state.url === requestedUrl;
  }
}

function browserToolSuccess(tool: "openBrowser" | "navigateBrowser", data: BrowserState) {
  return tool === "openBrowser"
    ? ({ tool, ok: true, data } satisfies AgentToolResult)
    : ({ tool, ok: true, data } satisfies AgentToolResult);
}

async function runBrowserTool({
  tool,
  url,
  action,
  getBrowserState
}: {
  tool: "openBrowser" | "navigateBrowser";
  url: string;
  action: (url: string) => Promise<BrowserState>;
  getBrowserState: () => BrowserState;
}) {
  try {
    return browserToolSuccess(tool, await action(url));
  } catch (error) {
    try {
      const state = getBrowserState();
      if (browserStateMatchesRequestedUrl(state, url)) {
        return browserToolSuccess(tool, state);
      }
    } catch {
      /* Preserve the original browser action failure. */
    }
    throw error;
  }
}

function withUpdate(run: AgentRun, saveRun: (run: AgentRun) => void, update: Partial<AgentRun>) {
  const next = {
    ...run,
    ...update,
    updatedAt: nowIso()
  };
  saveRun(next);
  return next;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clip(value: unknown, max = 1200) {
  const text = String(value ?? "");
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

function sameOrigin(value: string, targetOrigin: string) {
  if (!targetOrigin) {
    return true;
  }

  try {
    return new URL(value).origin === targetOrigin;
  } catch {
    return false;
  }
}

function headerValue(headers: Record<string, string>, name: string) {
  const found = Object.entries(headers || {}).find(([key]) => key.toLowerCase() === name.toLowerCase());
  return found?.[1] || "";
}

function responseDraftFromIntercept(input: Partial<InterceptResponseDraft>, fallback: InterceptResponseDraft): InterceptResponseDraft {
  const numericStatus = Number(input.status ?? fallback.status);
  return {
    status: Number.isFinite(numericStatus) ? Math.max(100, Math.min(Math.round(numericStatus), 599)) : fallback.status,
    statusText: String(input.statusText ?? fallback.statusText).slice(0, 120),
    headers: input.headers || fallback.headers,
    body: typeof input.body === "string" ? input.body : fallback.body
  };
}

function runCaptures(run: AgentRun, captures: CapturedRequest[], rules: string[], targetOrigin: string) {
  return captures
    .map((capture) => ({
      ...capture,
      allowed: isAllowedTarget(capture.url, rules)
    }))
    .filter((capture) => capture.agentRunId === run.id && capture.allowed && sameOrigin(capture.url, targetOrigin));
}

function capturedTrafficContext(captures: CapturedRequest[], limit: number): AgentCapturedTrafficContext[] {
  return captures.slice(0, limit).map((capture) => ({
    id: capture.id,
    method: capture.method,
    url: capture.url,
    status: capture.status,
    statusText: capture.statusText,
    type: capture.type,
    mimeType: capture.mimeType,
    source: capture.source,
    requestHeaders: capture.requestHeaders,
    responseHeaders: capture.responseHeaders,
    requestBodyPreview: clip(capture.requestBody),
    responseBodyPreview: clip(capture.responseBody),
    agentRunId: capture.agentRunId,
    navigationId: capture.navigationId,
    frameUrl: capture.frameUrl,
    initiator: capture.initiator
  }));
}

function analyzeSecurityHeaders(captures: CapturedRequest[]): AgentEvidenceObservation[] {
  const observations: AgentEvidenceObservation[] = [];
  for (const capture of captures) {
    const contentType = headerValue(capture.responseHeaders, "content-type");
    const isHtml = /text\/html/i.test(contentType) || /document/i.test(capture.type || "");
    if (isHtml && !headerValue(capture.responseHeaders, "content-security-policy")) {
      observations.push({
        captureId: capture.id,
        url: capture.url,
        name: "content-security-policy",
        issue: "HTML response does not include Content-Security-Policy.",
        severity: "low"
      });
    }
    if (capture.url.startsWith("https://") && !headerValue(capture.responseHeaders, "strict-transport-security")) {
      observations.push({
        captureId: capture.id,
        url: capture.url,
        name: "strict-transport-security",
        issue: "HTTPS response does not include Strict-Transport-Security.",
        severity: "low"
      });
    }
    if (isHtml && !headerValue(capture.responseHeaders, "x-frame-options") && !/frame-ancestors/i.test(headerValue(capture.responseHeaders, "content-security-policy"))) {
      observations.push({
        captureId: capture.id,
        url: capture.url,
        name: "frame-ancestors",
        issue: "HTML response does not include X-Frame-Options or CSP frame-ancestors.",
        severity: "low"
      });
    }
  }
  return observations;
}

function splitSetCookie(value: string) {
  return String(value || "")
    .split(/,(?=\s*[^;,=\s]+=[^;,]+)/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function analyzeCookieFlags(captures: CapturedRequest[]): AgentEvidenceObservation[] {
  const observations: AgentEvidenceObservation[] = [];
  for (const capture of captures) {
    const setCookie = headerValue(capture.responseHeaders, "set-cookie");
    for (const cookie of splitSetCookie(setCookie)) {
      const name = cookie.split("=")[0] || "cookie";
      const lower = cookie.toLowerCase();
      if (capture.url.startsWith("https://") && !lower.includes("; secure")) {
        observations.push({ captureId: capture.id, url: capture.url, name, issue: "Cookie is missing Secure.", severity: "medium" });
      }
      if (!lower.includes("; httponly")) {
        observations.push({ captureId: capture.id, url: capture.url, name, issue: "Cookie is missing HttpOnly.", severity: "low" });
      }
      if (!lower.includes("; samesite")) {
        observations.push({ captureId: capture.id, url: capture.url, name, issue: "Cookie is missing SameSite.", severity: "low" });
      }
    }
  }
  return observations;
}

function checkCorsPolicy(captures: CapturedRequest[]): AgentEvidenceObservation[] {
  const observations: AgentEvidenceObservation[] = [];
  for (const capture of captures) {
    const allowOrigin = headerValue(capture.responseHeaders, "access-control-allow-origin");
    const allowCredentials = headerValue(capture.responseHeaders, "access-control-allow-credentials");
    if (allowOrigin === "*") {
      observations.push({
        captureId: capture.id,
        url: capture.url,
        name: "access-control-allow-origin",
        value: allowOrigin,
        issue: "Response allows any CORS origin.",
        severity: /true/i.test(allowCredentials) ? "medium" : "low"
      });
    }
    if (/true/i.test(allowCredentials) && allowOrigin && allowOrigin !== "*") {
      observations.push({
        captureId: capture.id,
        url: capture.url,
        name: "access-control-allow-credentials",
        value: allowCredentials,
        issue: "Response allows credentialed CORS; confirm allowed origin is intentional.",
        severity: "info"
      });
    }
  }
  return observations;
}

function findingFromDecision(input: AgentDecisionFinding, evidenceCatalog: AgentEvidenceCatalog) {
  return normalizeAgentFindingWithGate(input, createId("finding"), nowIso(), evidenceCatalog);
}

function runtimeEvidenceCatalog(deps: AgentRuntimeDeps) {
  const allowlist = deps.allowlist();
  const replayTabState = deps.getReplayTabState();
  return buildAgentEvidenceCatalog({
    captures: deps.getCaptures().filter((capture) => isAllowedTarget(capture.url, allowlist)),
    webSocketEvents: deps.getWebSocketEvents().filter((event) => isAllowedTarget(event.url, allowlist)),
    replayTabState: {
      ...replayTabState,
      tabs: replayTabState.tabs
        .map((tab) => ({
          ...tab,
          history: tab.history.filter((entry) => isAllowedTarget(entry.draft.url, allowlist))
        }))
        .filter((tab) => isAllowedTarget(tab.draft.url, allowlist) || tab.history.length > 0)
    },
    automateSessions: deps.listAutomateSessions().map((session) => ({
      ...session,
      results: session.results.filter((result) => isAllowedTarget(result.request.url, allowlist))
    })),
    workflowRuns: deps.listWorkflowRuns(),
    agentRuns: deps.listRuns()
  });
}

function runtimeContextSummary({
  deps,
  allowlist,
  maxCaptureSample
}: {
  deps: AgentRuntimeDeps;
  allowlist: string[];
  maxCaptureSample: number;
}): AgentContextSummary {
  try {
    const captures = deps.getCaptures();
    const frames = deps.getWebSocketEvents();
    const advancedSummary = buildAdvancedTestingSummary(
      captures.filter((capture) => isAllowedTarget(capture.url, allowlist)),
      frames.filter((frame) => isAllowedTarget(frame.url, allowlist))
    );
    return buildAgentContextSummary({
      captures,
      frames,
      findings: deps.listFindings(),
      workflows: deps.listWorkflows(),
      workflowRuns: deps.listWorkflowRuns(),
      projectNotes: deps.listProjectNotes(),
      savedViews: deps.listSavedViews(),
      runMemory: deps.listRunMemory(),
      allowlist,
      advancedSummary,
      captureLimit: maxCaptureSample
    });
  } catch {
    return emptyAgentContextSummary();
  }
}

function decisionContext({
  run,
  counters,
  startUrl,
  targetOrigin,
  deps
}: {
  run: AgentRun;
  counters: RunCounters;
  startUrl: string;
  targetOrigin: string;
  deps: AgentRuntimeDeps;
}): AgentDecisionContext {
  const activeAllowlist = deps.allowlist();
  const captures = runCaptures(run, deps.getCaptures(), activeAllowlist, "");
  const contextSummary = runtimeContextSummary({
    deps,
    allowlist: activeAllowlist,
    maxCaptureSample: run.policy.maxCaptureSample
  });
  return {
    goal: run.goal,
    startUrl,
    targetOrigin,
    allowlist: activeAllowlist,
    browserState: deps.getBrowserState(),
    policy: run.policy,
    profile: run.profileId,
    stepCount: counters.stepCount,
    replayCount: counters.replayCount,
    workflowRequestCount: counters.workflowRequestCount,
    availableTools: availableToolNames().filter((tool) => agentProfileAllowsTool(run.profileId, tool)),
    capturedTraffic: capturedTrafficContext(captures, run.policy.maxCaptureSample),
    contextSummary,
    runMemory: deps.listRunMemory().slice(0, 16),
    mission: missionFromRun(run),
    capabilities: capabilityStateFromRun(run),
    timeline: run.timeline.slice(-16)
  };
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
      const result = grantAgentCapabilityLease(state, request.leaseId, {
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
      note = `Operator granted capability lease ${result.lease.id} until ${result.lease.expiresAt}.`;
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
    return withUpdate(run, this.deps.saveRun, {
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
    const goal = String(request.goal || "").trim();
    if (!goal) {
      throw new Error("Agent goal is required.");
    }

    const createdAt = nowIso();
    const profileId = normalizeAgentRunProfileId(request.profileId);
    const startUrl = firstUrlFromText(goal) || request.startUrl || "";
    const run: AgentRun = {
      id: createId("agent"),
      sessionId: this.deps.currentSessionId(),
      createdAt,
      updatedAt: createdAt,
      goal,
      profileId,
      status: "queued",
      policy: normalizeAgentPolicy(request.policy, profileId),
      checkpoint: {
        startUrl,
        targetOrigin: startUrl ? originFromUrl(startUrl) : "",
        stepCount: 0,
        replayCount: 0,
        workflowRequestCount: 0,
        elapsedMs: 0,
        lastResumedAt: createdAt,
        activeIdentity: "current"
      },
      mission: createAgentMission(goal, startUrl, createdAt),
      capabilities: createAgentCapabilityState(),
      timeline: [
        timeline("Run queued from AI-First goal prompt.", {
          phase: "status",
          summary: `Queued with ${profileId} profile`
        })
      ],
      findings: []
    };

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
    if (running.has(runId)) {
      throw new Error("Agent run is still pausing. Retry resume after the active step settles.");
    }
    const checkpoint = elapsedCheckpoint(run);
    if (checkpoint.elapsedMs >= run.policy.maxRuntimeMs) {
      throw new Error("Agent run cannot resume because its runtime budget is exhausted.");
    }
    if (checkpoint.stepCount >= run.policy.maxSteps) {
      throw new Error("Agent run cannot resume because its tool-call budget is exhausted.");
    }
    if (missionHasOpenQuestion(missionFromRun(run))) {
      throw new Error("Answer or dismiss the open mission question before resuming this run.");
    }
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
    if (call && !isRetryableAgentTool(call) && !capabilityBlockedBeforeDispatch) {
      throw new Error(`${call.tool} cannot be retried automatically because it may have side effects.`);
    }
    if (requestedAction === "retry-tool" && !call) {
      throw new Error("The failed tool call could not be recovered from the transcript.");
    }
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
          call
        }
      },
      timeline: [
        ...run.timeline,
        timeline(
          requestedAction === "retry-with-evidence"
            ? "Queued recovery with a fresh scoped evidence snapshot."
            : `Queued safe retry for ${call?.tool || "the failed planner step"}.`,
          { phase: "status", target: entry.target }
        )
      ]
    });
    this.queueExecution(runId);
    return next;
  }

  stop(runId: string) {
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

  private async callTool(run: AgentRun, counters: RunCounters, call: AgentToolCall) {
    const normalizedCall = normalizeAgentToolCall(call);
    const blocked = blockedToolReason({
      call: normalizedCall,
      allowlist: this.deps.allowlist(),
      policy: run.policy,
      profileId: run.profileId,
      replayCount: counters.replayCount,
      workflowRequestCount: counters.workflowRequestCount,
      stepCount: counters.stepCount,
      startedAt: counters.startedAt
    });
    if (blocked) {
      counters.stepCount += 1;
      return withUpdate(run, this.deps.saveRun, {
        checkpoint: checkpointFromCounters(counters),
        timeline: [
          ...run.timeline,
          timeline(blocked, {
            phase: "policy-block",
            summary: `Policy blocked ${normalizedCall.tool}`,
            target: visibleTargetForTool(normalizedCall),
            recoveryActions: recoveryActionsForFailure(normalizedCall),
            toolCall: normalizedCall,
            toolResult: { tool: normalizedCall.tool, ok: false, error: blocked }
          })
        ]
      });
    }

    const capabilityUse = capabilityUseForCall(run, counters, normalizedCall, this.deps);
    let capabilityLease: AgentCapabilityLease | null = null;
    let capabilityReceiptId = "";
    let preActionAuthFingerprint = "";
    if (capabilityUse) {
      preActionAuthFingerprint = await this.currentAuthFingerprint();
      const authorization = authorizeAgentCapability(
        capabilityStateFromRun(run),
        { ...capabilityUse, authFingerprint: preActionAuthFingerprint },
        createId("receipt"),
        nowIso()
      );
      if (authorization.required) {
        capabilityReceiptId = authorization.receipt.id;
        capabilityLease = authorization.lease || null;
        run = withUpdate(run, this.deps.saveRun, {
          capabilities: authorization.state,
          timeline: [
            ...run.timeline,
            timeline(
              `${authorization.allowed ? "Capability allowed" : "Capability blocked"}: ${authorization.reason}`,
              {
                phase: authorization.allowed ? "decision" : "policy-block",
                summary: `${authorization.receipt.riskTier} ${normalizedCall.tool} / ${authorization.receipt.decision}`,
                target: visibleTargetForTool(normalizedCall),
                capabilityReceiptId: authorization.receipt.id
              }
            )
          ]
        });
        if (!authorization.allowed) {
          counters.stepCount += 1;
          return withUpdate(run, this.deps.saveRun, {
            checkpoint: checkpointFromCounters(counters),
            timeline: [
              ...run.timeline,
              timeline(authorization.reason, {
                phase: "policy-block",
                summary: `Capability lease blocked ${normalizedCall.tool}`,
                target: visibleTargetForTool(normalizedCall),
                recoveryActions: ["retry-tool", "skip-and-continue", "stop-run"],
                capabilityReceiptId: authorization.receipt.id,
                toolCall: normalizedCall,
                toolResult: { tool: normalizedCall.tool, ok: false, error: authorization.reason }
              })
            ]
          });
        }
      }
    }

    counters.stepCount += 1;
    const actionId = toolMayEmitNetwork(normalizedCall) ? createId("action") : "";
    if (actionId) {
      this.deps.setActiveActionContext?.({
        actionId,
        identityId: counters.activeIdentity || undefined
      });
    }
    let next = withUpdate(run, this.deps.saveRun, {
      checkpoint: checkpointFromCounters(counters),
      timeline: [
        ...run.timeline,
        timeline(`Tool call: ${normalizedCall.tool}`, {
          phase: "tool-call",
          summary: `${normalizedCall.tool} requested`,
          target: visibleTargetForTool(normalizedCall),
          actionId: actionId || undefined,
          identityId: counters.activeIdentity || undefined,
          toolCall: normalizedCall
        })
      ]
    });

    let result: AgentToolResult;
    try {
      if (
        (normalizedCall.tool === "getCookies" || normalizedCall.tool === "getStorageState") &&
        !run.policy.allowRawContext
      ) {
        throw new Error("Raw cookie and storage values require the run's explicit raw-context opt-in.");
      }
      switch (normalizedCall.tool) {
        case "getBrowserState":
          result = { tool: normalizedCall.tool, ok: true, data: this.deps.getBrowserState() };
          break;
        case "showView":
          result = { tool: normalizedCall.tool, ok: true, data: { view: normalizedCall.input.view } };
          break;
        case "openBrowser":
          result = await runBrowserTool({
            tool: normalizedCall.tool,
            url: normalizedCall.input.url,
            action: this.deps.openBrowser,
            getBrowserState: this.deps.getBrowserState
          });
          break;
        case "navigateBrowser":
          result = await runBrowserTool({
            tool: normalizedCall.tool,
            url: normalizedCall.input.url,
            action: this.deps.navigateBrowser,
            getBrowserState: this.deps.getBrowserState
          });
          break;
        case "waitForNetworkIdle":
          result = { tool: normalizedCall.tool, ok: true, data: await this.deps.waitForNetworkIdle(normalizedCall.input) };
          break;
        case "getPageText":
          result = { tool: normalizedCall.tool, ok: true, data: await this.deps.getPageText() };
          break;
        case "getDomSummary":
          result = { tool: normalizedCall.tool, ok: true, data: await this.deps.getDomSummary() };
          break;
        case "getClickableElements":
          result = { tool: normalizedCall.tool, ok: true, data: await this.deps.getClickableElements() };
          break;
        case "clickElement":
          result = { tool: normalizedCall.tool, ok: true, data: await this.deps.clickElement(normalizedCall.input) };
          break;
        case "fillInput":
          result = { tool: normalizedCall.tool, ok: true, data: await this.deps.fillInput(normalizedCall.input) };
          break;
        case "submitForm":
          result = { tool: normalizedCall.tool, ok: true, data: await this.deps.submitForm(normalizedCall.input) };
          break;
        case "getCookies":
          result = { tool: normalizedCall.tool, ok: true, data: await this.deps.getCookies() };
          break;
        case "getStorageState":
          result = { tool: normalizedCall.tool, ok: true, data: await this.deps.getStorageState() };
          break;
        case "saveAuthState":
          result = { tool: normalizedCall.tool, ok: true, data: await this.deps.saveAuthState(normalizedCall.input) };
          break;
        case "loadAuthState":
          result = { tool: normalizedCall.tool, ok: true, data: await this.deps.loadAuthState(normalizedCall.input) };
          break;
        case "listAuthStates":
          result = { tool: normalizedCall.tool, ok: true, data: await this.deps.listAuthStates() };
          break;
        case "compareAuthStates":
          result = { tool: normalizedCall.tool, ok: true, data: await this.deps.compareAuthStates(normalizedCall.input) };
          break;
        case "getIdentityLabContext":
          result = { tool: normalizedCall.tool, ok: true, data: await this.deps.getIdentityLabContext() };
          break;
        case "activateIdentityProfile":
          result = { tool: normalizedCall.tool, ok: true, data: await this.deps.activateIdentityProfile(normalizedCall.input) };
          break;
        case "verifyIdentityProfile":
          result = { tool: normalizedCall.tool, ok: true, data: await this.deps.verifyIdentityProfile(normalizedCall.input) };
          break;
        case "getCaptures":
          {
            const activeAllowlist = this.deps.allowlist();
            const targetOrigin = String(normalizedCall.input.targetOrigin || "").trim();
            const captures = runCaptures(run, this.deps.getCaptures(), activeAllowlist, targetOrigin);
            result = {
              tool: normalizedCall.tool,
              ok: true,
              data: { captures: captures.slice(0, normalizedCall.input.limit || run.policy.maxCaptureSample) }
            };
          }
          break;
        case "getInterceptQueue": {
          const state = this.deps.getInterceptState();
          result = {
            tool: normalizedCall.tool,
            ok: true,
            data: { queue: state.queue.slice(0, normalizedCall.input.limit || run.policy.maxCaptureSample) }
          };
          break;
        }
        case "prepareInterceptEdit": {
          const state = this.deps.getInterceptState();
          const item = state.queue.find((entry) => entry.id === normalizedCall.input.id);
          if (!item) {
            throw new Error("Intercept queue item was not found.");
          }
          if (item.stage === "response") {
            const response = responseDraftFromIntercept(normalizedCall.input.response || {}, {
              status: item.status || 200,
              statusText: item.statusText || "",
              headers: item.headers,
              body: item.body
            });
            result = {
              tool: normalizedCall.tool,
              ok: true,
              data: { item, response, note: normalizedCall.input.note || "Prepared response edit for operator review." }
            };
          } else {
            const draft = normalizeDraft(normalizedCall.input.draft || item);
            if (!isAllowedTarget(draft.url, this.deps.allowlist())) {
              throw new Error(`Prepared intercept URL is out of scope: ${draft.url}`);
            }
            result = {
              tool: normalizedCall.tool,
              ok: true,
              data: { item, draft, note: normalizedCall.input.note || "Prepared request edit for operator review." }
            };
          }
          break;
        }
        case "analyzeSecurityHeaders": {
          const captures = runCaptures(run, this.deps.getCaptures(), this.deps.allowlist(), normalizedCall.input.targetOrigin || "");
          result = { tool: normalizedCall.tool, ok: true, data: { observations: analyzeSecurityHeaders(captures) } };
          break;
        }
        case "analyzeCookieFlags": {
          const captures = runCaptures(run, this.deps.getCaptures(), this.deps.allowlist(), normalizedCall.input.targetOrigin || "");
          result = { tool: normalizedCall.tool, ok: true, data: { observations: analyzeCookieFlags(captures) } };
          break;
        }
        case "checkCorsPolicy": {
          const captures = runCaptures(run, this.deps.getCaptures(), this.deps.allowlist(), normalizedCall.input.targetOrigin || "");
          result = { tool: normalizedCall.tool, ok: true, data: { observations: checkCorsPolicy(captures) } };
          break;
        }
        case "getSitemapCoverage": {
          const captures = runCaptures(run, this.deps.getCaptures(), this.deps.allowlist(), "");
          const sitemap = buildSitemap(captures);
          const limit = normalizedCall.input.limit || 12;
          const hosts = sitemap.roots.slice(0, limit).map((hostId) => {
            const hostNode = sitemap.nodes[hostId];
            return {
              host: hostNode?.host || hostId,
              requestCount: hostNode?.requestCount || 0,
              paths: (hostNode?.childIds || [])
                .slice(0, 8)
                .map((pathId) => sitemap.nodes[pathId]?.path || pathId)
            };
          });
          const endpointCount = Object.values(sitemap.nodes).filter((node) => node.kind === "endpoint").length;
          result = {
            tool: normalizedCall.tool,
            ok: true,
            data: {
              hostCount: sitemap.roots.length,
              endpointCount,
              hosts,
              suggestedQueries: hosts.flatMap((host) => [
                `host:${host.host}`,
                `host:${host.host} status:4xx`
              ]).slice(0, 8)
            }
          };
          break;
        }
        case "prepareTrafficQuery": {
          const parsed = parseTrafficQuery(normalizedCall.input.query);
          if (!parsed.ok) {
            throw new Error(parsed.error);
          }
          result = {
            tool: normalizedCall.tool,
            ok: true,
            data: {
              query: normalizedCall.input.query,
              reason: normalizedCall.input.reason || "Prepared traffic query for operator review."
            }
          };
          break;
        }
        case "getReplayContext": {
          const tabState = this.deps.getReplayTabState();
          const environments = this.deps.listReplayEnvironments();
          const collections = this.deps.listReplayCollections();
          result = {
            tool: normalizedCall.tool,
            ok: true,
            data: {
              tabState,
              environments: environments.map((environment) => ({
                id: environment.id,
                name: environment.name,
                variableCount: Object.keys(environment.variables).length
              })),
              collections: collections.map((collection) => ({
                id: collection.id,
                name: collection.name,
                itemCount: collection.items.length
              }))
            }
          };
          break;
        }
        case "prepareReplayTab": {
          const current = this.deps.getReplayTabState();
          const tab = createReplayTab(normalizedCall.input.name || `AI ${current.tabs.length + 1}`, normalizedCall.input.draft);
          const next = normalizeReplayTabState({
            tabs: [...current.tabs, { ...tab, environmentId: normalizedCall.input.environmentId || "" }],
            activeTabId: tab.id
          });
          this.deps.setReplayTabState(next);
          result = {
            tool: normalizedCall.tool,
            ok: true,
            data: {
              tabId: tab.id,
              name: tab.name,
              draft: tab.draft,
              environmentId: normalizedCall.input.environmentId || "",
              note: normalizedCall.input.note || "Prepared replay tab for operator review."
            }
          };
          break;
        }
        case "compareReplayResults": {
          const tabState = this.deps.getReplayTabState();
          const tab =
            tabState.tabs.find((item) => item.id === (normalizedCall.input.tabId || tabState.activeTabId)) ||
            tabState.tabs[0];
          if (!tab) {
            throw new Error("No repeater tab is available.");
          }
          const left = tab.history.find((entry) => entry.id === normalizedCall.input.leftHistoryId);
          const right = tab.history.find((entry) => entry.id === normalizedCall.input.rightHistoryId);
          if (!left || !right) {
            throw new Error("Replay history entries were not found in the selected tab.");
          }
          const summary = diffReplayHistory(left, right);
          result = {
            tool: normalizedCall.tool,
            ok: true,
            data: {
              statusChanged: summary.statusChanged,
              statusBefore: summary.statusBefore,
              statusAfter: summary.statusAfter,
              latencyDeltaMs: summary.latencyDeltaMs,
              bodyLengthDelta: summary.bodyLengthDelta,
              identical: summary.identical
            }
          };
          break;
        }
        case "getAutomateContext": {
          const payloadSets = this.deps.listAutomatePayloadSets();
          const sessions = this.deps.listAutomateSessions();
          result = {
            tool: normalizedCall.tool,
            ok: true,
            data: {
              payloadSets: payloadSets.map((payloadSet) => ({
                id: payloadSet.id,
                name: payloadSet.name,
                source: payloadSet.source,
                payloadCount: payloadSet.payloads.length,
                wordlistPath: payloadSet.wordlistPath
              })),
              sessions: sessions.map((item) => ({
                id: item.id,
                name: item.name,
                status: item.status,
                payloadCount: item.payloads.length,
                resultCount: item.results.length,
                clusterCount: item.clusters.length,
                matchCount: item.results.filter((entry) => entry.matchedRules.length > 0 || entry.extracts.length > 0).length,
                updatedAt: item.updatedAt
              }))
            }
          };
          break;
        }
        case "prepareAutomateDraft": {
          if (!isAllowedTarget(normalizedCall.input.draft.url, this.deps.allowlist())) {
            throw new Error(`Prepared Automate URL is out of scope: ${normalizedCall.input.draft.url}`);
          }
          result = {
            tool: normalizedCall.tool,
            ok: true,
            data: {
              draft: normalizedCall.input.draft,
              payloads: normalizedCall.input.payloads,
              rules: normalizedCall.input.rules || [],
              name: normalizedCall.input.name || "AI prepared run",
              environmentId: normalizedCall.input.environmentId || "",
              note: normalizedCall.input.note || "Prepared Automate controls for operator review."
            }
          };
          break;
        }
        case "analyzeAutomateResults": {
          const sessions = this.deps.listAutomateSessions();
          const session =
            sessions.find((item) => item.id === normalizedCall.input.sessionId) ||
            sessions[0];
          if (!session) {
            throw new Error("No Automate session is available to analyze.");
          }
          const summary = summarizeAutomateSession(session);
          result = {
            tool: normalizedCall.tool,
            ok: true,
            data: {
              sessionId: session.id,
              status: session.status,
              resultCount: summary.resultCount,
              failures: summary.failures,
              matches: summary.matches,
              clusters: session.clusters,
              outlierResultIds: session.clusters
                .filter((cluster) => cluster.count === 1)
                .map((cluster) => cluster.representativeResultId)
            }
          };
          break;
        }
        case "getWorkflowCatalog": {
          result = {
            tool: normalizedCall.tool,
            ok: true,
            data: {
              workflows: this.deps.listWorkflows().map((workflow) => ({
                id: workflow.id,
                name: workflow.name,
                description: workflow.description,
                mode: workflow.mode,
                inputs: workflow.inputs,
                scope: workflow.scope,
                steps: workflow.steps
              })),
              recentRuns: this.deps.listWorkflowRuns().slice(0, 8).map((run) => ({
                id: run.id,
                workflowId: run.workflowId,
                workflowName: run.workflowName,
                status: run.status,
                mode: run.mode,
                actionCount: run.actionCount,
                startedAt: run.startedAt,
                resultCount: run.results.length
              }))
            }
          };
          break;
        }
        case "getAgentContextSummary": {
          result = {
            tool: normalizedCall.tool,
            ok: true,
            data: runtimeContextSummary({
              deps: this.deps,
              allowlist: this.deps.allowlist(),
              maxCaptureSample: run.policy.maxCaptureSample
            })
          };
          break;
        }
        case "getPluginInventory": {
          result = {
            tool: normalizedCall.tool,
            ok: true,
            data: {
              plugins: this.deps.listPlugins().map((plugin) => ({
                id: plugin.id,
                name: plugin.manifest.name,
                version: plugin.manifest.version,
                status: plugin.status,
                requestedPermissions: plugin.manifest.permissions,
                grantedPermissions: plugin.grantedPermissions,
                panels: plugin.manifest.panels.map((panel) => ({
                  id: panel.id,
                  title: panel.title
                })),
                warningCount: plugin.warnings.length
              }))
            }
          };
          break;
        }
        case "getAdvancedTestingSummary": {
          const activeAllowlist = this.deps.allowlist();
          const captures = runCaptures(run, this.deps.getCaptures(), activeAllowlist, "");
          const frames = this.deps.getWebSocketEvents().filter((event) => isAllowedTarget(event.url, activeAllowlist));
          result = {
            tool: normalizedCall.tool,
            ok: true,
            data: buildAdvancedTestingSummary(captures, frames)
          };
          break;
        }
        case "prepareWorkflowDraft": {
          const workflow = normalizeWorkflowDefinition(normalizedCall.input.workflow);
          if (!workflow) {
            throw new Error("Prepared workflow definition was invalid.");
          }
          result = {
            tool: normalizedCall.tool,
            ok: true,
            data: {
              workflow,
              note: normalizedCall.input.note || "Prepared workflow draft for operator review."
            }
          };
          break;
        }
        case "runWorkflow": {
          const workflow = this.deps.listWorkflows().find((item) => item.id === normalizedCall.input.workflowId);
          if (!workflow) {
            throw new Error("Workflow was not found.");
          }
          const requestedWorkflowBudget = workflow.mode === "active" ? workflow.scope.maxRequests : 0;
          if (counters.workflowRequestCount + requestedWorkflowBudget > run.policy.maxWorkflowRequests) {
            throw new Error("Workflow would exceed the AI-First workflow request budget.");
          }
          if (workflow.mode === "active" && counters.replayCount + workflow.scope.maxRequests > run.policy.maxReplay) {
            throw new Error("Workflow would exceed the AI-First replay budget.");
          }
          const workflowRun = await this.deps.runWorkflow({
            workflowId: normalizedCall.input.workflowId,
            inputs: normalizedCall.input.inputs,
            source: "ai"
          });
          counters.replayCount += workflowRun.actionCount;
          counters.workflowRequestCount += workflowRun.actionCount || requestedWorkflowBudget;
          result = {
            tool: normalizedCall.tool,
            ok: true,
            data: workflowRun
          };
          break;
        }
        case "sendReplay": {
          counters.replayCount += 1;
          result = { tool: normalizedCall.tool, ok: true, data: await this.deps.sendReplay(normalizedCall.input.draft) };
          break;
        }
        case "proposeRunMemory": {
          const memory = normalizeAgentRunMemory(
            {
              ...normalizedCall.input,
              id: createId("memory"),
              sourceRunId: run.id,
              status: "proposed",
              createdAt: nowIso(),
              updatedAt: nowIso()
            },
            createId("memory")
          );
          if (!memory) {
            throw new Error("Run memory proposal requires a title and notes.");
          }
          result = {
            tool: normalizedCall.tool,
            ok: true,
            data: {
              memory,
              note: "Proposed run memory for operator confirmation."
            }
          };
          break;
        }
      }
    } catch (error) {
      result = {
        tool: normalizedCall.tool,
        ok: false,
        error: error instanceof Error ? error.message : "Agent tool failed."
      };
    }
    let finalizedCapabilities = capabilityStateFromRun(next);
    let capabilityRevocationNote = "";
    if (capabilityReceiptId && capabilityLease && capabilityUse) {
      const outcome = capabilityOutcome(result);
      finalizedCapabilities = finalizeAgentCapabilityReceipt(
        finalizedCapabilities,
        capabilityReceiptId,
        outcome.status,
        outcome.reason,
        nowIso()
      );
      const observedUrl = capabilityResultUrl(result);
      if (
        observedUrl &&
        !leaseAllowsObservedUrl(capabilityLease, observedUrl, capabilityUse.method, capabilityUse.identity)
      ) {
        capabilityRevocationNote = `Observed browser target escaped lease bounds: ${observedUrl}`;
      } else if (outcome.status === "unknown" || outcome.status === "failed") {
        capabilityRevocationNote = `Capability outcome was ${outcome.status}: ${outcome.reason}`;
      } else if (
        normalizedCall.tool !== "loadAuthState" &&
        normalizedCall.tool !== "activateIdentityProfile" &&
        normalizedCall.tool !== "verifyIdentityProfile"
      ) {
        const postActionAuthFingerprint = await this.currentAuthFingerprint();
        if (postActionAuthFingerprint !== preActionAuthFingerprint) {
          capabilityRevocationNote = "Auth state changed unexpectedly during the leased action.";
        }
      }
      if (capabilityRevocationNote) {
        finalizedCapabilities = invalidateAgentCapabilityLease(
          finalizedCapabilities,
          capabilityLease.id,
          capabilityRevocationNote,
          nowIso()
        );
      }
    }
    if (result.ok && normalizedCall.tool === "loadAuthState") {
      counters.activeIdentity = normalizedCall.input.name;
    }
    if (result.ok && normalizedCall.tool === "activateIdentityProfile") {
      counters.activeIdentity = normalizedCall.input.identityId;
    }
    if (result.ok && normalizedCall.tool === "verifyIdentityProfile") {
      counters.activeIdentity = normalizedCall.input.identityId;
    }
    if (
      result.ok &&
      (normalizedCall.tool === "activateIdentityProfile" || normalizedCall.tool === "verifyIdentityProfile")
    ) {
      finalizedCapabilities = revokeGrantedAgentCapabilities(
        finalizedCapabilities,
        "Identity activation changed the controlled browser authority context.",
        nowIso()
      );
    }

    next = withUpdate(next, this.deps.saveRun, {
      checkpoint: checkpointFromCounters(counters),
      capabilities: finalizedCapabilities,
      timeline: [
        ...next.timeline,
        timeline(`Tool result: ${normalizedCall.tool}`, {
          phase: result.ok ? "tool-result" : "failure",
          summary: result.ok ? `${normalizedCall.tool} completed` : `${normalizedCall.tool} failed`,
          target: visibleTargetForTool(normalizedCall),
          recoveryActions: result.ok ? undefined : recoveryActionsForFailure(normalizedCall),
          capabilityReceiptId: capabilityReceiptId || undefined,
          actionId: actionId || undefined,
          identityId: counters.activeIdentity || undefined,
          toolCall: normalizedCall,
          toolResult: result
        }),
        ...(capabilityRevocationNote
          ? [
              timeline(`Capability lease revoked: ${capabilityRevocationNote}`, {
                phase: "policy-block" as const,
                summary: "Unexpected effect revoked capability lease",
                target: visibleTargetForTool(normalizedCall),
                capabilityReceiptId
              })
            ]
          : [])
      ]
    });
    return next;
  }

  private async execute(runId: string) {
    if (running.has(runId)) {
      return;
    }
    running.add(runId);
    let counters: RunCounters | null = null;

    try {
      let run = this.deps.loadRun(runId);
      if (!run) {
        return;
      }
      if (run.status === "completed" || run.status === "stopped" || run.status === "paused" || run.status === "failed") {
        return;
      }
      counters = countersFromRun(run);
      const persistedCheckpoint = normalizedCheckpoint(run);
      const pendingRecovery = persistedCheckpoint.pendingRecovery;
      const pendingCapabilityCall = persistedCheckpoint.pendingCapabilityCall;
      this.deps.setActiveRunId?.(run.id);

      run = withUpdate(run, this.deps.saveRun, {
        status: "running",
        checkpoint: checkpointFromCounters(counters, pendingRecovery, pendingCapabilityCall),
        timeline: [...run.timeline, timeline("Run started. Scope and policy checks are active.", { phase: "status" })]
      });

      if (this.isStopped(runId)) {
        return;
      }

      if (pendingRecovery) {
        if (pendingRecovery.action === "retry-with-evidence") {
          run = withUpdate(run, this.deps.saveRun, {
            checkpoint: checkpointFromCounters(counters, pendingRecovery),
            timeline: [
              ...run.timeline,
              timeline("Refreshed scoped captures and project context before recovery.", { phase: "status" })
            ]
          });
        }
        if (pendingRecovery.call) {
          run = await this.callTool(run, counters, pendingRecovery.call);
          const recoveryResult = run.timeline.at(-1);
          if (recoveryResult?.phase === "failure" || recoveryResult?.phase === "policy-block") {
            withUpdate(run, this.deps.saveRun, {
              status: "paused",
              checkpoint: checkpointFromCounters(counters),
              timeline: [
                ...run.timeline,
                timeline("Recovery retry failed. The run is paused for operator direction.", { phase: "status" })
              ]
            });
            return;
          }
        }
        run = withUpdate(run, this.deps.saveRun, {
          checkpoint: checkpointFromCounters(counters, undefined, pendingCapabilityCall),
          timeline: [...run.timeline, timeline("Recovery completed; autonomous planning resumed.", { phase: "status" })]
        });
      }

      if (pendingCapabilityCall) {
        run = await this.callTool(run, counters, pendingCapabilityCall);
        const capabilityResult = run.timeline.at(-1);
        if (capabilityResult?.phase === "failure" || capabilityResult?.phase === "policy-block") {
          withUpdate(run, this.deps.saveRun, {
            status: "paused",
            checkpoint: checkpointFromCounters(counters, undefined, pendingCapabilityCall),
            timeline: [
              ...run.timeline,
              timeline("Capability-gated action remains paused. Review or amend the lease before retrying.", {
                phase: "status",
                target: capabilityResult.target
              })
            ]
          });
          return;
        }
        run = withUpdate(run, this.deps.saveRun, {
          checkpoint: checkpointFromCounters(counters),
          timeline: [...run.timeline, timeline("Granted capability action completed; autonomous planning resumed.", { phase: "status" })]
        });
      }

      while (!this.isStopped(runId)) {
        if (Date.now() - counters.startedAt > run.policy.maxRuntimeMs) {
          throw new Error("Agent exceeded its runtime budget before returning finish.");
        }
        if (counters.stepCount >= run.policy.maxSteps) {
          throw new Error("Agent exhausted its tool-call budget before returning finish.");
        }

        const decision = await this.deps.decideNextAction(
          decisionContext({
            run,
            counters,
            startUrl: counters.startUrl,
            targetOrigin: counters.targetOrigin,
            deps: this.deps
          })
        );

        if (this.isStopped(runId)) {
          return;
        }
        if (Date.now() - counters.startedAt > run.policy.maxRuntimeMs) {
          throw new Error("Agent exceeded its runtime budget while waiting for the next planner decision.");
        }

        if (!decision || (decision.action !== "tool" && decision.action !== "finish")) {
          throw new Error("Agent decision must choose either tool or finish.");
        }

        if (decision.missionPatch) {
          const missionResult = applyAgentMissionPatch(missionFromRun(run), decision.missionPatch, nowIso());
          if (!missionResult.ok) {
            throw new Error(missionResult.error);
          }
          const evidenceErrors = validateAgentMissionEvidence(missionResult.mission, runtimeEvidenceCatalog(this.deps));
          if (evidenceErrors.length > 0) {
            throw new Error(`Mission patch failed evidence validation: ${evidenceErrors.join(", ")}`);
          }
          run = withUpdate(run, this.deps.saveRun, {
            mission: missionResult.mission,
            timeline: [
              ...run.timeline,
              timeline(`Mission graph advanced to revision ${missionResult.mission.revision}.`, {
                phase: "decision",
                summary: `${decision.missionPatch.updates.length} mission update${decision.missionPatch.updates.length === 1 ? "" : "s"}`
              })
            ]
          });
          if (missionHasOpenQuestion(missionResult.mission)) {
            withUpdate(run, this.deps.saveRun, {
              status: "paused",
              checkpoint: checkpointFromCounters(counters),
              timeline: [
                ...run.timeline,
                timeline("Run paused for an operator answer recorded in the Mission Graph.", {
                  phase: "status",
                  summary: "Operator input required"
                })
              ]
            });
            return;
          }
          if (decision.action === "tool" && missionResult.mission.status !== "active") {
            throw new Error(`Agent cannot call a tool while mission status is ${missionResult.mission.status}.`);
          }
        }

        if (decision.action === "tool" && decision.leaseRequest) {
          const profile = getAgentRunProfile(run.profileId);
          if (!decision.leaseRequest.tools.includes(decision.call.tool)) {
            throw new Error("Agent leaseRequest must include the selected tool.");
          }
          if (decision.leaseRequest.tools.some((tool) => !profile.allowedTools.includes(tool))) {
            throw new Error("Agent leaseRequest exceeds the selected run profile.");
          }
          if (decision.leaseRequest.grants.some((grant) => !isAllowedTarget(grant.origin, this.deps.allowlist()))) {
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
          withUpdate(run, this.deps.saveRun, {
            status: "paused",
            capabilities: proposed.state,
            checkpoint: checkpointFromCounters(counters, undefined, decision.call),
            timeline: [
              ...run.timeline,
              timeline(`Capability lease review required: ${proposed.lease.name}`, {
                phase: "policy-block",
                summary: `${proposed.lease.riskTier} lease proposed for ${decision.call.tool}`,
                target: visibleTargetForTool(decision.call)
              })
            ]
          });
          return;
        }

        if (decision.action === "finish") {
          const evidenceCatalog = runtimeEvidenceCatalog(this.deps);
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
                recoveryActions: ["retry-with-evidence", "draft-finding", "stop-run"]
              })
            );
          run = withUpdate(run, this.deps.saveRun, {
            status: "completed",
            mission: applyAgentMissionUpdates(
              missionFromRun(run),
              [
                {
                  kind: "mission-status",
                  status: "completed",
                  stopReason: decision.rationale || "Agent completed the scoped mission."
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
                  `Agent returned finish with ${nextFindings.length} draft finding${nextFindings.length === 1 ? "" : "s"}.`,
                { phase: "status" }
              )
            ]
          });
          return;
        }

        if (!decision.call) {
          throw new Error("Agent tool decision did not include a tool call.");
        }

        if (decision.rationale) {
          run = withUpdate(run, this.deps.saveRun, {
            timeline: [
              ...run.timeline,
              timeline(`Agent selected ${decision.call.tool}: ${decision.rationale}`, {
                phase: "decision",
                summary: decision.rationale,
                target: visibleTargetForTool(decision.call)
              })
            ]
          });
        }
        run = await this.callTool(run, counters, decision.call);

        if (toolMayEmitNetwork(decision.call)) {
          await this.waitForSettle(1200);
          this.deps.setActiveActionContext?.(null);
        }

        const interruptedStatus = requestedRunStatus.get(runId);
        if (interruptedStatus) {
          const interruptedMission =
            interruptedStatus === "stopped"
              ? applyAgentMissionUpdates(
                  missionFromRun(run),
                  [{ kind: "mission-status", status: "stopped", stopReason: "Stopped by operator." }],
                  nowIso()
                )
              : missionFromRun(run);
          withUpdate(run, this.deps.saveRun, {
            status: interruptedStatus,
            mission: interruptedMission,
            capabilities:
              interruptedStatus === "stopped"
                ? revokeGrantedAgentCapabilities(
                    capabilityStateFromRun(run),
                    "Run stopped by operator.",
                    nowIso()
                  )
                : capabilityStateFromRun(run),
            checkpoint: checkpointFromCounters(counters),
            timeline: [
              ...run.timeline,
              timeline(
                interruptedStatus === "paused"
                  ? "Pause completed after the active tool settled."
                  : "Stop completed after the active tool settled.",
                { phase: "status" }
              )
            ]
          });
          return;
        }

        const lastToolEntry = run.timeline.at(-1);
        if (lastToolEntry?.phase === "failure" || lastToolEntry?.phase === "policy-block") {
          run = withUpdate(run, this.deps.saveRun, {
            status: "paused",
            checkpoint: checkpointFromCounters(counters),
            timeline: [
              ...run.timeline,
              timeline("Run paused after a failed or policy-blocked step. Choose a recovery action to continue.", {
                phase: "status",
                target: lastToolEntry.target
              })
            ]
          });
          return;
        }

      }
    } catch (error) {
      const run = this.deps.loadRun(runId);
      if (run) {
        const message = error instanceof Error ? error.message : "Agent run failed.";
        withUpdate(run, this.deps.saveRun, {
          status: "failed",
          error: message,
          checkpoint: counters ? checkpointFromCounters(counters) : elapsedCheckpoint(run),
          timeline: [
            ...run.timeline,
            timeline(`Run failed: ${message}`, {
              phase: "failure",
              summary: message,
              recoveryActions: recoveryActionsForFailure()
            })
          ]
        });
      }
    } finally {
      this.deps.setActiveActionContext?.(null);
      this.deps.setActiveRunId?.(null);
      running.delete(runId);
      stopped.delete(runId);
      requestedRunStatus.delete(runId);
    }
  }
}

export { DEFAULT_AGENT_POLICY };
