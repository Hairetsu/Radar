import fs from "node:fs";
import path from "node:path";
import type { AiProviderId, AiSettings } from "../../shared/ai-types.js";
import { sanitizeModelId } from "../../shared/ai-models.js";
import {
  AI_PROVIDER_IDS,
  AI_PROVIDER_PROFILES,
  DEFAULT_AI_SETTINGS,
  isAiProviderId,
  providerBaseUrl
} from "../../shared/ai-providers.js";

export const DEFAULT_SETTINGS: AiSettings = DEFAULT_AI_SETTINGS;

type ProviderSettings = Omit<AiSettings, "provider">;
type ProviderSettingsById = Partial<Record<AiProviderId, ProviderSettings>>;

type StoredSettings = AiSettings & {
  providerSettings: ProviderSettingsById;
};

function settingsPath(userDataPath: string) {
  return path.join(userDataPath, "ai-settings.json");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function defaultSettingsFor(provider: AiProviderId): AiSettings {
  const profile = AI_PROVIDER_PROFILES[provider];
  return {
    provider,
    model: profile.defaultModel,
    apiKey: profile.auth === "local" ? "local" : "",
    baseUrl: profile.baseUrl
  };
}

function normalizeProviderSettings(provider: AiProviderId, value: unknown): AiSettings {
  const defaults = defaultSettingsFor(provider);
  const candidate = isRecord(value) ? value : {};
  const model = sanitizeModelId(String(candidate.model || defaults.model)) || defaults.model;
  const apiKey = typeof candidate.apiKey === "string" ? candidate.apiKey : defaults.apiKey;
  const baseUrl = providerBaseUrl({
    provider,
    baseUrl: typeof candidate.baseUrl === "string" ? candidate.baseUrl : defaults.baseUrl
  });
  return { provider, model, apiKey, baseUrl };
}

function readStoredSettings(userDataPath: string): StoredSettings | null {
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(settingsPath(userDataPath), "utf8"));
    if (!isRecord(parsed) || !isAiProviderId(parsed.provider)) {
      return null;
    }

    const providerSettings: ProviderSettingsById = {};
    if (isRecord(parsed.providerSettings)) {
      for (const provider of AI_PROVIDER_IDS) {
        if (isRecord(parsed.providerSettings[provider])) {
          const normalized = normalizeProviderSettings(provider, parsed.providerSettings[provider]);
          providerSettings[provider] = {
            model: normalized.model,
            apiKey: normalized.apiKey,
            baseUrl: normalized.baseUrl
          };
        }
      }
    }

    const active = normalizeProviderSettings(parsed.provider, parsed);
    providerSettings[active.provider] = {
      model: active.model,
      apiKey: active.apiKey,
      baseUrl: active.baseUrl
    };
    return { ...active, providerSettings };
  } catch {
    return null;
  }
}

export function loadSettings(userDataPath: string, requestedProvider?: AiProviderId): AiSettings {
  if (requestedProvider !== undefined && !isAiProviderId(requestedProvider)) {
    throw new Error("Unknown AI provider.");
  }

  const stored = readStoredSettings(userDataPath);
  const provider = requestedProvider || stored?.provider || DEFAULT_SETTINGS.provider;
  return normalizeProviderSettings(provider, stored?.providerSettings[provider]);
}

export function saveSettings(userDataPath: string, settings: Partial<AiSettings>): AiSettings {
  const file = settingsPath(userDataPath);
  if (settings.provider !== undefined && !isAiProviderId(settings.provider)) {
    throw new Error("Unknown AI provider.");
  }

  const stored = readStoredSettings(userDataPath);
  const provider = isAiProviderId(settings.provider)
    ? settings.provider
    : stored?.provider || DEFAULT_SETTINGS.provider;
  const current = normalizeProviderSettings(provider, stored?.providerSettings[provider]);
  const next: AiSettings = {
    provider,
    model: settings.model === undefined
      ? current.model
      : sanitizeModelId(String(settings.model)) || AI_PROVIDER_PROFILES[provider].defaultModel,
    apiKey: settings.apiKey === undefined ? current.apiKey : String(settings.apiKey),
    baseUrl: settings.baseUrl === undefined
      ? current.baseUrl
      : providerBaseUrl({ provider, baseUrl: String(settings.baseUrl) })
  };
  const providerSettings: ProviderSettingsById = {
    ...stored?.providerSettings,
    [provider]: {
      model: next.model,
      apiKey: next.apiKey,
      baseUrl: next.baseUrl
    }
  };
  const persisted: StoredSettings = { ...next, providerSettings };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(persisted, null, 2), { encoding: "utf8", mode: 0o600 });
  try {
    fs.chmodSync(file, 0o600);
  } catch {
    // Windows and some managed filesystems do not expose POSIX permission bits.
  }
  return next;
}
