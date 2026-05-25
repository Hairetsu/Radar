import { vi } from "vitest";
import "@testing-library/jest-dom/vitest";

const radarApi = {
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
  sendBurst: vi.fn(async () => ({ ok: true, results: [], failures: 0 })),
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
  connectAi: vi.fn(async () => ({
    settings: { provider: "openai", model: "gpt-4o-mini", apiKey: "", baseUrl: "https://api.openai.com/v1" },
    meta: { presetId: "codex", label: "Codex", apiKeySource: "missing" },
    probe: { ok: false, message: "mock" }
  }))
};

if (typeof window !== "undefined") {
  Object.defineProperty(window, "radar", {
    value: radarApi,
    writable: true
  });
}
