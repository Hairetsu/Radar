import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow, ipcMain, shell, webContents, nativeImage, dialog } from "electron";
import {
  generateCACertificate,
  generateSPKIFingerprint,
  getLocal,
  type CompletedRequest,
  type CompletedResponse,
  type WebSocketClose,
  type WebSocketMessage
} from "mockttp";
import {
  DEFAULT_ALLOWLIST,
  isAllowedTarget,
  normalizeTargetRules,
  shouldTrustLocalCertificate
} from "../shared/allowlist.js";
import { toCaptureEntry, proxyRequestToCapture } from "../shared/capture.js";
import type {
  BrowserState,
  CapturedRequest,
  CaptureInterceptRecord,
  FindingReportOptions,
  InterceptConfig,
  InterceptQueueItem,
  InterceptResponseDraft,
  InterceptResolution,
  InterceptRule,
  InterceptState,
  LocalContext,
  MatchReplaceRule,
  ProxyState,
  ReplayDraft,
  SslEvent,
  WebSocketDirection,
  WebSocketEvent
} from "../shared/domain.js";
import { normalizeAutomatePayloadSets } from "../shared/automate.js";
import type {
  AgentRun
} from "../shared/agent-types.js";
import { normalizeDraft, MAX_REPLAY_BODY } from "../shared/draft.js";
import { safeJsonHeaders } from "../shared/headers.js";
import { matchingInterceptRules, normalizeInterceptRules } from "../shared/interceptRules.js";
import { applyMatchReplaceRules, normalizeMatchReplaceRules } from "../shared/matchReplace.js";
import { annotationContext } from "../shared/evidenceTags.js";
import {
  buildFindingReport,
  findingFromAgentFinding,
  normalizeFinding
} from "../shared/findings.js";
import { normalizeSavedFilters } from "../shared/savedFilters.js";
import { filterCapturesByQuery, filterWebSocketEventsByQuery } from "../shared/trafficQuery.js";
import {
  searchGlobal,
  type GlobalSearchRequest
} from "../shared/globalSearch.js";
import { buildAdvancedTestingSummary } from "../shared/advancedTesting.js";
import { MAX_CAPTURED_BODY, truncateText } from "../shared/text.js";
import { normalizeUrl as normalizeBrowserUrl } from "../shared/url.js";
import { BUILT_IN_WORKFLOWS } from "../shared/workflows.js";
import { openLocalStore, type LocalStore } from "./localStore.js";
import { applyCaptureAttribution } from "./captureAttribution.js";
import {
  createIdentityActivation,
  createSerializedIdentityActivator,
  identityBrowserProfileDir
} from "./identityProfiles.js";
import { createIdentityController } from "./identity/identityController.js";
import { seedDemoProject } from "./demoProject.js";
import { registerAgentIpc } from "./ipc/registerAgentIpc.js";
import { registerAiIpc } from "./ipc/registerAiIpc.js";
import { registerAutomateIpc } from "./ipc/registerAutomateIpc.js";
import { registerBrowserIpc } from "./ipc/registerBrowserIpc.js";
import { registerCaptureIpc } from "./ipc/registerCaptureIpc.js";
import { registerInterceptIpc } from "./ipc/registerInterceptIpc.js";
import { registerIdentityIpc } from "./ipc/registerIdentityIpc.js";
import { registerFindingsIpc } from "./ipc/registerFindingsIpc.js";
import { registerLocalIpc } from "./ipc/registerLocalIpc.js";
import { registerProjectIpc } from "./ipc/registerProjectIpc.js";
import { registerPluginIpc } from "./ipc/registerPluginIpc.js";
import { registerRepeaterIpc } from "./ipc/registerRepeaterIpc.js";
import { registerWorkflowIpc } from "./ipc/registerWorkflowIpc.js";
import {
  loadSettings as loadAiSettings,
  saveSettings as saveAiSettings,
  previewContext as previewAiContext,
  runAiTask,
  snapshotAudit as snapshotAiAudit,
  connectPreset as connectAiPreset,
  probeSettings as probeAiSettings,
  loadSkills as loadAiSkills,
  upsertSkill as saveAiSkill,
  deleteSkill as deleteAiSkill,
  getAiModels,
  refreshAiModels,
  reconcileSettingsModel,
  loginCursorCli
} from "./ai/index.js";
import { AgentRuntime } from "./agent/runtime.js";
import { createAiAgentPlanner } from "./agent/planner.js";
import { createAutomateController } from "./automate/automateController.js";
import { createPageInspectionController } from "./browser/pageInspection.js";
import { createPluginController } from "./plugins/pluginController.js";
import { createProjectArtifactController } from "./project/projectArtifactController.js";
import { createReplayController } from "./replay/replayController.js";
import { createWorkflowController } from "./workflows/workflowController.js";
import { findCdpEndpointForUrl, type CdpListEntry } from "./chromeDebugging.js";
import { createPlaywrightBrowserController } from "./playwrightBrowser.js";
import { findSystemBrowser } from "./systemBrowser.js";
import { ensureRadarKeychainInSearchList, trustProxyCa } from "./trustCa.js";

const regressionUserDataPath = process.env.RADAR_REGRESSION_USER_DATA_DIR?.trim();
if (regressionUserDataPath) {
  app.setPath("userData", path.resolve(regressionUserDataPath));
}

const regressionArtifactPath = process.env.RADAR_REGRESSION_ARTIFACT_DIR?.trim();

const regressionProxyPort = Number.parseInt(process.env.RADAR_REGRESSION_PROXY_PORT || "", 10);
const defaultProxyPort = Number.isInteger(regressionProxyPort) && regressionProxyPort > 0 && regressionProxyPort <= 65_535
  ? regressionProxyPort
  : 8088;

const regressionDebugPort = Number.parseInt(process.env.RADAR_REGRESSION_DEBUG_PORT || "", 10);
const defaultDebugPort = Number.isInteger(regressionDebugPort) && regressionDebugPort > 0 && regressionDebugPort <= 65_535
  ? regressionDebugPort
  : 9223;

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const HOT_CAPTURE_LIMIT = 500;
const HOT_WEBSOCKET_LIMIT = 1000;
const MAX_INTERCEPT_QUEUE = 80;

const defaultAllowlist = DEFAULT_ALLOWLIST;

let mainWindow: BrowserWindow | null = null;
let targetBrowserWindow: BrowserWindow | undefined;
let chromeProcess: ChildProcess | null = null;
let proxyServer: ReturnType<typeof getLocal> | undefined;
let allowlist = [...defaultAllowlist];
const captured = new Map<string, CapturedRequest>();
const CAPTURE_SESSION_ID = Symbol("captureSessionId");
type SessionBoundCapture = CapturedRequest & { [CAPTURE_SESSION_ID]?: string };
const captureSessionIds = new Map<string, string>();
const webSocketEvents: WebSocketEvent[] = [];
const webSocketConnections = new Map<string, { url: string; initiator: string }>();
const webSocketSessionIds = new Map<string, string>();
const attachedContents = new Set<number>();
const sslEvents: SslEvent[] = [];
const interceptQueue = new Map<string, PendingIntercept>();
let lastCaptureChangeAt = Date.now();
let localStore: LocalStore | null = null;
let localContext: LocalContext | null = null;
let agentRuntime: AgentRuntime | null = null;
let activeAgentRunId = "";
let activeNavigationId = "";
let activeActionId = "";
let activeIdentityId = "";
let activeActivationId = "";
let activeSequenceRunId = "";
let activeExperimentId = "";
let activeChromeProfileDir = "";
const serializeIdentityActivation = createSerializedIdentityActivator();
let chromeObserverSocket: CdpSocket | null = null;
let chromeObserverInstanceId = "";
let chromeObserverSessionId = "";
let chromeObserverCommandId = 0;
const chromeObserverRequests = new Map<string, string>();
const chromeObserverWebSockets = new Map<
  string,
  {
    url: string;
    agentRunId?: string;
    navigationId?: string;
    actionId?: string;
    identityId?: string;
    activationId?: string;
    sequenceRunId?: string;
    experimentId?: string;
  }
>();
const chromeObserverPending = new Map<
  number,
  { resolve: (value: unknown) => void; reject: (error: Error) => void; timeout: ReturnType<typeof setTimeout> }
>();
let browserState: BrowserState = {
  open: false,
  url: "",
  title: "",
  loading: false,
  engine: "none"
};
const playwrightBrowser = createPlaywrightBrowserController({
  allowlist: () => allowlist.slice(),
  onStateChange: (automation) => {
    browserState = {
      ...browserState,
      url: automation.url || browserState.url,
      title: automation.title || browserState.title,
      loading: automation.loading,
      automation: automation.status,
      automationPageCount: automation.pageCount,
      automationError: automation.error
    };
  }
});
let proxyState: ProxyState = {
  running: false,
  port: defaultProxyPort,
  proxyUrl: `http://127.0.0.1:${defaultProxyPort}`,
  caCertPath: "",
  caKeyPath: "",
  caFingerprint: ""
};
let interceptConfig: InterceptConfig = {
  requestEnabled: false,
  responseEnabled: false
};
let interceptRules: InterceptRule[] = [];
let matchReplaceRules: MatchReplaceRule[] = [];

type ProxyRequestCallbackResult =
  | void
  | {
      method?: string;
      url?: string;
      headers?: Record<string, string>;
      body?: string;
      response?: "close" | "reset";
    };

type ProxyResponseCallbackResult =
  | void
  | "close"
  | "reset"
  | {
      statusCode?: number;
      statusMessage?: string;
      headers?: Record<string, string>;
      body?: string;
    };

type PendingIntercept = {
  item: InterceptQueueItem;
} & (
  | {
      item: InterceptQueueItem & { stage: "request" };
      resolve: (result: ProxyRequestCallbackResult) => void;
    }
  | {
      item: InterceptQueueItem & { stage: "response" };
      resolve: (result: ProxyResponseCallbackResult) => void;
    }
);

type ProxyPassThroughResponse = {
  id: string;
  statusCode: number;
  statusMessage?: string;
  headers?: Record<string, unknown>;
  body: {
    getText: () => Promise<string | undefined>;
  };
};

function activeLocalContext() {
  if (!localContext) {
    throw new Error("Local workspace is not ready.");
  }
  return localContext;
}

function activeLocalStore() {
  if (!localStore) {
    throw new Error("Local store is not ready.");
  }
  return localStore;
}

function activeAgentRuntime() {
  if (!agentRuntime) {
    agentRuntime = createAgentRuntime();
  }
  return agentRuntime;
}

function endActiveIdentityActivation() {
  if (localStore && localContext && activeActivationId) {
    try {
      const activation = localStore
        .listIdentityActivations(localContext.session.id, 100)
        .find((item) => item.id === activeActivationId && item.status === "active");
      if (activation) {
        localStore.upsertIdentityActivation(localContext.session.id, {
          ...activation,
          status: "ended",
          endedAt: new Date().toISOString()
        });
      }
    } catch {
      /* Context shutdown remains fail-closed even if lifecycle persistence fails. */
    }
  }
  activeIdentityId = "";
  activeActivationId = "";
  activeActionId = "";
  activeNavigationId = "";
  activeSequenceRunId = "";
  activeExperimentId = "";
  activeChromeProfileDir = "";
}

function activateLocalContext(nextContext: LocalContext) {
  const profileChanged = Boolean(localContext && localContext.profile.id !== nextContext.profile.id);
  const workspaceChanged = Boolean(localContext && localContext.workspace.id !== nextContext.workspace.id);
  if (profileChanged || workspaceChanged) {
    endActiveIdentityActivation();
    stopChromeProcess();
    browserState = {
      open: false,
      url: browserState.url,
      title: "",
      loading: false,
      engine: "none"
    };
  }

  localContext = nextContext;
  hydrateActiveLocalState();
  return localContext;
}

function rememberCapture(entry: CapturedRequest) {
  const currentSessionId = localContext?.session.id || "";
  const explicitSessionId = (entry as SessionBoundCapture)[CAPTURE_SESSION_ID] || "";
  const boundSessionId = explicitSessionId || captureSessionIds.get(entry.id) || currentSessionId;
  if (boundSessionId && !captureSessionIds.has(entry.id)) {
    captureSessionIds.set(entry.id, boundSessionId);
    while (captureSessionIds.size > HOT_CAPTURE_LIMIT * 4) {
      const oldest = captureSessionIds.keys().next().value;
      if (!oldest) break;
      captureSessionIds.delete(oldest);
    }
  }
  const isActiveSession = Boolean(boundSessionId && boundSessionId === currentSessionId);
  const existing = isActiveSession ? captured.get(entry.id) : undefined;
  entry = applyCaptureAttribution(
    entry,
    existing,
    entry.source === "proxy" || !isActiveSession
      ? {}
      : {
          agentRunId: activeAgentRunId,
          navigationId: activeNavigationId,
          actionId: activeActionId,
          identityId: activeIdentityId,
          activationId: activeActivationId,
          sequenceRunId: activeSequenceRunId,
          experimentId: activeExperimentId
        }
  );
  if (boundSessionId) (entry as SessionBoundCapture)[CAPTURE_SESSION_ID] = boundSessionId;
  if (existing?.intercept && !entry.intercept) {
    entry.intercept = existing.intercept;
  }
  if (existing?.rewrites && !entry.rewrites) {
    if (existing.rewrites.some((hit) => hit.stage === "request")) {
      entry.requestHeaders = existing.requestHeaders;
      entry.requestBody = existing.requestBody;
    }
    if (existing.rewrites.some((hit) => hit.stage === "response")) {
      entry.status = existing.status;
      entry.statusText = existing.statusText;
      entry.responseHeaders = existing.responseHeaders;
      entry.responseBody = existing.responseBody;
    }
    entry.rewrites = existing.rewrites;
  }
  if (isActiveSession) {
    captured.set(entry.id, entry);
    lastCaptureChangeAt = Date.now();
    while (captured.size > HOT_CAPTURE_LIMIT) {
      const oldest = captured.keys().next().value;
      if (!oldest) {
        break;
      }
      captured.delete(oldest);
    }
  }

  if (localStore && boundSessionId) {
    localStore.upsertCapture(boundSessionId, entry);
  }
}

function bindCaptureEntryToSession(entry: CapturedRequest, sessionId: string) {
  if (!entry.id || !sessionId) return entry;
  (entry as SessionBoundCapture)[CAPTURE_SESSION_ID] = sessionId;
  if (!captureSessionIds.has(entry.id)) captureSessionIds.set(entry.id, sessionId);
  return entry;
}

function bindCaptureToCurrentSession(captureId: string) {
  const sessionId = localContext?.session.id || "";
  if (captureId && sessionId && !captureSessionIds.has(captureId)) captureSessionIds.set(captureId, sessionId);
}

function parseCaptureUrlParts(url: string) {
  try {
    const parsed = new URL(url);
    return {
      host: parsed.host,
      path: `${parsed.pathname}${parsed.search}`
    };
  } catch {
    return {
      host: url || "request",
      path: "/"
    };
  }
}

function interceptStateSnapshot(): InterceptState {
  return {
    config: { ...interceptConfig },
    queue: Array.from(interceptQueue.values()).map((pending) => ({ ...pending.item }))
  };
}

function updateCaptureIntercept(
  captureId: string,
  stage: "request" | "response",
  queuedAt: string,
  resolution: InterceptResolution,
  edited: boolean,
  note: string,
  ruleHits = [] as CaptureInterceptRecord["ruleHits"]
) {
  const entry = captured.get(captureId);
  if (!entry) {
    return;
  }
  const record: CaptureInterceptRecord = {
    stage,
    queuedAt,
    resolvedAt: resolution === "queued" ? undefined : new Date().toISOString(),
    resolution,
    edited,
    note,
    ruleHits
  };
  const existing = entry.intercept || [];
  entry.intercept = [...existing.filter((item) => item.stage !== stage || item.queuedAt !== queuedAt), record];
  rememberCapture(entry);
}

function applyDraftToCapture(captureId: string, draft: ReplayDraft) {
  const entry = captured.get(captureId);
  if (!entry) {
    return;
  }
  const parts = parseCaptureUrlParts(draft.url);
  entry.method = draft.method;
  entry.url = draft.url;
  entry.host = parts.host;
  entry.path = parts.path;
  entry.requestHeaders = draft.headers;
  entry.requestBody = draft.body;
  entry.allowed = isAllowedTarget(draft.url, allowlist);
  rememberCapture(entry);
}

function normalizeResponseDraft(input: InterceptResponseDraft): InterceptResponseDraft {
  return {
    status: Math.min(Math.max(Math.round(Number(input.status || 200)), 100), 599),
    statusText: String(input.statusText || "").slice(0, 120),
    headers: safeJsonHeaders(input.headers || {}),
    body: truncateText(typeof input.body === "string" ? input.body : "")
  };
}

function applyResponseDraftToCapture(captureId: string, draft: InterceptResponseDraft) {
  const entry = captured.get(captureId);
  if (!entry) {
    return;
  }
  entry.status = draft.status;
  entry.statusText = draft.statusText;
  entry.responseHeaders = draft.headers;
  entry.responseBody = draft.body;
  rememberCapture(entry);
}

function queuedItemChanged(item: InterceptQueueItem, draft: ReplayDraft) {
  return (
    item.method !== draft.method ||
    item.url !== draft.url ||
    item.body !== draft.body ||
    JSON.stringify(item.headers) !== JSON.stringify(draft.headers)
  );
}

function queuedResponseChanged(item: InterceptQueueItem, draft: InterceptResponseDraft) {
  return (
    item.status !== draft.status ||
    (item.statusText || "") !== draft.statusText ||
    item.body !== draft.body ||
    JSON.stringify(item.headers) !== JSON.stringify(draft.headers)
  );
}

function shouldQueueForRules(capture: CapturedRequest, stage: "request" | "response") {
  const enabledRules = interceptRules.filter((rule) => rule.enabled);
  if (enabledRules.length === 0) {
    return { queue: true, hits: [] };
  }
  const hits = matchingInterceptRules(enabledRules, capture, stage);
  return { queue: hits.length > 0, hits };
}

function applyScopedMatchReplace(capture: CapturedRequest, stage: "request" | "response") {
  if (!capture.allowed) {
    return { capture, hits: [], changed: false };
  }
  return applyMatchReplaceRules(matchReplaceRules, capture, stage);
}

function requestTransformFromCapture(capture: CapturedRequest): Exclude<ProxyRequestCallbackResult, void> {
  return {
    method: capture.method,
    url: capture.url,
    headers: capture.requestHeaders,
    body: capture.requestBody
  };
}

function responseTransformFromCapture(capture: CapturedRequest): Exclude<ProxyResponseCallbackResult, void | "close" | "reset"> {
  return {
    statusCode: capture.status || 200,
    statusMessage: capture.statusText,
    headers: capture.responseHeaders,
    body: capture.responseBody
  };
}

function resolveInterceptItem(
  id: string,
  resolution: Exclude<InterceptResolution, "queued">,
  draftInput?: ReplayDraft,
  responseInput?: InterceptResponseDraft
) {
  const pending = interceptQueue.get(id);
  if (!pending) {
    throw new Error("Intercept queue item was not found.");
  }

  const item = pending.item;
  const draft = draftInput ? normalizeDraft(draftInput) : normalizeDraft(item);
  const responseDraft = responseInput
    ? normalizeResponseDraft(responseInput)
    : normalizeResponseDraft({
        status: item.status || 200,
        statusText: item.statusText || "",
        headers: item.headers,
        body: item.body
      });
  const edited = item.stage === "response" ? queuedResponseChanged(item, responseDraft) : queuedItemChanged(item, draft);
  const hasRewrites = Boolean(item.rewrites?.length);

  if (item.stage === "request" && resolution !== "dropped" && !isAllowedTarget(draft.url, allowlist)) {
    throw new Error(`Edited intercept URL is out of scope: ${draft.url}`);
  }

  interceptQueue.delete(id);

  if (resolution === "dropped") {
    const entry = captured.get(item.captureId);
    if (entry) {
      entry.status = 0;
      entry.statusText = "Dropped by Radar intercept";
      entry.durationMs = Date.now() - new Date(item.queuedAt).getTime();
      rememberCapture(entry);
    }
    updateCaptureIntercept(
      item.captureId,
      item.stage,
      item.queuedAt,
      "dropped",
      edited,
      `Operator dropped the queued ${item.stage}.`,
      item.ruleHits
    );
    if (item.stage === "response") {
      pending.resolve("close");
    } else {
      pending.resolve({ response: "close" });
    }
    return interceptStateSnapshot();
  }

  if (item.stage === "response") {
    applyResponseDraftToCapture(item.captureId, responseDraft);
  } else if (edited || hasRewrites) {
    applyDraftToCapture(item.captureId, draft);
  }
  updateCaptureIntercept(
    item.captureId,
    item.stage,
    item.queuedAt,
    resolution === "resumed" ? "resumed" : edited ? "edited" : "forwarded",
    edited,
    edited ? `Operator edited and forwarded the queued ${item.stage}.` : `Operator forwarded the queued ${item.stage}.`,
    item.ruleHits
  );
  if (item.stage === "response") {
    pending.resolve(
      edited || hasRewrites
        ? {
            statusCode: responseDraft.status,
            statusMessage: responseDraft.statusText,
            headers: responseDraft.headers,
            body: responseDraft.body
          }
        : undefined
    );
  } else {
    pending.resolve(edited || hasRewrites ? draft : undefined);
  }
  return interceptStateSnapshot();
}

async function queueInterceptRequest(req: CompletedRequest): Promise<ProxyRequestCallbackResult> {
  if (!req.url?.startsWith("http")) {
    return undefined;
  }

  if (!isAllowedTarget(req.url, allowlist)) {
    return undefined;
  }

  const requestSessionId = localContext?.session.id || "";
  bindCaptureToCurrentSession(req.id);
  const bodyText = truncateText(await req.body.getText().catch(() => ""));
  let capture = proxyRequestToCapture({ req, bodyText, rules: allowlist });
  bindCaptureEntryToSession(capture, requestSessionId);
  const rewriteResult = applyScopedMatchReplace(capture, "request");
  capture = rewriteResult.capture;
  if (rewriteResult.changed) {
    rememberCapture(capture);
  }

  const rewriteTransform = rewriteResult.changed ? requestTransformFromCapture(capture) : undefined;

  if (!interceptConfig.requestEnabled || interceptQueue.size >= MAX_INTERCEPT_QUEUE) {
    return rewriteTransform;
  }

  const ruleDecision = shouldQueueForRules(capture, "request");
  if (!ruleDecision.queue) {
    return rewriteTransform;
  }
  const queuedAt = new Date().toISOString();
  capture.intercept = [
    {
      stage: "request",
      queuedAt,
      resolution: "queued",
      edited: false,
      note: "Scoped proxy request paused before upstream.",
      ruleHits: ruleDecision.hits
    }
  ];
  rememberCapture(capture);

  const { host, path: requestPath } = parseCaptureUrlParts(capture.url);
  const item: InterceptQueueItem & { stage: "request" } = {
    id: `intercept_${randomUUID()}`,
    captureId: capture.id,
    stage: "request",
    queuedAt,
    method: capture.method,
    url: capture.url,
    host,
    path: requestPath,
    headers: capture.requestHeaders,
    body: capture.requestBody,
    allowed: capture.allowed,
    source: "proxy",
    note: "Paused before upstream",
    ruleHits: ruleDecision.hits,
    rewrites: rewriteResult.hits
  };

  return new Promise<ProxyRequestCallbackResult>((resolve) => {
    interceptQueue.set(item.id, { item, resolve });
  });
}

async function queueInterceptResponse(
  res: ProxyPassThroughResponse,
  req: CompletedRequest
): Promise<ProxyResponseCallbackResult> {
  if (!req.url?.startsWith("http")) {
    return undefined;
  }

  if (!isAllowedTarget(req.url, allowlist)) {
    return undefined;
  }

  const bodyText = truncateText(await res.body.getText().catch(() => ""));
  let capture = captured.get(req.id) || proxyRequestToCapture({ req, bodyText: "", rules: allowlist });
  capture.status = res.statusCode;
  capture.statusText = res.statusMessage || "";
  capture.responseHeaders = safeJsonHeaders(res.headers || {});
  capture.responseBody = bodyText;
  const rewriteResult = applyScopedMatchReplace(capture, "response");
  capture = rewriteResult.capture;
  if (rewriteResult.changed) {
    rememberCapture(capture);
  }

  const rewriteTransform = rewriteResult.changed ? responseTransformFromCapture(capture) : undefined;

  if (!interceptConfig.responseEnabled || interceptQueue.size >= MAX_INTERCEPT_QUEUE) {
    return rewriteTransform;
  }

  const ruleDecision = shouldQueueForRules(capture, "response");
  if (!ruleDecision.queue) {
    rememberCapture(capture);
    return rewriteTransform;
  }
  const queuedAt = new Date().toISOString();
  capture.intercept = [
    ...(capture.intercept || []),
    {
      stage: "response",
      queuedAt,
      resolution: "queued",
      edited: false,
      note: "Scoped proxy response paused before client delivery.",
      ruleHits: ruleDecision.hits
    }
  ];
  rememberCapture(capture);

  const { host, path: requestPath } = parseCaptureUrlParts(capture.url);
  const item: InterceptQueueItem & { stage: "response" } = {
    id: `intercept_${randomUUID()}`,
    captureId: capture.id,
    stage: "response",
    queuedAt,
    method: capture.method,
    url: capture.url,
    host,
    path: requestPath,
    headers: capture.responseHeaders,
    body: capture.responseBody,
    allowed: capture.allowed,
    source: "proxy",
    note: "Paused before client",
    status: capture.status || 200,
    statusText: capture.statusText,
    ruleHits: ruleDecision.hits,
    rewrites: rewriteResult.hits
  };

  return new Promise<ProxyResponseCallbackResult>((resolve) => {
    interceptQueue.set(item.id, { item, resolve });
  });
}

function rememberSslEvent(event: SslEvent) {
  sslEvents.unshift(event);
  sslEvents.splice(80);

  if (localStore && localContext) {
    localStore.insertSslEvent(localContext.session.id, event);
  }
}

function websocketHost(url: string) {
  try {
    return new URL(url).host;
  } catch {
    return url || "websocket";
  }
}

function websocketEvent({
  requestId,
  url,
  direction,
  opcode,
  payloadData = "",
  size,
  status,
  statusText,
  error,
  requestHeaders,
  responseHeaders,
  initiator
}: {
  requestId: string;
  url: string;
  direction: WebSocketDirection;
  opcode?: number;
  payloadData?: string;
  size?: number;
  status?: number;
  statusText?: string;
  error?: string;
  requestHeaders?: Record<string, unknown>;
  responseHeaders?: Record<string, unknown>;
  initiator?: string;
}): WebSocketEvent {
  return {
    id: `ws_${requestId}_${Date.now()}_${randomUUID()}`,
    requestId,
    createdAt: new Date().toISOString(),
    url,
    host: websocketHost(url),
    direction,
    opcode,
    payloadData: truncateText(payloadData || ""),
    size: typeof size === "number" ? size : Buffer.byteLength(payloadData || "", "utf8"),
    status,
    statusText,
    error,
    requestHeaders: safeJsonHeaders(requestHeaders || {}),
    responseHeaders: safeJsonHeaders(responseHeaders || {}),
    initiator,
    allowed: isAllowedTarget(url, allowlist)
  };
}

function rememberWebSocketConnection(requestId: string, url: string, initiator = "") {
  webSocketConnections.set(requestId, { url, initiator });
  const sessionId = localContext?.session.id || "";
  if (sessionId && !webSocketSessionIds.has(requestId)) webSocketSessionIds.set(requestId, sessionId);
  while (webSocketConnections.size > HOT_WEBSOCKET_LIMIT) {
    const oldest = webSocketConnections.keys().next().value;
    if (!oldest) {
      break;
    }
    webSocketConnections.delete(oldest);
  }
}

function webSocketConnectionFor(requestId: string) {
  return webSocketConnections.get(requestId) || { url: "", initiator: "proxy" };
}

function webSocketPayloadFromProxyMessage(message: WebSocketMessage) {
  const buffer = Buffer.from(message.content);
  if (!message.isBinary) {
    return buffer.toString("utf8");
  }
  return buffer.length === 0 ? "[binary 0 bytes]" : `[binary ${buffer.length} bytes]\n${buffer.toString("base64")}`;
}

function rememberProxyWebSocketRequest(req: CompletedRequest) {
  rememberWebSocketConnection(req.id, req.url, "proxy");
  rememberWebSocketEvent(
    websocketEvent({
      requestId: req.id,
      url: req.url,
      direction: "handshake",
      payloadData: "Client handshake",
      requestHeaders: req.headers || {},
      initiator: "proxy"
    })
  );
}

function rememberProxyWebSocketAccepted(res: CompletedResponse) {
  const connection = webSocketConnectionFor(res.id);
  rememberWebSocketEvent(
    websocketEvent({
      requestId: res.id,
      url: connection.url,
      direction: "handshake",
      payloadData: "Server handshake",
      status: res.statusCode,
      statusText: res.statusMessage || "",
      responseHeaders: res.headers || {},
      initiator: connection.initiator
    })
  );
}

function rememberProxyWebSocketMessage(message: WebSocketMessage) {
  const connection = webSocketConnectionFor(message.streamId);
  rememberWebSocketEvent(
    websocketEvent({
      requestId: message.streamId,
      url: connection.url,
      direction: message.direction === "received" ? "sent" : "received",
      opcode: message.isBinary ? 2 : 1,
      payloadData: webSocketPayloadFromProxyMessage(message),
      size: Buffer.from(message.content).length,
      initiator: connection.initiator
    })
  );
}

function rememberProxyWebSocketClose(close: WebSocketClose) {
  const connection = webSocketConnectionFor(close.streamId);
  rememberWebSocketEvent(
    websocketEvent({
      requestId: close.streamId,
      url: connection.url,
      direction: "closed",
      payloadData: close.closeReason || "WebSocket closed",
      status: close.closeCode,
      initiator: connection.initiator
    })
  );
  webSocketConnections.delete(close.streamId);
}

function rememberWebSocketEvent(event: WebSocketEvent) {
  const currentSessionId = localContext?.session.id || "";
  const boundSessionId = webSocketSessionIds.get(event.requestId) || currentSessionId;
  if (boundSessionId && !webSocketSessionIds.has(event.requestId)) {
    webSocketSessionIds.set(event.requestId, boundSessionId);
  }
  const isActiveSession = Boolean(boundSessionId && boundSessionId === currentSessionId);
  if (event.initiator !== "proxy" && isActiveSession) {
    event.agentRunId ||= activeAgentRunId || undefined;
    event.navigationId ||= activeNavigationId || undefined;
    event.actionId ||= activeActionId || undefined;
    event.identityId ||= activeIdentityId || undefined;
    event.activationId ||= activeActivationId || undefined;
    event.sequenceRunId ||= activeSequenceRunId || undefined;
    event.experimentId ||= activeExperimentId || undefined;
  }
  if (isActiveSession) {
    webSocketEvents.unshift(event);
    webSocketEvents.splice(HOT_WEBSOCKET_LIMIT);
  }

  if (localStore && boundSessionId) {
    localStore.insertWebSocketEvent(boundSessionId, event);
  }
}

function hydrateActiveLocalState() {
  if (!localStore || !localContext) {
    return;
  }

  allowlist = localStore.getTargets(localContext.workspace.id);
  interceptRules = localStore.listInterceptRules(localContext.workspace.id);
  matchReplaceRules = localStore.listMatchReplaceRules(localContext.workspace.id);
  captured.clear();
  for (const entry of localStore.listCaptures(localContext.session.id, HOT_CAPTURE_LIMIT).reverse()) {
    captureSessionIds.set(entry.id, localContext.session.id);
    bindCaptureEntryToSession(entry, localContext.session.id);
    captured.set(entry.id, entry);
  }

  sslEvents.splice(0, sslEvents.length, ...localStore.listSslEvents(localContext.session.id, 80));
  const storedWebSockets = localStore.listWebSocketEvents(localContext.session.id, HOT_WEBSOCKET_LIMIT);
  for (const event of storedWebSockets) webSocketSessionIds.set(event.requestId, localContext.session.id);
  webSocketEvents.splice(0, webSocketEvents.length, ...storedWebSockets);
}

function listHttpCaptures(limit = 400) {
  if (localStore && localContext) {
    return localStore
      .listCaptures(localContext.session.id, Math.max(limit, 1))
      .filter((entry) => entry.url.startsWith("http://") || entry.url.startsWith("https://"))
      .slice(0, limit);
  }
  return Array.from(captured.values())
    .filter((entry) => entry.url.startsWith("http://") || entry.url.startsWith("https://"))
    .slice(-limit)
    .reverse();
}

function listWebSocketEvents(limit = HOT_WEBSOCKET_LIMIT) {
  if (localStore && localContext) {
    return localStore.listWebSocketEvents(localContext.session.id, limit);
  }
  return webSocketEvents.slice(0, limit);
}

function webSocketEventMap() {
  return new Map(listWebSocketEvents(HOT_WEBSOCKET_LIMIT).map((event) => [event.id, event]));
}

async function waitForNetworkIdle({ idleMs = 700, timeoutMs = 8000 }: { idleMs?: number; timeoutMs?: number }) {
  if (browserState.engine === "chrome" && browserState.remoteDebuggingUrl) {
    const automation = await ensurePlaywrightBrowser();
    return automation.waitForNetworkIdle({ idleMs, timeoutMs });
  }
  const started = Date.now();
  let observedChangeAt = lastCaptureChangeAt;
  while (Date.now() - started < timeoutMs) {
    if (lastCaptureChangeAt !== observedChangeAt) {
      observedChangeAt = lastCaptureChangeAt;
    }
    if (Date.now() - observedChangeAt >= idleMs) {
      return { idle: true, waitedMs: Date.now() - started };
    }
    await delay(100);
  }
  return { idle: false, waitedMs: Date.now() - started };
}

function trimAgentText(value: unknown, max = 20000) {
  const text = String(value || "").replace(/\s+\n/g, "\n").trim();
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

async function evaluateElectronPage<T>(script: string) {
  if (!targetBrowserWindow || targetBrowserWindow.isDestroyed()) {
    return null;
  }
  return targetBrowserWindow.webContents.executeJavaScript(script, true) as Promise<T>;
}

type CdpSocket = {
  readyState: number;
  send: (text: string) => void;
  close: () => void;
  addEventListener: (event: string, listener: (event: { data?: unknown }) => void, options?: { once?: boolean }) => void;
  removeEventListener: (event: string, listener: (event: { data?: unknown }) => void) => void;
};

async function canUsePort(port: number) {
  return new Promise<boolean>((resolve) => {
    const server = createServer();
    server.unref();
    server.once("error", () => resolve(false));
    server.listen(port, "127.0.0.1", () => {
      server.close(() => resolve(true));
    });
  });
}

async function findOpenPort(startPort: number) {
  for (let port = startPort; port < startPort + 80; port += 1) {
    if (await canUsePort(port)) {
      return port;
    }
  }
  throw new Error(`No open local port found for Chrome debugging near ${startPort}.`);
}

async function fetchCdpTargets(endpoint: string) {
  const response = await fetch(`${endpoint.replace(/\/$/, "")}/json/list`);
  if (!response.ok) {
    throw new Error(`Chrome debugging endpoint returned ${response.status}.`);
  }
  return (await response.json()) as CdpListEntry[];
}

async function waitForChromeDebugger(endpoint: string, timeoutMs = 8000) {
  const started = Date.now();
  let lastError: unknown;
  while (Date.now() - started < timeoutMs) {
    try {
      return await fetchCdpTargets(endpoint);
    } catch (error) {
      lastError = error;
      await delay(150);
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Chrome debugging endpoint is unavailable.");
}

async function cdpPageTarget() {
  let endpoint = browserState.remoteDebuggingUrl;
  let targets: CdpListEntry[] | null = null;

  if (endpoint) {
    try {
      targets = await waitForChromeDebugger(endpoint, 2500);
    } catch {
      targets = null;
    }
  }

  if (!targets) {
    const reopenUrl = syncBrowserState().url || browserState.url;
    if (reopenUrl && /^https?:\/\//i.test(reopenUrl)) {
      await openRealChrome(reopenUrl);
      endpoint = browserState.remoteDebuggingUrl;
      if (endpoint) {
        targets = await waitForChromeDebugger(endpoint, 8000);
      }
    }
  }

  if (!endpoint || !targets) {
    throw new Error("No Chrome debugging endpoint is available. Use openBrowser to reopen the controlled browser, then retry.");
  }

  const target = targets.find((item) => item.type === "page" && item.webSocketDebuggerUrl) || targets.find((item) => item.webSocketDebuggerUrl);
  if (!target?.webSocketDebuggerUrl) {
    throw new Error("No debuggable page target is available.");
  }
  return target;
}

async function withCdpPage<T>(callback: (sendCommand: (method: string, params?: Record<string, unknown>) => Promise<unknown>) => Promise<T>) {
  const target = await cdpPageTarget();
  const WebSocketCtor = (globalThis as unknown as { WebSocket?: new (url: string) => CdpSocket }).WebSocket;
  if (!WebSocketCtor) {
    throw new Error("WebSocket support is not available in this runtime.");
  }
  const debuggerUrl = target.webSocketDebuggerUrl;
  if (!debuggerUrl) {
    throw new Error("No Chrome debugger WebSocket URL is available.");
  }

  const socket = new WebSocketCtor(debuggerUrl);
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Timed out connecting to Chrome debugger.")), 5000);
    socket.addEventListener(
      "open",
      () => {
        clearTimeout(timeout);
        resolve();
      },
      { once: true }
    );
    socket.addEventListener(
      "error",
      () => {
        clearTimeout(timeout);
        reject(new Error("Chrome debugger connection failed."));
      },
      { once: true }
    );
  });

  let id = 0;
  const sendCommand = (method: string, params: Record<string, unknown> = {}) => {
    id += 1;
    const commandId = id;
    return new Promise<unknown>((resolve, reject) => {
      const timeout = setTimeout(() => {
        socket.removeEventListener("message", onMessage);
        reject(new Error(`Chrome debugger command timed out: ${method}`));
      }, 5000);
      const onMessage = (event: { data?: unknown }) => {
        const payload = JSON.parse(String(event.data || "{}")) as {
          id?: number;
          result?: unknown;
          error?: { message?: string };
        };
        if (payload.id !== commandId) {
          return;
        }
        clearTimeout(timeout);
        socket.removeEventListener("message", onMessage);
        if (payload.error) {
          reject(new Error(payload.error.message || `Chrome debugger command failed: ${method}`));
          return;
        }
        resolve(payload.result);
      };
      socket.addEventListener("message", onMessage);
      socket.send(JSON.stringify({ id: commandId, method, params }));
    });
  };

  try {
    return await callback(sendCommand);
  } finally {
    socket.close();
  }
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function stopChromeObserver() {
  for (const pending of chromeObserverPending.values()) {
    clearTimeout(pending.timeout);
    pending.reject(new Error("Chrome observer stopped."));
  }
  chromeObserverPending.clear();
  chromeObserverRequests.clear();
  chromeObserverWebSockets.clear();
  chromeObserverInstanceId = "";
  chromeObserverSessionId = "";
  try {
    chromeObserverSocket?.close();
  } catch {
    /* ignore */
  }
  chromeObserverSocket = null;
}

function chromeObserverSendCommand(method: string, params: Record<string, unknown> = {}) {
  const socket = chromeObserverSocket;
  if (!socket || socket.readyState !== 1) {
    return Promise.reject(new Error("Chrome observer is not connected."));
  }
  chromeObserverCommandId += 1;
  const id = chromeObserverCommandId;
  return new Promise<unknown>((resolve, reject) => {
    const timeout = setTimeout(() => {
      chromeObserverPending.delete(id);
      reject(new Error(`Chrome observer command timed out: ${method}`));
    }, 5_000);
    chromeObserverPending.set(id, { resolve, reject, timeout });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

async function handleChromeObserverEvent(method: string, rawParams: unknown) {
  const params = recordValue(rawParams);
  const rawRequestId = String(params.requestId || "");
  if (!rawRequestId) return;
  const captureId = chromeObserverRequests.get(rawRequestId) || `chrome_${chromeObserverInstanceId}_${rawRequestId}`;

  if (method === "Network.webSocketCreated") {
    const context = {
      url: String(params.url || ""),
      agentRunId: activeAgentRunId || undefined,
      navigationId: activeNavigationId || undefined,
      actionId: activeActionId || undefined,
      identityId: activeIdentityId || undefined,
      activationId: activeActivationId || undefined,
      sequenceRunId: activeSequenceRunId || undefined,
      experimentId: activeExperimentId || undefined
    };
    chromeObserverWebSockets.set(rawRequestId, context);
    rememberWebSocketEvent({
      ...websocketEvent({
        requestId: rawRequestId,
        url: context.url,
        direction: "handshake",
        payloadData: "WebSocket created",
        initiator: "chrome-cdp"
      }),
      ...context
    });
    return;
  }

  const webSocketContext = chromeObserverWebSockets.get(rawRequestId);
  if (webSocketContext && method.startsWith("Network.webSocket")) {
    const frame = recordValue(params.response);
    const request = recordValue(params.request);
    const response = recordValue(params.response);
    const direction: WebSocketDirection =
      method === "Network.webSocketFrameSent"
        ? "sent"
        : method === "Network.webSocketFrameReceived"
          ? "received"
          : method === "Network.webSocketFrameError"
            ? "error"
            : method === "Network.webSocketClosed"
              ? "closed"
              : "handshake";
    const event = websocketEvent({
      requestId: rawRequestId,
      url: webSocketContext.url,
      direction,
      opcode: typeof frame.opcode === "number" ? frame.opcode : undefined,
      payloadData:
        String(frame.payloadData || params.errorMessage || "") ||
        (direction === "closed" ? "WebSocket closed" : direction === "handshake" ? "WebSocket handshake" : ""),
      status: typeof response.status === "number" ? response.status : undefined,
      statusText: String(response.statusText || ""),
      error: direction === "error" ? String(params.errorMessage || "WebSocket frame error") : undefined,
      requestHeaders: recordValue(request.headers),
      responseHeaders: recordValue(response.headers),
      initiator: "chrome-cdp"
    });
    rememberWebSocketEvent({ ...event, ...webSocketContext });
    if (direction === "closed") chromeObserverWebSockets.delete(rawRequestId);
    return;
  }

  if (method === "Network.requestWillBeSent") {
    const request = recordValue(params.request);
    const initiator = recordValue(params.initiator);
    const next = toCaptureEntry({
      requestId: captureId,
      request: {
        method: String(request.method || "GET"),
        url: String(request.url || ""),
        headers: recordValue(request.headers),
        postData: String(request.postData || ""),
        frameUrl: String(params.documentURL || params.frameId || ""),
        initiator: String(initiator.type || "")
      },
      rules: allowlist
    });
    bindCaptureEntryToSession(next, chromeObserverSessionId);
    chromeObserverRequests.set(rawRequestId, captureId);
    rememberCapture(next);
    return;
  }

  const entry = captured.get(captureId);
  if (!entry) return;
  if (method === "Network.responseReceived") {
    const response = recordValue(params.response);
    const securityDetails = recordValue(response.securityDetails);
    const timing = recordValue(response.timing);
    entry.status = typeof response.status === "number" ? response.status : null;
    entry.statusText = String(response.statusText || "");
    entry.mimeType = String(response.mimeType || "");
    entry.type = String(params.type || "Other");
    entry.responseHeaders = safeJsonHeaders(recordValue(response.headers));
    entry.tls = Object.keys(securityDetails).length
      ? {
          protocol: String(securityDetails.protocol || ""),
          issuer: String(securityDetails.issuer || ""),
          subjectName: String(securityDetails.subjectName || ""),
          validFrom: Number(securityDetails.validFrom || 0),
          validTo: Number(securityDetails.validTo || 0)
        }
      : null;
    if (typeof timing.receiveHeadersEnd === "number") {
      entry.durationMs = Math.max(0, Math.round(timing.receiveHeadersEnd));
    }
    rememberCapture(entry);
    return;
  }
  if (method === "Network.loadingFinished") {
    try {
      const bodyResult = recordValue(
        await chromeObserverSendCommand("Network.getResponseBody", { requestId: rawRequestId })
      );
      const body = String(bodyResult.body || "");
      entry.responseBody = truncateText(
        bodyResult.base64Encoded ? Buffer.from(body, "base64").toString("utf8") : body
      );
    } catch {
      entry.responseBody = "";
    }
    if (typeof params.encodedDataLength === "number") entry.encodedDataLength = params.encodedDataLength;
    rememberCapture(entry);
    return;
  }
  if (method === "Network.loadingFailed") {
    entry.statusText = String(params.errorText || "Failed");
    rememberCapture(entry);
  }
}

async function startChromeObserver(endpoint: string) {
  stopChromeObserver();
  const targets = await waitForChromeDebugger(endpoint, 8_000);
  const target = targets.find((item) => item.type === "page" && item.webSocketDebuggerUrl) || targets.find((item) => item.webSocketDebuggerUrl);
  if (!target?.webSocketDebuggerUrl) throw new Error("No debuggable Chrome page is available for causal capture.");
  const WebSocketCtor = (globalThis as unknown as { WebSocket?: new (url: string) => CdpSocket }).WebSocket;
  if (!WebSocketCtor) throw new Error("WebSocket support is not available in this runtime.");
  const socket = new WebSocketCtor(target.webSocketDebuggerUrl);
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Timed out connecting the Chrome causal observer.")), 5_000);
    socket.addEventListener("open", () => {
      clearTimeout(timeout);
      resolve();
    }, { once: true });
    socket.addEventListener("error", () => {
      clearTimeout(timeout);
      reject(new Error("Chrome causal observer connection failed."));
    }, { once: true });
  });
  chromeObserverSocket = socket;
  chromeObserverInstanceId = randomUUID();
  chromeObserverSessionId = localContext?.session.id || "";
  socket.addEventListener("message", (event) => {
    let message: Record<string, unknown>;
    try {
      message = recordValue(JSON.parse(String(event.data || "{}")));
    } catch {
      return;
    }
    if (typeof message.id === "number") {
      const pending = chromeObserverPending.get(message.id);
      if (!pending) return;
      clearTimeout(pending.timeout);
      chromeObserverPending.delete(message.id);
      const error = recordValue(message.error);
      if (Object.keys(error).length) pending.reject(new Error(String(error.message || "Chrome observer command failed.")));
      else pending.resolve(message.result);
      return;
    }
    if (typeof message.method === "string") void handleChromeObserverEvent(message.method, message.params);
  });
  await chromeObserverSendCommand("Network.enable", { maxPostDataSize: MAX_REPLAY_BODY });
}

type CdpRuntimeEvaluation<T> = {
  result?: { value?: T; description?: string };
  exceptionDetails?: {
    text?: string;
    exception?: { description?: string; value?: unknown };
  };
};

async function evaluateChromePage<T>(expression: string) {
  const result = (await withCdpPage((sendCommand) =>
    sendCommand("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true
    })
  )) as CdpRuntimeEvaluation<T>;
  if (result.exceptionDetails) {
    throw new Error(
      result.exceptionDetails.exception?.description ||
        result.exceptionDetails.text ||
        "Chrome page evaluation failed."
    );
  }
  return result.result?.value;
}

async function ensurePlaywrightBrowser() {
  const endpoint = browserState.remoteDebuggingUrl;
  if (!endpoint) {
    throw new Error("No Chrome debugging endpoint is available for Playwright automation.");
  }
  await playwrightBrowser.connect(endpoint);
  return playwrightBrowser;
}

const {
  getPageText,
  getDomSummary,
  getClickableElements,
  clickElement,
  fillInput,
  submitForm,
  getCookies,
  getStorageState
} = createPageInspectionController({
  browserState: () => browserState,
  ensureAutomation: ensurePlaywrightBrowser,
  evaluateElectron: evaluateElectronPage,
  evaluateChrome: evaluateChromePage,
  withCdpPage,
  trimText: trimAgentText
});

function legacyAuthSnapshotsUnavailable(): never {
  throw new Error(
    "Legacy global auth snapshots are disabled. Use a workspace-scoped dedicated Identity Lab profile."
  );
}

async function saveAuthState(_input: { name: string }) {
  void _input;
  return legacyAuthSnapshotsUnavailable();
}

async function loadAuthState(_input: { name: string }) {
  void _input;
  return legacyAuthSnapshotsUnavailable();
}

async function listAuthStates() {
  return legacyAuthSnapshotsUnavailable();
}

async function compareAuthStates(_input: { left: string; right: string }) {
  void _input;
  return legacyAuthSnapshotsUnavailable();
}

const identityController = createIdentityController({
  store: activeLocalStore,
  context: activeLocalContext,
  allowlist: () => allowlist.slice(),
  getStorageState,
  activateBrowser: activateDedicatedIdentityBrowser,
  waitForNetworkIdle,
  getPageText,
  browserInstanceId: () => chromeObserverInstanceId,
  activeActionId: () => activeActionId,
  setActiveActionId: (id) => {
    activeActionId = id;
  },
  setActiveNavigationId: (id) => {
    activeNavigationId = id;
  },
  activeIdentityId: () => activeIdentityId,
  activeActivationId: () => activeActivationId,
  endActivation: endActiveIdentityActivation,
  stopBrowser: stopChromeProcess,
  withCdpPage,
  listCaptures: listHttpCaptures
});

function createAgentRuntime() {
  const runtime = new AgentRuntime({
    currentSessionId: () => activeLocalContext().session.id,
    allowlist: () => allowlist.slice(),
    saveRun: (run) => {
      activeLocalStore().upsertAgentRun(run.sessionId, run);
      syncAgentFindingsToInbox(run);
    },
    loadRun: (runId) => activeLocalStore().getAgentRun(activeLocalContext().session.id, String(runId || "")),
    listRuns: () => activeLocalStore().listAgentRuns(activeLocalContext().session.id),
    getBrowserState: () => syncBrowserState(),
    openBrowser: (url) => {
      activeNavigationId = `nav_${randomUUID()}`;
      return openRealChrome(url);
    },
    navigateBrowser: (url) => {
      activeNavigationId = `nav_${randomUUID()}`;
      return navigateRealChrome(url);
    },
    getCaptures: () => listHttpCaptures(400),
    getWebSocketEvents: () => listWebSocketEvents(HOT_WEBSOCKET_LIMIT),
    getInterceptState: () => interceptStateSnapshot(),
    getReplayTabState: () => activeLocalStore().getReplayTabState(activeLocalContext().workspace.id),
    setReplayTabState: (state) => activeLocalStore().setReplayTabState(activeLocalContext().workspace.id, state),
    listReplayEnvironments: () => activeLocalStore().listReplayEnvironments(activeLocalContext().workspace.id),
    listReplayCollections: () => activeLocalStore().listReplayCollections(activeLocalContext().workspace.id),
    listAutomatePayloadSets: () => activeLocalStore().listAutomatePayloadSets(activeLocalContext().workspace.id),
    listAutomateSessions: () => activeLocalStore().listAutomateSessions(activeLocalContext().session.id),
    listWorkflows: workflowController.catalog,
    listWorkflowRuns: () => activeLocalStore().listWorkflowRuns(activeLocalContext().session.id),
    listFindings: () => activeLocalStore().listFindings(activeLocalContext().session.id),
    listProjectNotes: () => activeLocalStore().listProjectNotes(activeLocalContext().workspace.id),
    listSavedViews: () => activeLocalStore().listSavedViews(activeLocalContext().workspace.id),
    listRunMemory: () => activeLocalStore().listAgentRunMemory(activeLocalContext().workspace.id),
    listPlugins: () => activeLocalStore().listPlugins(activeLocalContext().workspace.id),
    runWorkflow: workflowController.run,
    sendReplay: (draft) => sendRequest(typeof draft === "object" && draft && "draft" in draft ? draft : { draft }),
    waitForNetworkIdle,
    getPageText,
    getDomSummary,
    getClickableElements,
    clickElement,
    fillInput,
    submitForm,
    getCookies,
    getStorageState,
    saveAuthState,
    loadAuthState,
    listAuthStates,
    compareAuthStates,
    listIdentityProfiles: identityController.list,
    getIdentityLabContext: async () =>
      identityController.labContext(),
    activateIdentityProfile: identityController.activate,
    verifyIdentityProfile: async (input) => {
      const identity = await identityController.verify(input);
      return { identity, url: (await getPageText()).url };
    },
    decideNextAction: createAiAgentPlanner(app.getPath("userData")),
    setActiveRunId: (runId) => {
      activeAgentRunId = runId || "";
      if (!runId) {
        activeNavigationId = "";
      }
    },
    setActiveActionContext: (context) => {
      activeActionId = context?.actionId || "";
    }
  });
  runtime.revokeAllGrantedLeases("Agent runtime or active session changed.");
  return runtime;
}

function syncAgentFindingsToInbox(run: AgentRun) {
  if (!localStore || run.status !== "completed" || run.findings.length === 0) {
    return;
  }
  for (const agentFinding of run.findings) {
    const finding = findingFromAgentFinding(run.id, agentFinding);
    if (finding) {
      localStore.upsertFinding(run.sessionId, finding);
    }
  }
}

function initializeLocalState() {
  localStore = openLocalStore(app.getPath("userData"));
  localContext = localStore.getActiveContext();
  agentRuntime = createAgentRuntime();
  hydrateActiveLocalState();
}

function loadAppIcon() {
  const base = path.join(__dirname, "..", "..", "resources");
  const candidates =
    process.platform === "darwin"
      ? [path.join(base, "icon.icns"), path.join(base, "icon.png")]
      : [path.join(base, "icon.png")];

  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) {
      continue;
    }
    const image = nativeImage.createFromPath(candidate);
    if (!image.isEmpty()) {
      return image;
    }
  }

  return null;
}

function applyAppIcon() {
  const icon = loadAppIcon();
  if (!icon || process.platform !== "darwin" || !app.dock) {
    return;
  }
  app.dock.setIcon(icon);
}

function createWindow() {
  const icon = loadAppIcon();
  mainWindow = new BrowserWindow({
    width: 1480,
    height: 940,
    minWidth: 1120,
    minHeight: 760,
    title: "Radar",
    ...(icon ? { icon } : {}),
    backgroundColor: "#07110f",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
      sandbox: false
    }
  });

  mainWindow.removeMenu();
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.webContents.on("before-input-event", (_event, input) => {
    if (input.type !== "keyDown") return;
    const key = input.key?.toLowerCase();
    const toggleCombo =
      (process.platform === "darwin" && input.meta && input.alt && key === "i") ||
      (process.platform !== "darwin" && input.control && input.shift && key === "i") ||
      key === "f12";
    if (toggleCombo) {
      mainWindow!.webContents.toggleDevTools();
    }
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    mainWindow.loadURL(devUrl);
  } else {
    mainWindow.loadFile(path.join(__dirname, "..", "..", "dist", "index.html"));
  }
}

function createStartupErrorWindow(error: unknown) {
  const message = error instanceof Error ? error.message : "Radar could not open its local project database.";
  const safeMessage = message.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[character] || character);
  mainWindow = new BrowserWindow({
    width: 920,
    height: 600,
    minWidth: 720,
    minHeight: 480,
    title: "Radar — Local Store Blocked",
    backgroundColor: "#07110f",
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  mainWindow.removeMenu();
  const html = `<!doctype html><meta charset="utf-8"><title>Radar — Local Store Blocked</title><style>
    :root{color-scheme:dark;background:#07110f;color:#e8dfc8;font-family:Georgia,serif}body{margin:0;min-height:100vh;display:grid;place-items:center;background:radial-gradient(circle at 80% 10%,#17352c 0,transparent 38%),repeating-linear-gradient(0deg,transparent 0 23px,#789b8a12 24px)}main{width:min(680px,calc(100vw - 64px));border:1px solid #577466;background:#0b1714e8;box-shadow:0 24px 90px #000b;padding:38px}small{font:700 11px ui-monospace,monospace;letter-spacing:.3em;color:#e2a84b;text-transform:uppercase}h1{font-size:36px;font-weight:500;letter-spacing:.03em;margin:16px 0}p{font:14px/1.7 ui-monospace,monospace;color:#b9c6bd}code{display:block;margin-top:22px;padding:16px;border-left:3px solid #bd5f45;background:#050b09;color:#f2c5b8;white-space:pre-wrap}strong{color:#f0d18b}</style><main data-testid="startupError"><small>Fail-closed local state boundary</small><h1>Radar did not modify this database.</h1><p>The selected local store is incompatible with this build. Keep the file intact, open it with a compatible Radar version, or copy it before performing a supported migration.</p><code>${safeMessage}</code><p><strong>Database:</strong> ${app.getPath("userData")}/radar-local.sqlite</p></main>`;
  void mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
}

app.whenReady().then(() => {
  try {
    initializeLocalState();
  } catch (error) {
    createStartupErrorWindow(error);
    return;
  }
  applyAppIcon();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  endActiveIdentityActivation();
  stopChromeProcess();
  localStore?.close();
  localStore = null;
});

app.on("certificate-error", (event, _contents, url, error, certificate, callback) => {
  const trusted = shouldTrustLocalCertificate(url);
  rememberSslEvent({
    id: `${Date.now()}-${sslEvents.length}`,
    url,
    error,
    trusted,
    subjectName: certificate?.subjectName,
    issuerName: certificate?.issuerName,
    createdAt: new Date().toISOString()
  });

  if (trusted) {
    event.preventDefault();
    callback(true);
    return;
  }

  callback(false);
});

function currentBrowserState(): BrowserState {
  if (browserState.engine === "chrome" && browserState.open) {
    const automation = playwrightBrowser.state();
    return {
      ...browserState,
      url: automation.url || browserState.url,
      title: automation.title || browserState.title,
      loading: automation.loading,
      automation: automation.status,
      automationPageCount: automation.pageCount,
      automationError: automation.error
    };
  }

  if (!targetBrowserWindow || targetBrowserWindow.isDestroyed()) {
    return {
      open: false,
      url: browserState.url,
      title: browserState.title,
      loading: false,
      engine: browserState.engine || "none"
    };
  }

  return {
    open: true,
    url: targetBrowserWindow.webContents.getURL(),
    title: targetBrowserWindow.getTitle(),
    loading: targetBrowserWindow.webContents.isLoading(),
    engine: "electron"
  };
}

function syncBrowserState() {
  browserState = currentBrowserState();
  return browserState;
}

function chromeProfileDir() {
  if (activeChromeProfileDir) {
    fs.mkdirSync(activeChromeProfileDir, { recursive: true, mode: 0o700 });
    return activeChromeProfileDir;
  }
  const profileId = localContext?.profile.id || "default";
  const profileDir = path.join(app.getPath("userData"), "profiles", profileId, "proxy-browser-profile");
  fs.mkdirSync(profileDir, { recursive: true });
  return profileDir;
}

function stopChromeProcess() {
  stopChromeObserver();
  playwrightBrowser.reset();
  if (!chromeProcess || chromeProcess.killed) {
    chromeProcess = null;
    return;
  }
  try {
    chromeProcess.kill();
  } catch {
    /* ignore */
  }
  chromeProcess = null;
}

async function activateDedicatedIdentityBrowser(identityId: string, startUrl: string) {
  return serializeIdentityActivation(async () => {
    const nextUrl = normalizeBrowserUrl(startUrl);
    if (!isAllowedTarget(nextUrl, allowlist)) {
      throw new Error(`Identity activation URL is out of scope: ${nextUrl}`);
    }
    const context = activeLocalContext();
    const profileDir = identityBrowserProfileDir(app.getPath("userData"), context.profile.id, identityId);
    const activation = createIdentityActivation(profileDir, identityId);
    fs.mkdirSync(profileDir, { recursive: true, mode: 0o700 });
    stopChromeProcess();
    activeIdentityId = activation.identityId;
    activeActivationId = activation.activationId;
    if (!activeActionId) activeActionId = `action_${randomUUID()}`;
    activeChromeProfileDir = profileDir;
    try {
      await openRealChrome(nextUrl);
      if (!browserState.open || activeActivationId !== activation.activationId) {
        throw new Error("Dedicated identity browser did not remain active after launch.");
      }
      return activation;
    } catch (error) {
      stopChromeProcess();
      activeIdentityId = "";
      activeActivationId = "";
      activeActionId = "";
      activeChromeProfileDir = "";
      throw error;
    }
  });
}

async function openRealChrome(urlString: string) {
  const nextUrl = normalizeBrowserUrl(urlString);
  const browser = findSystemBrowser();
  const proxy = await startMitmProxy(proxyState.port);
  const remoteDebuggingPort = await findOpenPort(defaultDebugPort);
  const profileDir = chromeProfileDir();

  stopChromeProcess();

  const radarKeychain = trustProxyCa(proxy.caCertPath, path.dirname(proxy.caCertPath));
  if (radarKeychain) {
    ensureRadarKeychainInSearchList(radarKeychain);
  }

  const args = [
    `--user-data-dir=${profileDir}`,
    `--remote-debugging-port=${remoteDebuggingPort}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-features=Translate",
    `--proxy-server=${proxy.proxyUrl}`,
    "--proxy-bypass-list=<-loopback>",
    `--ignore-certificate-errors-spki-list=${proxy.caFingerprint}`,
    "--new-window",
    nextUrl
  ];

  const launched = await new Promise<ChildProcess>((resolve, reject) => {
    const child = spawn(browser.executablePath, args, {
      detached: true,
      stdio: "ignore"
    });
    child.once("error", reject);
    child.once("spawn", () => resolve(child));
  });

  chromeProcess = launched;
  launched.unref();
  launched.once("exit", (code, signal) => {
    if (code && code !== 0) {
      console.error(`[radar] browser exited code=${code} signal=${signal}`);
    }
    if (chromeProcess !== launched) {
      return;
    }
    endActiveIdentityActivation();
    browserState = {
      ...browserState,
      open: false,
      loading: false
    };
    chromeProcess = null;
  });

  const remoteDebuggingUrl = `http://127.0.0.1:${remoteDebuggingPort}`;

  browserState = {
    open: true,
    url: nextUrl,
    title: browser.channel,
    loading: false,
    engine: "chrome",
    automation: "connecting",
    automationPageCount: 0,
    remoteDebuggingUrl,
    profileDir,
    executablePath: browser.executablePath,
    channel: browser.channel
  };

  try {
    await waitForChromeDebugger(remoteDebuggingUrl, 8000);
    await startChromeObserver(remoteDebuggingUrl);
    await playwrightBrowser.connect(remoteDebuggingUrl);
    await playwrightBrowser.reload();
  } catch (error) {
    const recoveredDebuggingUrl = await findCdpEndpointForUrl({
      requestedUrl: nextUrl,
      fetchTargets: fetchCdpTargets
    });
    if (recoveredDebuggingUrl) {
      browserState = {
        ...browserState,
        open: true,
        loading: false,
        remoteDebuggingUrl: recoveredDebuggingUrl
      };
      await startChromeObserver(recoveredDebuggingUrl);
      await playwrightBrowser.connect(recoveredDebuggingUrl);
      await playwrightBrowser.reload();
      console.warn(
        `[radar] Chrome reused an existing debugging endpoint at ${recoveredDebuggingUrl}: ${
          error instanceof Error ? error.message : "unknown error"
        }`
      );
      return browserState;
    }
    if (chromeProcess !== launched || !browserState.open || browserState.remoteDebuggingUrl !== remoteDebuggingUrl) {
      throw error;
    }
    console.warn(
      `[radar] Chrome debugging endpoint was not ready after launch: ${error instanceof Error ? error.message : "unknown error"}`
    );
  }
  return browserState;
}

async function navigateRealChrome(urlString: string) {
  const nextUrl = normalizeBrowserUrl(urlString);
  if (!browserState.open || browserState.engine !== "chrome" || !browserState.remoteDebuggingUrl) {
    return openRealChrome(nextUrl);
  }
  const automation = await ensurePlaywrightBrowser();
  await automation.navigate(nextUrl);
  return syncBrowserState();
}

async function ensureProxyCa() {
  const caDir = path.join(app.getPath("userData"), "proxy-ca");
  const caCertPath = path.join(caDir, "radar-ca.pem");
  const caKeyPath = path.join(caDir, "radar-ca-key.pem");

  fs.mkdirSync(caDir, { recursive: true });

  if (!fs.existsSync(caCertPath) || !fs.existsSync(caKeyPath)) {
    const ca = await generateCACertificate({
      subject: {
        commonName: "Radar Local Proxy CA",
        organizationName: "Radar"
      }
    });
    fs.writeFileSync(caCertPath, ca.cert, { mode: 0o600 });
    fs.writeFileSync(caKeyPath, ca.key, { mode: 0o600 });
  }

  const cert = fs.readFileSync(caCertPath, "utf8");
  const caFingerprint = await generateSPKIFingerprint(cert);
  if (!regressionUserDataPath) {
    trustProxyCa(caCertPath, caDir);
  }
  proxyState = {
    ...proxyState,
    caCertPath,
    caKeyPath,
    caFingerprint
  };
  return proxyState;
}

async function startMitmProxy(port = defaultProxyPort) {
  if (proxyServer) {
    return proxyState;
  }

  const ca = await ensureProxyCa();
  proxyServer = getLocal({
    https: {
      keyPath: ca.caKeyPath,
      certPath: ca.caCertPath
    },
    http2: "fallback",
    passthrough: ["unknown-protocol"],
    recordTraffic: false,
    suggestChanges: false,
    maxBodySize: MAX_CAPTURED_BODY
  });

  await proxyServer.start(Number(port) || defaultProxyPort);

  await proxyServer.on("request", async (req) => {
    const requestSessionId = localContext?.session.id || "";
    bindCaptureToCurrentSession(req.id);
    const text = await req.body.getText().catch(() => `[truncated: request body exceeded ${MAX_CAPTURED_BODY} bytes]`);
    const capture = proxyRequestToCapture({ req, bodyText: truncateText(text), rules: allowlist });
    bindCaptureEntryToSession(capture, requestSessionId);
    rememberCapture(capture);
  });

  await proxyServer.on("response", async (res) => {
    const entry = captured.get(res.id);
    if (!entry) {
      return;
    }
    const text = await res.body.getText().catch(() => `[truncated: response body exceeded ${MAX_CAPTURED_BODY} bytes]`);
    const contentLengthHeader = res.headers?.["content-length"];
    const contentLength = Number(Array.isArray(contentLengthHeader) ? contentLengthHeader[0] : contentLengthHeader || 0);
    entry.status = res.statusCode;
    entry.statusText = res.statusMessage || "";
    entry.responseHeaders = safeJsonHeaders(res.headers || {});
    entry.responseBody =
      !text && Number.isFinite(contentLength) && contentLength > MAX_CAPTURED_BODY
        ? `[truncated: response body exceeded ${MAX_CAPTURED_BODY} bytes]`
        : truncateText(text || "");
    entry.durationMs =
      typeof res.timingEvents?.responseSentTimestamp === "number" &&
      typeof res.timingEvents?.startTimestamp === "number"
        ? Math.max(0, Math.round(res.timingEvents.responseSentTimestamp - res.timingEvents.startTimestamp))
        : null;
    rememberCapture(entry);
  });

  await proxyServer.on("tls-client-error", (event) => {
    rememberSslEvent({
      id: `${Date.now()}-${sslEvents.length}`,
      url: event.remoteIpAddress || "tls-client",
      error: event.failureCause || "tls-client-error",
      trusted: false,
      createdAt: new Date().toISOString()
    });
  });

  await proxyServer.on("websocket-request", rememberProxyWebSocketRequest);
  await proxyServer.on("websocket-accepted", rememberProxyWebSocketAccepted);
  await proxyServer.on("websocket-message-received", rememberProxyWebSocketMessage);
  await proxyServer.on("websocket-message-sent", rememberProxyWebSocketMessage);
  await proxyServer.on("websocket-close", rememberProxyWebSocketClose);

  await proxyServer.forAnyWebSocket().thenPassThrough();
  await proxyServer.forAnyRequest().waitForRequestBody().thenPassThrough({
    beforeRequest: queueInterceptRequest,
    beforeResponse: queueInterceptResponse,
    ...(regressionUserDataPath ? { additionalTrustedCAs: [{ certPath: ca.caCertPath }] } : {})
  });

  proxyState = {
    ...ca,
    running: true,
    port: proxyServer.port,
    proxyUrl: `http://127.0.0.1:${proxyServer.port}`
  };
  return proxyState;
}

async function stopMitmProxy() {
  if (proxyServer) {
    await proxyServer.stop();
    proxyServer = undefined;
  }
  proxyState = {
    ...proxyState,
    running: false
  };
  return proxyState;
}

async function captureResponseBody(
  debuggerApi: { sendCommand: (method: string, params: { requestId: string }) => Promise<{ base64Encoded?: boolean; body?: string }> },
  requestId: string
) {
  try {
    const bodyResult = await debuggerApi.sendCommand("Network.getResponseBody", { requestId });
    const buffer = bodyResult.base64Encoded
      ? Buffer.from(bodyResult.body || "", "base64")
      : Buffer.from(bodyResult.body || "", "utf8");
    return truncateText(buffer.toString("utf8"));
  } catch {
    return "";
  }
}

function attachDebugger(contentsId: number) {
  const id = Number(contentsId);
  const target = webContents.fromId(id);
  if (!target) {
    throw new Error("Browser surface was not found.");
  }

  if (attachedContents.has(id)) {
    return;
  }

  target.debugger.attach("1.3");
  target.debugger.sendCommand("Network.enable", {
    maxPostDataSize: MAX_REPLAY_BODY
  });

  attachedContents.add(id);

  target.debugger.on("message", async (_event, method, params) => {
    if (method === "Network.requestWillBeSent") {
      const next = toCaptureEntry({
        requestId: params.requestId,
        request: {
          ...(params.request || {}),
          frameUrl: params.documentURL || params.frameId || "",
          initiator: params.initiator?.type || ""
        },
        rules: allowlist
      });
      rememberCapture(next);
      return;
    }

    if (method === "Network.webSocketCreated") {
      rememberWebSocketEvent(
        websocketEvent({
          requestId: params.requestId,
          url: params.url || "",
          direction: "handshake",
          payloadData: "WebSocket created",
          initiator: params.initiator?.type || ""
        })
      );
      return;
    }

    if (method === "Network.webSocketWillSendHandshakeRequest") {
      const entry = captured.get(params.requestId);
      rememberWebSocketEvent(
        websocketEvent({
          requestId: params.requestId,
          url: entry?.url || "",
          direction: "handshake",
          payloadData: "Client handshake",
          requestHeaders: params.request?.headers || {},
          initiator: entry?.initiator || ""
        })
      );
      return;
    }

    if (method === "Network.webSocketHandshakeResponseReceived") {
      const entry = captured.get(params.requestId);
      const response = params.response || {};
      rememberWebSocketEvent(
        websocketEvent({
          requestId: params.requestId,
          url: entry?.url || response.url || "",
          direction: "handshake",
          payloadData: "Server handshake",
          status: response.status,
          statusText: response.statusText || "",
          responseHeaders: response.headers || {},
          initiator: entry?.initiator || ""
        })
      );
      return;
    }

    if (method === "Network.webSocketFrameSent" || method === "Network.webSocketFrameReceived") {
      const entry = captured.get(params.requestId);
      const frame = params.response || {};
      rememberWebSocketEvent(
        websocketEvent({
          requestId: params.requestId,
          url: entry?.url || "",
          direction: method === "Network.webSocketFrameSent" ? "sent" : "received",
          opcode: frame.opcode,
          payloadData: frame.payloadData || "",
          initiator: entry?.initiator || ""
        })
      );
      return;
    }

    if (method === "Network.webSocketFrameError") {
      const entry = captured.get(params.requestId);
      rememberWebSocketEvent(
        websocketEvent({
          requestId: params.requestId,
          url: entry?.url || "",
          direction: "error",
          error: params.errorMessage || "WebSocket frame error",
          payloadData: params.errorMessage || "",
          initiator: entry?.initiator || ""
        })
      );
      return;
    }

    if (method === "Network.webSocketClosed") {
      const entry = captured.get(params.requestId);
      rememberWebSocketEvent(
        websocketEvent({
          requestId: params.requestId,
          url: entry?.url || "",
          direction: "closed",
          payloadData: "WebSocket closed",
          initiator: entry?.initiator || ""
        })
      );
      return;
    }

    const entry = captured.get(params.requestId);
    if (!entry) {
      return;
    }

    if (method === "Network.responseReceived") {
      const response = params.response || {};
      const securityDetails = response.securityDetails || null;
      entry.status = response.status || null;
      entry.statusText = response.statusText || "";
      entry.mimeType = response.mimeType || "";
      entry.type = params.type || "Other";
      entry.responseHeaders = safeJsonHeaders(response.headers || {});
      entry.tls = securityDetails
        ? {
            protocol: securityDetails.protocol || "",
            issuer: securityDetails.issuer || "",
            subjectName: securityDetails.subjectName || "",
            validFrom: securityDetails.validFrom || 0,
            validTo: securityDetails.validTo || 0
          }
        : null;
      if (response.timing && typeof response.timing.receiveHeadersEnd === "number") {
        entry.durationMs = Math.max(0, Math.round(response.timing.receiveHeadersEnd));
      }
      rememberCapture(entry);
    }

    if (method === "Network.loadingFinished") {
      entry.responseBody = await captureResponseBody(target.debugger, params.requestId);
      if (typeof params.encodedDataLength === "number") {
        entry.encodedDataLength = params.encodedDataLength;
      }
      rememberCapture(entry);
    }

    if (method === "Network.loadingFailed") {
      entry.statusText = params.errorText || "Failed";
      rememberCapture(entry);
    }
  });

  target.once("destroyed", () => {
    attachedContents.delete(id);
  });
}

const replayController = createReplayController({
  store: activeLocalStore,
  context: activeLocalContext,
  allowlist: () => allowlist.slice(),
  regressionMode: Boolean(regressionUserDataPath),
  recordWebSocket: ({ url, direction, payload, requestHeaders }) => {
    rememberWebSocketEvent(
      websocketEvent({
        requestId: randomUUID(),
        url,
        direction,
        payloadData: payload,
        requestHeaders,
        responseHeaders: {},
        initiator: "repeater"
      })
    );
  }
});
const { sendRequest, sendWebSocketReplay, runBurst: sendReplayBurst } =
  replayController;

const automateController = createAutomateController({
  store: activeLocalStore,
  context: activeLocalContext,
  allowlist: () => allowlist.slice(),
  sendRequest
});

function saveFinding(input: unknown) {
  const finding = normalizeFinding(input);
  if (!finding) {
    throw new Error("Finding needs a title and at least one evidence reference.");
  }
  return activeLocalStore().upsertFinding(activeLocalContext().session.id, finding);
}

function findingReport(options: unknown) {
  const value = options && typeof options === "object" && !Array.isArray(options) ? (options as Partial<FindingReportOptions>) : {};
  const store = activeLocalStore();
  const sessionId = activeLocalContext().session.id;
  const findings = store.listFindings(sessionId);
  if (value.includeRawEvidence) {
    const captures = new Map(store.listCaptures(sessionId, 2000).map((capture) => [capture.id, capture]));
    const webSocketEvents = new Map(store.listWebSocketEvents(sessionId, 5000).map((event) => [event.id, event]));
    for (const finding of findings) {
      finding.evidence = finding.evidence.map((reference) => {
        const capture = reference.kind === "capture" ? captures.get(reference.id) : undefined;
        if (capture) {
          return {
            ...reference,
            metadata: {
              ...reference.metadata,
              requestHeaders: JSON.stringify(capture.requestHeaders),
              requestBody: capture.requestBody,
              responseHeaders: JSON.stringify(capture.responseHeaders),
              responseBody: capture.responseBody
            }
          };
        }
        const event = reference.kind === "websocket" ? webSocketEvents.get(reference.id) : undefined;
        return event
          ? {
              ...reference,
              metadata: {
                ...reference.metadata,
                requestHeaders: JSON.stringify(event.requestHeaders),
                responseHeaders: JSON.stringify(event.responseHeaders),
                payload: event.payloadData
              }
            }
          : reference;
      });
    }
  }
  return buildFindingReport(findings, value, `${activeLocalContext().workspace.name} Findings`);
}

const workflowController = createWorkflowController({
  store: activeLocalStore,
  context: activeLocalContext,
  allowlist: () => allowlist.slice(),
  sendRequest: (input, options) => sendRequest(input, options),
  openBrowser: openRealChrome
});

const pluginController = createPluginController({
  store: activeLocalStore,
  context: activeLocalContext,
  allowlist: () => allowlist.slice(),
  listWorkflows: workflowController.catalog,
  saveWorkflow: workflowController.save,
  runWorkflow: workflowController.run,
  sendReplay: (draft) => sendRequest({ draft })
});

 function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

registerLocalIpc(ipcMain, {
  context: () => activeLocalContext(),
  listProfiles: () => activeLocalStore().listProfiles(),
  createProfile: (name) =>
    activateLocalContext(activeLocalStore().createProfileContext(name)),
  saveProfile: (id, name) => {
    const profile = activeLocalStore().updateProfile(id, name);
    if (localContext?.profile.id === profile.id) {
      localContext = { ...localContext, profile };
    }
    return profile;
  },
  loadProfile: (id) =>
    activateLocalContext(activeLocalStore().loadProfile(id)),
  listSessions: (profileId) => {
    const context = activeLocalContext();
    return activeLocalStore().listSessions(profileId || context.profile.id);
  },
  createSession: (name) => {
    const context = activeLocalContext();
    const session = activeLocalStore().createSession(context.workspace.id, name);
    return activateLocalContext({ ...context, session });
  },
  saveSession: (id, name) => {
    const session = activeLocalStore().updateSession(id, name);
    if (localContext?.session.id === session.id) {
      localContext = { ...localContext, session };
    }
    return session;
  },
  loadSession: (id) =>
    activateLocalContext(activeLocalStore().loadSession(id)),
  seedDemo: () =>
    activateLocalContext(seedDemoProject(activeLocalStore()))
});

registerBrowserIpc(ipcMain, {
  attachCaptureDebugger: attachDebugger,
  open: openRealChrome,
  navigate: navigateRealChrome,
  back: async () => {
    if (browserState.engine === "chrome" && browserState.remoteDebuggingUrl) {
      await (await ensurePlaywrightBrowser()).back();
      return syncBrowserState();
    }
    if (
      targetBrowserWindow &&
      !targetBrowserWindow.isDestroyed() &&
      targetBrowserWindow.webContents.canGoBack()
    ) {
      targetBrowserWindow.webContents.goBack();
    }
    return syncBrowserState();
  },
  forward: async () => {
    if (browserState.engine === "chrome" && browserState.remoteDebuggingUrl) {
      await (await ensurePlaywrightBrowser()).forward();
      return syncBrowserState();
    }
    if (
      targetBrowserWindow &&
      !targetBrowserWindow.isDestroyed() &&
      targetBrowserWindow.webContents.canGoForward()
    ) {
      targetBrowserWindow.webContents.goForward();
    }
    return syncBrowserState();
  },
  reload: async () => {
    if (browserState.engine === "chrome" && browserState.remoteDebuggingUrl) {
      await (await ensurePlaywrightBrowser()).reload();
      return syncBrowserState();
    }
    if (targetBrowserWindow && !targetBrowserWindow.isDestroyed()) {
      targetBrowserWindow.webContents.reload();
    }
    return syncBrowserState();
  },
  state: syncBrowserState,
  ensureProxyCa,
  startProxy: startMitmProxy,
  stopProxy: stopMitmProxy,
  proxyState: () => proxyState,
  listProxyProfiles: () =>
    localStore && localContext
      ? localStore.listProxyProfiles(localContext.workspace.id)
      : [],
  saveProxyProfile: (payload) =>
    activeLocalStore().saveProxyProfile(activeLocalContext().workspace.id, payload)
});

const projectArtifactController = createProjectArtifactController({
  store: activeLocalStore,
  context: activeLocalContext,
  setContext: (context) => {
    localContext = context;
  },
  allowlist: () => allowlist.slice(),
  setAllowlist: (targets) => {
    allowlist = targets;
  },
  artifactPath: regressionArtifactPath || "",
  promptSave: async ({ title, defaultPath, extensions }) => {
    const result = await dialog.showSaveDialog({
      title,
      defaultPath,
      filters: [{ name: title, extensions }]
    });
    return result.canceled ? null : result.filePath || null;
  },
  promptOpen: async ({ title, extensions }) => {
    const result = await dialog.showOpenDialog({
      title,
      properties: ["openFile"],
      filters: [{ name: title, extensions }]
    });
    return result.canceled ? null : result.filePaths[0] || null;
  }
});

function runGlobalProjectSearch(request: GlobalSearchRequest) {
  if (!localStore || !localContext) {
    return searchGlobal({}, request);
  }
  const sessionId = localContext.session.id;
  const workspaceId = localContext.workspace.id;
  const captures = listHttpCaptures(4000);
  const webSocketItems = listWebSocketEvents(HOT_WEBSOCKET_LIMIT);
  const scopedCaptures = captures.filter((capture) => capture.allowed && isAllowedTarget(capture.url, allowlist));
  const scopedWebSockets = webSocketItems.filter((event) => event.allowed && isAllowedTarget(event.url, allowlist));
  return searchGlobal(
    {
      captures,
      webSocketEvents: webSocketItems,
      evidenceAnnotations: localStore.listEvidenceAnnotations(sessionId),
      replayTabState: localStore.getReplayTabState(workspaceId),
      replayCollections: localStore.listReplayCollections(workspaceId),
      findings: localStore.listFindings(sessionId),
      workflows: workflowController.catalog(),
      workflowRuns: localStore.listWorkflowRuns(sessionId, 200),
      plugins: pluginController.list(),
      advancedSummary: buildAdvancedTestingSummary(scopedCaptures, scopedWebSockets, "", allowlist[0] || ""),
      savedFilters: localStore.listSavedFilters(workspaceId),
      projectNotes: localStore.listProjectNotes(workspaceId),
      savedViews: localStore.listSavedViews(workspaceId),
      allowlist
    },
    request
  );
}

registerProjectIpc(ipcMain, {
  search: runGlobalProjectSearch,
  listNotes: () =>
    localStore && localContext
      ? localStore.listProjectNotes(localContext.workspace.id)
      : [],
  saveNote: (note) =>
    activeLocalStore().upsertProjectNote(activeLocalContext().workspace.id, note),
  deleteNote: (id) => {
    const workspaceId = activeLocalContext().workspace.id;
    activeLocalStore().deleteProjectNote(workspaceId, id);
    return activeLocalStore().listProjectNotes(workspaceId);
  },
  listViews: () =>
    localStore && localContext
      ? localStore.listSavedViews(localContext.workspace.id)
      : [],
  saveView: (view) =>
    activeLocalStore().upsertSavedView(activeLocalContext().workspace.id, view),
  deleteView: (id) => {
    const workspaceId = activeLocalContext().workspace.id;
    activeLocalStore().deleteSavedView(workspaceId, id);
    return activeLocalStore().listSavedViews(workspaceId);
  },
  previewBundleExport: projectArtifactController.previewBundleExport,
  writeBundle: projectArtifactController.writeBundle,
  previewBundleImport: projectArtifactController.previewBundleImport,
  applyBundleImport: projectArtifactController.applyBundleImport,
  previewHandoff: projectArtifactController.previewHandoff,
  writeHandoff: projectArtifactController.writeHandoff
});

registerCaptureIpc(ipcMain, {
  snapshot: () => listHttpCaptures(400),
  query: (query) => {
    const result = filterCapturesByQuery(
      listHttpCaptures(4000),
      query,
      localStore && localContext
        ? annotationContext(
            localStore.listEvidenceAnnotations(localContext.session.id)
          )
        : {}
    );
    return result.ok
      ? { ok: true, captures: result.captures.slice(0, 400) }
      : { ok: false, error: result.error, captures: [] };
  },
  session: (sessionId) => {
    if (!sessionId || !localStore || !localContext) {
      return [];
    }
    const allowed = localStore
      .listSessions(localContext.profile.id)
      .some((session) => session.id === sessionId);
    return allowed
      ? localStore
          .listCaptures(sessionId, 2000)
          .filter(
            (entry) =>
              entry.url.startsWith("http://") ||
              entry.url.startsWith("https://")
          )
      : [];
  },
  delete: (captureId) => {
    if (!captureId) {
      return false;
    }
    captured.delete(captureId);
    if (localStore && localContext) {
      localStore.deleteCapture(localContext.session.id, captureId);
    }
    return true;
  },
  clear: () => {
    captured.clear();
    if (localStore && localContext) {
      localStore.clearCaptures(localContext.session.id);
    }
  },
  sslSnapshot: () => sslEvents.slice(0, 80),
  webSocketSnapshot: () => listWebSocketEvents(HOT_WEBSOCKET_LIMIT),
  clearWebSockets: () => {
    webSocketEvents.splice(0, webSocketEvents.length);
    if (localStore && localContext) {
      localStore.clearWebSocketEvents(localContext.session.id);
    }
  },
  queryWebSockets: (query) => {
    const result = filterWebSocketEventsByQuery(
      listWebSocketEvents(HOT_WEBSOCKET_LIMIT),
      query,
      localStore && localContext
        ? annotationContext(
            localStore.listEvidenceAnnotations(localContext.session.id)
          )
        : {}
    );
    return result.ok
      ? { ok: true, events: result.events }
      : { ok: false, error: result.error, events: [] };
  },
  getFilters: () =>
    localStore && localContext
      ? localStore.listSavedFilters(localContext.workspace.id)
      : [],
  setFilters: (filters) => {
    const next = normalizeSavedFilters(filters);
    return localStore && localContext
      ? localStore.setSavedFilters(localContext.workspace.id, next)
      : next;
  },
  getTargets: () => allowlist,
  setTargets: (targets) => {
    allowlist = normalizeTargetRules(targets, defaultAllowlist);
    if (localStore && localContext) {
      allowlist = localStore.setTargets(localContext.workspace.id, allowlist);
    }
    return allowlist;
  }
});

registerInterceptIpc(ipcMain, {
  state: interceptStateSnapshot,
  configure: (config) => {
    interceptConfig = {
      requestEnabled:
        typeof config.requestEnabled === "boolean"
          ? config.requestEnabled
          : interceptConfig.requestEnabled,
      responseEnabled:
        typeof config.responseEnabled === "boolean"
          ? config.responseEnabled
          : interceptConfig.responseEnabled
    };
    return interceptStateSnapshot();
  },
  forward: (id, draft, response) =>
    resolveInterceptItem(
      id,
      draft || response ? "edited" : "forwarded",
      draft,
      response
    ),
  drop: (id) => resolveInterceptItem(id, "dropped"),
  resumeAll: () => {
    for (const id of Array.from(interceptQueue.keys())) {
      resolveInterceptItem(id, "resumed");
    }
    return interceptStateSnapshot();
  },
  getRules: () => interceptRules,
  setRules: (rules) => {
    const next = normalizeInterceptRules(rules);
    interceptRules =
      localStore && localContext
        ? localStore.setInterceptRules(localContext.workspace.id, next)
        : next;
    return interceptRules;
  },
  getMatchReplaceRules: () => matchReplaceRules,
  setMatchReplaceRules: (rules) => {
    const next = normalizeMatchReplaceRules(rules);
    matchReplaceRules =
      localStore && localContext
        ? localStore.setMatchReplaceRules(localContext.workspace.id, next)
        : next;
    return matchReplaceRules;
  }
});

registerAutomateIpc(ipcMain, {
  getPayloadSets: () =>
    localStore && localContext
      ? localStore.listAutomatePayloadSets(localContext.workspace.id)
      : [],
  setPayloadSets: (payloadSets) =>
    localStore && localContext
      ? localStore.setAutomatePayloadSets(
          localContext.workspace.id,
          normalizeAutomatePayloadSets(payloadSets)
        )
      : [],
  listSessions: () =>
    localStore && localContext
      ? localStore.listAutomateSessions(localContext.session.id)
      : [],
  getSession: (id) =>
    localStore && localContext
      ? localStore.getAutomateSession(localContext.session.id, id)
      : null,
  start: automateController.start,
  pause: automateController.pause,
  resume: automateController.resume,
  stop: automateController.stop,
  retry: automateController.retry,
  promoteToRepeater: automateController.promoteToRepeater,
  promoteToFinding: automateController.promoteToFinding
});

registerFindingsIpc(ipcMain, {
  listAnnotations: () =>
    localStore && localContext
      ? localStore.listEvidenceAnnotations(localContext.session.id)
      : [],
  saveAnnotation: (annotation) => {
    if (!localStore || !localContext) {
      throw new Error("Local store is unavailable.");
    }
    return localStore.saveEvidenceAnnotation(
      localContext.session.id,
      annotation
    );
  },
  saveAnnotations: (annotations) =>
    localStore && localContext
      ? localStore.saveEvidenceAnnotations(
          localContext.session.id,
          annotations
        )
      : [],
  listFindings: () =>
    localStore && localContext
      ? localStore.listFindings(localContext.session.id)
      : [],
  saveFinding,
  deleteFinding: (findingId) => {
    if (!findingId) {
      return false;
    }
    activeLocalStore().deleteFinding(
      activeLocalContext().session.id,
      findingId
    );
    return true;
  },
  buildReport: findingReport
});

registerWorkflowIpc(ipcMain, {
  list: () =>
    localStore && localContext
      ? workflowController.catalog()
      : BUILT_IN_WORKFLOWS,
  save: workflowController.save,
  delete: workflowController.remove,
  validate: workflowController.validate,
  revisions: workflowController.revisions,
  runs: () =>
    localStore && localContext
      ? localStore.listWorkflowRuns(localContext.session.id)
      : [],
  run: workflowController.run,
  promoteResult: workflowController.promoteResult
});

registerPluginIpc(ipcMain, {
  list: () => (localStore && localContext ? pluginController.list() : []),
  preview: pluginController.preview,
  install: pluginController.install,
  approve: pluginController.approve,
  setStatus: pluginController.setStatus,
  remove: pluginController.remove,
  audit: pluginController.audit,
  renderPanel: pluginController.renderPanel,
  validate: pluginController.validate,
  runApi: pluginController.runApi
});

registerIdentityIpc(ipcMain, {
  listProfiles: identityController.list,
  createProfile: identityController.create,
  updateProfile: identityController.update,
  activateProfile: identityController.activate,
  verifyProfile: (identityId) =>
    identityController.verify({ identityId }),
  archiveProfile: identityController.archive,
  listActivations: () =>
    activeLocalStore().listIdentityActivations(
      activeLocalContext().session.id,
      100
    )
});

registerAgentIpc(ipcMain, {
  start: (request) => activeAgentRuntime().start(request),
  pause: (id) => activeAgentRuntime().pause(id),
  resume: (id) => activeAgentRuntime().resume(id),
  recover: (id, request) => activeAgentRuntime().recover(id, request),
  steerMission: (id, request) => activeAgentRuntime().steerMission(id, request),
  updateCapabilities: (id, request) => activeAgentRuntime().updateCapabilities(id, request),
  stop: (id) => activeAgentRuntime().stop(id),
  get: (id) => activeAgentRuntime().get(id),
  list: () => activeAgentRuntime().list(),
  listMemory: () =>
    activeLocalStore().listAgentRunMemory(activeLocalContext().workspace.id),
  saveMemory: (entry) =>
    activeLocalStore().upsertAgentRunMemory(activeLocalContext().workspace.id, {
      ...entry,
      status: entry.status === "proposed" ? "confirmed" : entry.status,
      updatedAt: new Date().toISOString()
    }),
  deleteMemory: (id) =>
    activeLocalStore().deleteAgentRunMemory(activeLocalContext().workspace.id, id)
});

registerAiIpc(ipcMain, {
  getSettings: () => loadAiSettings(app.getPath("userData")),
  saveSettings: (settings) => saveAiSettings(app.getPath("userData"), settings),
  previewContext: (request) =>
    previewAiContext({
      capturedMap: captured,
      webSocketEventMap: webSocketEventMap(),
      allowlist,
      browserUrl: browserState.url || "",
      request
    }),
  run: (request) =>
    runAiTask({
      capturedMap: captured,
      webSocketEventMap: webSocketEventMap(),
      allowlist,
      browserUrl: browserState.url || "",
      userDataPath: app.getPath("userData"),
      request
    }),
  getSkills: () => loadAiSkills(app.getPath("userData")),
  saveSkill: (skill) => saveAiSkill(app.getPath("userData"), skill),
  deleteSkill: (id) => deleteAiSkill(app.getPath("userData"), id),
  snapshotAudit: () => snapshotAiAudit(),
  connect: async (presetId) => {
    const result = await connectAiPreset({
      userDataPath: app.getPath("userData"),
      presetId
    });
    if (localStore && result.probe.ok) {
      try {
        await refreshAiModels({ settings: result.settings, store: localStore });
      } catch {
        // Keep cached models when refresh fails.
      }
    }
    return result;
  },
  probe: (settings) => probeAiSettings(settings),
  cursorLogin: () => loginCursorCli(),
  getModels: (provider) => getAiModels(provider, localStore),
  refreshModels: async (settings) => {
    const current = settings || loadAiSettings(app.getPath("userData"));
    const models = await refreshAiModels({ settings: current, store: localStore });
    const next = reconcileSettingsModel(current, models);
    if (next.model !== current.model) {
      saveAiSettings(app.getPath("userData"), next);
    }
    return models;
  }
});

 registerRepeaterIpc(ipcMain, {
  getTabs: () =>
    localStore && localContext
      ? localStore.getReplayTabState(localContext.workspace.id)
      : null,
  setTabs: (state) => {
    if (!localStore || !localContext) {
      throw new Error("Local store is unavailable.");
    }
    return localStore.setReplayTabState(localContext.workspace.id, state);
  },
  getEnvironments: () =>
    localStore && localContext
      ? localStore.listReplayEnvironments(localContext.workspace.id)
      : [],
  setEnvironments: (environments) =>
    localStore && localContext
      ? localStore.setReplayEnvironments(
          localContext.workspace.id,
          environments
        )
      : [],
  getCollections: () =>
    localStore && localContext
      ? localStore.listReplayCollections(localContext.workspace.id)
      : [],
  setCollections: (collections) =>
    localStore && localContext
      ? localStore.setReplayCollections(localContext.workspace.id, collections)
      : [],
  sendWebSocket: sendWebSocketReplay,
  send: (input) =>
    sendRequest(input as Parameters<typeof sendRequest>[0]),
  burst: sendReplayBurst
});
