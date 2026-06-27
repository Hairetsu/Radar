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
  shouldTrustLocalCertificate
} from "../shared/allowlist.js";
import { toCaptureEntry, proxyRequestToCapture } from "../shared/capture.js";
import type {
  AutomateSession,
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
  ReplayResult,
  SslEvent,
  WebSocketDirection,
  WebSocketEvent,
  WebSocketReplayDraft,
  WorkflowDefinition,
  WorkflowRunSource,
  PluginInstallStatus,
  PluginPermission,
  PluginApiRequest,
  PluginAuditEntry
} from "../shared/domain.js";
import {
  assignmentsForPayload,
  automateErrorResult,
  automateResultFromReplay,
  clusterAutomateResults,
  createAutomateSession,
  materializeAutomateDraft,
  MAX_AUTOMATE_COUNT,
  MAX_AUTOMATE_PAYLOADS,
  normalizeAutomateLimits,
  normalizeAutomatePayloadSets,
  normalizeAutomateRules
} from "../shared/automate.js";
import type {
  AgentAuthStateSummary,
  AgentCookie,
  AgentRun,
  AgentRunMemoryEntry,
  AgentStorageState
} from "../shared/agent-types.js";
import { normalizeDraft, MAX_REPLAY_BODY } from "../shared/draft.js";
import { safeJsonHeaders } from "../shared/headers.js";
import { matchingInterceptRules, normalizeInterceptRules } from "../shared/interceptRules.js";
import { applyMatchReplaceRules, normalizeMatchReplaceRules } from "../shared/matchReplace.js";
import { annotationContext } from "../shared/evidenceTags.js";
import {
  buildFindingReport,
  evidenceRefFromAutomateResult,
  findingFromAgentFinding,
  normalizeFinding
} from "../shared/findings.js";
import { normalizeSavedFilters } from "../shared/savedFilters.js";
import { prepareReplayDraft } from "../shared/replayVariables.js";
import { normalizeWebSocketReplayDraft } from "../shared/websocketReplay.js";
import { filterCapturesByQuery, filterWebSocketEventsByQuery } from "../shared/trafficQuery.js";
import { searchGlobal } from "../shared/globalSearch.js";
import {
  buildProjectBundle,
  parseProjectBundleJson,
  previewProjectBundleImport,
  serializeProjectBundle,
  type ProjectBundle,
  type ProjectBundleApplyResult,
  type ProjectBundleOptions
} from "../shared/projectBundle.js";
import {
  buildHandoffPackage,
  serializeHandoffPackage,
  type HandoffPackageOptions
} from "../shared/handoffPackage.js";
import { buildAdvancedTestingSummary } from "../shared/advancedTesting.js";
import { MAX_CAPTURED_BODY, truncateText } from "../shared/text.js";
import { normalizeUrl as normalizeBrowserUrl } from "../shared/url.js";
import { createReplayTab } from "../shared/replayTabs.js";
import {
  BUILT_IN_WORKFLOWS,
  activeBrowserWorkflowResult,
  activeReplayWorkflowResult,
  allWorkflows,
  createWorkflowRunRecord,
  evaluatePassiveWorkflow,
  findingFromWorkflowResult,
  normalizeWorkflowDefinition,
  normalizeWorkflowInputs,
  isActiveWorkflowStep,
  replayDraftFromCapture,
  shouldRunWorkflowStep,
  validateWorkflowDraft
} from "../shared/workflows.js";
import { openLocalStore, type LocalStore } from "./localStore.js";
import { seedDemoProject } from "./demoProject.js";
import { installedPluginFromPreview, readPluginInstallPreview, renderInstalledPluginPanel, validatePluginSource } from "./plugins.js";
import { runPluginApiAction as runPluginApiActionForPlugin } from "./pluginApi.js";
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
import { findSystemBrowser } from "./systemBrowser.js";
import { ensureRadarKeychainInSearchList, trustProxyCa } from "./trustCa.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const MAX_BURST_COUNT = 50;
const MAX_BURST_CONCURRENCY = 5;
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
const webSocketEvents: WebSocketEvent[] = [];
const webSocketConnections = new Map<string, { url: string; initiator: string }>();
const attachedContents = new Set<number>();
const sslEvents: SslEvent[] = [];
const interceptQueue = new Map<string, PendingIntercept>();
let lastCaptureChangeAt = Date.now();
let localStore: LocalStore | null = null;
let localContext: LocalContext | null = null;
let agentRuntime: AgentRuntime | null = null;
let activeAgentRunId = "";
let activeNavigationId = "";
let browserState: BrowserState = {
  open: false,
  url: "",
  title: "",
  loading: false,
  engine: "none"
};
let proxyState: ProxyState = {
  running: false,
  port: 8088,
  proxyUrl: "http://127.0.0.1:8088",
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

type AutomateController = {
  stopped: boolean;
  paused: boolean;
  active: Set<AbortController>;
};

const automateControllers = new Map<string, AutomateController>();

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

function activateLocalContext(nextContext: LocalContext) {
  const profileChanged = Boolean(localContext && localContext.profile.id !== nextContext.profile.id);
  if (profileChanged) {
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
  const existing = captured.get(entry.id);
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
  if (activeAgentRunId && !entry.agentRunId) {
    entry.agentRunId = activeAgentRunId;
  }
  if (activeNavigationId && !entry.navigationId) {
    entry.navigationId = activeNavigationId;
  }

  captured.set(entry.id, entry);
  lastCaptureChangeAt = Date.now();
  while (captured.size > HOT_CAPTURE_LIMIT) {
    const oldest = captured.keys().next().value;
    if (!oldest) {
      break;
    }
    captured.delete(oldest);
  }

  if (localStore && localContext) {
    localStore.upsertCapture(localContext.session.id, entry);
  }
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

  const bodyText = truncateText(await req.body.getText().catch(() => ""));
  let capture = proxyRequestToCapture({ req, bodyText, rules: allowlist });
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
  webSocketEvents.unshift(event);
  webSocketEvents.splice(HOT_WEBSOCKET_LIMIT);

  if (localStore && localContext) {
    localStore.insertWebSocketEvent(localContext.session.id, event);
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
  webSocketConnections.clear();
  for (const entry of localStore.listCaptures(localContext.session.id, HOT_CAPTURE_LIMIT).reverse()) {
    captured.set(entry.id, entry);
  }

  sslEvents.splice(0, sslEvents.length, ...localStore.listSslEvents(localContext.session.id, 80));
  webSocketEvents.splice(0, webSocketEvents.length, ...localStore.listWebSocketEvents(localContext.session.id, HOT_WEBSOCKET_LIMIT));
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

type CdpListEntry = {
  type?: string;
  url?: string;
  title?: string;
  webSocketDebuggerUrl?: string;
};

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

async function getPageText() {
  const expression = `(() => ({
    url: location.href,
    title: document.title,
    text: document.body ? document.body.innerText : ""
  }))()`;
  const electronResult = await evaluateElectronPage<{ url: string; title: string; text: string }>(expression);
  const result = electronResult || (await evaluateChromePage<{ url: string; title: string; text: string }>(expression));
  if (!result) {
    throw new Error("No active browser page is available.");
  }
  return { url: result.url || "", title: result.title || "", text: trimAgentText(result.text) };
}

async function getDomSummary() {
  const expression = `(() => ({
    url: location.href,
    title: document.title,
    text: document.body ? document.body.innerText.slice(0, 6000) : "",
    links: Array.from(document.querySelectorAll('a[href]')).slice(0, 80).map((node) => ({ text: (node.innerText || node.getAttribute('aria-label') || '').trim().slice(0, 120), href: node.href })),
    buttons: Array.from(document.querySelectorAll('button, [role="button"], input[type="submit"], input[type="button"]')).slice(0, 80).map((node) => (node.innerText || node.value || node.getAttribute('aria-label') || '').trim().slice(0, 120)).filter(Boolean),
    forms: Array.from(document.querySelectorAll('form')).slice(0, 20).map((form) => ({ action: form.action || location.href, method: (form.method || 'GET').toUpperCase(), inputs: Array.from(form.querySelectorAll('input, textarea, select')).map((input) => input.name || input.id || input.type || input.tagName).filter(Boolean).slice(0, 40) }))
  }))()`;
  const electronResult = await evaluateElectronPage<{
    url: string;
    title: string;
    text: string;
    links: Array<{ text: string; href: string }>;
    buttons: string[];
    forms: Array<{ action: string; method: string; inputs: string[] }>;
  }>(expression);
  const result = electronResult || (await evaluateChromePage<{
    url: string;
    title: string;
    text: string;
    links: Array<{ text: string; href: string }>;
    buttons: string[];
    forms: Array<{ action: string; method: string; inputs: string[] }>;
  }>(expression));
  if (!result) {
    throw new Error("No active browser page is available.");
  }
  return {
    url: result.url || "",
    title: result.title || "",
    text: trimAgentText(result.text, 6000),
    links: Array.isArray(result.links) ? result.links : [],
    buttons: Array.isArray(result.buttons) ? result.buttons : [],
    forms: Array.isArray(result.forms) ? result.forms : []
  };
}

async function getClickableElements() {
  const expression = `(() => {
    const cssPath = (node) => {
      if (!node || node.nodeType !== Node.ELEMENT_NODE) return "";
      if (node.id && document.querySelectorAll("#" + CSS.escape(node.id)).length === 1) return "#" + CSS.escape(node.id);
      const parts = [];
      let current = node;
      while (current && current.nodeType === Node.ELEMENT_NODE && parts.length < 5) {
        let part = current.localName.toLowerCase();
        if (current.classList.length) part += "." + Array.from(current.classList).slice(0, 2).map((item) => CSS.escape(item)).join(".");
        const siblings = Array.from(current.parentElement ? current.parentElement.children : []);
        const sameTag = siblings.filter((item) => item.localName === current.localName);
        if (sameTag.length > 1) part += ":nth-of-type(" + (sameTag.indexOf(current) + 1) + ")";
        parts.unshift(part);
        current = current.parentElement;
      }
      return parts.join(" > ");
    };
    const nodes = Array.from(document.querySelectorAll('a[href], button, [role="button"], input, textarea, select, summary, [tabindex]:not([tabindex="-1"])'));
    return {
      url: location.href,
      elements: nodes.slice(0, 120).map((node) => ({
        selector: cssPath(node),
        text: (node.innerText || node.value || node.getAttribute('aria-label') || node.name || node.id || '').trim().slice(0, 140),
        tag: node.tagName.toLowerCase(),
        role: node.getAttribute('role') || node.type || '',
        href: node.href || undefined
      })).filter((item) => item.selector)
    };
  })()`;
  const result =
    (await evaluateElectronPage<{ url: string; elements: Array<{ selector: string; text: string; tag: string; role: string; href?: string }> }>(expression)) ||
    (await evaluateChromePage<{ url: string; elements: Array<{ selector: string; text: string; tag: string; role: string; href?: string }> }>(expression));
  if (!result) {
    throw new Error("No active browser page is available.");
  }
  return { url: result.url || "", elements: Array.isArray(result.elements) ? result.elements : [] };
}

async function clickElement({ selector }: { selector: string }) {
  const expression = `(() => {
    const selector = ${JSON.stringify(selector)};
    const node = document.querySelector(selector);
    if (!node) throw new Error("Element not found: " + selector);
    node.scrollIntoView({ block: "center", inline: "center" });
    node.click();
    return { clicked: true, selector, url: location.href };
  })()`;
  const result =
    (await evaluateElectronPage<{ clicked: boolean; selector: string; url: string }>(expression)) ||
    (await evaluateChromePage<{ clicked: boolean; selector: string; url: string }>(expression));
  if (!result) {
    throw new Error("No active browser page is available.");
  }
  return result;
}

async function fillInput({ selector, value }: { selector: string; value: string }) {
  const expression = `(() => {
    const selector = ${JSON.stringify(selector)};
    const value = ${JSON.stringify(value)};
    const node = document.querySelector(selector);
    if (!node) throw new Error("Input not found: " + selector);
    node.focus();
    if ("value" in node) {
      node.value = value;
      node.dispatchEvent(new Event("input", { bubbles: true }));
      node.dispatchEvent(new Event("change", { bubbles: true }));
    } else if (node.isContentEditable) {
      node.textContent = value;
      node.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
    } else {
      throw new Error("Element is not fillable: " + selector);
    }
    return { filled: true, selector };
  })()`;
  const result =
    (await evaluateElectronPage<{ filled: boolean; selector: string }>(expression)) ||
    (await evaluateChromePage<{ filled: boolean; selector: string }>(expression));
  if (!result) {
    throw new Error("No active browser page is available.");
  }
  return result;
}

async function submitForm({ selector }: { selector: string }) {
  const expression = `(() => {
    const selector = ${JSON.stringify(selector)};
    const node = document.querySelector(selector);
    if (!node) throw new Error("Form target not found: " + selector);
    const form = node.tagName && node.tagName.toLowerCase() === "form" ? node : node.closest("form");
    if (!form) throw new Error("No form found for selector: " + selector);
    if (form.requestSubmit) form.requestSubmit();
    else form.submit();
    return { submitted: true, selector, url: location.href };
  })()`;
  const result =
    (await evaluateElectronPage<{ submitted: boolean; selector: string; url: string }>(expression)) ||
    (await evaluateChromePage<{ submitted: boolean; selector: string; url: string }>(expression));
  if (!result) {
    throw new Error("No active browser page is available.");
  }
  return result;
}

function normalizeCookie(cookie: Record<string, unknown>): AgentCookie {
  return {
    name: String(cookie.name || ""),
    value: String(cookie.value || ""),
    domain: cookie.domain ? String(cookie.domain) : undefined,
    path: cookie.path ? String(cookie.path) : undefined,
    expires: typeof cookie.expires === "number" ? cookie.expires : undefined,
    httpOnly: Boolean(cookie.httpOnly),
    secure: Boolean(cookie.secure),
    sameSite: cookie.sameSite ? String(cookie.sameSite) : undefined
  };
}

async function getCookies() {
  const result = (await withCdpPage((sendCommand) => sendCommand("Network.getAllCookies"))) as {
    cookies?: Array<Record<string, unknown>>;
  };
  return { cookies: Array.isArray(result.cookies) ? result.cookies.map(normalizeCookie).filter((cookie) => cookie.name) : [] };
}

async function getStorageState(): Promise<AgentStorageState> {
  const page = await getPageText();
  const expression = `(() => ({
    localStorage: Object.fromEntries(Object.entries(localStorage)),
    sessionStorage: Object.fromEntries(Object.entries(sessionStorage))
  }))()`;
  const storage =
    (await evaluateElectronPage<{ localStorage: Record<string, string>; sessionStorage: Record<string, string> }>(expression)) ||
    (await evaluateChromePage<{ localStorage: Record<string, string>; sessionStorage: Record<string, string> }>(expression)) || {
      localStorage: {},
      sessionStorage: {}
    };
  const cookies = await getCookies();
  return {
    url: page.url,
    origin: new URL(page.url).origin,
    cookies: cookies.cookies,
    localStorage: storage.localStorage || {},
    sessionStorage: storage.sessionStorage || {}
  };
}

type SavedAuthState = AgentStorageState & {
  name: string;
  createdAt: string;
};

function authStatesPath() {
  return path.join(app.getPath("userData"), "agent-auth-states.json");
}

function readAuthStates() {
  try {
    return JSON.parse(fs.readFileSync(authStatesPath(), "utf8")) as SavedAuthState[];
  } catch {
    return [];
  }
}

function writeAuthStates(states: SavedAuthState[]) {
  fs.mkdirSync(path.dirname(authStatesPath()), { recursive: true });
  fs.writeFileSync(authStatesPath(), JSON.stringify(states, null, 2), "utf8");
}

function authStateSummary(state: SavedAuthState): AgentAuthStateSummary {
  return {
    name: state.name,
    origin: state.origin,
    createdAt: state.createdAt,
    cookieCount: state.cookies.length,
    localStorageKeys: Object.keys(state.localStorage),
    sessionStorageKeys: Object.keys(state.sessionStorage)
  };
}

async function saveAuthState({ name }: { name: string }) {
  if (!name) {
    throw new Error("Auth state name is required.");
  }
  const state = await getStorageState();
  const saved: SavedAuthState = { ...state, name, createdAt: new Date().toISOString() };
  const next = [saved, ...readAuthStates().filter((item) => item.name !== name)].slice(0, 20);
  writeAuthStates(next);
  return authStateSummary(saved);
}

async function loadAuthState({ name }: { name: string }) {
  const state = readAuthStates().find((item) => item.name === name);
  if (!state) {
    throw new Error(`Auth state not found: ${name}`);
  }
  if (!isAllowedTarget(state.origin, allowlist)) {
    throw new Error(`Saved auth state origin is out of scope: ${state.origin}`);
  }

  if (!browserState.remoteDebuggingUrl || !browserState.url || !browserState.url.startsWith(state.origin)) {
    await openRealChrome(state.origin);
    await waitForNetworkIdle({ idleMs: 500, timeoutMs: 5000 });
  }
  await withCdpPage(async (sendCommand) => {
    await sendCommand("Network.setCookies", { cookies: state.cookies });
  });
  const expression = `(() => {
    const local = ${JSON.stringify(state.localStorage)};
    const session = ${JSON.stringify(state.sessionStorage)};
    localStorage.clear();
    sessionStorage.clear();
    Object.entries(local).forEach(([key, value]) => localStorage.setItem(key, String(value)));
    Object.entries(session).forEach(([key, value]) => sessionStorage.setItem(key, String(value)));
    return true;
  })()`;
  await evaluateChromePage<boolean>(expression);
  await evaluateChromePage<boolean>("(() => { location.reload(); return true; })()");
  await waitForNetworkIdle({ idleMs: 500, timeoutMs: 5000 });
  return authStateSummary(state);
}

async function listAuthStates() {
  return { states: readAuthStates().map(authStateSummary) };
}

async function compareAuthStates({ left, right }: { left: string; right: string }) {
  const states = readAuthStates();
  const leftState = states.find((item) => item.name === left);
  const rightState = states.find((item) => item.name === right);
  if (!leftState || !rightState) {
    throw new Error(`Auth states not found: ${left}${leftState ? "" : " (missing)"}, ${right}${rightState ? "" : " (missing)"}`);
  }

  const observations: Array<{ name: string; issue: string; severity: "info" | "low" | "medium" | "high"; value?: string }> = [];
  const leftCookies = new Map(leftState.cookies.map((cookie) => [cookie.name, cookie]));
  const rightCookies = new Map(rightState.cookies.map((cookie) => [cookie.name, cookie]));
  for (const name of new Set([...leftCookies.keys(), ...rightCookies.keys()])) {
    const a = leftCookies.get(name);
    const b = rightCookies.get(name);
    if (!a || !b) {
      observations.push({
        name,
        issue: `Cookie exists only in ${a ? left : right} auth state.`,
        severity: "info"
      });
      continue;
    }
    if (a.value !== b.value) {
      observations.push({ name, issue: "Cookie value differs between auth states.", severity: "info" });
    }
    if (a.secure !== b.secure || a.httpOnly !== b.httpOnly || a.sameSite !== b.sameSite) {
      observations.push({ name, issue: "Cookie flags differ between auth states.", severity: "low" });
    }
  }

  const compareKeys = (label: string, a: Record<string, string>, b: Record<string, string>) => {
    for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
      if (!(key in a) || !(key in b)) {
        observations.push({ name: `${label}:${key}`, issue: `Storage key exists only in ${key in a ? left : right}.`, severity: "info" });
      } else if (a[key] !== b[key]) {
        observations.push({ name: `${label}:${key}`, issue: "Storage value differs between auth states.", severity: "info" });
      }
    }
  };
  compareKeys("localStorage", leftState.localStorage, rightState.localStorage);
  compareKeys("sessionStorage", leftState.sessionStorage, rightState.sessionStorage);

  return { left, right, observations };
}

function createAgentRuntime() {
  return new AgentRuntime({
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
      return openRealChrome(url);
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
    listWorkflows: () => workflowCatalog(),
    listWorkflowRuns: () => activeLocalStore().listWorkflowRuns(activeLocalContext().session.id),
    listFindings: () => activeLocalStore().listFindings(activeLocalContext().session.id),
    listProjectNotes: () => activeLocalStore().listProjectNotes(activeLocalContext().workspace.id),
    listSavedViews: () => activeLocalStore().listSavedViews(activeLocalContext().workspace.id),
    listRunMemory: () => activeLocalStore().listAgentRunMemory(activeLocalContext().workspace.id),
    listPlugins: () => activeLocalStore().listPlugins(activeLocalContext().workspace.id),
    runWorkflow: (input) => runWorkflow(input),
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
    decideNextAction: createAiAgentPlanner(app.getPath("userData")),
    setActiveRunId: (runId) => {
      activeAgentRunId = runId || "";
      if (!runId) {
        activeNavigationId = "";
      }
    }
  });
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

app.whenReady().then(() => {
  initializeLocalState();
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
    return browserState;
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
  const profileId = localContext?.profile.id || "default";
  const profileDir = path.join(app.getPath("userData"), "profiles", profileId, "proxy-browser-profile");
  fs.mkdirSync(profileDir, { recursive: true });
  return profileDir;
}

function stopChromeProcess() {
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

async function openRealChrome(urlString: string) {
  const nextUrl = normalizeBrowserUrl(urlString);
  const browser = findSystemBrowser();
  const proxy = await startMitmProxy(proxyState.port);
  const remoteDebuggingPort = await findOpenPort(9223);

  stopChromeProcess();

  const radarKeychain = trustProxyCa(proxy.caCertPath, path.dirname(proxy.caCertPath));
  if (radarKeychain) {
    ensureRadarKeychainInSearchList(radarKeychain);
  }

  const args = [
    `--user-data-dir=${chromeProfileDir()}`,
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
    browserState = {
      ...browserState,
      open: false,
      loading: false
    };
    chromeProcess = null;
  });

  browserState = {
    open: true,
    url: nextUrl,
    title: browser.channel,
    loading: false,
    engine: "chrome",
    remoteDebuggingUrl: `http://127.0.0.1:${remoteDebuggingPort}`,
    profileDir: chromeProfileDir(),
    executablePath: browser.executablePath,
    channel: browser.channel
  };

  await waitForChromeDebugger(`http://127.0.0.1:${remoteDebuggingPort}`, 8000);
  return browserState;
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
  trustProxyCa(caCertPath, caDir);
  proxyState = {
    ...proxyState,
    caCertPath,
    caKeyPath,
    caFingerprint
  };
  return proxyState;
}

async function startMitmProxy(port = 8088) {
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

  await proxyServer.start(Number(port) || 8088);

  await proxyServer.on("request", async (req) => {
    const text = await req.body.getText().catch(() => "");
    rememberCapture(proxyRequestToCapture({ req, bodyText: truncateText(text), rules: allowlist }));
  });

  await proxyServer.on("response", async (res) => {
    const entry = captured.get(res.id);
    if (!entry) {
      return;
    }
    const text = await res.body.getText().catch(() => "");
    entry.status = res.statusCode;
    entry.statusText = res.statusMessage || "";
    entry.responseHeaders = safeJsonHeaders(res.headers || {});
    entry.responseBody = truncateText(text || "");
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
    beforeResponse: queueInterceptResponse
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

async function sendRequest(
  input: ReplayDraft | Parameters<typeof normalizeDraft>[0] | { draft?: ReplayDraft; environmentId?: string },
  options: { timeoutMs?: number; signal?: AbortSignal } = {}
) {
  const record = input && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>) : null;
  const environmentId = record && "environmentId" in record ? String(record.environmentId || "") : "";
  const draftInput = record && "draft" in record ? record.draft : input;
  const environments = localStore && localContext ? localStore.listReplayEnvironments(localContext.workspace.id) : [];
  const draft = prepareReplayDraft(draftInput as ReplayDraft, environments, environmentId);

  if (!isAllowedTarget(draft.url, allowlist)) {
    throw new Error("Replay URL is outside the current scope allowlist.");
  }

  const started = Date.now();
  const abort = new AbortController();
  const forwardAbort = () => abort.abort();
  if (options.signal?.aborted) {
    abort.abort();
  } else {
    options.signal?.addEventListener("abort", forwardAbort, { once: true });
  }
  const timeout = setTimeout(() => abort.abort(), Math.min(Math.max(Number(options.timeoutMs || 30_000), 1000), 30_000));

  try {
    const response = await fetch(draft.url, {
      method: draft.method,
      headers: draft.headers,
      body: draft.body || undefined,
      redirect: "manual",
      signal: abort.signal
    });
    const buffer = Buffer.from(await response.arrayBuffer());
    const text = truncateText(buffer.toString("utf8"));

    return {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      durationMs: Date.now() - started,
      headers: Object.fromEntries(response.headers.entries()),
      body: text,
      bytes: buffer.length
    };
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener("abort", forwardAbort);
  }
}

function currentAutomateSession(id: string) {
  return activeLocalStore().getAutomateSession(activeLocalContext().session.id, id);
}

function saveAutomateSession(session: AutomateSession) {
  const clustered = clusterAutomateResults(session.results);
  return activeLocalStore().upsertAutomateSession(activeLocalContext().session.id, {
    ...session,
    results: clustered.results,
    clusters: clustered.clusters,
    updatedAt: new Date().toISOString()
  });
}

function sessionWithStatus(session: AutomateSession, status: AutomateSession["status"], error?: string) {
  return saveAutomateSession({
    ...session,
    status,
    error: error || undefined
  });
}

async function waitForAutomateResume(controller: AutomateController) {
  while (controller.paused && !controller.stopped) {
    await delay(200);
  }
}

async function runAutomateSession(sessionId: string, payloadOverride?: string[]) {
  const controller =
    automateControllers.get(sessionId) ||
    (() => {
      const next: AutomateController = { stopped: false, paused: false, active: new Set() };
      automateControllers.set(sessionId, next);
      return next;
    })();
  const loadedSession = currentAutomateSession(sessionId);
  if (!loadedSession) {
    automateControllers.delete(sessionId);
    return;
  }
  let session: AutomateSession = loadedSession;

  const startingResultCount = session.results.length;
  const remainingPayloads = (payloadOverride || session.payloads.slice(startingResultCount))
    .map((payload) => String(payload || "").slice(0, 8000))
    .filter((payload) => payload.trim().length > 0)
    .slice(0, MAX_AUTOMATE_PAYLOADS);
  let cursor = 0;

  async function worker() {
    while (!controller.stopped) {
      await waitForAutomateResume(controller);
      if (controller.stopped) {
        return;
      }
      const localIndex = cursor;
      cursor += 1;
      if (localIndex >= remainingPayloads.length) {
        return;
      }

      if (session.limits.delayMs > 0 && startingResultCount + localIndex > 0) {
        await delay(session.limits.delayMs);
      }

      const payload = remainingPayloads[localIndex];
      const index = startingResultCount + localIndex + 1;
      const request = materializeAutomateDraft(session.draft, assignmentsForPayload(session.positions, payload));
      const replayEnvironments = localStore && localContext ? localStore.listReplayEnvironments(localContext.workspace.id) : [];
      const scopedRequest = prepareReplayDraft(request, replayEnvironments, session.environmentId);
      let result;

      if (!isAllowedTarget(scopedRequest.url, allowlist)) {
        result = automateErrorResult({
          id: `automate_result_${randomUUID()}`,
          index,
          payload,
          request: scopedRequest,
          error: "Automate URL is outside the current scope allowlist.",
          rules: session.rules
        });
      } else {
        const abort = new AbortController();
        controller.active.add(abort);
        try {
          const response: ReplayResult = await sendRequest(
            { draft: request, environmentId: session.environmentId },
            { timeoutMs: session.limits.timeoutMs, signal: abort.signal }
          );
          result = automateResultFromReplay({
            id: `automate_result_${randomUUID()}`,
            index,
            payload,
            request: scopedRequest,
            response,
            rules: session.rules
          });
        } catch (error) {
          result = automateErrorResult({
            id: `automate_result_${randomUUID()}`,
            index,
            payload,
            request: scopedRequest,
            error: error instanceof Error ? error.message : "Automate request failed.",
            rules: session.rules
          });
        } finally {
          controller.active.delete(abort);
        }
      }

      const latest = currentAutomateSession(sessionId) || session;
      session = saveAutomateSession({
        ...latest,
        status: controller.paused ? "paused" : "running",
        results: [...latest.results, result].sort((left, right) => left.index - right.index)
      });
    }
  }

  try {
    await Promise.all(Array.from({ length: Math.min(session.limits.concurrency, remainingPayloads.length || 1) }, () => worker()));
    const latest = currentAutomateSession(sessionId);
    if (!latest) {
      return;
    }
    if (controller.stopped) {
      saveAutomateSession({ ...latest, status: "stopped" });
      return;
    }
    if (latest.status !== "paused") {
      saveAutomateSession({ ...latest, status: "completed" });
    }
  } catch (error) {
    const latest = currentAutomateSession(sessionId) || session;
    saveAutomateSession({
      ...latest,
      status: "failed",
      error: error instanceof Error ? error.message : "Automate session failed."
    });
  } finally {
    if (!controller.paused) {
      automateControllers.delete(sessionId);
    }
  }
}

function startAutomateSession(input: unknown) {
  const value = input && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
  const payloads = Array.isArray(value.payloads)
    ? value.payloads.map((payload) => String(payload || ""))
    : [];
  const session = createAutomateSession({
    name: String(value.name || ""),
    draft: normalizeDraft(value.draft as ReplayDraft),
    environmentId: String(value.environmentId || ""),
    payloadSetId: typeof value.payloadSetId === "string" ? value.payloadSetId : undefined,
    payloads,
    positions: Array.isArray(value.positions) ? value.positions : undefined,
    limits: normalizeAutomateLimits(value.limits),
    rules: normalizeAutomateRules(value.rules)
  });

  if (!session) {
    throw new Error("Automate session could not be created.");
  }
  if (session.positions.length === 0) {
    throw new Error("Automate needs at least one payload marker before a run can start.");
  }
  if (session.payloads.length === 0) {
    throw new Error("Automate needs at least one payload before a run can start.");
  }

  const running = saveAutomateSession({ ...session, status: "running" });
  automateControllers.set(running.id, { stopped: false, paused: false, active: new Set() });
  void runAutomateSession(running.id);
  return running;
}

function pauseAutomateSession(id: string) {
  const session = currentAutomateSession(id);
  if (!session) {
    return null;
  }
  const controller = automateControllers.get(session.id);
  if (controller) {
    controller.paused = true;
  }
  return sessionWithStatus(session, "paused");
}

function resumeAutomateSession(id: string) {
  const session = currentAutomateSession(id);
  if (!session) {
    return null;
  }
  const controller = automateControllers.get(session.id);
  const running = sessionWithStatus(session, "running");
  if (controller) {
    controller.paused = false;
  } else {
    automateControllers.set(running.id, { stopped: false, paused: false, active: new Set() });
    void runAutomateSession(running.id);
  }
  return running;
}

function stopAutomateSession(id: string) {
  const session = currentAutomateSession(id);
  if (!session) {
    return null;
  }
  const controller = automateControllers.get(session.id);
  if (controller) {
    controller.stopped = true;
    controller.paused = false;
    for (const abort of controller.active) {
      abort.abort();
    }
  }
  automateControllers.delete(session.id);
  return sessionWithStatus(session, "stopped");
}

function retryAutomateSession(id: string) {
  const session = currentAutomateSession(id);
  if (!session) {
    return null;
  }
  if (automateControllers.has(session.id)) {
    return session;
  }
  const failedPayloads = session.results
    .filter((result) => result.error || !result.ok || result.status >= 400)
    .map((result) => result.payload)
    .slice(0, MAX_AUTOMATE_COUNT);
  const retryPayloads = failedPayloads.length > 0 ? failedPayloads : session.payloads.slice(0, session.limits.count);
  const running = saveAutomateSession({ ...session, status: "running", error: undefined });
  automateControllers.set(running.id, { stopped: false, paused: false, active: new Set() });
  void runAutomateSession(running.id, retryPayloads);
  return running;
}

function promoteAutomateResultToRepeater(input: unknown) {
  const payload = input && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
  const session = currentAutomateSession(String(payload.sessionId || ""));
  const result = session?.results.find((entry) => entry.id === String(payload.resultId || ""));
  if (!session || !result) {
    throw new Error("Automate result was not found.");
  }
  const state = activeLocalStore().getReplayTabState(activeLocalContext().workspace.id);
  const tab = createReplayTab(`Automate ${result.payload || result.index}`, result.request);
  return activeLocalStore().setReplayTabState(activeLocalContext().workspace.id, {
    tabs: [...state.tabs, tab],
    activeTabId: tab.id
  });
}

function promoteAutomateResultToFinding(input: unknown) {
  const payload = input && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
  const session = currentAutomateSession(String(payload.sessionId || ""));
  const result = session?.results.find((entry) => entry.id === String(payload.resultId || ""));
  if (!session || !result) {
    throw new Error("Automate result was not found.");
  }
  const createdAt = new Date().toISOString();
  const finding = normalizeFinding(
    {
      id: `finding_${randomUUID()}`,
      title: `Review Automate result: ${result.payload || `attempt ${result.index}`}`,
      severity: result.status >= 500 || result.error ? "medium" : "low",
      confidence: result.matchedRules.length + result.extracts.length > 0 ? "medium" : "low",
      status: "draft",
      affectedAssets: [result.request.url],
      evidence: [evidenceRefFromAutomateResult(session, result)],
      reproductionSteps: `${result.request.method} ${result.request.url}\nPayload: ${result.payload}`,
      impact: "Automate identified a response delta or interesting payload result that needs manual review.",
      remediation: "",
      notes: result.bodyPreview || result.error || "",
      owner: "",
      retestResult: "",
      source: "automate",
      sourceId: session.id,
      createdAt,
      updatedAt: createdAt
    },
    createdAt
  );
  if (!finding) {
    throw new Error("Automate result did not contain enough evidence for a finding.");
  }
  return activeLocalStore().upsertFinding(activeLocalContext().session.id, finding);
}

function saveFinding(input: unknown) {
  const finding = normalizeFinding(input);
  if (!finding) {
    throw new Error("Finding needs a title and at least one evidence reference.");
  }
  return activeLocalStore().upsertFinding(activeLocalContext().session.id, finding);
}

function findingReport(options: unknown) {
  const value = options && typeof options === "object" && !Array.isArray(options) ? (options as Partial<FindingReportOptions>) : {};
  const findings = activeLocalStore().listFindings(activeLocalContext().session.id);
  return buildFindingReport(findings, value, `${activeLocalContext().workspace.name} Findings`);
}

function workflowCatalog() {
  return allWorkflows(activeLocalStore().listWorkflowDefinitions(activeLocalContext().workspace.id));
}

function saveWorkflowDefinition(input: unknown) {
  const workflow = normalizeWorkflowDefinition(input);
  if (!workflow) {
    throw new Error("Workflow definition was invalid.");
  }
  if (workflow.builtIn || BUILT_IN_WORKFLOWS.some((item) => item.id === workflow.id)) {
    throw new Error("Built-in workflows cannot be overwritten.");
  }
  return activeLocalStore().upsertWorkflowDefinition(activeLocalContext().workspace.id, {
    ...workflow,
    builtIn: false
  });
}

function deleteWorkflowDefinition(id: unknown) {
  const workflowId = String(id || "").trim();
  if (!workflowId || BUILT_IN_WORKFLOWS.some((workflow) => workflow.id === workflowId)) {
    return { ok: false, workflows: workflowCatalog() };
  }
  activeLocalStore().deleteWorkflowDefinition(activeLocalContext().workspace.id, workflowId);
  return { ok: true, workflows: workflowCatalog() };
}

function validateWorkflowDefinition(input: unknown) {
  const payload = input && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
  const inputs =
    payload.inputs && typeof payload.inputs === "object" && !Array.isArray(payload.inputs)
      ? Object.fromEntries(Object.entries(payload.inputs).map(([key, value]) => [key, String(value || "")]))
      : {};
  return validateWorkflowDraft("definition" in payload ? payload.definition : input, inputs);
}

function getWorkflowRevisions(id: unknown) {
  const workflowId = String(id || "").trim();
  if (!workflowId || !localStore || !localContext) {
    return [];
  }
  return localStore.listWorkflowRevisions(localContext.workspace.id, workflowId, 60);
}

function listPlugins() {
  return activeLocalStore().listPlugins(activeLocalContext().workspace.id);
}

function previewPluginInstall(sourcePath: unknown) {
  return readPluginInstallPreview(sourcePath);
}

function installPlugin(sourcePath: unknown) {
  const preview = readPluginInstallPreview(sourcePath);
  return activeLocalStore().upsertPlugin(activeLocalContext().workspace.id, installedPluginFromPreview(preview));
}

function approvePlugin(input: unknown) {
  const payload = input && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
  const pluginId = String(payload.id || "").trim();
  const permissions = Array.isArray(payload.permissions) ? (payload.permissions as PluginPermission[]) : [];
  if (!pluginId) {
    throw new Error("Plugin id is required.");
  }
  return activeLocalStore().approvePlugin(activeLocalContext().workspace.id, pluginId, permissions);
}

function setPluginStatus(input: unknown) {
  const payload = input && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
  const pluginId = String(payload.id || "").trim();
  const status = String(payload.status || "").trim() as PluginInstallStatus;
  if (!pluginId) {
    throw new Error("Plugin id is required.");
  }
  if (status === "approved") {
    throw new Error("Use plugin approval to grant permissions.");
  }
  return activeLocalStore().setPluginStatus(activeLocalContext().workspace.id, pluginId, status);
}

function removePlugin(id: unknown) {
  const pluginId = String(id || "").trim();
  if (!pluginId) {
    return { ok: false, plugins: listPlugins() };
  }
  const plugins = activeLocalStore().deletePlugin(activeLocalContext().workspace.id, pluginId);
  return { ok: true, plugins };
}

function summarizeAuditValue(value: unknown) {
  if (typeof value === "string") {
    return value.slice(0, 500);
  }
  try {
    return JSON.stringify(value).slice(0, 500);
  } catch {
    return "";
  }
}

function appendPluginAudit(entry: PluginAuditEntry) {
  if (!localStore || !localContext) {
    return entry;
  }
  return localStore.appendPluginAudit(localContext.workspace.id, entry);
}

function pluginAuditEntry(input: Omit<PluginAuditEntry, "id" | "createdAt" | "durationMs"> & { durationMs?: number }): PluginAuditEntry {
  return {
    ...input,
    id: `plugin_audit_${randomUUID()}`,
    durationMs: input.durationMs || 0,
    createdAt: new Date().toISOString()
  };
}

function getPluginAudit() {
  return localStore && localContext ? localStore.listPluginAudit(localContext.workspace.id, 120) : [];
}

function renderPluginPanel(input: unknown) {
  const payload = input && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
  const pluginId = String(payload.pluginId || "").trim();
  const panelId = String(payload.panelId || "").trim();
  const plugin = pluginId ? activeLocalStore().getPlugin(activeLocalContext().workspace.id, pluginId) : null;
  const started = Date.now();
  if (!plugin) {
    const message = "Plugin was not installed.";
    appendPluginAudit(
      pluginAuditEntry({
        pluginId: pluginId || "unknown",
        pluginName: pluginId || "Unknown plugin",
        action: "panel:render",
        permission: "ui:panel",
        ok: false,
        message,
        inputSummary: summarizeAuditValue(payload),
        outputSummary: message
      })
    );
    return {
      ok: false,
      pluginId,
      panelId,
      title: "Missing panel",
      html: "",
      sourcePath: "",
      runtimeStatus: "failed",
      warnings: [],
      error: message
    };
  }
  const render = renderInstalledPluginPanel(plugin, panelId);
  appendPluginAudit(
    pluginAuditEntry({
      pluginId: plugin.id,
      pluginName: plugin.manifest.name,
      action: "panel:render",
      permission: "ui:panel",
      ok: render.ok,
      message: render.ok ? "Plugin panel rendered in sandbox." : render.error || "Plugin panel render failed.",
      inputSummary: summarizeAuditValue(payload),
      outputSummary: summarizeAuditValue({ panelId: render.panelId, warnings: render.warnings, error: render.error }),
      durationMs: Date.now() - started
    })
  );
  return render;
}

function validatePluginDeveloperSource(sourcePath: unknown) {
  const started = Date.now();
  const validation = validatePluginSource(sourcePath);
  appendPluginAudit(
    pluginAuditEntry({
      pluginId: validation.manifest?.id || "plugin-dev",
      pluginName: validation.manifest?.name || "Plugin validation",
      action: "plugin:validate",
      ok: validation.ok,
      message: validation.ok ? "Plugin developer validation passed." : "Plugin developer validation failed.",
      inputSummary: summarizeAuditValue({ sourcePath }),
      outputSummary: summarizeAuditValue({ errors: validation.errors, warnings: validation.warnings }),
      durationMs: Date.now() - started
    })
  );
  return validation;
}

function runPluginApiRequest(input: unknown) {
  return runPluginApiActionForPlugin(input as PluginApiRequest, {
    getPlugin: (pluginId) => activeLocalStore().getPlugin(activeLocalContext().workspace.id, pluginId),
    allowlist: () => allowlist.slice(),
    listCaptures: () => activeLocalStore().listCaptures(activeLocalContext().session.id, 2000),
    listWebSocketEvents: () => activeLocalStore().listWebSocketEvents(activeLocalContext().session.id, 5000),
    saveFinding: (finding) => activeLocalStore().upsertFinding(activeLocalContext().session.id, finding),
    listWorkflows: () => workflowCatalog(),
    saveWorkflow: (workflow) => saveWorkflowDefinition(workflow),
    runWorkflow: (payload) => runWorkflow(payload),
    sendReplay: (draft) => sendRequest({ draft }),
    recordAudit: (entry) => appendPluginAudit(entry)
  });
}

function workflowById(workflowId: string): WorkflowDefinition | null {
  return workflowCatalog().find((workflow) => workflow.id === workflowId) || null;
}

async function runWorkflow(input: unknown) {
  const payload = input && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
  const workflowId = String(payload.workflowId || "").trim();
  const definition = workflowById(workflowId);
  if (!definition) {
    throw new Error("Workflow was not found.");
  }
  const source: WorkflowRunSource = payload.source === "ai" ? "ai" : "manual";
  const inputs = normalizeWorkflowInputs(definition, payload.inputs as Record<string, unknown>);
  const context = activeLocalContext();
  const store = activeLocalStore();
  const sessionId = context.session.id;
  let run = createWorkflowRunRecord({
    definition,
    sessionId,
    source,
    inputs,
    status: "running",
    startedAt: new Date().toISOString()
  });
  store.upsertWorkflowRun(sessionId, run);

  try {
    const captures = store.listCaptures(sessionId, 2000);
    const results = evaluatePassiveWorkflow(definition, captures, allowlist, inputs);
    let actionCount = 0;
    for (const step of definition.steps) {
      if (!isActiveWorkflowStep(step) || !shouldRunWorkflowStep(step, inputs)) {
        continue;
      }
      if (!definition.scope.allowActive) {
        throw new Error("Workflow active steps are disabled by policy.");
      }
      if (actionCount >= definition.scope.maxRequests) {
        throw new Error("Workflow exceeded its active request cap.");
      }
      if (definition.scope.delayMs > 0 && actionCount > 0) {
        await delay(definition.scope.delayMs);
      }
      if (step.kind === "active-replay") {
        const captureId = inputs["capture-id"] || inputs.captureId || "";
        const capture = captures.find((item) => item.id === captureId);
        if (!capture) {
          throw new Error("Active workflow needs a selected capture id.");
        }
        if (definition.scope.requireInScope && !isAllowedTarget(capture.url, allowlist)) {
          throw new Error("Workflow capture is outside the current scope allowlist.");
        }
        const draft = replayDraftFromCapture(capture, step.config.stripAuth !== "false");
        const replay = await sendRequest({ draft }, { timeoutMs: definition.scope.timeoutMs });
        results.push(activeReplayWorkflowResult({ step, capture, replay }));
      } else {
        const targetUrl = inputs[step.config.urlInput || "url"] || step.config.url || "";
        if (!targetUrl) {
          throw new Error("Workflow browser step needs a URL input or config value.");
        }
        if (!isAllowedTarget(targetUrl, allowlist)) {
          throw new Error("Workflow browser URL is outside the current scope allowlist.");
        }
        await openRealChrome(targetUrl);
        results.push(activeBrowserWorkflowResult({ step, url: targetUrl }));
      }
      actionCount += 1;
    }

    run = {
      ...run,
      status: "completed",
      completedAt: new Date().toISOString(),
      actionCount,
      results: results.slice(0, definition.scope.maxResults)
    };
    return store.upsertWorkflowRun(sessionId, run);
  } catch (error) {
    run = {
      ...run,
      status: "failed",
      completedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : "Workflow failed."
    };
    store.upsertWorkflowRun(sessionId, run);
    return run;
  }
}

function promoteWorkflowResultToFinding(input: unknown) {
  const payload = input && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
  const run = activeLocalStore().getWorkflowRun(activeLocalContext().session.id, String(payload.runId || ""));
  const result = run?.results.find((item) => item.id === String(payload.resultId || ""));
  if (!run || !result) {
    throw new Error("Workflow result was not found.");
  }
  const finding = findingFromWorkflowResult(run, result);
  if (!finding) {
    throw new Error("Only warning or failed workflow results can become findings.");
  }
  return activeLocalStore().upsertFinding(activeLocalContext().session.id, finding);
}

async function sendWebSocketReplay(input: WebSocketReplayDraft) {
  const draft = normalizeWebSocketReplayDraft(input);
  if (!draft) {
    throw new Error("WebSocket replay draft was invalid.");
  }
  if (!isAllowedTarget(draft.url, allowlist)) {
    throw new Error("WebSocket URL is outside the current scope allowlist.");
  }

  type ReplaySocket = {
    addEventListener: (type: string, listener: (event?: { data?: unknown }) => void) => void;
    send: (data: string) => void;
    close: () => void;
  };
  const WebSocketCtor = (globalThis as unknown as { WebSocket?: new (url: string) => ReplaySocket }).WebSocket;
  if (!WebSocketCtor) {
    throw new Error("WebSocket support is not available in this runtime.");
  }

  const started = Date.now();
  return await new Promise<{ ok: boolean; error?: string; handshakeStatus?: number; responsePayload?: string; durationMs: number }>(
    (resolve) => {
      let settled = false;
      const finish = (result: { ok: boolean; error?: string; handshakeStatus?: number; responsePayload?: string; durationMs: number }) => {
        if (settled) {
          return;
        }
        settled = true;
        resolve(result);
      };

      const timeout = setTimeout(() => {
        finish({ ok: false, error: "WebSocket replay timed out.", durationMs: Date.now() - started });
        socket.close();
      }, 15_000);

      const socket = new WebSocketCtor(draft.url);
      let responsePayload = "";

      socket.addEventListener("open", () => {
        socket.send(draft.payload);
        rememberWebSocketEvent(
          websocketEvent({
            requestId: randomUUID(),
            url: draft.url,
            direction: "sent",
            payloadData: draft.payload,
            requestHeaders: draft.requestHeaders,
            responseHeaders: {},
            initiator: "repeater"
          })
        );
      });

      socket.addEventListener("message", (messageEvent) => {
        responsePayload = truncateText(String(messageEvent?.data ?? "")).slice(0, 100_000);
        rememberWebSocketEvent(
          websocketEvent({
            requestId: randomUUID(),
            url: draft.url,
            direction: "received",
            payloadData: responsePayload,
            requestHeaders: draft.requestHeaders,
            responseHeaders: {},
            initiator: "repeater"
          })
        );
        clearTimeout(timeout);
        socket.close();
        finish({ ok: true, responsePayload, durationMs: Date.now() - started });
      });

      socket.addEventListener("error", () => {
        clearTimeout(timeout);
        finish({ ok: false, error: "WebSocket replay failed.", durationMs: Date.now() - started });
      });

      socket.addEventListener("close", () => {
        clearTimeout(timeout);
        if (!settled) {
          finish({ ok: true, responsePayload, durationMs: Date.now() - started });
        }
      });
    }
  );
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

ipcMain.handle("capture:attach", (_event, contentsId) => {
  attachDebugger(contentsId);
  return { ok: true };
});

ipcMain.handle("local:context", () => activeLocalContext());

ipcMain.handle("local:profiles:list", () => activeLocalStore().listProfiles());

ipcMain.handle("local:profile:create", (_event, name) => {
  const context = activeLocalStore().createProfileContext(typeof name === "string" ? name : undefined);
  return activateLocalContext(context);
});

ipcMain.handle("local:profile:save", (_event, payload) => {
  const profile = activeLocalStore().updateProfile(String(payload?.id || ""), String(payload?.name || ""));
  if (localContext?.profile.id === profile.id) {
    localContext = {
      ...localContext,
      profile
    };
  }
  return profile;
});

ipcMain.handle("local:profile:load", (_event, id) => {
  const context = activeLocalStore().loadProfile(String(id || ""));
  return activateLocalContext(context);
});

ipcMain.handle("local:sessions:list", (_event, profileId) => {
  const context = activeLocalContext();
  const nextProfileId = typeof profileId === "string" && profileId.trim() ? profileId : context.profile.id;
  return activeLocalStore().listSessions(nextProfileId);
});

ipcMain.handle("local:session:create", (_event, name) => {
  const context = activeLocalContext();
  const session = activeLocalStore().createSession(context.workspace.id, typeof name === "string" ? name : undefined);
  return activateLocalContext({
    ...context,
    session
  });
});

ipcMain.handle("local:session:save", (_event, payload) => {
  const session = activeLocalStore().updateSession(String(payload?.id || ""), String(payload?.name || ""));
  if (localContext?.session.id === session.id) {
    localContext = {
      ...localContext,
      session
    };
  }
  return session;
});

ipcMain.handle("local:session:load", (_event, id) => {
  const context = activeLocalStore().loadSession(String(id || ""));
  return activateLocalContext(context);
});

ipcMain.handle("local:demo:seed", () => {
  const context = seedDemoProject(activeLocalStore());
  return activateLocalContext(context);
});

ipcMain.handle("browser:open", (_event, url) => {
  return openRealChrome(url);
});

ipcMain.handle("browser:navigate", (_event, url) => {
  return openRealChrome(url);
});

ipcMain.handle("browser:back", () => {
  if (targetBrowserWindow && !targetBrowserWindow.isDestroyed() && targetBrowserWindow.webContents.canGoBack()) {
    targetBrowserWindow.webContents.goBack();
  }
  return syncBrowserState();
});

ipcMain.handle("browser:forward", () => {
  if (targetBrowserWindow && !targetBrowserWindow.isDestroyed() && targetBrowserWindow.webContents.canGoForward()) {
    targetBrowserWindow.webContents.goForward();
  }
  return syncBrowserState();
});

ipcMain.handle("browser:reload", () => {
  if (targetBrowserWindow && !targetBrowserWindow.isDestroyed()) {
    targetBrowserWindow.webContents.reload();
  }
  return syncBrowserState();
});

ipcMain.handle("browser:state", () => syncBrowserState());

ipcMain.handle("proxy:ca", () => ensureProxyCa());

ipcMain.handle("proxy:start", (_event, port) => startMitmProxy(port));

ipcMain.handle("proxy:stop", () => stopMitmProxy());

ipcMain.handle("proxy:state", () => proxyState);

ipcMain.handle("proxy:profiles:get", () => {
  if (!localStore || !localContext) {
    return [];
  }
  return localStore.listProxyProfiles(localContext.workspace.id);
});

ipcMain.handle("proxy:profiles:save", (_event, payload) => {
  return activeLocalStore().saveProxyProfile(activeLocalContext().workspace.id, {
    id: payload?.id,
    notes: payload?.notes
  });
});

function normalizeBundleOptions(input: unknown): ProjectBundleOptions {
  const payload = input && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
  const redaction =
    payload.redaction === "metadata-only" ||
    payload.redaction === "reviewed-findings" ||
    payload.redaction === "raw-evidence"
      ? payload.redaction
      : "redacted-evidence";
  return {
    redaction,
    includePlugins: payload.includePlugins === true,
    includeReplayCollections: payload.includeReplayCollections !== false
  };
}

function activeProjectBundleInput(options: ProjectBundleOptions) {
  const context = activeLocalContext();
  const store = activeLocalStore();
  const sessionId = context.session.id;
  const workspaceId = context.workspace.id;
  const captures = store.listCaptures(sessionId, 2000);
  const webSocketEvents = store.listWebSocketEvents(sessionId, 5000);
  const scopedCaptures = captures.filter((capture) => capture.allowed && isAllowedTarget(capture.url, allowlist));
  const scopedWebSocketEvents = webSocketEvents.filter((event) => event.allowed && isAllowedTarget(event.url, allowlist));
  return {
    profile: context.profile,
    workspace: context.workspace,
    targets: store.getTargets(workspaceId),
    savedFilters: store.listSavedFilters(workspaceId),
    projectNotes: store.listProjectNotes(workspaceId),
    savedViews: store.listSavedViews(workspaceId),
    workflows: store.listWorkflowDefinitions(workspaceId),
    replayCollections: options.includeReplayCollections === false ? [] : store.listReplayCollections(workspaceId),
    plugins: options.includePlugins ? store.listPlugins(workspaceId) : [],
    sessions: [
      {
        session: context.session,
        captures: scopedCaptures,
        webSocketEvents: scopedWebSocketEvents,
        evidenceAnnotations: store.listEvidenceAnnotations(sessionId),
        findings: store.listFindings(sessionId),
        workflowRuns: store.listWorkflowRuns(sessionId, 200)
      }
    ]
  };
}

function previewBundleExport(input: unknown) {
  const options = normalizeBundleOptions(input);
  return buildProjectBundle(activeProjectBundleInput(options), options);
}

function bundleFilePath(input: unknown) {
  const payload = input && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
  const sourcePath = String(payload.sourcePath || "").trim();
  if (!sourcePath) {
    return "";
  }
  const resolved = path.resolve(sourcePath);
  if (!resolved.endsWith(".json") && !resolved.endsWith(".radar-bundle.json")) {
    throw new Error("Project bundle path must end in .json or .radar-bundle.json.");
  }
  return resolved;
}

function readBundleFromPath(sourcePath: string): ProjectBundle {
  const stat = fs.statSync(sourcePath);
  if (!stat.isFile()) {
    throw new Error("Project bundle path is not a file.");
  }
  const text = fs.readFileSync(sourcePath, "utf8");
  const parsed = parseProjectBundleJson(text);
  if (!parsed.ok) {
    throw new Error(parsed.error);
  }
  return parsed.bundle;
}

async function writeBundle(input: unknown) {
  const preview = previewBundleExport(input);
  if (!preview.ok || !preview.bundle) {
    return { ok: false, preview, error: preview.error || "Project bundle could not be built." };
  }
  const defaultPath = `${activeLocalContext().profile.name.replace(/[^a-zA-Z0-9_.-]/g, "-")}.radar-bundle.json`;
  const result = await dialog.showSaveDialog({
    title: "Export Radar Project Bundle",
    defaultPath,
    filters: [{ name: "Radar Project Bundle", extensions: ["radar-bundle.json", "json"] }]
  });
  if (result.canceled || !result.filePath) {
    return { ok: false, preview, error: "Project bundle export was cancelled." };
  }
  fs.writeFileSync(result.filePath, serializeProjectBundle(preview.bundle), "utf8");
  return { ok: true, path: result.filePath, preview };
}

async function readBundleForImport(input: unknown) {
  let sourcePath = bundleFilePath(input);
  if (!sourcePath) {
    const result = await dialog.showOpenDialog({
      title: "Import Radar Project Bundle",
      properties: ["openFile"],
      filters: [{ name: "Radar Project Bundle", extensions: ["radar-bundle.json", "json"] }]
    });
    if (result.canceled || !result.filePaths[0]) {
      throw new Error("Project bundle import was cancelled.");
    }
    sourcePath = result.filePaths[0];
  }
  return readBundleFromPath(sourcePath);
}

async function previewBundleImport(input: unknown) {
  const bundle = await readBundleForImport(input);
  const context = activeLocalContext();
  const store = activeLocalStore();
  return previewProjectBundleImport({
    bundle,
    activeTargets: store.getTargets(context.workspace.id),
    existingCaptures: store.listCaptures(context.session.id, 2000),
    existingWebSocketEvents: store.listWebSocketEvents(context.session.id, 5000),
    existingFindings: store.listFindings(context.session.id),
    existingWorkflows: store.listWorkflowDefinitions(context.workspace.id),
    existingProjectNotes: store.listProjectNotes(context.workspace.id),
    existingSavedViews: store.listSavedViews(context.workspace.id)
  });
}

function zeroBundleStats() {
  return {
    sessions: 0,
    captures: 0,
    webSocketEvents: 0,
    findings: 0,
    workflows: 0,
    projectNotes: 0,
    savedViews: 0,
    replayCollections: 0,
    plugins: 0,
    proposedTargets: 0
  };
}

async function applyBundleImport(input: unknown): Promise<ProjectBundleApplyResult> {
  const preview = await previewBundleImport(input);
  if (!preview.ok || !preview.bundle) {
    return {
      ok: false,
      imported: zeroBundleStats(),
      skipped: zeroBundleStats(),
      proposedTargets: [],
      message: preview.error || "Project bundle import preview failed."
    };
  }
  const bundle = preview.bundle;
  const context = activeLocalContext();
  const store = activeLocalStore();
  const workspaceId = context.workspace.id;
  const imported = zeroBundleStats();
  const skipped = zeroBundleStats();

  const existingFilters = store.listSavedFilters(workspaceId);
  store.setSavedFilters(workspaceId, [
    ...existingFilters,
    ...bundle.savedFilters.filter((filter) => !existingFilters.some((item) => item.id === filter.id))
  ]);
  const existingNotes = store.listProjectNotes(workspaceId);
  const existingNoteIds = new Set(existingNotes.map((note) => note.id));
  for (const note of bundle.projectNotes) {
    if (existingNoteIds.has(note.id)) {
      skipped.projectNotes += 1;
      continue;
    }
    store.upsertProjectNote(workspaceId, note);
    existingNoteIds.add(note.id);
    imported.projectNotes += 1;
  }
  const existingViews = store.listSavedViews(workspaceId);
  const existingViewIds = new Set(existingViews.map((view) => view.id));
  for (const view of bundle.savedViews) {
    if (existingViewIds.has(view.id)) {
      skipped.savedViews += 1;
      continue;
    }
    store.upsertSavedView(workspaceId, view);
    existingViewIds.add(view.id);
    imported.savedViews += 1;
  }
  const existingWorkflows = store.listWorkflowDefinitions(workspaceId);
  const existingWorkflowIds = new Set(existingWorkflows.map((workflow) => workflow.id));
  for (const workflow of bundle.workflows) {
    if (existingWorkflowIds.has(workflow.id)) {
      skipped.workflows += 1;
      continue;
    }
    store.upsertWorkflowDefinition(workspaceId, workflow);
    existingWorkflowIds.add(workflow.id);
    imported.workflows += 1;
  }
  if (bundle.replayCollections.length > 0) {
    const existing = store.listReplayCollections(workspaceId);
    const existingCollectionIds = new Set(existing.map((collection) => collection.id));
    const importedCollections = bundle.replayCollections.filter((collection) => {
      if (existingCollectionIds.has(collection.id)) {
        skipped.replayCollections += 1;
        return false;
      }
      existingCollectionIds.add(collection.id);
      return true;
    });
    store.setReplayCollections(workspaceId, [
      ...existing,
      ...importedCollections
    ]);
    imported.replayCollections = importedCollections.length;
  }
  const existingPlugins = store.listPlugins(workspaceId);
  const existingPluginIds = new Set(existingPlugins.map((plugin) => plugin.id));
  for (const plugin of bundle.plugins) {
    if (existingPluginIds.has(plugin.id)) {
      skipped.plugins += 1;
      continue;
    }
    store.upsertPlugin(workspaceId, plugin);
    existingPluginIds.add(plugin.id);
    imported.plugins += 1;
  }
  for (const bundleSession of bundle.sessions) {
    const importedSession = store.createSession(workspaceId, `Imported ${bundleSession.session.name}`);
    imported.sessions += 1;
    const captureIds = new Set<string>();
    for (const capture of bundleSession.captures) {
      if (captureIds.has(capture.id)) {
        skipped.captures += 1;
        continue;
      }
      store.upsertCapture(importedSession.id, capture);
      captureIds.add(capture.id);
      imported.captures += 1;
    }
    const webSocketIds = new Set<string>();
    for (const event of bundleSession.webSocketEvents) {
      if (webSocketIds.has(event.id)) {
        skipped.webSocketEvents += 1;
        continue;
      }
      store.insertWebSocketEvent(importedSession.id, event);
      webSocketIds.add(event.id);
      imported.webSocketEvents += 1;
    }
    if (bundleSession.evidenceAnnotations.length > 0) {
      store.saveEvidenceAnnotations(importedSession.id, bundleSession.evidenceAnnotations);
    }
    const findingIds = new Set<string>();
    for (const finding of bundleSession.findings) {
      if (findingIds.has(finding.id)) {
        skipped.findings += 1;
        continue;
      }
      store.upsertFinding(importedSession.id, finding);
      findingIds.add(finding.id);
      imported.findings += 1;
    }
    for (const run of bundleSession.workflowRuns) {
      store.upsertWorkflowRun(importedSession.id, { ...run, sessionId: importedSession.id });
    }
    localContext = { ...context, session: importedSession };
  }
  imported.proposedTargets = preview.proposedTargets.length;
  allowlist = store.getTargets(workspaceId);
  return {
    ok: true,
    imported,
    skipped,
    proposedTargets: preview.proposedTargets,
    message:
      preview.proposedTargets.length > 0
        ? "Bundle imported. Proposed scope targets were left inactive."
        : "Bundle imported."
  };
}

function normalizeHandoffOptions(input: unknown): HandoffPackageOptions {
  const payload = input && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
  const bundleOptions = normalizeBundleOptions(payload);
  return {
    title: String(payload.title || "").trim().slice(0, 180),
    redaction: bundleOptions.redaction,
    includeDraftFindings: payload.includeDraftFindings === true,
    includeProjectNotes: payload.includeProjectNotes !== false,
    includeReplayCollections: payload.includeReplayCollections !== false,
    includeWorkflows: payload.includeWorkflows !== false
  };
}

function activeHandoffInput(options: HandoffPackageOptions) {
  const context = activeLocalContext();
  const store = activeLocalStore();
  const sessionId = context.session.id;
  const workspaceId = context.workspace.id;
  const captures = store.listCaptures(sessionId, 2000);
  const webSocketEvents = store.listWebSocketEvents(sessionId, 5000);
  return {
    profile: context.profile,
    workspace: context.workspace,
    session: context.session,
    targets: store.getTargets(workspaceId),
    captures: captures.filter((capture) => capture.allowed && isAllowedTarget(capture.url, allowlist)),
    webSocketEvents: webSocketEvents.filter((event) => event.allowed && isAllowedTarget(event.url, allowlist)),
    findings: store.listFindings(sessionId),
    workflows: options.includeWorkflows === false ? [] : store.listWorkflowDefinitions(workspaceId),
    replayCollections: options.includeReplayCollections === false ? [] : store.listReplayCollections(workspaceId),
    projectNotes: options.includeProjectNotes === false ? [] : store.listProjectNotes(workspaceId)
  };
}

function previewHandoff(input: unknown) {
  const options = normalizeHandoffOptions(input);
  return buildHandoffPackage(activeHandoffInput(options), options);
}

async function writeHandoff(input: unknown) {
  const preview = previewHandoff(input);
  if (!preview.ok || !preview.package) {
    return { ok: false, preview, error: preview.error || "Handoff package could not be built." };
  }
  const defaultPath = `${preview.package.title.replace(/[^a-zA-Z0-9_.-]/g, "-")}.radar-handoff.json`;
  const result = await dialog.showSaveDialog({
    title: "Export Radar Handoff Package",
    defaultPath,
    filters: [{ name: "Radar Handoff Package", extensions: ["radar-handoff.json", "json"] }]
  });
  if (result.canceled || !result.filePath) {
    return { ok: false, preview, error: "Handoff package export was cancelled." };
  }
  fs.writeFileSync(result.filePath, serializeHandoffPackage(preview.package), "utf8");
  return { ok: true, path: result.filePath, preview };
}

ipcMain.handle("search:global", (_event, request) => {
  if (!localStore || !localContext) {
    return searchGlobal({}, request || { query: "" });
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
      workflows: workflowCatalog(),
      workflowRuns: localStore.listWorkflowRuns(sessionId, 200),
      plugins: listPlugins(),
      advancedSummary: buildAdvancedTestingSummary(scopedCaptures, scopedWebSockets, "", allowlist[0] || ""),
      savedFilters: localStore.listSavedFilters(workspaceId),
      projectNotes: localStore.listProjectNotes(workspaceId),
      savedViews: localStore.listSavedViews(workspaceId),
      allowlist
    },
    request || { query: "" }
  );
});

ipcMain.handle("project-notes:list", () => {
  if (!localStore || !localContext) {
    return [];
  }
  return localStore.listProjectNotes(localContext.workspace.id);
});

ipcMain.handle("project-notes:save", (_event, note) => {
  return activeLocalStore().upsertProjectNote(activeLocalContext().workspace.id, note);
});

ipcMain.handle("project-notes:delete", (_event, id) => {
  const workspaceId = activeLocalContext().workspace.id;
  activeLocalStore().deleteProjectNote(workspaceId, String(id || ""));
  return { ok: true, notes: activeLocalStore().listProjectNotes(workspaceId) };
});

ipcMain.handle("saved-views:list", () => {
  if (!localStore || !localContext) {
    return [];
  }
  return localStore.listSavedViews(localContext.workspace.id);
});

ipcMain.handle("saved-views:save", (_event, view) => {
  return activeLocalStore().upsertSavedView(activeLocalContext().workspace.id, view);
});

ipcMain.handle("saved-views:delete", (_event, id) => {
  const workspaceId = activeLocalContext().workspace.id;
  activeLocalStore().deleteSavedView(workspaceId, String(id || ""));
  return { ok: true, views: activeLocalStore().listSavedViews(workspaceId) };
});

ipcMain.handle("project-bundle:export:preview", (_event, options) => previewBundleExport(options));

ipcMain.handle("project-bundle:export:write", (_event, options) => writeBundle(options));

ipcMain.handle("project-bundle:import:preview", (_event, payload) => previewBundleImport(payload));

ipcMain.handle("project-bundle:import:apply", (_event, payload) => applyBundleImport(payload));

ipcMain.handle("handoff:preview", (_event, options) => previewHandoff(options));

ipcMain.handle("handoff:write", (_event, options) => writeHandoff(options));

ipcMain.handle("capture:snapshot", () => {
  return listHttpCaptures(400);
});

ipcMain.handle("capture:query", (_event, query) => {
  const result = filterCapturesByQuery(
    listHttpCaptures(4000),
    query,
    localStore && localContext ? annotationContext(localStore.listEvidenceAnnotations(localContext.session.id)) : {}
  );
  if (!result.ok) {
    return { ok: false, error: result.error, captures: [] };
  }
  return { ok: true, captures: result.captures.slice(0, 400) };
});

ipcMain.handle("capture:session", (_event, sessionId) => {
  const id = String(sessionId || "").trim();
  if (!id || !localStore || !localContext) {
    return [];
  }
  const allowed = localStore.listSessions(localContext.profile.id).some((session) => session.id === id);
  if (!allowed) {
    return [];
  }
  return localStore
    .listCaptures(id, 2000)
    .filter((entry) => entry.url.startsWith("http://") || entry.url.startsWith("https://"));
});

ipcMain.handle("capture:delete", (_event, id) => {
  const captureId = String(id || "").trim();
  if (!captureId) {
    return { ok: false };
  }

  captured.delete(captureId);
  if (localStore && localContext) {
    localStore.deleteCapture(localContext.session.id, captureId);
  }
  return { ok: true };
});

ipcMain.handle("capture:clear", () => {
  captured.clear();
  if (localStore && localContext) {
    localStore.clearCaptures(localContext.session.id);
  }
  return { ok: true };
});

ipcMain.handle("intercept:state", () => interceptStateSnapshot());

ipcMain.handle("intercept:config", (_event, config) => {
  const next = config && typeof config === "object" && !Array.isArray(config) ? config : {};
  const payload = next as Partial<InterceptConfig>;
  interceptConfig = {
    requestEnabled:
      typeof payload.requestEnabled === "boolean" ? payload.requestEnabled : interceptConfig.requestEnabled,
    responseEnabled:
      typeof payload.responseEnabled === "boolean" ? payload.responseEnabled : interceptConfig.responseEnabled
  };
  return interceptStateSnapshot();
});

ipcMain.handle("intercept:forward", (_event, payload) => {
  const id = String(payload?.id || "").trim();
  if (!id) {
    throw new Error("Intercept queue item id is required.");
  }
  const draft =
    payload?.draft && typeof payload.draft === "object" && !Array.isArray(payload.draft)
      ? (payload.draft as ReplayDraft)
      : undefined;
  const response =
    payload?.response && typeof payload.response === "object" && !Array.isArray(payload.response)
      ? (payload.response as InterceptResponseDraft)
      : undefined;
  return resolveInterceptItem(id, draft || response ? "edited" : "forwarded", draft, response);
});

ipcMain.handle("intercept:drop", (_event, id) => {
  return resolveInterceptItem(String(id || "").trim(), "dropped");
});

ipcMain.handle("intercept:resume-all", () => {
  for (const id of Array.from(interceptQueue.keys())) {
    resolveInterceptItem(id, "resumed");
  }
  return interceptStateSnapshot();
});

ipcMain.handle("intercept:rules:get", () => interceptRules);

ipcMain.handle("intercept:rules:set", (_event, rules) => {
  const next = normalizeInterceptRules(rules);
  interceptRules = localStore && localContext ? localStore.setInterceptRules(localContext.workspace.id, next) : next;
  return interceptRules;
});

ipcMain.handle("match-replace:rules:get", () => matchReplaceRules);

ipcMain.handle("match-replace:rules:set", (_event, rules) => {
  const next = normalizeMatchReplaceRules(rules);
  matchReplaceRules = localStore && localContext ? localStore.setMatchReplaceRules(localContext.workspace.id, next) : next;
  return matchReplaceRules;
});

ipcMain.handle("ssl:snapshot", () => sslEvents.slice(0, 80));

ipcMain.handle("websocket:snapshot", () => {
  return listWebSocketEvents(HOT_WEBSOCKET_LIMIT);
});

ipcMain.handle("websocket:clear", () => {
  webSocketEvents.splice(0, webSocketEvents.length);
  if (localStore && localContext) {
    localStore.clearWebSocketEvents(localContext.session.id);
  }
  return { ok: true };
});

ipcMain.handle("websocket:query", (_event, query) => {
  const result = filterWebSocketEventsByQuery(
    listWebSocketEvents(HOT_WEBSOCKET_LIMIT),
    query,
    localStore && localContext ? annotationContext(localStore.listEvidenceAnnotations(localContext.session.id)) : {}
  );
  if (!result.ok) {
    return { ok: false, error: result.error, events: [] };
  }
  return { ok: true, events: result.events };
});

ipcMain.handle("filters:get", () => {
  return localStore && localContext ? localStore.listSavedFilters(localContext.workspace.id) : [];
});

ipcMain.handle("filters:set", (_event, filters) => {
  const next = normalizeSavedFilters(filters);
  return localStore && localContext ? localStore.setSavedFilters(localContext.workspace.id, next) : next;
});

ipcMain.handle("repeater:tabs:get", () => {
  return localStore && localContext ? localStore.getReplayTabState(localContext.workspace.id) : null;
});

ipcMain.handle("repeater:tabs:set", (_event, state) => {
  if (!localStore || !localContext) {
    throw new Error("Local store is unavailable.");
  }
  return localStore.setReplayTabState(localContext.workspace.id, state);
});

ipcMain.handle("repeater:environments:get", () => {
  return localStore && localContext ? localStore.listReplayEnvironments(localContext.workspace.id) : [];
});

ipcMain.handle("repeater:environments:set", (_event, environments) => {
  if (!localStore || !localContext) {
    return [];
  }
  return localStore.setReplayEnvironments(localContext.workspace.id, environments);
});

ipcMain.handle("repeater:collections:get", () => {
  return localStore && localContext ? localStore.listReplayCollections(localContext.workspace.id) : [];
});

ipcMain.handle("repeater:collections:set", (_event, collections) => {
  if (!localStore || !localContext) {
    return [];
  }
  return localStore.setReplayCollections(localContext.workspace.id, collections);
});

ipcMain.handle("automate:payload-sets:get", () => {
  return localStore && localContext ? localStore.listAutomatePayloadSets(localContext.workspace.id) : [];
});

ipcMain.handle("automate:payload-sets:set", (_event, payloadSets) => {
  if (!localStore || !localContext) {
    return [];
  }
  return localStore.setAutomatePayloadSets(localContext.workspace.id, normalizeAutomatePayloadSets(payloadSets));
});

ipcMain.handle("automate:sessions:list", () => {
  return localStore && localContext ? localStore.listAutomateSessions(localContext.session.id) : [];
});

ipcMain.handle("automate:session:get", (_event, id) => {
  return localStore && localContext ? localStore.getAutomateSession(localContext.session.id, String(id || "")) : null;
});

ipcMain.handle("automate:session:start", (_event, payload) => {
  return startAutomateSession(payload);
});

ipcMain.handle("automate:session:pause", (_event, id) => {
  return pauseAutomateSession(String(id || ""));
});

ipcMain.handle("automate:session:resume", (_event, id) => {
  return resumeAutomateSession(String(id || ""));
});

ipcMain.handle("automate:session:stop", (_event, id) => {
  return stopAutomateSession(String(id || ""));
});

ipcMain.handle("automate:session:retry", (_event, id) => {
  return retryAutomateSession(String(id || ""));
});

ipcMain.handle("automate:result:promote", (_event, payload) => {
  return promoteAutomateResultToRepeater(payload);
});

ipcMain.handle("automate:result:finding", (_event, payload) => {
  return promoteAutomateResultToFinding(payload);
});

ipcMain.handle("repeater:websocket:send", async (_event, input) => {
  return sendWebSocketReplay(input as WebSocketReplayDraft);
});

ipcMain.handle("evidence:annotations:get", () => {
  return localStore && localContext ? localStore.listEvidenceAnnotations(localContext.session.id) : [];
});

ipcMain.handle("evidence:annotations:save", (_event, annotation) => {
  if (!localStore || !localContext) {
    throw new Error("Local store is unavailable.");
  }
  return localStore.saveEvidenceAnnotation(localContext.session.id, annotation);
});

ipcMain.handle("evidence:annotations:save-many", (_event, annotations) => {
  if (!localStore || !localContext) {
    return [];
  }
  return localStore.saveEvidenceAnnotations(
    localContext.session.id,
    Array.isArray(annotations) ? annotations : []
  );
});

ipcMain.handle("findings:list", () => {
  return localStore && localContext ? localStore.listFindings(localContext.session.id) : [];
});

ipcMain.handle("findings:save", (_event, finding) => {
  return saveFinding(finding);
});

ipcMain.handle("findings:delete", (_event, id) => {
  const findingId = String(id || "").trim();
  if (!findingId) {
    return { ok: false };
  }
  activeLocalStore().deleteFinding(activeLocalContext().session.id, findingId);
  return { ok: true };
});

ipcMain.handle("findings:report", (_event, options) => {
  return findingReport(options);
});

ipcMain.handle("workflows:list", () => {
  return localStore && localContext ? workflowCatalog() : BUILT_IN_WORKFLOWS;
});

ipcMain.handle("workflows:save", (_event, workflow) => {
  return saveWorkflowDefinition(workflow);
});

ipcMain.handle("workflows:delete", (_event, id) => {
  return deleteWorkflowDefinition(id);
});

ipcMain.handle("workflows:validate", (_event, payload) => {
  return validateWorkflowDefinition(payload);
});

ipcMain.handle("workflows:revisions", (_event, id) => {
  return getWorkflowRevisions(id);
});

ipcMain.handle("workflows:runs", () => {
  return localStore && localContext ? localStore.listWorkflowRuns(localContext.session.id) : [];
});

ipcMain.handle("workflows:run", (_event, payload) => {
  return runWorkflow(payload);
});

ipcMain.handle("workflows:result:finding", (_event, payload) => {
  return promoteWorkflowResultToFinding(payload);
});

ipcMain.handle("plugins:list", () => {
  return localStore && localContext ? listPlugins() : [];
});

ipcMain.handle("plugins:preview", (_event, sourcePath) => {
  return previewPluginInstall(sourcePath);
});

ipcMain.handle("plugins:install", (_event, sourcePath) => {
  return installPlugin(sourcePath);
});

ipcMain.handle("plugins:approve", (_event, payload) => {
  return approvePlugin(payload);
});

ipcMain.handle("plugins:status", (_event, payload) => {
  return setPluginStatus(payload);
});

ipcMain.handle("plugins:remove", (_event, id) => {
  return removePlugin(id);
});

ipcMain.handle("plugins:audit", () => {
  return getPluginAudit();
});

ipcMain.handle("plugins:panel", (_event, payload) => {
  return renderPluginPanel(payload);
});

ipcMain.handle("plugins:validate", (_event, sourcePath) => {
  return validatePluginDeveloperSource(sourcePath);
});

ipcMain.handle("plugins:api", (_event, request) => {
  return runPluginApiRequest(request);
});

ipcMain.handle("targets:get", () => allowlist);

ipcMain.handle("targets:set", (_event, targets) => {
  const next = Array.isArray(targets)
    ? targets.map((target) => String(target).trim()).filter(Boolean).slice(0, 40)
    : defaultAllowlist;
  allowlist = next.length > 0 ? next : [...defaultAllowlist];
  if (localStore && localContext) {
    allowlist = localStore.setTargets(localContext.workspace.id, allowlist);
  }
  return allowlist;
});

ipcMain.handle("repeater:send", async (_event, input) => {
  return sendRequest(input);
});

ipcMain.handle("agent:start", (_event, payload) => {
  return activeAgentRuntime().start(payload || {});
});

ipcMain.handle("agent:stop", (_event, id) => {
  return activeAgentRuntime().stop(String(id || ""));
});

ipcMain.handle("agent:get", (_event, id) => {
  return activeAgentRuntime().get(String(id || ""));
});

ipcMain.handle("agent:list", () => {
  return activeAgentRuntime().list();
});

ipcMain.handle("agent-memory:list", () => {
  return activeLocalStore().listAgentRunMemory(activeLocalContext().workspace.id);
});

ipcMain.handle("agent-memory:save", (_event, entry: AgentRunMemoryEntry) => {
  return activeLocalStore().upsertAgentRunMemory(activeLocalContext().workspace.id, {
    ...entry,
    status: entry.status === "proposed" ? "confirmed" : entry.status,
    updatedAt: new Date().toISOString()
  });
});

ipcMain.handle("agent-memory:delete", (_event, id) => {
  const memory = activeLocalStore().deleteAgentRunMemory(activeLocalContext().workspace.id, String(id || ""));
  return { ok: true, memory };
});

ipcMain.handle("ai:settings:get", () => loadAiSettings(app.getPath("userData")));

ipcMain.handle("ai:settings:set", (_event, settings) => saveAiSettings(app.getPath("userData"), settings));

ipcMain.handle("ai:context:preview", (_event, payload) => {
  return previewAiContext({
    capturedMap: captured,
    webSocketEventMap: webSocketEventMap(),
    allowlist,
    browserUrl: browserState.url || "",
    request: payload || {}
  });
});

ipcMain.handle("ai:run", async (_event, payload) => {
  return runAiTask({
    capturedMap: captured,
    webSocketEventMap: webSocketEventMap(),
    allowlist,
    browserUrl: browserState.url || "",
    userDataPath: app.getPath("userData"),
    request: payload || {}
  });
});

ipcMain.handle("ai:skills:get", () => loadAiSkills(app.getPath("userData")));

ipcMain.handle("ai:skills:save", (_event, skill) => saveAiSkill(app.getPath("userData"), skill));

ipcMain.handle("ai:skills:delete", (_event, id) => deleteAiSkill(app.getPath("userData"), String(id || "")));

ipcMain.handle("ai:audit:snapshot", () => snapshotAiAudit());

ipcMain.handle("ai:connect", async (_event, presetId) => {
  const result = await connectAiPreset({ userDataPath: app.getPath("userData"), presetId });
  if (localStore && result.probe.ok) {
    try {
      await refreshAiModels({ settings: result.settings, store: localStore });
    } catch {
      // keep cached models when refresh fails
    }
  }
  return result;
});

ipcMain.handle("ai:connect:probe", async (_event, settings) => {
  return probeAiSettings(settings || {});
});

ipcMain.handle("ai:cursor:login", async () => {
  return loginCursorCli();
});

ipcMain.handle("ai:models:get", (_event, provider) => {
  return getAiModels(String(provider || ""), localStore);
});

ipcMain.handle("ai:models:refresh", async (_event, settings) => {
  const current = settings || loadAiSettings(app.getPath("userData"));
  const models = await refreshAiModels({ settings: current, store: localStore });
  const next = reconcileSettingsModel(current, models);
  if (next.model !== current.model) {
    saveAiSettings(app.getPath("userData"), next);
  }
  return models;
});

ipcMain.handle("repeater:burst", async (_event, input) => {
  const requestPayload = {
    draft: input.request || input,
    environmentId: String(input.environmentId || "")
  };
  const count = Math.min(Math.max(Number(input.count || 1), 1), MAX_BURST_COUNT);
  const concurrency = Math.min(Math.max(Number(input.concurrency || 1), 1), MAX_BURST_CONCURRENCY);
  const delayMs = Math.min(Math.max(Number(input.delayMs || 0), 0), 10_000);
  const results: Array<{
    index: number;
    ok: boolean;
    status: number;
    statusText: string;
    durationMs: number;
    headers: Record<string, string>;
    body: string;
    bytes: number;
  }> = [];
  let cursor = 0;

  async function worker() {
    while (cursor < count) {
      const index = cursor;
      cursor += 1;
      if (delayMs > 0 && index > 0) {
        await delay(delayMs);
      }
      try {
        const response = await sendRequest(requestPayload);
        results[index] = { ...response, index: index + 1 };
      } catch (error) {
        results[index] = {
          index: index + 1,
          ok: false,
          status: 0,
          statusText: error instanceof Error ? error.message : "Replay failed",
          durationMs: 0,
          headers: {},
          body: "",
          bytes: 0
        };
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  return {
    count,
    concurrency,
    results,
    averageMs: Math.round(results.reduce((sum, item) => sum + item.durationMs, 0) / results.length),
    failures: results.filter((item) => !item.ok || item.status >= 400).length
  };
});
