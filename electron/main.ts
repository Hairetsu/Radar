import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow, ipcMain, session, shell, webContents, nativeImage, dialog, screen, type Rectangle } from "electron";
import {
  DEFAULT_ALLOWLIST,
  isAllowedTarget,
  normalizeTargetRules,
  shouldTrustLocalCertificate
} from "../shared/allowlist.js";
import type {
  FindingReportOptions,
  LocalContext,
  SslEvent
} from "../shared/domain.js";
import { normalizeAutomatePayloadSets } from "../shared/automate.js";
import type {
  AgentRun
} from "../shared/agent-types.js";
import type { AiConnectProbe, AiSettings } from "../shared/ai-types.js";
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
import { normalizeUrl as normalizeBrowserUrl } from "../shared/url.js";
import { BUILT_IN_WORKFLOWS } from "../shared/workflows.js";
import { openLocalStore, type LocalStore } from "./localStore.js";
import {
  createIdentityActivation,
  createSerializedIdentityActivator,
  identityBrowserProfileDir
} from "./identityProfiles.js";
import { createIdentityController } from "./identity/identityController.js";
import { seedDemoProject } from "./demoProject.js";
import { registerAgentIpc, type AgentIpcAction } from "./ipc/registerAgentIpc.js";
import { registerAiIpc, type AiIpcAction } from "./ipc/registerAiIpc.js";
import { registerAutomateIpc } from "./ipc/registerAutomateIpc.js";
import { registerBrowserIpc } from "./ipc/registerBrowserIpc.js";
import { registerCaptureIpc } from "./ipc/registerCaptureIpc.js";
import { registerInterceptIpc } from "./ipc/registerInterceptIpc.js";
import { registerIdentityIpc } from "./ipc/registerIdentityIpc.js";
import { registerFindingsIpc } from "./ipc/registerFindingsIpc.js";
import { registerLocalIpc } from "./ipc/registerLocalIpc.js";
import { registerProjectIpc } from "./ipc/registerProjectIpc.js";
import { registerPluginIpc } from "./ipc/registerPluginIpc.js";
import { runManualReplayExperiment } from "./agent/assessment/manualExperiment.js";
import { delayWithSignal } from "./agent/assessment/stopController.js";
import { registerRepeaterIpc } from "./ipc/registerRepeaterIpc.js";
import { registerWorkflowIpc } from "./ipc/registerWorkflowIpc.js";
import { registerWindowIpc } from "./ipc/registerWindowIpc.js";
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
  loginCursorCli,
  loginGrokCli
} from "./ai/index.js";
import { AgentRuntime } from "./agent/runtime.js";
import { createAiAgentPlanner } from "./agent/planner.js";
import { createAutomateController } from "./automate/automateController.js";
import { createPageInspectionController } from "./browser/pageInspection.js";
import { createElectronDebuggerCapture } from "./browser/electronDebuggerCapture.js";
import {
  createChromeCaptureObserver
} from "./browser/chromeCaptureObserver.js";
import {
  createCdpPageClient,
  waitForChromeDebugger
} from "./browser/cdpClient.js";
import { createManagedBrowser } from "./browser/managedBrowser.js";
import {
  createWebSocketLedger,
  HOT_WEBSOCKET_LIMIT
} from "./capture/webSocketLedger.js";
import {
  createCaptureLedger,
  HOT_CAPTURE_LIMIT
} from "./capture/captureLedger.js";
import { createCausalAttribution } from "./capture/causalAttribution.js";
import { createInterceptController } from "./intercept/interceptController.js";
import { createProxyController } from "./proxy/proxyController.js";
import { createPluginController } from "./plugins/pluginController.js";
import { createProjectArtifactController } from "./project/projectArtifactController.js";
import { createReplayController } from "./replay/replayController.js";
import { createWorkflowController } from "./workflows/workflowController.js";
import type { CdpListEntry } from "./chromeDebugging.js";
import {
  createWindowCoordinator,
  type WindowCoordinator
} from "./windows/windowCoordinator.js";

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

const defaultAllowlist = DEFAULT_ALLOWLIST;

let mainWindow: BrowserWindow | null = null;
let targetBrowserWindow: BrowserWindow | undefined;
let allowlist = [...defaultAllowlist];
const sslEvents: SslEvent[] = [];
let localStore: LocalStore | null = null;
let localContext: LocalContext | null = null;
let agentRuntime: AgentRuntime | null = null;
let windowCoordinator: WindowCoordinator | null = null;
const causalAttribution = createCausalAttribution();
const serializeIdentityActivation = createSerializedIdentityActivator();

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

function activeWindowCoordinator() {
  if (!windowCoordinator) {
    throw new Error("Radar window coordination is not ready.");
  }
  return windowCoordinator;
}

function windowRole(webContentsId: number) {
  return activeWindowCoordinator().roleForWebContents(webContentsId);
}

function authorizeAgentAction(webContentsId: number, action: AgentIpcAction) {
  const role = windowRole(webContentsId);
  if (role === "ai-operator") {
    return true;
  }
  return role === "workspace" && [
    "pause",
    "resume",
    "stop",
    "get",
    "list",
    "list-memory"
  ].includes(action);
}

function authorizeAiAction(webContentsId: number, action: AiIpcAction) {
  const role = windowRole(webContentsId);
  if (role === "ai-operator") {
    return [
      "settings-read",
      "settings-write",
      "connect",
      "probe",
      "login",
      "models-read",
      "models-refresh"
    ].includes(action);
  }
  return role === "workspace" && [
    "settings-read",
    "preview",
    "run",
    "skills-read",
    "skills-write",
    "audit",
    "models-read"
  ].includes(action);
}

function publishAiConnection(settings: AiSettings, probe: AiConnectProbe, checking = false) {
  return activeWindowCoordinator().publishAiConnection({
    connected: probe.ok,
    checking,
    provider: settings.provider,
    model: settings.model,
    message: probe.message
  });
}

function endActiveIdentityActivation() {
  const attribution = causalAttribution.raw();
  if (localStore && localContext && attribution.activationId) {
    try {
      const activation = localStore
        .listIdentityActivations(localContext.session.id, 100)
        .find((item) => item.id === attribution.activationId && item.status === "active");
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
  causalAttribution.clearIdentityContext();
  managedBrowser.clearDedicatedProfileDir();
}

function activateLocalContext(nextContext: LocalContext) {
  const profileChanged = Boolean(localContext && localContext.profile.id !== nextContext.profile.id);
  const workspaceChanged = Boolean(localContext && localContext.workspace.id !== nextContext.workspace.id);
  if (profileChanged || workspaceChanged) {
    endActiveIdentityActivation();
    managedBrowser.reset();
  }

  localContext = nextContext;
  hydrateActiveLocalState();
  return localContext;
}

const captureLedger = createCaptureLedger({
  currentSessionId: () => localContext?.session.id || "",
  attribution: causalAttribution.current,
  persist: (sessionId, capture) => localStore?.upsertCapture(sessionId, capture),
  load: (sessionId, limit) => localStore?.listCaptures(sessionId, limit) || null,
  deletePersisted: (sessionId, captureId) => localStore?.deleteCapture(sessionId, captureId),
  clearPersisted: (sessionId) => localStore?.clearCaptures(sessionId)
});
const captured = captureLedger.captures;
const rememberCapture = captureLedger.remember;
const bindCaptureEntryToSession = captureLedger.bindEntryToSession;
const bindCaptureToCurrentSession = captureLedger.bindToCurrentSession;

const interceptController = createInterceptController({
  currentSessionId: () => localContext?.session.id || "",
  allowlist: () => allowlist.slice(),
  captureById: (captureId) => captured.get(captureId),
  rememberCapture,
  bindCaptureToCurrentSession,
  bindCaptureToSession: bindCaptureEntryToSession,
  saveInterceptRules: (rules) =>
    localStore && localContext
      ? localStore.setInterceptRules(localContext.workspace.id, rules)
      : rules,
  saveMatchReplaceRules: (rules) =>
    localStore && localContext
      ? localStore.setMatchReplaceRules(localContext.workspace.id, rules)
      : rules
});
const interceptStateSnapshot = interceptController.state;
const queueInterceptRequest = interceptController.queueRequest;
const queueInterceptResponse = interceptController.queueResponse;

function rememberSslEvent(event: SslEvent) {
  sslEvents.unshift(event);
  sslEvents.splice(80);

  if (localStore && localContext) {
    localStore.insertSslEvent(localContext.session.id, event);
  }
}

const webSocketLedger = createWebSocketLedger({
  currentSessionId: () => localContext?.session.id || "",
  allowlist: () => allowlist.slice(),
  attribution: causalAttribution.current,
  persist: (sessionId, event) => localStore?.insertWebSocketEvent(sessionId, event),
  load: (sessionId, limit) => localStore?.listWebSocketEvents(sessionId, limit) || null,
  clearPersisted: (sessionId) => localStore?.clearWebSocketEvents(sessionId)
});
const websocketEvent = webSocketLedger.createEvent;
const rememberWebSocketEvent = webSocketLedger.rememberEvent;
const rememberProxyWebSocketRequest = webSocketLedger.rememberProxyRequest;
const rememberProxyWebSocketAccepted = webSocketLedger.rememberProxyAccepted;
const rememberProxyWebSocketMessage = webSocketLedger.rememberProxyMessage;
const rememberProxyWebSocketClose = webSocketLedger.rememberProxyClose;

function hydrateActiveLocalState() {
  if (!localStore || !localContext) {
    return;
  }

  allowlist = localStore.getTargets(localContext.workspace.id);
  interceptController.hydrateRules(
    localStore.listInterceptRules(localContext.workspace.id),
    localStore.listMatchReplaceRules(localContext.workspace.id)
  );
  captureLedger.hydrate(
    localStore.listCaptures(localContext.session.id, HOT_CAPTURE_LIMIT).reverse(),
    localContext.session.id
  );

  sslEvents.splice(0, sslEvents.length, ...localStore.listSslEvents(localContext.session.id, 80));
  const storedWebSockets = localStore.listWebSocketEvents(localContext.session.id, HOT_WEBSOCKET_LIMIT);
  webSocketLedger.hydrate(storedWebSockets, localContext.session.id);
}

const listHttpCaptures = captureLedger.listHttp;

const listWebSocketEvents = webSocketLedger.list;
const webSocketEventMap = webSocketLedger.eventMap;

async function waitForNetworkIdle({ idleMs = 700, timeoutMs = 8000 }: { idleMs?: number; timeoutMs?: number }) {
  const state = browserStateSnapshot();
  if (state.engine === "chrome" && state.remoteDebuggingUrl) {
    const automation = await ensurePlaywrightBrowser();
    return automation.waitForNetworkIdle({ idleMs, timeoutMs });
  }
  const started = Date.now();
  let observedChangeAt = captureLedger.lastChangeAt();
  while (Date.now() - started < timeoutMs) {
    if (captureLedger.lastChangeAt() !== observedChangeAt) {
      observedChangeAt = captureLedger.lastChangeAt();
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

async function cdpPageTarget() {
  let endpoint = browserStateSnapshot().remoteDebuggingUrl;
  let targets: CdpListEntry[] | null = null;

  if (endpoint) {
    try {
      targets = await waitForChromeDebugger(endpoint, 2500);
    } catch {
      targets = null;
    }
  }

  if (!targets) {
    const reopenUrl = syncBrowserState().url || browserStateSnapshot().url;
    if (reopenUrl && /^https?:\/\//i.test(reopenUrl)) {
      await openRealChrome(reopenUrl);
      endpoint = browserStateSnapshot().remoteDebuggingUrl;
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

const chromeCaptureObserver = createChromeCaptureObserver({
  waitForDebugger: waitForChromeDebugger,
  currentSessionId: () => localContext?.session.id || "",
  allowlist: () => allowlist.slice(),
  attribution: causalAttribution.current,
  bindCaptureToSession: bindCaptureEntryToSession,
  captureById: (captureId) => captured.get(captureId),
  rememberCapture,
  createWebSocketEvent: websocketEvent,
  rememberWebSocketEvent
});

const managedBrowser = createManagedBrowser({
  userDataPath: app.getPath("userData"),
  defaultDebugPort,
  profileId: () => localContext?.profile.id || "default",
  allowlist: () => allowlist.slice(),
  startProxy: (port) => proxyController.start(port),
  proxyState: () => proxyController.state(),
  captureObserver: chromeCaptureObserver,
  electronSurfaceState: () =>
    targetBrowserWindow && !targetBrowserWindow.isDestroyed()
      ? {
          open: true,
          url: targetBrowserWindow.webContents.getURL(),
          title: targetBrowserWindow.getTitle(),
          loading: targetBrowserWindow.webContents.isLoading(),
          engine: "electron"
        }
      : null,
  onProcessExit: endActiveIdentityActivation
});
const syncBrowserState = managedBrowser.state;
const browserStateSnapshot = managedBrowser.rawState;
const openRealChrome = managedBrowser.open;
const navigateRealChrome = managedBrowser.navigate;
const stopChromeProcess = managedBrowser.stop;
const ensurePlaywrightBrowser = managedBrowser.ensureAutomation;

const cdpPageClient = createCdpPageClient({ resolveTarget: cdpPageTarget });
const withCdpPage = cdpPageClient.withPage;
const evaluateChromePage = cdpPageClient.evaluate;

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
  browserState: browserStateSnapshot,
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
  browserInstanceId: chromeCaptureObserver.instanceId,
  activeActionId: () => causalAttribution.raw().actionId,
  setActiveActionId: (id) => {
    causalAttribution.update({ actionId: id });
  },
  setActiveNavigationId: (id) => {
    causalAttribution.update({ navigationId: id });
  },
  activeIdentityId: () => causalAttribution.raw().identityId,
  activeActivationId: () => causalAttribution.raw().activationId,
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
      windowCoordinator?.publishAgentChanged(run.id);
    },
    loadRun: (runId) => activeLocalStore().getAgentRun(activeLocalContext().session.id, String(runId || "")),
    listRuns: () => activeLocalStore().listAgentRuns(activeLocalContext().session.id),
    getBrowserState: () => syncBrowserState(),
    openBrowser: (url) => {
      causalAttribution.update({ navigationId: `nav_${randomUUID()}` });
      return openRealChrome(url);
    },
    navigateBrowser: (url) => {
      causalAttribution.update({ navigationId: `nav_${randomUUID()}` });
      return navigateRealChrome(url);
    },
    getCaptures: () => listHttpCaptures(2000),
    getCaptureById: (id) => {
      const captureId = String(id || "").trim();
      if (!captureId) {
        return null;
      }
      const hot = captureLedger.captures.get(captureId);
      if (hot && (hot.url.startsWith("http://") || hot.url.startsWith("https://"))) {
        return hot;
      }
      if (!localStore || !localContext) {
        return null;
      }
      const stored = localStore.getCapture(localContext.session.id, captureId);
      if (!stored || !(stored.url.startsWith("http://") || stored.url.startsWith("https://"))) {
        return null;
      }
      return stored;
    },
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
    sendReplay: (draft, options) =>
      sendRequest(typeof draft === "object" && draft && "draft" in draft ? draft : { draft }, options),
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
      causalAttribution.update({
        agentRunId: runId || "",
        ...(!runId ? { navigationId: "" } : {})
      });
    },
    setActiveActionContext: (context) => {
      causalAttribution.update({ actionId: context?.actionId || "" });
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

function openApprovedExternalUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol === "http:" || url.protocol === "https:") {
      void shell.openExternal(url.toString());
    }
  } catch {
    // Renderer-created external URLs fail closed.
  }
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
      webviewTag: false,
      sandbox: false
    }
  });

  activeWindowCoordinator().attachWorkspace(mainWindow);
  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  mainWindow.removeMenu();
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    openApprovedExternalUrl(url);
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

  loadRendererSurface(mainWindow, "workspace");
}

function loadRendererSurface(window: BrowserWindow, surface: "workspace" | "ai-operator") {
  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    const url = new URL(devUrl);
    url.searchParams.set("surface", surface);
    void window.loadURL(url.toString());
    return;
  }
  void window.loadFile(path.join(__dirname, "..", "..", "dist", "index.html"), {
    query: { surface }
  });
}

function createAiOperatorWindow(bounds: Rectangle) {
  const icon = loadAppIcon();
  const window = new BrowserWindow({
    ...bounds,
    minWidth: 760,
    minHeight: 640,
    show: false,
    title: "Radar — AI Operator",
    ...(icon ? { icon } : {}),
    backgroundColor: "#07110f",
    webPreferences: {
      preload: path.join(__dirname, "aiOperatorPreload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: false,
      // Electron 42's packaged ESM preload does not execute in a sandboxed
      // renderer on every supported platform. The dedicated preload remains
      // narrow, context-isolated, Node-free, and sender-role authorized.
      sandbox: false
    }
  });
  window.removeMenu();
  window.webContents.setWindowOpenHandler(({ url }) => {
    openApprovedExternalUrl(url);
    return { action: "deny" };
  });
  window.webContents.on("before-input-event", (_event, input) => {
    if (input.type !== "keyDown") return;
    const key = input.key?.toLowerCase();
    const toggleCombo =
      (process.platform === "darwin" && input.meta && input.alt && key === "i") ||
      (process.platform !== "darwin" && input.control && input.shift && key === "i") ||
      key === "f12";
    if (toggleCombo) {
      window.webContents.toggleDevTools();
    }
  });
  loadRendererSurface(window, "ai-operator");
  return window;
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
  windowCoordinator = createWindowCoordinator({
    stateFile: path.join(app.getPath("userData"), "radar-window-state.json"),
    createAiWindow: createAiOperatorWindow
  });
  screen.on("display-removed", () => {
    windowCoordinator?.reclampAiOperator();
  });
  createWindow();
  const devCsp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self' ws: wss: http: https:",
    "object-src 'none'",
    "frame-src 'none'",
    "base-uri 'self'"
  ].join("; ");
  const prodCsp = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self' http: https:",
    "object-src 'none'",
    "frame-src 'none'",
    "base-uri 'self'"
  ].join("; ");
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [process.env.VITE_DEV_SERVER_URL ? devCsp : prodCsp]
      }
    });
  });

  app.on("activate", () => {
    if (!mainWindow || mainWindow.isDestroyed()) {
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
  windowCoordinator?.destroy();
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
    causalAttribution.update({
      identityId: activation.identityId,
      activationId: activation.activationId,
      actionId: causalAttribution.raw().actionId || `action_${randomUUID()}`
    });
    managedBrowser.setDedicatedProfileDir(profileDir);
    try {
      await openRealChrome(nextUrl);
      if (!browserStateSnapshot().open || causalAttribution.raw().activationId !== activation.activationId) {
        throw new Error("Dedicated identity browser did not remain active after launch.");
      }
      return activation;
    } catch (error) {
      stopChromeProcess();
      causalAttribution.update({ identityId: "", activationId: "", actionId: "" });
      managedBrowser.clearDedicatedProfileDir();
      throw error;
    }
  });
}

const proxyController = createProxyController({
  userDataPath: app.getPath("userData"),
  regressionMode: Boolean(regressionUserDataPath),
  defaultPort: defaultProxyPort,
  currentSessionId: () => localContext?.session.id || "",
  allowlist: () => allowlist.slice(),
  captureById: (captureId) => captured.get(captureId),
  bindCaptureToCurrentSession,
  bindCaptureToSession: bindCaptureEntryToSession,
  rememberCapture,
  rememberSslEvent,
  rememberWebSocketRequest: rememberProxyWebSocketRequest,
  rememberWebSocketAccepted: rememberProxyWebSocketAccepted,
  rememberWebSocketMessage: rememberProxyWebSocketMessage,
  rememberWebSocketClose: rememberProxyWebSocketClose,
  queueInterceptRequest,
  queueInterceptResponse
});
const ensureProxyCa = proxyController.ensureCa;
const startMitmProxy = proxyController.start;
const stopMitmProxy = proxyController.stop;

const electronDebuggerCapture = createElectronDebuggerCapture({
  resolveContents: (contentsId) => webContents.fromId(contentsId) || undefined,
  allowlist: () => allowlist.slice(),
  captureById: (requestId) => captured.get(requestId),
  rememberCapture,
  createWebSocketEvent: websocketEvent,
  rememberWebSocketEvent
});

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
  authorizeContextRead: (webContentsId) => Boolean(windowRole(webContentsId)),
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
  attachCaptureDebugger: electronDebuggerCapture.attach,
  open: openRealChrome,
  navigate: navigateRealChrome,
  back: async () => {
    const state = browserStateSnapshot();
    if (state.engine === "chrome" && state.remoteDebuggingUrl) {
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
    const state = browserStateSnapshot();
    if (state.engine === "chrome" && state.remoteDebuggingUrl) {
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
    const state = browserStateSnapshot();
    if (state.engine === "chrome" && state.remoteDebuggingUrl) {
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
  proxyState: proxyController.state,
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
  authorizeTargetsRead: (webContentsId) => Boolean(windowRole(webContentsId)),
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
  delete: captureLedger.remove,
  clear: captureLedger.clear,
  sslSnapshot: () => sslEvents.slice(0, 80),
  webSocketSnapshot: () => listWebSocketEvents(HOT_WEBSOCKET_LIMIT),
  clearWebSockets: webSocketLedger.clear,
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
  state: interceptController.state,
  configure: interceptController.configure,
  forward: interceptController.forward,
  drop: interceptController.drop,
  resumeAll: interceptController.resumeAll,
  getRules: interceptController.getRules,
  setRules: interceptController.setRules,
  getMatchReplaceRules: interceptController.getMatchReplaceRules,
  setMatchReplaceRules: interceptController.setMatchReplaceRules
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
  authorize: authorizeAgentAction,
  start: (request) => {
    const run = activeAgentRuntime().start(request);
    activeWindowCoordinator().setAppMode("ai-first");
    return run;
  },
  pause: (id) => activeAgentRuntime().pause(id),
  resume: (id) => activeAgentRuntime().resume(id),
  recover: (id, request) => activeAgentRuntime().recover(id, request),
  steerMission: (id, request) => activeAgentRuntime().steerMission(id, request),
  updateCapabilities: (id, request) => activeAgentRuntime().updateCapabilities(id, request),
  stop: (id) => activeAgentRuntime().stop(id),
  stopTraffic: () => activeAgentRuntime().stopTrafficNow(),
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

registerWindowIpc(ipcMain, {
  coordinator: activeWindowCoordinator,
  executingRun: () =>
    activeAgentRuntime().list().find((run) => run.status === "queued" || run.status === "running") || null,
  pauseRun: (id) => activeAgentRuntime().pause(id)
});

registerAiIpc(ipcMain, {
  authorize: authorizeAiAction,
  getSettings: (provider) => loadAiSettings(app.getPath("userData"), provider),
  saveSettings: (settings) => saveAiSettings(app.getPath("userData"), settings),
  previewContext: (request) =>
    previewAiContext({
      capturedMap: captured,
      webSocketEventMap: webSocketEventMap(),
      allowlist,
      browserUrl: browserStateSnapshot().url || "",
      request
    }),
  run: (request) =>
    runAiTask({
      capturedMap: captured,
      webSocketEventMap: webSocketEventMap(),
      allowlist,
      browserUrl: browserStateSnapshot().url || "",
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
    publishAiConnection(result.settings, result.probe);
    return result;
  },
  probe: async (settings) => {
    const probe = await probeAiSettings(settings);
    publishAiConnection(settings, probe);
    return probe;
  },
  cursorLogin: async () => {
    const probe = await loginCursorCli();
    publishAiConnection(loadAiSettings(app.getPath("userData")), probe);
    return probe;
  },
  grokLogin: async () => {
    const probe = await loginGrokCli();
    publishAiConnection(loadAiSettings(app.getPath("userData")), probe);
    return probe;
  },
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
  burst: sendReplayBurst,
  experiment: (input) =>
    runManualReplayExperiment({
      request: input,
      captures: listHttpCaptures(4000),
      allowlist: allowlist.slice(),
      deps: {
        send: (draft, options) => sendRequest({ draft }, options),
        getTabState: () => activeLocalStore().getReplayTabState(activeLocalContext().workspace.id),
        setTabState: (state) =>
          activeLocalStore().setReplayTabState(activeLocalContext().workspace.id, state),
        delay: delayWithSignal,
        now: () => new Date().toISOString(),
        createId: (prefix) => `${prefix}_${randomUUID()}`
      }
    })
});
