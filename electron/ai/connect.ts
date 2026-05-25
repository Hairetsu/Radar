import type { AiConnectPresetId, AiProviderId, ProbeSettingsInput } from "../../shared/ai-types.js";

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
    provider: "openai",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-5.3-codex",
    envKeys: ["OPENAI_API_KEY", "CODEX_API_KEY"]
  },
  cursor_cli: {
    label: "Cursor CLI",
    provider: "openai-compatible",
    baseUrl: "http://127.0.0.1:8765/v1",
    model: "auto",
    envKeys: ["CURSOR_BRIDGE_API_KEY", "CURSOR_API_KEY"],
    fallbackApiKey: "unused"
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
  const apiKey = fromEnv?.value || savedApiKey || preset.fallbackApiKey || "";
  const baseUrl =
    presetId === "cursor_cli"
      ? (process.env.CURSOR_PROXY_URL || process.env.CURSOR_API_PROXY_URL || preset.baseUrl).replace(/\/$/, "")
      : preset.baseUrl;

  return {
    presetId,
    label: preset.label,
    provider: preset.provider,
    model: preset.model,
    apiKey,
    baseUrl,
    apiKeySource: fromEnv ? fromEnv.key : savedApiKey ? "saved" : preset.fallbackApiKey ? "local" : "missing"
  };
}

export async function probeSettings(settings: ProbeSettingsInput) {
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
      settings.presetId === "cursor_cli"
        ? "Cursor CLI proxy not reachable. Start: npx cursor-api-proxy (or set CURSOR_PROXY_URL)."
        : "Codex/OpenAI API not reachable. Check OPENAI_API_KEY and network."
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
