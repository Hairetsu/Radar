import { describe, expect, it } from "vitest";
import { aiProviderFromValue, isAiProviderId } from "./aiProvider";

describe("aiProvider", () => {
  it("accepts known provider ids", () => {
    expect(isAiProviderId("openai")).toBe(true);
    expect(isAiProviderId("anthropic")).toBe(true);
    expect(isAiProviderId("xai")).toBe(true);
    expect(isAiProviderId("openrouter")).toBe(true);
    expect(isAiProviderId("openai-compatible")).toBe(true);
    expect(isAiProviderId("codex-local")).toBe(true);
    expect(isAiProviderId("cursor-local")).toBe(true);
  });

  it("rejects unknown provider ids", () => {
    expect(isAiProviderId("azure")).toBe(false);
    expect(aiProviderFromValue("azure")).toBeNull();
  });

  it("returns provider ids unchanged", () => {
    expect(aiProviderFromValue("anthropic")).toBe("anthropic");
  });
});
