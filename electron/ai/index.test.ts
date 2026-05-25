import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { CapturedRequest } from "../../shared/domain.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { clearAudit } from "./audit.js";
import { previewContext, runAiTask, connectPreset } from "./index.js";
import { saveSettings } from "./settings.js";

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
      captureIds: [],
      includeRaw: false
    });

    expect(preview.blockedReason).toContain("Select at least one capture");
    expect(preview.captureCount).toBe(0);
  });

  it("previews selected captures", () => {
    const preview = previewContext({
      capturedMap: new Map([["cap-1", sampleCapture]]),
      allowlist: ["http://localhost:*"],
      browserUrl: "http://localhost:3000",
      captureIds: ["cap-1"],
      includeRaw: false
    });

    expect(preview.captureCount).toBe(1);
    expect(preview.previewText).toContain("RADAR AI CONTEXT");
    expect(preview.redacted).toBe(true);
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
      request: { task: "capture_summary", captureIds: ["cap-1"], includeRaw: false }
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
      request: { task: "capture_summary", captureIds: ["cap-1"], includeRaw: false, userPrompt: "note" }
    });

    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it("connects preset and saves settings", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "radar-ai-"));
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true })));

    const result = await connectPreset({ userDataPath: tmpDir, presetId: "cursor_cli" });
    expect(result.meta.presetId).toBe("cursor_cli");
    expect(result.settings.provider).toBe("openai-compatible");
  });

  it("requires capture ids for runAiTask", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "radar-ai-"));
    await expect(
      runAiTask({
        capturedMap: new Map(),
        allowlist: [],
        browserUrl: "",
        userDataPath: tmpDir,
        request: { task: "capture_summary", captureIds: [], includeRaw: false }
      })
    ).rejects.toThrow("Select at least one capture");
  });

  it("requires ai task", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "radar-ai-"));
    await expect(
      runAiTask({
        capturedMap: new Map([["cap-1", sampleCapture]]),
        allowlist: [],
        browserUrl: "",
        userDataPath: tmpDir,
        request: { captureIds: ["cap-1"], includeRaw: false }
      })
    ).rejects.toThrow("AI task is required.");
  });
});
