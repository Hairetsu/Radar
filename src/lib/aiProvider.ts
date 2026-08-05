import { isAiProviderId } from "../../shared/ai-providers";
import type { AiProviderId } from "../ai/types";

export { isAiProviderId };

export function aiProviderFromValue(value: string): AiProviderId | null {
  return isAiProviderId(value) ? value : null;
}
