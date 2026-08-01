import { describe, expect, it } from "vitest";
import type { Browser, BrowserContext, Page } from "playwright-core";
import {
  automationSelectorForRef,
  createPlaywrightBrowserController,
  isAutomationRequestAllowed,
  normalizeAutomationSelector
} from "./playwrightBrowser.js";

function connectedBrowserFixture() {
  let currentUrl = "https://allowed.test/start";
  const frame = {};
  const browserEvents = new Map<string, (...args: unknown[]) => void>();
  const pageEvents = new Map<string, (...args: unknown[]) => void>();
  const page = {
    isClosed: () => false,
    url: () => currentUrl,
    title: async () => "Allowed target",
    mainFrame: () => frame,
    setDefaultTimeout: () => undefined,
    setDefaultNavigationTimeout: () => undefined,
    on: (event: string, listener: (...args: unknown[]) => void) => {
      pageEvents.set(event, listener);
      return page;
    },
    bringToFront: async () => undefined,
    goto: async (url: string) => {
      currentUrl = url;
      return null;
    },
    goBack: async () => null,
    goForward: async () => null,
    reload: async () => null,
    waitForLoadState: async () => undefined,
    waitForTimeout: async () => undefined
  } as unknown as Page;
  const context = {
    pages: () => [page],
    newPage: async () => page,
    on: () => context
  } as unknown as BrowserContext;
  const browser = {
    isConnected: () => true,
    contexts: () => [context],
    on: (event: string, listener: (...args: unknown[]) => void) => {
      browserEvents.set(event, listener);
      return browser;
    }
  } as unknown as Browser;
  return { browser, browserEvents, pageEvents };
}

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

  it("owns connection, navigation, disconnect, and reset lifecycle state", async () => {
    const fixture = connectedBrowserFixture();
    const controller = createPlaywrightBrowserController({
      allowlist: () => ["https://allowed.test"],
      connectOverCdp: async () => fixture.browser
    });

    await expect(controller.connect("http://127.0.0.1:9223/")).resolves.toMatchObject({
      status: "ready",
      pageCount: 1,
      url: "https://allowed.test/start"
    });
    await expect(controller.navigate("https://allowed.test/next")).resolves.toMatchObject({
      status: "ready",
      url: "https://allowed.test/next",
      loading: false
    });
    await expect(controller.back()).resolves.toMatchObject({ status: "ready", loading: false });
    await expect(controller.forward()).resolves.toMatchObject({ status: "ready", loading: false });
    await expect(controller.reload()).resolves.toMatchObject({ status: "ready", loading: false });
    await expect(controller.waitForNetworkIdle({ idleMs: 500 })).resolves.toMatchObject({ idle: true });

    fixture.pageEvents.get("framenavigated")?.({});
    fixture.pageEvents.get("domcontentloaded")?.();
    fixture.pageEvents.get("close")?.();

    fixture.browserEvents.get("disconnected")?.();
    expect(controller.state()).toMatchObject({ status: "disconnected", pageCount: 0, loading: false });
    controller.reset();
    expect(controller.state()).toEqual({
      status: "disconnected",
      pageCount: 0,
      url: "",
      title: "",
      loading: false,
      error: undefined
    });
  });

  it("fails closed when the debugging endpoint or persistent context is unavailable", async () => {
    const controller = createPlaywrightBrowserController({
      allowlist: () => ["https://allowed.test"],
      connectOverCdp: async () => ({ contexts: () => [] }) as unknown as Browser
    });

    await expect(controller.connect("")).rejects.toThrow("endpoint is required");
    await expect(controller.connect("http://127.0.0.1:9223")).rejects.toThrow("persistent browser context");
    expect(controller.state()).toMatchObject({ status: "error", error: expect.stringContaining("persistent browser context") });
  });
});
