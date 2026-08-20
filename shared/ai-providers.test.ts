import { describe, expect, it } from "vitest";
import {
  AI_PROVIDER_IDS,
  AI_PROVIDER_PROFILES,
  isAiProviderId,
  providerBaseUrl
} from "./ai-providers.js";

describe("ai-providers", () => {
  it("exposes first-class cloud and local providers", () => {
    expect(AI_PROVIDER_IDS).toEqual(
      expect.arrayContaining(["openai", "anthropic", "xai", "openrouter", "codex-local"])
    );
    expect(AI_PROVIDER_PROFILES.xai.baseUrl).toBe("https://api.x.ai/v1");
    expect(AI_PROVIDER_PROFILES.openrouter.baseUrl).toBe("https://openrouter.ai/api/v1");
  });

  it("recognizes only configured provider ids", () => {
    expect(isAiProviderId("openrouter")).toBe(true);
    expect(isAiProviderId("xai")).toBe(true);
    expect(isAiProviderId("azure")).toBe(false);
  });

  it("keeps custom endpoints but pins first-party providers", () => {
    expect(providerBaseUrl({ provider: "xai", baseUrl: "https://attacker.test/v1" })).toBe(
      "https://api.x.ai/v1"
    );
    expect(providerBaseUrl({ provider: "openai-compatible", baseUrl: "http://127.0.0.1:8080/v1" })).toBe(
      "http://127.0.0.1:8080/v1"
    );
  });
});
