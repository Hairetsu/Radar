import { contextBridge } from "electron";
import type { AgentRun } from "../shared/agent-types.js";
import type { AiSettings } from "../shared/ai-types.js";
import type { RadarApi } from "../shared/radar-api.js";
import type { BrowserState, CapturedRequest, LocalContext, ProxyState, SslEvent } from "../shared/domain.js";

const context: LocalContext = {
  profile: {
    id: "profile-screenshot",
    name: "Field Operator",
    createdAt: "2026-05-25T00:00:00.000Z",
    updatedAt: "2026-05-25T00:00:00.000Z"
  },
  workspace: {
    id: "workspace-screenshot",
    profileId: "profile-screenshot",
    name: "Screenshot Workspace",
    createdAt: "2026-05-25T00:00:00.000Z",
    updatedAt: "2026-05-25T00:00:00.000Z"
  },
  session: {
    id: "session-screenshot",
    workspaceId: "workspace-screenshot",
    name: "Context Menu Sweep",
    startedAt: "2026-05-25T00:00:00.000Z",
    updatedAt: "2026-05-25T00:00:00.000Z"
  }
};

const captures: CapturedRequest[] = [
  {
    id: "cap-auth",
    startedAt: "2026-05-25T00:00:04.000Z",
    method: "POST",
    url: "http://localhost:3000/api/session",
    host: "localhost:3000",
    path: "/api/session",
    requestHeaders: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Radar-Trace": "screenshot"
    },
    requestBody: "{\"email\":\"operator@example.test\",\"remember\":false}",
    status: 200,
    statusText: "OK",
    mimeType: "application/json",
    type: "Fetch",
    responseHeaders: {
      "content-type": "application/json",
      "cache-control": "no-store"
    },
    responseBody: "{\"ok\":true,\"role\":\"analyst\"}",
    durationMs: 86,
    encodedDataLength: 64,
    allowed: true,
    source: "browser",
    tls: null
  },
  {
    id: "cap-page",
    startedAt: "2026-05-25T00:00:02.000Z",
    method: "GET",
    url: "http://localhost:3000/dashboard",
    host: "localhost:3000",
    path: "/dashboard",
    requestHeaders: { Accept: "text/html" },
    requestBody: "",
    status: 304,
    statusText: "Not Modified",
    mimeType: "text/html",
    type: "Document",
    responseHeaders: { etag: "W/\"radar-dashboard\"" },
    responseBody: "",
    durationMs: 24,
    encodedDataLength: 0,
    allowed: true,
    source: "browser",
    tls: null
  }
];

const sslEvents: SslEvent[] = [
  {
    id: "ssl-local",
    url: "https://localhost:8443",
    error: "local certificate trusted by launch scope",
    trusted: true,
    subjectName: "localhost",
    issuerName: "Radar Local CA",
    createdAt: "2026-05-25T00:00:03.000Z"
  }
];

const browserState: BrowserState = {
  open: true,
  url: "http://localhost:3000/dashboard",
  title: "Local Dashboard",
  loading: false,
  engine: "chrome",
  remoteDebuggingUrl: "http://127.0.0.1:9223",
  profileDir: "/tmp/radar-profile",
  executablePath: "/Applications/Google Chrome.app",
  buildId: "screenshot",
  channel: "Chrome"
};

const proxyState: ProxyState = {
  running: true,
  port: 8088,
  proxyUrl: "http://127.0.0.1:8088",
  caCertPath: "/tmp/radar-ca.pem",
  caKeyPath: "/tmp/radar-ca.key",
  caFingerprint: "sha256/2B:4D:9F:RADAR"
};

const aiSettings: AiSettings = {
  provider: "codex-local",
  model: "auto",
  apiKey: "local",
  baseUrl: "codex://local"
};

let currentCaptures = [...captures];
let targets = ["http://localhost:*", "http://127.0.0.1:*", "http://[::1]:*"];
const agentRuns: AgentRun[] = [];

const radar: RadarApi = {
  getLocalContext: async () => context,
  listLocalProfiles: async () => [context.profile],
  createLocalProfile: async () => context,
  saveLocalProfile: async (payload) => ({ ...context.profile, ...payload }),
  loadLocalProfile: async () => context,
  listLocalSessions: async () => [
    { ...context.session, captureCount: currentCaptures.length, sslEventCount: sslEvents.length }
  ],
  createLocalSession: async () => context,
  saveLocalSession: async (payload) => ({ ...context.session, ...payload }),
  loadLocalSession: async () => context,
  openBrowser: async () => browserState,
  navigateBrowser: async () => browserState,
  browserBack: async () => browserState,
  browserForward: async () => browserState,
  browserReload: async () => browserState,
  getBrowserState: async () => browserState,
  ensureProxyCa: async () => proxyState,
  startProxy: async () => proxyState,
  stopProxy: async () => ({ ...proxyState, running: false }),
  getProxyState: async () => proxyState,
  getCaptures: async () => currentCaptures,
  deleteCapture: async (id) => {
    currentCaptures = currentCaptures.filter((capture) => capture.id !== id);
    return { ok: true };
  },
  clearCaptures: async () => {
    currentCaptures = [];
    return { ok: true };
  },
  getSslEvents: async () => sslEvents,
  getTargets: async () => targets,
  setTargets: async (nextTargets) => {
    targets = nextTargets;
    return targets;
  },
  sendReplay: async () => ({
    ok: true,
    status: 200,
    statusText: "OK",
    durationMs: 92,
    headers: { "content-type": "application/json" },
    body: "{\"ok\":true}",
    bytes: 11
  }),
  runBurst: async () => ({ count: 1, concurrency: 1, averageMs: 92, failures: 0, results: [] }),
  getAiSettings: async () => aiSettings,
  setAiSettings: async (settings) => settings,
  previewAiContext: async () => ({
    captureCount: currentCaptures.length,
    charCount: 420,
    previewText: "RADAR AI CONTEXT",
    redacted: true
  }),
  runAiTask: async () => ({ ok: false, auditId: "ai-screenshot", error: "Screenshot fixture" }),
  getAiAudit: async () => [],
  getAiSkills: async () => [],
  saveAiSkill: async (skill) => [skill],
  deleteAiSkill: async () => [],
  connectAi: async () => ({
    settings: aiSettings,
    meta: { presetId: "codex", label: "Codex", apiKeySource: "local" },
    probe: { ok: true, message: "Connected" }
  }),
  probeAiConnection: async () => ({ ok: true, message: "Connected" }),
  loginCursor: async () => ({ ok: true, message: "Linked" }),
  getAiModels: async () => [{ id: "auto", label: "auto" }],
  refreshAiModels: async () => [{ id: "auto", label: "auto" }],
  startAgentRun: async (payload) => {
    const run: AgentRun = {
      id: "agent-screenshot",
      sessionId: context.session.id,
      createdAt: "2026-05-25T00:00:00.000Z",
      updatedAt: "2026-05-25T00:00:00.000Z",
      goal: payload.goal,
      status: "queued",
      policy: {
        maxRuntimeMs: 120000,
        maxSteps: 8,
        maxReplay: 1,
        maxCaptureSample: 20,
        allowRawContext: false
      },
      timeline: [{ id: "step-screenshot", createdAt: "2026-05-25T00:00:00.000Z", note: "Run queued." }],
      findings: []
    };
    agentRuns.unshift(run);
    return run;
  },
  stopAgentRun: async (id) => {
    const run = agentRuns.find((item) => item.id === id);
    if (!run) return null;
    run.status = "stopped";
    run.updatedAt = "2026-05-25T00:01:00.000Z";
    return run;
  },
  getAgentRun: async (id) => agentRuns.find((run) => run.id === id) || null,
  listAgentRuns: async () => agentRuns
};

contextBridge.exposeInMainWorld("radar", radar);
