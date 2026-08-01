import { chromium, type Browser, type BrowserContext, type Page } from "playwright-core";
import type {
  AgentClickableElement,
  AgentCookie,
  AgentStorageState
} from "../shared/agent-types.js";
import { createPlaywrightActions } from "./browser/playwrightActions.js";
import {
  inspectPlaywrightClickableElements,
  inspectPlaywrightCookies,
  inspectPlaywrightDom,
  inspectPlaywrightPageText,
  inspectPlaywrightStorage,
  type PlaywrightDomSummary
} from "./browser/playwrightInspection.js";
import {
  AUTOMATION_ACTION_TIMEOUT_MS,
  AUTOMATION_CONNECT_TIMEOUT_MS,
  AUTOMATION_NAVIGATION_TIMEOUT_MS
} from "./browser/playwrightConstants.js";

export {
  automationSelectorForRef,
  isAutomationRequestAllowed,
  normalizeAutomationSelector
} from "./browser/playwrightActions.js";
export type { PlaywrightDomSummary } from "./browser/playwrightInspection.js";

export type PlaywrightAutomationStatus = "disconnected" | "connecting" | "ready" | "error";

export type PlaywrightAutomationState = {
  status: PlaywrightAutomationStatus;
  pageCount: number;
  url: string;
  title: string;
  loading: boolean;
  error?: string;
};

export type PlaywrightBrowserController = {
  connect: (endpoint: string) => Promise<PlaywrightAutomationState>;
  reset: () => void;
  state: () => PlaywrightAutomationState;
  navigate: (url: string) => Promise<PlaywrightAutomationState>;
  back: () => Promise<PlaywrightAutomationState>;
  forward: () => Promise<PlaywrightAutomationState>;
  reload: () => Promise<PlaywrightAutomationState>;
  waitForNetworkIdle: (input: { idleMs?: number; timeoutMs?: number }) => Promise<{ idle: boolean; waitedMs: number }>;
  getPageText: () => Promise<{ url: string; title: string; text: string }>;
  getDomSummary: () => Promise<PlaywrightDomSummary>;
  getClickableElements: () => Promise<{ url: string; elements: AgentClickableElement[] }>;
  clickElement: (input: { selector: string }) => Promise<{ clicked: boolean; selector: string; url: string }>;
  fillInput: (input: { selector: string; value: string }) => Promise<{ filled: boolean; selector: string }>;
  submitForm: (input: { selector: string }) => Promise<{ submitted: boolean; selector: string; url: string }>;
  getCookies: () => Promise<{ cookies: AgentCookie[] }>;
  getStorageState: () => Promise<AgentStorageState>;
};

type ConnectOverCdp = (endpoint: string, options: { timeout: number }) => Promise<Browser>;

type ControllerOptions = {
  allowlist: () => string[];
  connectOverCdp?: ConnectOverCdp;
  onStateChange?: (state: PlaywrightAutomationState) => void;
};

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function isHttpUrl(value: string) {
  return /^https?:\/\//i.test(value);
}

export function createPlaywrightBrowserController(options: ControllerOptions): PlaywrightBrowserController {
  const connectOverCdp =
    options.connectOverCdp ||
    ((endpoint: string, connectOptions: { timeout: number }) => chromium.connectOverCDP(endpoint, connectOptions));
  let browser: Browser | null = null;
  let context: BrowserContext | null = null;
  let currentPage: Page | null = null;
  let endpoint = "";
  let status: PlaywrightAutomationStatus = "disconnected";
  let title = "";
  let loading = false;
  let lastError = "";
  let generation = 0;

  const pages = () => (context ? context.pages().filter((page) => !page.isClosed()) : []);

  const selectPage = () => {
    const available = pages();
    if (currentPage && available.includes(currentPage)) {
      return currentPage;
    }
    currentPage =
      [...available].reverse().find((page) => isHttpUrl(page.url())) ||
      available[available.length - 1] ||
      null;
    return currentPage;
  };

  const state = (): PlaywrightAutomationState => ({
    status,
    pageCount: pages().length,
    url: selectPage()?.url() || "",
    title,
    loading,
    error: lastError || undefined
  });

  const notify = () => {
    options.onStateChange?.(state());
  };

  const refreshTitle = async (page: Page, expectedGeneration = generation) => {
    try {
      const nextTitle = await page.title();
      if (expectedGeneration === generation && page === selectPage()) {
        title = nextTitle;
        notify();
      }
    } catch {
      /* A page can close between an event and a title read. */
    }
  };

  const bindPage = (page: Page, expectedGeneration: number) => {
    currentPage = page;
    page.setDefaultTimeout(AUTOMATION_ACTION_TIMEOUT_MS);
    page.setDefaultNavigationTimeout(AUTOMATION_NAVIGATION_TIMEOUT_MS);
    page.on("framenavigated", (frame) => {
      if (expectedGeneration !== generation || frame !== page.mainFrame()) return;
      currentPage = page;
      void refreshTitle(page, expectedGeneration);
      notify();
    });
    page.on("domcontentloaded", () => {
      if (expectedGeneration !== generation) return;
      loading = false;
      void refreshTitle(page, expectedGeneration);
      notify();
    });
    page.on("close", () => {
      if (expectedGeneration !== generation) return;
      if (currentPage === page) currentPage = null;
      notify();
    });
    void refreshTitle(page, expectedGeneration);
    notify();
  };

  const ensurePage = async () => {
    const existing = selectPage();
    if (existing) return existing;
    if (!context) {
      throw new Error("Playwright is not connected to the Radar browser.");
    }
    const page = await context.newPage();
    bindPage(page, generation);
    return page;
  };

  const connect = async (nextEndpoint: string) => {
    const normalizedEndpoint = String(nextEndpoint || "").trim().replace(/\/$/, "");
    if (!normalizedEndpoint) {
      throw new Error("Chrome debugging endpoint is required for Playwright automation.");
    }
    if (browser?.isConnected() && endpoint === normalizedEndpoint && context) {
      status = "ready";
      lastError = "";
      notify();
      return state();
    }

    generation += 1;
    const expectedGeneration = generation;
    status = "connecting";
    lastError = "";
    endpoint = normalizedEndpoint;
    browser = null;
    context = null;
    currentPage = null;
    title = "";
    loading = false;
    notify();

    try {
      const connectedBrowser = await connectOverCdp(normalizedEndpoint, {
        timeout: AUTOMATION_CONNECT_TIMEOUT_MS
      });
      if (expectedGeneration !== generation) {
        throw new Error("Playwright connection was superseded by a newer browser session.");
      }
      const connectedContext = connectedBrowser.contexts()[0];
      if (!connectedContext) {
        throw new Error("Chrome did not expose a persistent browser context.");
      }
      browser = connectedBrowser;
      context = connectedContext;
      status = "ready";
      connectedBrowser.on("disconnected", () => {
        if (expectedGeneration !== generation) return;
        status = "disconnected";
        browser = null;
        context = null;
        currentPage = null;
        loading = false;
        notify();
      });
      for (const page of connectedContext.pages()) {
        bindPage(page, expectedGeneration);
      }
      connectedContext.on("page", (page) => bindPage(page, expectedGeneration));
      await ensurePage();
      lastError = "";
      notify();
      return state();
    } catch (error) {
      status = "error";
      lastError = errorMessage(error, "Playwright could not connect to Chrome.");
      notify();
      throw new Error(lastError);
    }
  };

  const reset = () => {
    generation += 1;
    browser = null;
    context = null;
    currentPage = null;
    endpoint = "";
    status = "disconnected";
    title = "";
    loading = false;
    lastError = "";
    notify();
  };

  const settlePage = async (page: Page) => {
    await page.waitForLoadState("domcontentloaded", { timeout: 4_000 }).catch(() => undefined);
    await page.waitForTimeout(120);
    const selected = selectPage() || page;
    currentPage = selected;
    await refreshTitle(selected);
    loading = false;
    notify();
    return selected;
  };

  const navigate = async (url: string) => {
    const page = await ensurePage();
    loading = true;
    notify();
    try {
      await page.bringToFront();
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: AUTOMATION_NAVIGATION_TIMEOUT_MS });
      await settlePage(page);
      return state();
    } finally {
      loading = false;
      notify();
    }
  };

  const historyAction = async (action: (page: Page) => Promise<unknown>) => {
    const page = await ensurePage();
    loading = true;
    notify();
    try {
      await action(page);
      await settlePage(page);
      return state();
    } finally {
      loading = false;
      notify();
    }
  };

  const getPageText = async () => {
    const page = await ensurePage();
    const result = await inspectPlaywrightPageText(page);
    title = result.title;
    notify();
    return result;
  };

  const getDomSummary = async (): Promise<PlaywrightDomSummary> => {
    const page = await ensurePage();
    const result = await inspectPlaywrightDom(page);
    title = result.title;
    notify();
    return result;
  };

  const getClickableElements = async () => {
    return inspectPlaywrightClickableElements(await ensurePage());
  };

  const { clickElement, fillInput, submitForm } = createPlaywrightActions({
    allowlist: options.allowlist,
    context: () => context,
    ensurePage,
    selectPage,
    settlePage
  });

  const getCookies = async () => {
    const page = await ensurePage();
    if (!context) throw new Error("Playwright is not connected to the Radar browser.");
    return inspectPlaywrightCookies(context, page);
  };

  const getStorageState = async (): Promise<AgentStorageState> => {
    const page = await ensurePage();
    if (!context) throw new Error("Playwright is not connected to the Radar browser.");
    return inspectPlaywrightStorage(context, page);
  };

  return {
    connect,
    reset,
    state,
    navigate,
    back: () => historyAction((page) => page.goBack({ waitUntil: "commit", timeout: AUTOMATION_NAVIGATION_TIMEOUT_MS })),
    forward: () => historyAction((page) => page.goForward({ waitUntil: "commit", timeout: AUTOMATION_NAVIGATION_TIMEOUT_MS })),
    reload: () => historyAction((page) => page.reload({ waitUntil: "domcontentloaded" })),
    waitForNetworkIdle: async ({ idleMs = 700, timeoutMs = 8_000 }) => {
      const page = await ensurePage();
      const started = Date.now();
      try {
        await page.waitForLoadState("networkidle", { timeout: timeoutMs });
        if (idleMs > 500) await page.waitForTimeout(idleMs - 500);
        return { idle: true, waitedMs: Date.now() - started };
      } catch {
        return { idle: false, waitedMs: Date.now() - started };
      }
    },
    getPageText,
    getDomSummary,
    getClickableElements,
    clickElement,
    fillInput,
    submitForm,
    getCookies,
    getStorageState
  };
}
