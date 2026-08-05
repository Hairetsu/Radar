import fs from "node:fs";
import path from "node:path";
import type { AiSettings } from "../../shared/ai-types.js";
import { sanitizeModelId } from "../../shared/ai-models.js";
import {
  AI_PROVIDER_PROFILES,
  DEFAULT_AI_SETTINGS,
  isAiProviderId,
  providerBaseUrl
} from "../../shared/ai-providers.js";

export const DEFAULT_SETTINGS: AiSettings = DEFAULT_AI_SETTINGS;

function settingsPath(userDataPath: string) {
  return path.join(userDataPath, "ai-settings.json");
}

export function loadSettings(userDataPath: string): AiSettings {
  const file = settingsPath(userDataPath);
  try {
    const raw = fs.readFileSync(file, "utf8");
    const parsed = JSON.parse(raw) as Partial<AiSettings>;
    if (!isAiProviderId(parsed.provider)) {
      return { ...DEFAULT_SETTINGS };
    }
    const provider = parsed.provider;
    const profile = AI_PROVIDER_PROFILES[provider];
    const model = sanitizeModelId(String(parsed.model || profile.defaultModel)) || profile.defaultModel;
    const baseUrl = providerBaseUrl({ provider, baseUrl: String(parsed.baseUrl || profile.baseUrl) });
    return { provider, model, apiKey: String(parsed.apiKey || ""), baseUrl };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(userDataPath: string, settings: Partial<AiSettings>): AiSettings {
  const file = settingsPath(userDataPath);
  if (settings.provider !== undefined && !isAiProviderId(settings.provider)) {
    throw new Error("Unknown AI provider.");
  }
  const provider = isAiProviderId(settings.provider) ? settings.provider : DEFAULT_SETTINGS.provider;
  const profile = AI_PROVIDER_PROFILES[provider];
  const next: AiSettings = {
    provider,
    model: sanitizeModelId(String(settings.model || profile.defaultModel)) || profile.defaultModel,
    apiKey: String(settings.apiKey || ""),
    baseUrl: providerBaseUrl({ provider, baseUrl: String(settings.baseUrl || profile.baseUrl) })
  };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(next, null, 2), { encoding: "utf8", mode: 0o600 });
  try {
    fs.chmodSync(file, 0o600);
  } catch {
    // Windows and some managed filesystems do not expose POSIX permission bits.
  }
  return next;
}
