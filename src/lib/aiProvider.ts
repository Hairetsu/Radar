import type { AiProviderId } from "../ai/types";

export function isAiProviderId(value: string): value is AiProviderId {
  return value === "openai" || value === "anthropic" || value === "openai-compatible";
}

export function aiProviderFromValue(value: string): AiProviderId | null {
  return isAiProviderId(value) ? value : null;
}
