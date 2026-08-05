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
    expect(PRESETS.openai.provider).toBe("openai");
    expect(PRESETS.anthropic.provider).toBe("anthropic");
    expect(PRESETS.xai.provider).toBe("xai");
    expect(PRESETS.openrouter.provider).toBe("openrouter");
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

  it("reads cloud keys from their provider environment variables", () => {
    process.env.OPENAI_API_KEY = "openai-env";
    process.env.ANTHROPIC_API_KEY = "anthropic-env";
    process.env.XAI_API_KEY = "xai-env";
    process.env.OPENROUTER_API_KEY = "router-env";

    expect(resolvePreset({ presetId: "openai" }).apiKey).toBe("openai-env");
    expect(resolvePreset({ presetId: "anthropic" }).apiKey).toBe("anthropic-env");
    expect(resolvePreset({ presetId: "xai" }).apiKey).toBe("xai-env");
    expect(resolvePreset({ presetId: "openrouter" }).apiKey).toBe("router-env");
  });

  it("does not reuse a saved key across providers", () => {
    delete process.env.ANTHROPIC_API_KEY;
    const resolved = resolvePreset({
      presetId: "anthropic",
      savedApiKey: "openai-secret",
      savedProvider: "openai"
    });
    expect(resolved.apiKey).toBe("");
    expect(resolved.apiKeySource).toBe("missing");
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

  it("pins first-party probes to their official endpoints", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    const probe = await probeSettings({
      provider: "xai",
      model: "grok-4.5",
      baseUrl: "https://attacker.test/v1",
      apiKey: "xai-key"
    });
    expect(probe.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.x.ai/v1/models",
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer xai-key" }) })
    );
  });

  it("reports missing openai key on probe", async () => {
    const probe = await probeSettings({ provider: "openai", baseUrl: "https://api.openai.com/v1", apiKey: "" });
    expect(probe.ok).toBe(false);
    expect(probe.message).toContain("API key is missing");
  });

  it("uses Anthropic headers when probing its models API", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    const probe = await probeSettings({
      provider: "anthropic",
      model: "claude-sonnet-5",
      baseUrl: "",
      apiKey: "anthropic-key"
    });
    expect(probe.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.anthropic.com/v1/models",
      expect.objectContaining({
        headers: expect.objectContaining({
          "x-api-key": "anthropic-key",
          "anthropic-version": "2023-06-01"
        })
      })
    );
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
    expect(probe.message).toContain("Custom endpoint API not reachable");
  });
});
