import { afterEach, describe, expect, it, vi } from "vitest";
import type { AiSettings } from "../../shared/ai-types.js";
import { fetchAiModels, getAiModels, reconcileSettingsModel, refreshAiModels } from "./models.js";

vi.mock("./cursorCli.js", () => ({
  listCursorCliModels: vi.fn(async () => [{ id: "cursor-model", label: "cursor-model" }])
}));

vi.mock("./codexCli.js", () => ({
  listCodexCliModels: vi.fn(async () => [{ id: "auto", label: "auto" }])
}));

vi.mock("./grokCli.js", () => ({
  listGrokCliModels: vi.fn(async () => [{ id: "grok-4.6", label: "grok-4.6" }])
}));

describe("models", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reads cached models from the store", () => {
    const store = {
      saveAiModels: vi.fn(),
      listAiModels: vi.fn(() => [{ id: "cached", label: "cached" }])
    };

    expect(getAiModels("openai", store)).toEqual([{ id: "cached", label: "cached" }]);
    expect(getAiModels("openai", null)).toEqual([]);
  });

  it("fetches local provider models", async () => {
    const cursorSettings: AiSettings = {
      provider: "cursor-local",
      model: "auto",
      apiKey: "local",
      baseUrl: "cursor://local"
    };
    await expect(fetchAiModels(cursorSettings)).resolves.toEqual([{ id: "cursor-model", label: "cursor-model" }]);

    const grokSettings: AiSettings = {
      provider: "grok-local",
      model: "auto",
      apiKey: "local",
      baseUrl: "grok://local"
    };
    await expect(fetchAiModels(grokSettings)).resolves.toEqual([{ id: "grok-4.6", label: "grok-4.6" }]);
  });

  it("fetches anthropic models with provider-specific authentication", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ id: "claude-sonnet-5", display_name: "Claude Sonnet 5" }] })
    } as Awaited<ReturnType<typeof fetch>>);

    const anthropicSettings: AiSettings = {
      provider: "anthropic",
      model: "claude-sonnet-5",
      apiKey: "secret",
      baseUrl: ""
    };

    await expect(fetchAiModels(anthropicSettings)).resolves.toEqual(
      [{ id: "claude-sonnet-5", label: "Claude Sonnet 5" }]
    );
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://api.anthropic.com/v1/models",
      expect.objectContaining({
        headers: expect.objectContaining({
          "x-api-key": "secret",
          "anthropic-version": "2023-06-01"
        })
      })
    );
  });

  it("fetches OpenRouter and xAI models from their fixed endpoints", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ id: "model-id", name: "Model name" }] })
    } as Awaited<ReturnType<typeof fetch>>);

    await fetchAiModels({
      provider: "openrouter",
      model: "openrouter/free",
      apiKey: "router-key",
      baseUrl: "https://attacker.test/v1"
    });
    expect(globalThis.fetch).toHaveBeenLastCalledWith(
      "https://openrouter.ai/api/v1/models",
      expect.any(Object)
    );

    await fetchAiModels({
      provider: "xai",
      model: "grok-4.5",
      apiKey: "xai-key",
      baseUrl: "https://attacker.test/v1"
    });
    expect(globalThis.fetch).toHaveBeenLastCalledWith("https://api.x.ai/v1/models", expect.any(Object));
  });

  it("fetches openai-compatible models", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ id: "gpt-4o" }, { id: "gpt-4o-mini" }] })
    } as Awaited<ReturnType<typeof fetch>>);

    await expect(
      fetchAiModels({
        provider: "openai-compatible",
        model: "gpt-4o-mini",
        apiKey: "secret",
        baseUrl: "http://127.0.0.1:11434"
      })
    ).resolves.toEqual([
      { id: "gpt-4o", label: "gpt-4o" },
      { id: "gpt-4o-mini", label: "gpt-4o-mini" }
    ]);

    expect(globalThis.fetch).toHaveBeenCalledWith("http://127.0.0.1:11434/v1/models", expect.any(Object));
  });

  it("fetches openai models from the default endpoint", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ id: "gpt-4o-mini" }] })
    } as Awaited<ReturnType<typeof fetch>>);

    await expect(
      fetchAiModels({
        provider: "openai",
        model: "gpt-4o-mini",
        apiKey: "secret",
        baseUrl: ""
      })
    ).resolves.toEqual([{ id: "gpt-4o-mini", label: "gpt-4o-mini" }]);

    expect(globalThis.fetch).toHaveBeenCalledWith("https://api.openai.com/v1/models", expect.any(Object));
  });

  it("rejects openai model fetch without an api key", async () => {
    await expect(
      fetchAiModels({
        provider: "openai",
        model: "gpt-4o-mini",
        apiKey: "",
        baseUrl: "https://api.openai.com/v1"
      })
    ).rejects.toThrow("OpenAI API key required");
  });

  it("persists refreshed models in sqlite", async () => {
    const store = {
      saveAiModels: vi.fn((_provider, models) => models),
      listAiModels: vi.fn(() => [])
    };
    const settings: AiSettings = {
      provider: "codex-local",
      model: "auto",
      apiKey: "local",
      baseUrl: "codex://local"
    };

    await expect(refreshAiModels({ settings, store })).resolves.toEqual([{ id: "auto", label: "auto" }]);
    expect(store.saveAiModels).toHaveBeenCalledWith("codex-local", [{ id: "auto", label: "auto" }]);
  });

  it("falls back to cached models when refresh fails", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
    const store = {
      saveAiModels: vi.fn(),
      listAiModels: vi.fn(() => [{ id: "cached", label: "cached" }])
    };
    const settings: AiSettings = {
      provider: "openai",
      model: "gpt-4o-mini",
      apiKey: "secret",
      baseUrl: "https://api.openai.com/v1"
    };

    await expect(refreshAiModels({ settings, store })).resolves.toEqual([{ id: "cached", label: "cached" }]);
  });

  it("returns fetched models without sqlite when store is missing", async () => {
    await expect(
      refreshAiModels({
        settings: {
          provider: "codex-local",
          model: "auto",
          apiKey: "local",
          baseUrl: "codex://local"
        },
        store: null
      })
    ).resolves.toEqual([{ id: "auto", label: "auto" }]);
  });

  it("uses cached models when fetch returns no models", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ data: [] })
    } as Awaited<ReturnType<typeof fetch>>);

    const cachedStore = {
      saveAiModels: vi.fn(),
      listAiModels: vi.fn(() => [{ id: "cached", label: "cached" }])
    };
    await expect(
      refreshAiModels({
        settings: {
          provider: "openai",
          model: "gpt-4o-mini",
          apiKey: "secret",
          baseUrl: "https://api.openai.com/v1"
        },
        store: cachedStore
      })
    ).resolves.toEqual([{ id: "cached", label: "cached" }]);
  });

  it("rejects failed openai model responses", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 401
    } as Awaited<ReturnType<typeof fetch>>);

    await expect(
      fetchAiModels({
        provider: "openai",
        model: "gpt-4o-mini",
        apiKey: "secret",
        baseUrl: "https://api.openai.com/v1"
      })
    ).rejects.toThrow("Models request failed (401).");
  });

  it("keeps valid saved models unchanged", () => {
    const settings = {
      provider: "cursor-local" as const,
      model: "auto",
      apiKey: "local",
      baseUrl: "cursor://local"
    };
    expect(reconcileSettingsModel(settings, [{ id: "auto", label: "auto" }])).toEqual(settings);
  });

  it("reconciles invalid saved models to auto", () => {
    expect(
      reconcileSettingsModel(
        {
          provider: "cursor-local",
          model: "gpt-5.5-extra-high",
          apiKey: "local",
          baseUrl: "cursor://local"
        },
        [
          { id: "auto", label: "auto" },
          { id: "gpt-5.3-codex", label: "gpt-5.3-codex" }
        ]
      ).model
    ).toBe("auto");
  });

  it("throws when refresh fails without cache", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
    const store = {
      saveAiModels: vi.fn(),
      listAiModels: vi.fn(() => [])
    };

    await expect(
      refreshAiModels({
        settings: {
          provider: "openai",
          model: "gpt-4o-mini",
          apiKey: "secret",
          baseUrl: "https://api.openai.com/v1"
        },
        store
      })
    ).rejects.toThrow("Could not refresh models.");
  });

  it("falls back to auto when fetch succeeds with no models", async () => {
    const { listCodexCliModels } = await import("./codexCli.js");
    vi.mocked(listCodexCliModels).mockResolvedValueOnce([]);
    const store = {
      saveAiModels: vi.fn(),
      listAiModels: vi.fn(() => [])
    };

    await expect(
      refreshAiModels({
        settings: {
          provider: "codex-local",
          model: "custom-model",
          apiKey: "local",
          baseUrl: "codex://local"
        },
        store
      })
    ).resolves.toEqual([{ id: "auto", label: "auto" }]);
  });
});
