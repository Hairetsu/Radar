import { contextBridge } from "electron";
import type { AgentRun, AgentRunMemoryEntry } from "../shared/agent-types.js";
import type { AiSettings } from "../shared/ai-types.js";
import type { RadarApi } from "../shared/radar-api.js";
import type {
  AutomatePayloadSet,
  AutomateSession,
  BrowserState,
  CapturedRequest,
  Finding,
  InstalledPlugin,
  InterceptState,
  LocalContext,
  PluginInstallPreview,
  ProjectNote,
  ProxyProfile,
  ProxyState,
  SavedView,
  SslEvent,
  WebSocketEvent,
  WorkflowDefinition,
  WorkflowRun
} from "../shared/domain.js";
import { defaultProxyProfiles } from "../shared/proxyProfiles.js";
import { defaultReplayTabState } from "../shared/replayTabs.js";
import { BUILT_IN_WORKFLOWS } from "../shared/workflows.js";

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

const automatePayloadSets: AutomatePayloadSet[] = [
  {
    id: "payload-screenshot",
    name: "Auth probes",
    source: "inline",
    payloads: ["admin", "true", "../etc/passwd"],
    createdAt: "2026-05-25T00:00:00.000Z",
    updatedAt: "2026-05-25T00:00:00.000Z"
  }
];

const automateSessions: AutomateSession[] = [
  {
    id: "automate-screenshot",
    name: "Auth probe run",
    createdAt: "2026-05-25T00:00:00.000Z",
    updatedAt: "2026-05-25T00:02:00.000Z",
    status: "completed",
    draft: { method: "GET", url: "https://hairetsu.test/api/users?role={{payload:probe}}", headers: {}, body: "" },
    environmentId: "",
    payloadSetId: "payload-screenshot",
    payloads: ["admin", "true", "../etc/passwd"],
    positions: [
      {
        id: "url:probe:1",
        name: "probe",
        location: "url",
        occurrence: 1,
        marker: "{{payload:probe}}",
        preview: "role={{payload:probe}}"
      }
    ],
    limits: { count: 3, concurrency: 1, delayMs: 100, timeoutMs: 10000 },
    rules: [
      {
        id: "rule-500",
        name: "Server errors",
        enabled: true,
        kind: "match",
        target: "status",
        status: 500,
        createdAt: "2026-05-25T00:00:00.000Z",
        updatedAt: "2026-05-25T00:00:00.000Z"
      }
    ],
    results: [
      {
        id: "automate-result-1",
        index: 1,
        createdAt: "2026-05-25T00:01:00.000Z",
        payload: "admin",
        request: { method: "GET", url: "https://hairetsu.test/api/users?role=admin", headers: {}, body: "" },
        ok: true,
        status: 200,
        statusText: "OK",
        length: 612,
        latencyMs: 92,
        wordCount: 18,
        headers: { "content-type": "application/json" },
        bodyPreview: "{\"role\":\"admin\",\"allowed\":false}",
        matchedRules: [],
        extracts: [],
        clusterId: "cluster-1"
      },
      {
        id: "automate-result-2",
        index: 2,
        createdAt: "2026-05-25T00:01:06.000Z",
        payload: "true",
        request: { method: "GET", url: "https://hairetsu.test/api/users?role=true", headers: {}, body: "" },
        ok: false,
        status: 500,
        statusText: "Server Error",
        length: 144,
        latencyMs: 117,
        wordCount: 9,
        headers: { "content-type": "text/plain" },
        bodyPreview: "Unhandled role parser branch",
        matchedRules: [{ ruleId: "rule-500", name: "Server errors", kind: "match" }],
        extracts: [],
        clusterId: "cluster-2"
      }
    ],
    clusters: [
      {
        id: "cluster-1",
        fingerprint: "2xx:small:headers:body",
        statusFamily: "2xx",
        count: 1,
        representativeResultId: "automate-result-1",
        averageLength: 612,
        averageLatencyMs: 92,
        labels: []
      },
      {
        id: "cluster-2",
        fingerprint: "5xx:tiny:headers:body",
        statusFamily: "5xx",
        count: 1,
        representativeResultId: "automate-result-2",
        averageLength: 144,
        averageLatencyMs: 117,
        labels: ["Server errors"]
      }
    ]
  }
];

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
    id: "cap-graphql",
    startedAt: "2026-05-25T00:00:06.000Z",
    method: "POST",
    url: "http://localhost:3000/graphql",
    host: "localhost:3000",
    path: "/graphql",
    requestHeaders: {
      Authorization: "Bearer screenshot-token",
      "Content-Type": "application/json",
      Origin: "http://localhost:3000",
      "X-Forwarded-Host": "audit.local"
    },
    requestBody: "{\"operationName\":\"ListUsers\",\"query\":\"query ListUsers($role: String) { users(role: $role) { id email } }\",\"variables\":{\"role\":\"admin\"}}",
    status: 200,
    statusText: "OK",
    mimeType: "application/json",
    type: "Fetch",
    responseHeaders: {
      "content-type": "application/json",
      "cache-control": "public, max-age=3600",
      "access-control-allow-origin": "http://localhost:3000"
    },
    responseBody: "{\"data\":{\"users\":[]},\"debugToken\":\"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJzY3JlZW5zaG90In0.Signature123\"}",
    durationMs: 104,
    encodedDataLength: 128,
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

const webSocketEvents: WebSocketEvent[] = [
  {
    id: "ws-ready",
    requestId: "ws-local",
    createdAt: "2026-05-25T00:00:05.000Z",
    url: "ws://localhost:3000/socket",
    host: "localhost:3000",
    direction: "received",
    opcode: 1,
    payloadData: "{\"type\":\"ready\",\"channel\":\"audit\"}",
    size: 34,
    requestHeaders: { Upgrade: "websocket" },
    responseHeaders: { Connection: "Upgrade" },
    initiator: "script",
    allowed: true
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
let projectNotes: ProjectNote[] = [];
let savedViews: SavedView[] = [];
let proxyProfiles: ProxyProfile[] = defaultProxyProfiles().map((profile) =>
  profile.id === "cli"
    ? {
        ...profile,
        notes: "HTTPS_PROXY=http://127.0.0.1:8088\nNODE_EXTRA_CA_CERTS=/tmp/radar-ca.pem",
        updatedAt: "2026-05-25T00:00:00.000Z"
      }
    : profile
);
let interceptState: InterceptState = {
  config: { requestEnabled: false, responseEnabled: false },
  queue: []
};
const agentRuns: AgentRun[] = [];
const findings: Finding[] = [
  {
    id: "finding-screenshot",
    title: "Missing security headers on API response",
    templateId: "headers",
    severity: "low",
    confidence: "high",
    status: "reviewed",
    affectedAssets: ["https://hairetsu.test/api/users"],
    evidence: [
      {
        id: "capture-api-users",
        kind: "capture",
        label: "GET https://hairetsu.test/api/users",
        createdAt: "2026-05-25T00:00:20.000Z",
        metadata: { status: "200", host: "hairetsu.test" }
      }
    ],
    reproductionSteps: "Request the API users endpoint and review the response headers.",
    impact: "Browser hardening is reduced for authenticated API responses.",
    remediation: "Add HSTS, X-Content-Type-Options, and frame protections where appropriate.",
    notes: "Seeded screenshot finding.",
    owner: "platform",
    retestResult: "",
    source: "manual",
    createdAt: "2026-05-25T00:04:00.000Z",
    updatedAt: "2026-05-25T00:04:00.000Z",
    reviewedAt: "2026-05-25T00:04:00.000Z"
  }
];
const workflows: WorkflowDefinition[] = [...BUILT_IN_WORKFLOWS];
const agentRunMemory: AgentRunMemoryEntry[] = [];
const workflowRuns: WorkflowRun[] = [
  {
    id: "workflow-run-screenshot",
    workflowId: "builtin-security-headers",
    workflowName: "Security Headers",
    sessionId: context.session.id,
    source: "manual",
    mode: "passive",
    status: "completed",
    inputs: {},
    startedAt: "2026-05-25T00:06:00.000Z",
    completedAt: "2026-05-25T00:06:01.000Z",
    stepCount: 1,
    actionCount: 0,
    results: [
      {
        id: "workflow-result-screenshot",
        stepId: "headers",
        stepTitle: "Security header coverage",
        level: "warn",
        title: "Missing security headers",
        message: "https://hairetsu.test/api/users is missing strict-transport-security and x-content-type-options.",
        evidence: [
          {
            id: "capture-api-users",
            kind: "capture",
            label: "GET https://hairetsu.test/api/users",
            createdAt: "2026-05-25T00:00:20.000Z",
            metadata: { status: "200", host: "hairetsu.test" }
          }
        ],
        details: { missing: "strict-transport-security, x-content-type-options" },
        createdAt: "2026-05-25T00:06:00.000Z"
      }
    ]
  }
];

const plugins: InstalledPlugin[] = [];

function pluginPreview(sourcePath: string): PluginInstallPreview {
  return {
    sourcePath: String(sourcePath || "screenshot-plugin"),
    manifestPath: `${String(sourcePath || "screenshot-plugin")}/plugin.json`,
    manifest: {
      schemaVersion: 1,
      id: "screenshot-plugin",
      name: "Screenshot Plugin",
      version: "1.0.0",
      description: "Fixture plugin for screenshot rendering.",
      author: "Radar",
      sdkVersion: "0.1",
      minRadarVersion: "",
      entry: "dist/index.js",
      permissions: ["captures:read", "ui:panel"],
      panels: [{ id: "screenshot-panel", title: "Screenshot Panel", entry: "panel.html" }]
    },
    requestedPermissions: ["captures:read", "ui:panel"],
    permissionSummary: ["Read in-scope HTTP/S captures", "Render plugin panels inside the Radar console"],
    warnings: []
  };
}

function pluginFromPreview(preview: PluginInstallPreview): InstalledPlugin {
  return {
    id: preview.manifest.id,
    manifest: preview.manifest,
    sourcePath: preview.sourcePath,
    grantedPermissions: [],
    status: "pending",
    warnings: preview.warnings,
    installedAt: "2026-05-25T00:07:00.000Z",
    updatedAt: "2026-05-25T00:07:00.000Z"
  };
}

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
  seedDemoProject: async () => context,
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
  getProxyProfiles: async () => proxyProfiles,
  saveProxyProfile: async (payload) => {
    proxyProfiles = proxyProfiles.map((profile) =>
      profile.id === payload.id ? { ...profile, notes: payload.notes, updatedAt: "2026-05-25T00:02:00.000Z" } : profile
    );
    return proxyProfiles;
  },
  searchGlobal: async (request) => ({
    ok: true,
    query: request.query,
    results: [],
    total: 0,
    limit: request.limit || 40,
    offset: request.offset || 0
  }),
  getCaptures: async () => currentCaptures,
  queryCaptures: async () => ({ ok: true, captures: currentCaptures }),
  getSessionCaptures: async () => currentCaptures,
  deleteCapture: async (id) => {
    currentCaptures = currentCaptures.filter((capture) => capture.id !== id);
    return { ok: true };
  },
  clearCaptures: async () => {
    currentCaptures = [];
    return { ok: true };
  },
  getInterceptState: async () => interceptState,
  setInterceptConfig: async (config) => {
    interceptState = {
      ...interceptState,
      config: {
        requestEnabled:
          typeof config.requestEnabled === "boolean" ? config.requestEnabled : interceptState.config.requestEnabled,
        responseEnabled:
          typeof config.responseEnabled === "boolean" ? config.responseEnabled : interceptState.config.responseEnabled
      }
    };
    return interceptState;
  },
  forwardIntercept: async (payload) => {
    interceptState = {
      ...interceptState,
      queue: interceptState.queue.filter((item) => item.id !== payload.id)
    };
    return interceptState;
  },
  dropIntercept: async (id) => {
    interceptState = {
      ...interceptState,
      queue: interceptState.queue.filter((item) => item.id !== id)
    };
    return interceptState;
  },
  resumeAllIntercepts: async () => {
    interceptState = {
      ...interceptState,
      queue: []
    };
    return interceptState;
  },
  getInterceptRules: async () => [],
  setInterceptRules: async (rules) => rules,
  getMatchReplaceRules: async () => [],
  setMatchReplaceRules: async (rules) => rules,
  getSslEvents: async () => sslEvents,
  getWebSocketEvents: async () => webSocketEvents,
  clearWebSocketEvents: async () => {
    webSocketEvents.splice(0, webSocketEvents.length);
    return { ok: true };
  },
  queryWebSocketEvents: async () => ({ ok: true, events: webSocketEvents }),
  getSavedFilters: async () => [],
  setSavedFilters: async (filters) => filters,
  getProjectNotes: async () => projectNotes,
  saveProjectNote: async (note) => {
    projectNotes = [note, ...projectNotes.filter((item) => item.id !== note.id)];
    return note;
  },
  deleteProjectNote: async (id) => {
    projectNotes = projectNotes.filter((item) => item.id !== id);
    return { ok: true, notes: projectNotes };
  },
  getSavedViews: async () => savedViews,
  saveSavedView: async (view) => {
    savedViews = [view, ...savedViews.filter((item) => item.id !== view.id)];
    return view;
  },
  deleteSavedView: async (id) => {
    savedViews = savedViews.filter((item) => item.id !== id);
    return { ok: true, views: savedViews };
  },
  previewProjectBundleExport: async (options) => ({
    ok: true,
    bundle: null,
    stats: {
      sessions: 1,
      captures: currentCaptures.length,
      webSocketEvents: webSocketEvents.length,
      findings: findings.length,
      workflows: workflows.length,
      projectNotes: projectNotes.length,
      savedViews: savedViews.length,
      replayCollections: 0,
      plugins: 0,
      proposedTargets: targets.length
    },
    warnings: options.redaction === "raw-evidence" ? ["Raw evidence export includes sensitive values."] : []
  }),
  writeProjectBundle: async (options) => ({
    ok: true,
    path: "/tmp/radar-project.radar-bundle.json",
    preview: await radar.previewProjectBundleExport(options)
  }),
  previewProjectBundleImport: async () => ({
    ok: true,
    bundle: null,
    stats: {
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
    },
    warnings: [],
    conflicts: [],
    proposedTargets: [],
    inactiveTargets: []
  }),
  applyProjectBundleImport: async () => ({
    ok: true,
    imported: {
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
    },
    skipped: {
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
    },
    proposedTargets: [],
    message: "Bundle import applied."
  }),
  previewHandoffPackage: async () => ({
    ok: true,
    package: null,
    stats: {
      findings: findings.length,
      captures: currentCaptures.length,
      webSocketEvents: webSocketEvents.length,
      workflows: workflows.length,
      replayCollections: 0,
      projectNotes: projectNotes.length,
      targets: targets.length
    },
    warnings: []
  }),
  writeHandoffPackage: async () => ({
    ok: true,
    path: "/tmp/radar-handoff.json",
    preview: await radar.previewHandoffPackage({ redaction: "redacted-evidence" })
  }),
  getReplayTabState: async () => defaultReplayTabState(),
  setReplayTabState: async (state) => state,
  getReplayEnvironments: async () => [],
  setReplayEnvironments: async (items) => items,
  getReplayCollections: async () => [],
  setReplayCollections: async (items) => items,
  getAutomatePayloadSets: async () => automatePayloadSets,
  setAutomatePayloadSets: async (items) => {
    automatePayloadSets.splice(0, automatePayloadSets.length, ...items);
    return automatePayloadSets;
  },
  listAutomateSessions: async () => automateSessions,
  getAutomateSession: async (id) => automateSessions.find((session) => session.id === id) || null,
  startAutomateSession: async (payload) => {
    const session: AutomateSession = {
      id: "automate-started",
      name: payload.name || "Payload run",
      createdAt: "2026-05-25T00:00:00.000Z",
      updatedAt: "2026-05-25T00:00:00.000Z",
      status: "running",
      draft: payload.draft || { method: "GET", url: "https://hairetsu.test", headers: {}, body: "" },
      environmentId: payload.environmentId || "",
      payloadSetId: payload.payloadSetId,
      payloads: payload.payloads || [],
      positions: payload.positions || [],
      limits: payload.limits || { count: 1, concurrency: 1, delayMs: 0, timeoutMs: 10000 },
      rules: payload.rules || [],
      results: [],
      clusters: []
    };
    automateSessions.unshift(session);
    return session;
  },
  pauseAutomateSession: async () => null,
  resumeAutomateSession: async () => null,
  stopAutomateSession: async () => null,
  retryAutomateSession: async () => null,
  promoteAutomateResultToRepeater: async () => defaultReplayTabState(),
  getEvidenceAnnotations: async () => [],
  saveEvidenceAnnotation: async (annotation) => annotation,
  saveEvidenceAnnotations: async (annotations) => annotations,
  getFindings: async () => findings,
  saveFinding: async (finding) => {
    findings.splice(0, findings.length, finding, ...findings.filter((item) => item.id !== finding.id));
    return finding;
  },
  deleteFinding: async (id) => {
    const index = findings.findIndex((finding) => finding.id === id);
    if (index >= 0) {
      findings.splice(index, 1);
    }
    return { ok: true };
  },
  buildFindingReport: async (options) => ({
    format: options.format || "markdown",
    title: "Screenshot Workspace Findings",
    generatedAt: "2026-05-25T00:05:00.000Z",
    findingCount: findings.length,
    body: findings.map((finding) => `## ${finding.title}`).join("\n\n")
  }),
  promoteAutomateResultToFinding: async () => findings[0],
  getWorkflows: async () => workflows,
  saveWorkflow: async (workflow) => {
    workflows.splice(0, workflows.length, workflow, ...workflows.filter((item) => item.id !== workflow.id));
    return workflow;
  },
  deleteWorkflow: async (id) => {
    const next = workflows.filter((workflow) => workflow.id !== id || workflow.builtIn);
    workflows.splice(0, workflows.length, ...next);
    return { ok: true, workflows };
  },
  getWorkflowRuns: async () => workflowRuns,
  runWorkflow: async () => {
    workflowRuns.splice(0, workflowRuns.length, workflowRuns[0]);
    return workflowRuns[0];
  },
  promoteWorkflowResultToFinding: async () => findings[0],
  getPlugins: async () => plugins,
  previewPluginInstall: async (sourcePath) => pluginPreview(sourcePath),
  installPlugin: async (sourcePath) => {
    const preview = pluginPreview(sourcePath);
    const plugin: InstalledPlugin = {
      id: preview.manifest.id,
      manifest: preview.manifest,
      sourcePath: preview.sourcePath,
      grantedPermissions: [],
      status: "pending",
      warnings: preview.warnings,
      installedAt: "2026-05-25T00:07:00.000Z",
      updatedAt: "2026-05-25T00:07:00.000Z"
    };
    plugins.splice(0, plugins.length, plugin, ...plugins.filter((item) => item.id !== plugin.id));
    return plugin;
  },
  approvePlugin: async (payload) => {
    const plugin = plugins.find((item) => item.id === payload.id) || pluginFromPreview(pluginPreview("screenshot-plugin"));
    const approved: InstalledPlugin = {
      ...plugin,
      status: "approved",
      grantedPermissions: payload.permissions.filter((permission) => plugin.manifest.permissions.includes(permission)),
      updatedAt: "2026-05-25T00:07:01.000Z"
    };
    plugins.splice(0, plugins.length, approved, ...plugins.filter((item) => item.id !== approved.id));
    return approved;
  },
  setPluginStatus: async (payload) => {
    const plugin = plugins.find((item) => item.id === payload.id) || pluginFromPreview(pluginPreview("screenshot-plugin"));
    const updated = { ...plugin, status: payload.status, updatedAt: "2026-05-25T00:07:02.000Z" };
    plugins.splice(0, plugins.length, updated, ...plugins.filter((item) => item.id !== updated.id));
    return updated;
  },
  removePlugin: async (id) => {
    plugins.splice(0, plugins.length, ...plugins.filter((plugin) => plugin.id !== id));
    return { ok: true, plugins };
  },
  runPluginApiAction: async (request) => ({ ok: true, action: request.action, data: [] }),
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
  sendWebSocketReplay: async () => ({ ok: true, durationMs: 12, responsePayload: "{\"pong\":true}" }),
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
      profileId: payload.profileId || "passive-map",
      status: "queued",
      policy: {
        maxRuntimeMs: 120000,
        maxSteps: 8,
        maxReplay: 1,
        maxWorkflowRequests: 1,
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
  listAgentRuns: async () => agentRuns,
  getAgentRunMemory: async () => agentRunMemory,
  saveAgentRunMemory: async (entry) => {
    const saved = { ...entry, status: entry.status === "proposed" ? "confirmed" : entry.status };
    agentRunMemory.unshift(saved);
    return saved;
  },
  deleteAgentRunMemory: async (id) => {
    const index = agentRunMemory.findIndex((entry) => entry.id === id);
    if (index >= 0) {
      agentRunMemory.splice(index, 1);
    }
    return { ok: true, memory: agentRunMemory };
  }
};

contextBridge.exposeInMainWorld("radar", radar);
