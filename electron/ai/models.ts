import type { AiModelOption, AiProviderId, AiSettings } from "../../shared/ai-types.js";
import { pickValidModel } from "../../shared/ai-models.js";
import { AI_PROVIDER_PROFILES, isAiProviderId, providerBaseUrl } from "../../shared/ai-providers.js";
import { listCodexCliModels } from "./codexCli.js";
import { listCursorCliModels } from "./cursorCli.js";

export type AiModelStore = {
  saveAiModels: (provider: string, models: AiModelOption[]) => AiModelOption[];
  listAiModels: (provider: string) => AiModelOption[];
};

function fallbackModel(): AiModelOption[] {
  return [{ id: "auto", label: "auto" }];
}

export function reconcileSettingsModel(settings: AiSettings, models: AiModelOption[]): AiSettings {
  const model = pickValidModel(settings.model, models);
  return model === settings.model ? settings : { ...settings, model };
}

async function fetchProviderModels(settings: AiSettings): Promise<AiModelOption[]> {
  if (!isAiProviderId(settings.provider)) {
    throw new Error("Unknown AI provider.");
  }

  const profile = AI_PROVIDER_PROFILES[settings.provider];
  const key = settings.apiKey.trim();
  if (!key && profile.auth !== "optional-bearer") {
    throw new Error(profile.shortLabel + " API key required to list models.");
  }

  const root = providerBaseUrl(settings).replace(/\/$/, "");
  const url = root.endsWith("/v1") ? `${root}/models` : `${root}/v1/models`;
  const headers: Record<string, string> = { Accept: "application/json" };
  if (profile.auth === "anthropic") {
    headers["x-api-key"] = key;
    headers["anthropic-version"] = "2023-06-01";
  } else if (key) {
    headers.Authorization = `Bearer ${key}`;
  }
  const response = await fetch(url, {
    headers
  });

  if (!response.ok) {
    throw new Error(`Models request failed (${response.status}).`);
  }

  const payload = (await response.json()) as {
    data?: Array<{ id?: string; name?: string; display_name?: string }>;
  };
  const models = (payload.data || [])
    .map((entry) => ({
      id: entry.id?.trim() || "",
      label: entry.display_name?.trim() || entry.name?.trim() || entry.id?.trim() || ""
    }))
    .filter((entry) => Boolean(entry.id));

  if (models.length === 0) {
    throw new Error("No models returned.");
  }

  return models;
}

export async function fetchAiModels(settings: AiSettings): Promise<AiModelOption[]> {
  switch (settings.provider) {
    case "cursor-local":
      return listCursorCliModels();
    case "codex-local":
      return listCodexCliModels();
    case "anthropic":
    case "xai":
    case "openrouter":
    case "openai":
    case "openai-compatible":
      return fetchProviderModels(settings);
    default:
      return fallbackModel();
  }
}

export function getAiModels(provider: AiProviderId | string, store: AiModelStore | null) {
  if (!store) {
    return [];
  }
  return store.listAiModels(String(provider || ""));
}

export async function refreshAiModels({
  settings,
  store
}: {
  settings: AiSettings;
  store: AiModelStore | null;
}) {
  if (!store) {
    return fetchAiModels(settings);
  }

  try {
    const fetched = await fetchAiModels(settings);
    if (fetched.length > 0) {
      store.saveAiModels(settings.provider, fetched);
      return fetched;
    }
  } catch {
    const cached = store.listAiModels(settings.provider);
    if (cached.length > 0) {
      return cached;
    }
    throw new Error("Could not refresh models.");
  }

  const cached = store.listAiModels(settings.provider);
  return cached.length > 0 ? cached : fallbackModel();
}
