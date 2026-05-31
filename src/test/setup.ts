import { vi } from "vitest";
import "@testing-library/jest-dom/vitest";

const radarApi = {
  getLocalContext: vi.fn(async () => ({
    profile: {
      id: "profile-test",
      name: "Local Operator",
      createdAt: "2026-05-25T00:00:00.000Z",
      updatedAt: "2026-05-25T00:00:00.000Z"
    },
    workspace: {
      id: "workspace-test",
      profileId: "profile-test",
      name: "Default Workspace",
      createdAt: "2026-05-25T00:00:00.000Z",
      updatedAt: "2026-05-25T00:00:00.000Z"
    },
    session: {
      id: "session-test",
      workspaceId: "workspace-test",
      name: "Session 2026-05-25 00:00",
      startedAt: "2026-05-25T00:00:00.000Z",
      updatedAt: "2026-05-25T00:00:00.000Z"
    }
  })),
  listLocalProfiles: vi.fn(async () => [
    {
      id: "profile-test",
      name: "Local Operator",
      createdAt: "2026-05-25T00:00:00.000Z",
      updatedAt: "2026-05-25T00:00:00.000Z"
    }
  ]),
  createLocalProfile: vi.fn(async () => ({
    profile: {
      id: "profile-next",
      name: "New Operator",
      createdAt: "2026-05-25T00:02:00.000Z",
      updatedAt: "2026-05-25T00:02:00.000Z"
    },
    workspace: {
      id: "workspace-next",
      profileId: "profile-next",
      name: "Default Workspace",
      createdAt: "2026-05-25T00:02:00.000Z",
      updatedAt: "2026-05-25T00:02:00.000Z"
    },
    session: {
      id: "session-profile-next",
      workspaceId: "workspace-next",
      name: "Session 2026-05-25 00:02",
      startedAt: "2026-05-25T00:02:00.000Z",
      updatedAt: "2026-05-25T00:02:00.000Z"
    }
  })),
  saveLocalProfile: vi.fn(async (payload) => ({
    id: payload.id,
    name: payload.name,
    createdAt: "2026-05-25T00:00:00.000Z",
    updatedAt: "2026-05-25T00:03:00.000Z"
  })),
  loadLocalProfile: vi.fn(async () => ({
    profile: {
      id: "profile-test",
      name: "Local Operator",
      createdAt: "2026-05-25T00:00:00.000Z",
      updatedAt: "2026-05-25T00:00:00.000Z"
    },
    workspace: {
      id: "workspace-test",
      profileId: "profile-test",
      name: "Default Workspace",
      createdAt: "2026-05-25T00:00:00.000Z",
      updatedAt: "2026-05-25T00:00:00.000Z"
    },
    session: {
      id: "session-test",
      workspaceId: "workspace-test",
      name: "Session 2026-05-25 00:00",
      startedAt: "2026-05-25T00:00:00.000Z",
      updatedAt: "2026-05-25T00:00:00.000Z"
    }
  })),
  listLocalSessions: vi.fn(async () => [
    {
      id: "session-test",
      workspaceId: "workspace-test",
      name: "Session 2026-05-25 00:00",
      startedAt: "2026-05-25T00:00:00.000Z",
      updatedAt: "2026-05-25T00:00:00.000Z",
      captureCount: 0,
      sslEventCount: 0
    }
  ]),
  createLocalSession: vi.fn(async () => ({
    profile: {
      id: "profile-test",
      name: "Local Operator",
      createdAt: "2026-05-25T00:00:00.000Z",
      updatedAt: "2026-05-25T00:00:00.000Z"
    },
    workspace: {
      id: "workspace-test",
      profileId: "profile-test",
      name: "Default Workspace",
      createdAt: "2026-05-25T00:00:00.000Z",
      updatedAt: "2026-05-25T00:00:00.000Z"
    },
    session: {
      id: "session-next",
      workspaceId: "workspace-test",
      name: "Session 2026-05-25 00:01",
      startedAt: "2026-05-25T00:01:00.000Z",
      updatedAt: "2026-05-25T00:01:00.000Z"
    }
  })),
  saveLocalSession: vi.fn(async (payload) => ({
    id: payload.id,
    workspaceId: "workspace-test",
    name: payload.name,
    startedAt: "2026-05-25T00:00:00.000Z",
    updatedAt: "2026-05-25T00:03:00.000Z"
  })),
  loadLocalSession: vi.fn(async () => ({
    profile: {
      id: "profile-test",
      name: "Local Operator",
      createdAt: "2026-05-25T00:00:00.000Z",
      updatedAt: "2026-05-25T00:00:00.000Z"
    },
    workspace: {
      id: "workspace-test",
      profileId: "profile-test",
      name: "Default Workspace",
      createdAt: "2026-05-25T00:00:00.000Z",
      updatedAt: "2026-05-25T00:00:00.000Z"
    },
    session: {
      id: "session-test",
      workspaceId: "workspace-test",
      name: "Session 2026-05-25 00:00",
      startedAt: "2026-05-25T00:00:00.000Z",
      updatedAt: "2026-05-25T00:00:00.000Z"
    }
  })),
  getBrowserState: vi.fn(async () => ({ open: false, url: "", title: "", loading: false, engine: "none" })),
  getProxyState: vi.fn(async () => ({
    running: false,
    port: 8088,
    proxyUrl: "http://127.0.0.1:8088",
    caCertPath: "",
    caKeyPath: "",
    caFingerprint: ""
  })),
  getCaptures: vi.fn(async () => []),
  getProxyProfiles: vi.fn(async () => []),
  saveProxyProfile: vi.fn(async () => []),
  deleteCapture: vi.fn(async () => ({ ok: true })),
  getInterceptState: vi.fn(async () => ({
    config: { requestEnabled: false, responseEnabled: false },
    queue: []
  })),
  setInterceptConfig: vi.fn(async (config) => ({
    config: {
      requestEnabled: typeof config.requestEnabled === "boolean" ? config.requestEnabled : false,
      responseEnabled: typeof config.responseEnabled === "boolean" ? config.responseEnabled : false
    },
    queue: []
  })),
  forwardIntercept: vi.fn(async () => ({
    config: { requestEnabled: true, responseEnabled: false },
    queue: []
  })),
  dropIntercept: vi.fn(async () => ({
    config: { requestEnabled: true, responseEnabled: false },
    queue: []
  })),
  resumeAllIntercepts: vi.fn(async () => ({
    config: { requestEnabled: true, responseEnabled: false },
    queue: []
  })),
  getInterceptRules: vi.fn(async () => []),
  setInterceptRules: vi.fn(async (rules) => rules),
  getMatchReplaceRules: vi.fn(async () => []),
  setMatchReplaceRules: vi.fn(async (rules) => rules),
  getSslEvents: vi.fn(async () => []),
  getWebSocketEvents: vi.fn(async () => []),
  clearWebSocketEvents: vi.fn(async () => ({ ok: true })),
  getTargets: vi.fn(async () => []),
  onCapture: vi.fn(() => () => undefined),
  onSslEvent: vi.fn(() => () => undefined),
  onBrowserState: vi.fn(() => () => undefined),
  navigateBrowser: vi.fn(async () => undefined),
  openBrowser: vi.fn(async () => undefined),
  closeBrowser: vi.fn(async () => undefined),
  startProxy: vi.fn(async () => undefined),
  stopProxy: vi.fn(async () => undefined),
  setTargets: vi.fn(async () => undefined),
  sendReplay: vi.fn(async () => ({ ok: true, status: 200, statusText: "OK", headers: {}, body: "", durationMs: 10 })),
  runBurst: vi.fn(async () => ({ count: 1, concurrency: 1, averageMs: 10, results: [], failures: 0 })),
  getAiSettings: vi.fn(async () => ({
    provider: "openai",
    model: "gpt-4o-mini",
    apiKey: "",
    baseUrl: "http://127.0.0.1:11434/v1"
  })),
  setAiSettings: vi.fn(async () => undefined),
  previewAiContext: vi.fn(async () => ({
    captureCount: 1,
    webSocketEventCount: 0,
    charCount: 120,
    previewText: "RADAR AI CONTEXT",
    redacted: true
  })),
  runAiTask: vi.fn(async () => ({ ok: false, auditId: "ai-1", error: "mock" })),
  getAiAudit: vi.fn(async () => []),
  getAiSkills: vi.fn(async () => []),
  saveAiSkill: vi.fn(async (skill) => [skill]),
  deleteAiSkill: vi.fn(async () => []),
  probeAiConnection: vi.fn(async () => ({ ok: false, message: "Add an API key or connect a preset" })),
  connectAi: vi.fn(async () => ({
    settings: { provider: "codex-local", model: "auto", apiKey: "local", baseUrl: "codex://local" },
    meta: { presetId: "codex", label: "Codex", apiKeySource: "local" },
    probe: { ok: true, message: "mock" }
  })),
  loginCursor: vi.fn(async () => ({ ok: true, message: "Linked as test@example.com" })),
  getAiModels: vi.fn(async () => [{ id: "auto", label: "auto" }]),
  refreshAiModels: vi.fn(async () => [{ id: "auto", label: "auto" }]),
  startAgentRun: vi.fn(async (payload) => ({
    id: "agent-test",
    sessionId: "session-test",
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
    timeline: [
      {
        id: "step-test",
        createdAt: "2026-05-25T00:00:00.000Z",
        note: "Run queued from AI-First goal prompt."
      }
    ],
    findings: []
  })),
  stopAgentRun: vi.fn(async () => ({
    id: "agent-test",
    sessionId: "session-test",
    createdAt: "2026-05-25T00:00:00.000Z",
    updatedAt: "2026-05-25T00:01:00.000Z",
    goal: "Inspect target",
    status: "stopped",
    policy: {
      maxRuntimeMs: 120000,
      maxSteps: 8,
      maxReplay: 1,
      maxCaptureSample: 20,
      allowRawContext: false
    },
    timeline: [],
    findings: []
  })),
  getAgentRun: vi.fn(async () => null),
  listAgentRuns: vi.fn(async () => [])
};

if (typeof window !== "undefined") {
  Object.defineProperty(window, "radar", {
    value: radarApi,
    writable: true
  });
}
