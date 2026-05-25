import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const { PRESETS, resolvePreset, applyConnectPreset, probeSettings } = require("./connect.cjs");

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
    expect(PRESETS.cursor_cli.provider).toBe("openai-compatible");
  });

  it("resolves codex preset from env key", () => {
    process.env.OPENAI_API_KEY = "sk-test";
    const resolved = resolvePreset("codex");
    expect(resolved.apiKey).toBe("sk-test");
    expect(resolved.apiKeySource).toBe("OPENAI_API_KEY");
  });

  it("falls back to saved api key", () => {
    const resolved = resolvePreset("codex", "saved-key");
    expect(resolved.apiKey).toBe("saved-key");
    expect(resolved.apiKeySource).toBe("saved");
  });

  it("uses cursor proxy url override", () => {
    process.env.CURSOR_PROXY_URL = "http://127.0.0.1:9999/v1";
    const resolved = resolvePreset("cursor_cli");
    expect(resolved.baseUrl).toBe("http://127.0.0.1:9999/v1");
  });

  it("throws for unknown preset", () => {
    expect(() => resolvePreset("nope")).toThrow("Unknown connect preset");
  });

  it("applies connect preset settings", () => {
    const applied = applyConnectPreset("cursor_cli", "");
    expect(applied.settings.provider).toBe("openai-compatible");
    expect(applied.meta.presetId).toBe("cursor_cli");
  });

  it("probes health endpoint", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true }))
    );

    const probe = await probeSettings({
      provider: "openai-compatible",
      baseUrl: "http://127.0.0.1:8765/v1",
      apiKey: "unused",
      presetId: "cursor_cli"
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

  it("reports unreachable codex endpoint", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false })));
    const probe = await probeSettings({
      provider: "openai",
      baseUrl: "https://api.openai.com/v1",
      apiKey: "k",
      presetId: "codex"
    });
    expect(probe.ok).toBe(false);
    expect(probe.message).toContain("Codex/OpenAI API not reachable");
  });
});
