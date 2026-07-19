import { describe, expect, it } from "vitest";
import {
  automationSelectorForRef,
  isAutomationRequestAllowed,
  normalizeAutomationSelector
} from "./playwrightBrowser.js";

describe("playwright browser helpers", () => {
  it("allows non-network resources and saved-scope network requests", () => {
    const allowlist = ["https://allowed.test", "http://localhost:*"];

    expect(isAutomationRequestAllowed("data:text/plain,radar", allowlist)).toBe(true);
    expect(isAutomationRequestAllowed("https://allowed.test/account", allowlist)).toBe(true);
    expect(isAutomationRequestAllowed("http://localhost:4310/api", allowlist)).toBe(true);
  });

  it("fails closed for an out-of-scope request emitted by a browser action", () => {
    expect(isAutomationRequestAllowed("https://blocked.test/collect", ["https://allowed.test"])).toBe(false);
  });

  it("builds bounded stable element selectors and rejects empty selectors", () => {
    expect(automationSelectorForRef("pw-17<script>")).toBe('[data-radar-agent-ref="pw-17script"]');
    expect(normalizeAutomationSelector("  #sign-in  ")).toBe("#sign-in");
    expect(() => normalizeAutomationSelector("   ")).toThrow("selector is required");
  });
});
