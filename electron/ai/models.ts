import type { AiModelOption, AiProviderId, AiSettings } from "../../shared/ai-types.js";
import { pickValidModel } from "../../shared/ai-models.js";
import { listCodexCliModels } from "./codexCli.js";
import { listCursorCliModels } from "./cursorCli.js";

const ANTHROPIC_MODELS: AiModelOption[] = [
  { id: "claude-sonnet-4-20250514", label: "claude-sonnet-4" },
  { id: "claude-3-5-sonnet-20241022", label: "claude-3-5-sonnet" },
  { id: "claude-3-5-haiku-20241022", label: "claude-3-5-haiku" },
  { id: "claude-3-opus-20240229", label: "claude-3-opus" }
];

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

async function fetchOpenAiCompatibleModels(baseUrl: string, apiKey: string): Promise<AiModelOption[]> {
  const key = apiKey.trim();
  if (!key) {
    throw new Error("API key required to list models.");
  }

  const root = (baseUrl.trim() || "https://api.openai.com/v1").replace(/\/$/, "");
  const url = root.endsWith("/v1") ? `${root}/models` : `${root}/v1/models`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${key}` }
  });

  if (!response.ok) {
    throw new Error(`Models request failed (${response.status}).`);
  }

  const payload = (await response.json()) as { data?: Array<{ id?: string }> };
  const models = (payload.data || [])
    .map((entry) => entry.id?.trim())
    .filter((id): id is string => Boolean(id))
    .map((id) => ({ id, label: id }));

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
      return ANTHROPIC_MODELS;
    case "openai":
      return fetchOpenAiCompatibleModels("https://api.openai.com/v1", settings.apiKey);
    case "openai-compatible":
      return fetchOpenAiCompatibleModels(settings.baseUrl, settings.apiKey);
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
