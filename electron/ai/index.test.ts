import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { CapturedRequest, WebSocketEvent } from "../../shared/domain.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { clearAudit } from "./audit.js";
import * as cursorCli from "./cursorCli.js";
import * as grokCli from "./grokCli.js";
import { previewContext, runAiTask, connectPreset } from "./index.js";
import { saveSettings } from "./settings.js";
import { upsertSkill } from "./skills.js";

const sampleCapture: CapturedRequest = {
  id: "cap-1",
  startedAt: new Date().toISOString(),
  method: "GET",
  url: "http://localhost:3000",
  host: "localhost:3000",
  path: "/",
  requestHeaders: {},
  requestBody: "",
  status: 200,
  statusText: "OK",
  mimeType: "",
  type: "Document",
  responseHeaders: {},
  responseBody: "",
  durationMs: 10,
  allowed: true,
  source: "browser",
  tls: null
};

const sampleWebSocketEvent: WebSocketEvent = {
  id: "ws-1",
  requestId: "stream-1",
  createdAt: new Date().toISOString(),
  url: "wss://localhost:3000/socket",
  host: "localhost:3000",
  direction: "received",
  opcode: 1,
  payloadData: '{"event":"ready","token":"secret-token"}',
  size: 40,
  status: 101,
  statusText: "Switching Protocols",
  requestHeaders: { Authorization: "Bearer secret-token" },
  responseHeaders: {},
  allowed: true
};

describe("ai index", () => {
  let tmpDir = "";

  afterEach(() => {
    clearAudit();
    vi.unstubAllGlobals();
    if (tmpDir) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = "";
    }
  });

  it("blocks preview without captures", () => {
    const preview = previewContext({
      capturedMap: new Map(),
      allowlist: ["http://localhost:*"],
      browserUrl: "",
      request: { view: "traffic", captureIds: [], includeRaw: false }
    });

    expect(preview.blockedReason).toContain("Select at least one HTTP capture or WebSocket frame");
    expect(preview.captureCount).toBe(0);
  });

  it("previews scope targets without captures", () => {
    const preview = previewContext({
      capturedMap: new Map(),
      allowlist: ["http://localhost:*"],
      browserUrl: "",
      request: {
        view: "scope",
        task: "scope_checklist",
        captureIds: [],
        includeRaw: false,
        viewContext: { view: "scope", targets: ["http://localhost:*"] }
      }
    });

    expect(preview.blockedReason).toBeUndefined();
    expect(preview.previewText).toContain("SCOPE TARGETS");
  });

  it("previews ssl events without captures", () => {
    const preview = previewContext({
      capturedMap: new Map(),
      allowlist: ["http://localhost:*"],
      browserUrl: "",
      request: {
        view: "ssl",
        task: "tls_review",
        captureIds: [],
        includeRaw: false,
        viewContext: {
          view: "ssl",
          sslEvents: [
            {
              id: "ssl-1",
              url: "https://localhost",
              error: "bad cert",
              trusted: false,
              createdAt: "2026-05-25T00:00:00.000Z"
            }
          ],
          proxyRunning: false,
          proxyUrl: "http://127.0.0.1:8088"
        }
      }
    });

    expect(preview.blockedReason).toBeUndefined();
    expect(preview.previewText).toContain("SSL EVENTS");
  });

  it("previews selected captures", () => {
    const preview = previewContext({
      capturedMap: new Map([["cap-1", sampleCapture]]),
      allowlist: ["http://localhost:*"],
      browserUrl: "http://localhost:3000",
      request: { view: "traffic", captureIds: ["cap-1"], includeRaw: false }
    });

    expect(preview.captureCount).toBe(1);
    expect(preview.previewText).toContain("RADAR AI CONTEXT");
    expect(preview.redacted).toBe(true);
  });

  it("previews selected websocket frames without http captures", () => {
    const preview = previewContext({
      capturedMap: new Map(),
      webSocketEventMap: new Map([["ws-1", sampleWebSocketEvent]]),
      allowlist: ["http://localhost:*"],
      browserUrl: "http://localhost:3000",
      request: { view: "websocket", captureIds: [], webSocketEventIds: ["ws-1"], includeRaw: false }
    });

    expect(preview.blockedReason).toBeUndefined();
    expect(preview.captureCount).toBe(0);
    expect(preview.webSocketEventCount).toBe(1);
    expect(preview.previewText).toContain("websocket:ws-1");
    expect(preview.previewText).toContain("[REDACTED]");
  });

  it("runs ai task with mocked provider", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "radar-ai-"));
    saveSettings(tmpDir, {
      provider: "openai-compatible",
      model: "local",
      apiKey: "test-key",
      baseUrl: "http://127.0.0.1:11434/v1"
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: '{"summary":"done","observations":[],"uncertainties":[]}' } }]
        })
      }))
    );

    const result = await runAiTask({
      capturedMap: new Map([["cap-1", sampleCapture]]),
      allowlist: ["http://localhost:*"],
      browserUrl: "",
      userDataPath: tmpDir,
      request: { view: "traffic", task: "capture_summary", captureIds: ["cap-1"], includeRaw: false }
    });

    expect(result.ok).toBe(true);
    expect(result.output?.task).toBe("capture_summary");
  });

  it("returns error result when provider fails", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "radar-ai-"));
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, text: async () => "bad request" })));

    const result = await runAiTask({
      capturedMap: new Map([["cap-1", sampleCapture]]),
      allowlist: [],
      browserUrl: "",
      userDataPath: tmpDir,
      request: { view: "traffic", task: "capture_summary", captureIds: ["cap-1"], includeRaw: false, userPrompt: "note" }
    });

    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it("connects preset and saves settings", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "radar-ai-"));
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true })));
    vi.spyOn(cursorCli, "probeCursorCli").mockResolvedValue({ ok: true, message: "Cursor ready" });

    const result = await connectPreset({ userDataPath: tmpDir, presetId: "cursor_cli" });
    expect(result.meta.presetId).toBe("cursor_cli");
    expect(result.settings.provider).toBe("cursor-local");
  });

  it("connects grok cli preset and saves settings", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "radar-ai-"));
    vi.spyOn(grokCli, "probeGrokCli").mockResolvedValue({ ok: true, message: "Grok ready" });

    const result = await connectPreset({ userDataPath: tmpDir, presetId: "grok_cli" });
    expect(result.meta.presetId).toBe("grok_cli");
    expect(result.settings.provider).toBe("grok-local");
    expect(result.settings.baseUrl).toBe("grok://local");
  });

  it("quick connects with the key saved for the preset provider", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "radar-ai-"));
    const originalOpenAiKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true })));
    saveSettings(tmpDir, { provider: "openai", apiKey: "openai-secret" });
    saveSettings(tmpDir, { provider: "anthropic", apiKey: "anthropic-secret" });

    try {
      const result = await connectPreset({ userDataPath: tmpDir, presetId: "openai" });
      expect(result.settings.apiKey).toBe("openai-secret");
      expect(result.meta.apiKeySource).toBe("saved");
    } finally {
      if (originalOpenAiKey === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = originalOpenAiKey;
    }
  });

  it("requires capture ids for runAiTask", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "radar-ai-"));
    await expect(
      runAiTask({
        capturedMap: new Map(),
        allowlist: [],
        browserUrl: "",
        userDataPath: tmpDir,
        request: { view: "traffic", task: "capture_summary", captureIds: [], includeRaw: false }
      })
    ).rejects.toThrow("Select at least one HTTP capture or WebSocket frame");
  });

  it("runs custom skill with mocked provider", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "radar-ai-"));
    upsertSkill(tmpDir, {
      id: "skill-1",
      label: "Header diff",
      hint: "Compare headers",
      instructions: "Compare auth headers.",
      views: ["scope"],
      createdAt: new Date().toISOString()
    });
    saveSettings(tmpDir, {
      provider: "openai-compatible",
      model: "local",
      apiKey: "test-key",
      baseUrl: "http://127.0.0.1:11434/v1"
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: '{"text":"compared"}' } }]
        })
      }))
    );

    const result = await runAiTask({
      capturedMap: new Map(),
      allowlist: ["http://localhost:*"],
      browserUrl: "",
      userDataPath: tmpDir,
      request: {
        view: "scope",
        task: "custom",
        skillId: "skill-1",
        captureIds: [],
        includeRaw: false,
        viewContext: { view: "scope", targets: ["http://localhost:*"] }
      }
    });

    expect(result.ok).toBe(true);
    expect(result.output?.task).toBe("custom");
  });

  it("requires custom skill id", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "radar-ai-"));
    await expect(
      runAiTask({
        capturedMap: new Map(),
        allowlist: ["http://localhost:*"],
        browserUrl: "",
        userDataPath: tmpDir,
        request: {
          view: "scope",
          task: "custom",
          captureIds: [],
          includeRaw: false,
          viewContext: { view: "scope", targets: ["http://localhost:*"] }
        }
      })
    ).rejects.toThrow("Custom skill id is required.");
  });

  it("requires existing custom skill", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "radar-ai-"));
    await expect(
      runAiTask({
        capturedMap: new Map(),
        allowlist: ["http://localhost:*"],
        browserUrl: "",
        userDataPath: tmpDir,
        request: {
          view: "scope",
          task: "custom",
          skillId: "missing",
          captureIds: [],
          includeRaw: false,
          viewContext: { view: "scope", targets: ["http://localhost:*"] }
        }
      })
    ).rejects.toThrow("Custom skill not found.");
  });

  it("requires ai task", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "radar-ai-"));
    await expect(
      runAiTask({
        capturedMap: new Map([["cap-1", sampleCapture]]),
        allowlist: [],
        browserUrl: "",
        userDataPath: tmpDir,
        request: { view: "traffic", captureIds: ["cap-1"], includeRaw: false }
      })
    ).rejects.toThrow("AI task is required.");
  });
});
