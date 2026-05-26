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
  getSslEvents: vi.fn(async () => []),
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
  refreshAiModels: vi.fn(async () => [{ id: "auto", label: "auto" }])
};

if (typeof window !== "undefined") {
  Object.defineProperty(window, "radar", {
    value: radarApi,
    writable: true
  });
}
