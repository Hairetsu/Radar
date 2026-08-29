import type { AiProviderId, AiSettings } from "./ai-types.js";

export type AiProviderProfile = {
  label: string;
  shortLabel: string;
  baseUrl: string;
  defaultModel: string;
  apiKeyPlaceholder: string;
  environmentKey?: string;
  auth: "anthropic" | "bearer" | "local" | "optional-bearer";
};

export const AI_PROVIDER_PROFILES: Record<AiProviderId, AiProviderProfile> = {
  openai: {
    label: "OpenAI API",
    shortLabel: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-5.6-terra",
    apiKeyPlaceholder: "sk-…",
    environmentKey: "OPENAI_API_KEY",
    auth: "bearer"
  },
  anthropic: {
    label: "Anthropic API",
    shortLabel: "Anthropic",
    baseUrl: "https://api.anthropic.com/v1",
    defaultModel: "claude-sonnet-5",
    apiKeyPlaceholder: "sk-ant-…",
    environmentKey: "ANTHROPIC_API_KEY",
    auth: "anthropic"
  },
  xai: {
    label: "xAI API",
    shortLabel: "xAI / Grok",
    baseUrl: "https://api.x.ai/v1",
    defaultModel: "grok-4.5",
    apiKeyPlaceholder: "xai-…",
    environmentKey: "XAI_API_KEY",
    auth: "bearer"
  },
  openrouter: {
    label: "OpenRouter API",
    shortLabel: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    defaultModel: "openrouter/free",
    apiKeyPlaceholder: "sk-or-v1-…",
    environmentKey: "OPENROUTER_API_KEY",
    auth: "bearer"
  },
  "openai-compatible": {
    label: "Custom OpenAI-compatible API",
    shortLabel: "Custom endpoint",
    baseUrl: "http://127.0.0.1:11434/v1",
    defaultModel: "auto",
    apiKeyPlaceholder: "Optional API key",
    auth: "optional-bearer"
  },
  "codex-local": {
    label: "Codex app",
    shortLabel: "Codex",
    baseUrl: "codex://local",
    defaultModel: "auto",
    apiKeyPlaceholder: "",
    auth: "local"
  },
  "cursor-local": {
    label: "Cursor agent",
    shortLabel: "Cursor CLI",
    baseUrl: "cursor://local",
    defaultModel: "auto",
    apiKeyPlaceholder: "Optional API key",
    environmentKey: "CURSOR_API_KEY",
    auth: "local"
  },
  "grok-local": {
    label: "Grok Build CLI",
    shortLabel: "Grok CLI",
    baseUrl: "grok://local",
    defaultModel: "auto",
    apiKeyPlaceholder: "Optional API key",
    environmentKey: "XAI_API_KEY",
    auth: "local"
  }
};

export const AI_PROVIDER_IDS = Object.freeze(Object.keys(AI_PROVIDER_PROFILES) as AiProviderId[]);

export const DEFAULT_AI_SETTINGS: AiSettings = {
  provider: "openai",
  model: AI_PROVIDER_PROFILES.openai.defaultModel,
  apiKey: "",
  baseUrl: AI_PROVIDER_PROFILES.openai.baseUrl
};

export function isAiProviderId(value: unknown): value is AiProviderId {
  return typeof value === "string" && Object.hasOwn(AI_PROVIDER_PROFILES, value);
}

export function isLocalAiProvider(provider: AiProviderId) {
  return AI_PROVIDER_PROFILES[provider].auth === "local";
}

export function providerBaseUrl(settings: Pick<AiSettings, "provider" | "baseUrl">) {
  if (settings.provider === "openai-compatible") {
    return settings.baseUrl.trim() || AI_PROVIDER_PROFILES[settings.provider].baseUrl;
  }
  return AI_PROVIDER_PROFILES[settings.provider].baseUrl;
}
