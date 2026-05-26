import type { AiConnectPresetId, AiProviderId, ProbeSettingsInput } from "../../shared/ai-types.js";
import { probeCodexCli } from "./codexCli.js";
import { probeCursorCli } from "./cursorCli.js";

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

export function resolvePreset({ presetId, savedApiKey = "" }: { presetId: AiConnectPresetId; savedApiKey?: string }) {
  const preset = PRESETS[presetId];
  if (!preset) {
    throw new Error(`Unknown connect preset: ${presetId}`);
  }

  const fromEnv = firstEnv(preset.envKeys);
  const savedPresetKey = preset.provider === "codex-local" || preset.provider === "cursor-local" ? "" : savedApiKey;
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
  if (settings.provider === "codex-local") {
    return probeCodexCli();
  }

  if (settings.provider === "cursor-local") {
    return probeCursorCli();
  }

  const root = (settings.baseUrl || "").replace(/\/$/, "");
  if (!root) {
    return { ok: false, message: "Base URL is missing." };
  }

  if (!settings.apiKey?.trim() && settings.provider !== "openai-compatible") {
    return { ok: false, message: "API key is missing. Set OPENAI_API_KEY or save a key." };
  }

  const headers: Record<string, string> = {
    Accept: "application/json"
  };
  if (settings.apiKey?.trim()) {
    headers.Authorization = `Bearer ${settings.apiKey}`;
  }

  const healthUrl = root.includes("/v1") ? root.replace(/\/v1$/, "") + "/health" : `${root}/health`;
  const modelsUrl = root.endsWith("/v1") ? `${root}/models` : `${root}/v1/models`;

  for (const url of [healthUrl, modelsUrl]) {
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
      "OpenAI-compatible API not reachable. Check base URL, API key, and network."
  };
}

export function applyConnectPreset({ presetId, savedApiKey }: { presetId: AiConnectPresetId; savedApiKey: string }) {
  const resolved = resolvePreset({ presetId, savedApiKey });
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
