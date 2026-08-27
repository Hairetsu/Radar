import type { AiConnectPresetId, AiProviderId, ProbeSettingsInput } from "../../shared/ai-types.js";
import {
  AI_PROVIDER_PROFILES,
  isAiProviderId,
  providerBaseUrl
} from "../../shared/ai-providers.js";
import { probeCodexCli } from "./codexCli.js";
import { probeCursorCli } from "./cursorCli.js";
import { probeGrokCli } from "./grokCli.js";

type PresetConfig = {
  label: string;
  provider: AiProviderId;
  baseUrl: string;
  model: string;
  envKeys: string[];
  fallbackApiKey?: string;
};

export const PRESETS: Record<AiConnectPresetId, PresetConfig> = {
  codex: {
    label: "Codex",
    provider: "codex-local",
    baseUrl: "codex://local",
    model: "auto",
    envKeys: [],
    fallbackApiKey: "local"
  },
  cursor_cli: {
    label: "Cursor CLI",
    provider: "cursor-local",
    baseUrl: "cursor://local",
    model: "auto",
    envKeys: ["CURSOR_API_KEY", "CURSOR_AUTH_TOKEN"],
    fallbackApiKey: "local"
  },
  grok_cli: {
    label: "Grok CLI",
    provider: "grok-local",
    baseUrl: "grok://local",
    model: "auto",
    envKeys: ["XAI_API_KEY"],
    fallbackApiKey: "local"
  },
  openai: {
    label: "OpenAI",
    provider: "openai",
    baseUrl: AI_PROVIDER_PROFILES.openai.baseUrl,
    model: AI_PROVIDER_PROFILES.openai.defaultModel,
    envKeys: ["OPENAI_API_KEY"]
  },
  anthropic: {
    label: "Anthropic",
    provider: "anthropic",
    baseUrl: AI_PROVIDER_PROFILES.anthropic.baseUrl,
    model: AI_PROVIDER_PROFILES.anthropic.defaultModel,
    envKeys: ["ANTHROPIC_API_KEY"]
  },
  xai: {
    label: "xAI / Grok",
    provider: "xai",
    baseUrl: AI_PROVIDER_PROFILES.xai.baseUrl,
    model: AI_PROVIDER_PROFILES.xai.defaultModel,
    envKeys: ["XAI_API_KEY"]
  },
  openrouter: {
    label: "OpenRouter",
    provider: "openrouter",
    baseUrl: AI_PROVIDER_PROFILES.openrouter.baseUrl,
    model: AI_PROVIDER_PROFILES.openrouter.defaultModel,
    envKeys: ["OPENROUTER_API_KEY"]
  }
};

function firstEnv(keys: string[]) {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) {
      return { key, value };
    }
  }
  return null;
}

export function resolvePreset({
  presetId,
  savedApiKey = "",
  savedProvider
}: {
  presetId: AiConnectPresetId;
  savedApiKey?: string;
  savedProvider?: AiProviderId;
}) {
  const preset = PRESETS[presetId];
  if (!preset) {
    throw new Error(`Unknown connect preset: ${presetId}`);
  }

  const fromEnv = firstEnv(preset.envKeys);
  const savedPresetKey = savedProvider === preset.provider ? savedApiKey.trim() : "";
  const apiKey = fromEnv?.value || savedPresetKey || preset.fallbackApiKey || "";
  const baseUrl = preset.baseUrl;

  return {
    presetId,
    label: preset.label,
    provider: preset.provider,
    model: preset.model,
    apiKey,
    baseUrl,
    apiKeySource: fromEnv ? fromEnv.key : savedPresetKey ? "saved" : preset.fallbackApiKey ? "local" : "missing"
  };
}

export async function probeSettings(settings: ProbeSettingsInput) {
  if (!isAiProviderId(settings.provider)) {
    return { ok: false, message: "Unknown AI provider." };
  }

  if (settings.provider === "codex-local") {
    return probeCodexCli();
  }

  if (settings.provider === "cursor-local") {
    return probeCursorCli();
  }

  if (settings.provider === "grok-local") {
    return probeGrokCli(settings.apiKey);
  }

  const profile = AI_PROVIDER_PROFILES[settings.provider];
  const root = providerBaseUrl(settings).replace(/\/$/, "");
  if (!root) {
    return { ok: false, message: "Base URL is missing." };
  }

  const apiKey = settings.apiKey?.trim() || "";
  if (!apiKey && profile.auth !== "optional-bearer") {
    const environmentHint = profile.environmentKey ? " Set " + profile.environmentKey + " or save a key." : "";
    return { ok: false, message: profile.shortLabel + " API key is missing." + environmentHint };
  }

  const headers: Record<string, string> = {
    Accept: "application/json"
  };
  if (profile.auth === "anthropic") {
    headers["x-api-key"] = apiKey;
    headers["anthropic-version"] = "2023-06-01";
  } else if (apiKey) {
    headers.Authorization = "Bearer " + apiKey;
  }

  const healthUrl = root.includes("/v1") ? root.replace(/\/v1$/, "") + "/health" : `${root}/health`;
  const modelsUrl = root.endsWith("/v1") ? `${root}/models` : `${root}/v1/models`;
  const probeUrls = settings.provider === "openai-compatible" ? [healthUrl, modelsUrl] : [modelsUrl];

  for (const url of probeUrls) {
    try {
      const response = await fetch(url, {
        method: "GET",
        headers,
        signal: AbortSignal.timeout(4000)
      });
      if (response.ok) {
        return { ok: true, message: `Connected (${url})` };
      }
    } catch {
      // try next endpoint
    }
  }

  return {
    ok: false,
    message:
      profile.shortLabel +
      " API not reachable. Check the API key and network" +
      (settings.provider === "openai-compatible" ? ", plus the base URL" : "") +
      "."
  };
}

export function applyConnectPreset({
  presetId,
  savedApiKey,
  savedProvider
}: {
  presetId: AiConnectPresetId;
  savedApiKey: string;
  savedProvider?: AiProviderId;
}) {
  const resolved = resolvePreset({ presetId, savedApiKey, savedProvider });
  return {
    settings: {
      provider: resolved.provider,
      model: resolved.model,
      apiKey: resolved.apiKey,
      baseUrl: resolved.baseUrl
    },
    meta: {
      presetId: resolved.presetId,
      label: resolved.label,
      apiKeySource: resolved.apiKeySource
    }
  };
}
