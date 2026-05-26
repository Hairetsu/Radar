import type { AiConnectPresetId } from "../../shared/ai-types.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as codexCli from "./codexCli.js";
import * as cursorCli from "./cursorCli.js";
import { PRESETS, resolvePreset, applyConnectPreset, probeSettings } from "./connect.js";

describe("connect", () => {
  const env = { ...process.env };

  beforeEach(() => {
    process.env = { ...env };
  });

  afterEach(() => {
    process.env = env;
    vi.unstubAllGlobals();
  });

  it("exposes known presets", () => {
    expect(PRESETS.codex.label).toBe("Codex");
    expect(PRESETS.codex.provider).toBe("codex-local");
    expect(PRESETS.cursor_cli.provider).toBe("cursor-local");
  });

  it("resolves codex preset to local CLI auth", () => {
    const resolved = resolvePreset({ presetId: "codex" });
    expect(resolved.provider).toBe("codex-local");
    expect(resolved.apiKey).toBe("local");
    expect(resolved.apiKeySource).toBe("local");
  });

  it("resolves cursor preset to local agent auth", () => {
    const resolved = resolvePreset({ presetId: "cursor_cli" });
    expect(resolved.provider).toBe("cursor-local");
    expect(resolved.baseUrl).toBe("cursor://local");
    expect(resolved.apiKey).toBe("local");
    expect(resolved.apiKeySource).toBe("local");
  });

  it("reads cursor api key from env", () => {
    process.env.CURSOR_API_KEY = "env-key";
    const resolved = resolvePreset({ presetId: "cursor_cli", savedApiKey: "" });
    expect(resolved.apiKey).toBe("env-key");
    expect(resolved.apiKeySource).toBe("CURSOR_API_KEY");
  });

  it("reads cursor auth token from env", () => {
    delete process.env.CURSOR_API_KEY;
    process.env.CURSOR_AUTH_TOKEN = "token-key";
    const resolved = resolvePreset({ presetId: "cursor_cli", savedApiKey: "" });
    expect(resolved.apiKey).toBe("token-key");
    expect(resolved.apiKeySource).toBe("CURSOR_AUTH_TOKEN");
  });

  it("throws for unknown preset", () => {
    expect(() => resolvePreset({ presetId: "nope" as AiConnectPresetId })).toThrow("Unknown connect preset");
  });

  it("applies connect preset settings", () => {
    const applied = applyConnectPreset({ presetId: "cursor_cli", savedApiKey: "" });
    expect(applied.settings.provider).toBe("cursor-local");
    expect(applied.meta.presetId).toBe("cursor_cli");
  });

  it("probes health endpoint", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true })));

    const probe = await probeSettings({
      provider: "openai-compatible",
      baseUrl: "http://127.0.0.1:8765/v1",
      apiKey: "unused"
    });

    expect(probe.ok).toBe(true);
  });

  it("reports missing base url", async () => {
    const probe = await probeSettings({ provider: "openai", baseUrl: "", apiKey: "k" });
    expect(probe.ok).toBe(false);
    expect(probe.message).toContain("Base URL");
  });

  it("reports missing openai key on probe", async () => {
    const probe = await probeSettings({ provider: "openai", baseUrl: "https://api.openai.com/v1", apiKey: "" });
    expect(probe.ok).toBe(false);
    expect(probe.message).toContain("API key is missing");
  });

  it("probes codex local provider", async () => {
    vi.spyOn(codexCli, "probeCodexCli").mockResolvedValue({ ok: true, message: "Codex ready" });
    const probe = await probeSettings({ provider: "codex-local", baseUrl: "codex://local", apiKey: "local" });
    expect(probe.ok).toBe(true);
  });

  it("probes cursor local provider", async () => {
    vi.spyOn(cursorCli, "probeCursorCli").mockResolvedValue({ ok: true, message: "Cursor ready" });
    const probe = await probeSettings({ provider: "cursor-local", baseUrl: "cursor://local", apiKey: "local" });
    expect(probe.ok).toBe(true);
  });

  it("reports unreachable openai-compatible endpoint", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false })));
    const probe = await probeSettings({
      provider: "openai-compatible",
      baseUrl: "http://127.0.0.1:8765/v1",
      apiKey: "k"
    });
    expect(probe.ok).toBe(false);
    expect(probe.message).toContain("OpenAI-compatible API not reachable");
  });
});
