/* global document, location, localStorage, sessionStorage, getComputedStyle, HTMLElement, HTMLFormElement, HTMLAnchorElement, HTMLInputElement, HTMLButtonElement */
import { chromium, type Browser, type BrowserContext, type Locator, type Page, type Route } from "playwright-core";
import { isAllowedTarget } from "../shared/allowlist.js";
import type {
  AgentClickableElement,
  AgentCookie,
  AgentStorageState
} from "../shared/agent-types.js";

const AUTOMATION_CONNECT_TIMEOUT_MS = 10_000;
const AUTOMATION_ACTION_TIMEOUT_MS = 8_000;
const AUTOMATION_NAVIGATION_TIMEOUT_MS = 20_000;
const MAX_AUTOMATION_SELECTOR_LENGTH = 500;
const MAX_AUTOMATION_TEXT = 20_000;
const MAX_AUTOMATION_ARIA = 12_000;
const MAX_AUTOMATION_ELEMENTS = 120;
const AGENT_REF_ATTRIBUTE = "data-radar-agent-ref";

export type PlaywrightAutomationStatus = "disconnected" | "connecting" | "ready" | "error";

export type PlaywrightAutomationState = {
  status: PlaywrightAutomationStatus;
  pageCount: number;
  url: string;
  title: string;
  loading: boolean;
  error?: string;
};

export type PlaywrightDomSummary = {
  url: string;
  title: string;
  text: string;
  ariaSnapshot: string;
  links: Array<{ text: string; href: string }>;
  buttons: string[];
  forms: Array<{ action: string; method: string; inputs: string[] }>;
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

function clip(value: unknown, max: number) {
  const text = String(value || "").replace(/\s+\n/g, "\n").trim();
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function isHttpUrl(value: string) {
  return /^https?:\/\//i.test(value);
}

export function isAutomationRequestAllowed(url: string, allowlist: string[]) {
  return !isHttpUrl(url) || isAllowedTarget(url, allowlist);
}

export function automationSelectorForRef(ref: string) {
  const normalized = String(ref || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80);
  if (!normalized) {
    throw new Error("Browser element reference is required.");
  }
  return `[${AGENT_REF_ATTRIBUTE}="${normalized}"]`;
}

export function normalizeAutomationSelector(value: unknown) {
  const selector = String(value || "").trim().slice(0, MAX_AUTOMATION_SELECTOR_LENGTH);
  if (!selector) {
    throw new Error("A browser element selector is required.");
  }
  return selector;
}

function normalizeCookie(cookie: Awaited<ReturnType<BrowserContext["cookies"]>>[number]): AgentCookie {
  return {
    name: cookie.name,
    value: cookie.value,
    domain: cookie.domain,
    path: cookie.path,
    expires: cookie.expires,
    httpOnly: cookie.httpOnly,
    secure: cookie.secure,
    sameSite: cookie.sameSite
  };
}

async function potentialActionUrl(locator: Locator) {
  return locator.evaluate((node) => {
    const element = node as HTMLElement;
    const form = element instanceof HTMLFormElement ? element : element.closest("form");
    const href = element instanceof HTMLAnchorElement ? element.href : "";
    const formAction = element.getAttribute("formaction") || form?.action || "";
    return href || formAction || "";
  });
}

async function keepActionInVisibleTab(locator: Locator) {
  await locator.evaluate((node) => {
    const element = node as HTMLElement;
    if (element.getAttribute("target")?.toLowerCase() === "_blank") {
      element.setAttribute("target", "_self");
    }
    const form = element instanceof HTMLFormElement ? element : element.closest("form");
    if (form?.getAttribute("target")?.toLowerCase() === "_blank") {
      form.setAttribute("target", "_self");
    }
  });
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

  const runScopedAction = async <T>(action: (page: Page) => Promise<T>) => {
    const page = await ensurePage();
    if (!context) {
      throw new Error("Playwright is not connected to the Radar browser.");
    }
    let blockedUrl = "";
    const routeHandler = async (route: Route) => {
      const url = route.request().url();
      if (isAutomationRequestAllowed(url, options.allowlist())) {
        await route.continue();
        return;
      }
      blockedUrl ||= url;
      await route.abort("blockedbyclient");
    };
    await context.route("**/*", routeHandler);
    try {
      const result = await action(page);
      const selected = await settlePage(page);
      if (blockedUrl) {
        throw new Error(`Playwright blocked an out-of-scope browser request: ${blockedUrl}`);
      }
      if (isHttpUrl(selected.url()) && !isAllowedTarget(selected.url(), options.allowlist())) {
        throw new Error(`Playwright blocked an out-of-scope browser destination: ${selected.url()}`);
      }
      return result;
    } finally {
      await context.unroute("**/*", routeHandler).catch(() => undefined);
    }
  };

  const locatorFor = async (selectorValue: unknown) => {
    const selector = normalizeAutomationSelector(selectorValue);
    const page = await ensurePage();
    const locator = page.locator(selector).first();
    if ((await locator.count()) === 0) {
      throw new Error(`Browser element was not found: ${selector}`);
    }
    return { selector, page, locator };
  };

  const getPageText = async () => {
    const page = await ensurePage();
    const text = await page.locator("body").innerText({ timeout: AUTOMATION_ACTION_TIMEOUT_MS }).catch(() => "");
    title = await page.title();
    notify();
    return { url: page.url(), title, text: clip(text, MAX_AUTOMATION_TEXT) };
  };

  const getDomSummary = async (): Promise<PlaywrightDomSummary> => {
    const page = await ensurePage();
    const text = await page.locator("body").innerText({ timeout: AUTOMATION_ACTION_TIMEOUT_MS }).catch(() => "");
    const links = await page.locator("a[href]").evaluateAll((nodes) =>
      nodes.slice(0, 80).map((node) => {
        const anchor = node as HTMLAnchorElement;
        return {
          text: (anchor.innerText || anchor.getAttribute("aria-label") || "").trim().slice(0, 120),
          href: anchor.href
        };
      })
    );
    const buttons = await page
      .locator('button, [role="button"], input[type="submit"], input[type="button"]')
      .evaluateAll((nodes) =>
        nodes
          .slice(0, 80)
          .map((node) => {
            const element = node as HTMLInputElement;
            return (element.innerText || element.value || element.getAttribute("aria-label") || "").trim().slice(0, 120);
          })
          .filter(Boolean)
      );
    const forms = await page.locator("form").evaluateAll((nodes) =>
      nodes.slice(0, 20).map((node) => {
        const form = node as HTMLFormElement;
        return {
          action: form.action || location.href,
          method: (form.method || "GET").toUpperCase(),
          inputs: Array.from(form.querySelectorAll("input, textarea, select"))
            .map((input) => input.getAttribute("name") || input.id || input.getAttribute("type") || input.tagName)
            .filter(Boolean)
            .slice(0, 40)
        };
      })
    );
    const ariaSnapshot = await page.locator("body").ariaSnapshot({ timeout: 4_000 }).catch(() => "");
    title = await page.title();
    notify();
    return {
      url: page.url(),
      title,
      text: clip(text, 6_000),
      ariaSnapshot: clip(ariaSnapshot, MAX_AUTOMATION_ARIA),
      links,
      buttons,
      forms
    };
  };

  const getClickableElements = async () => {
    const page = await ensurePage();
    const elements = await page
      .locator('a[href], button, [role="button"], input, textarea, select, summary, [tabindex]:not([tabindex="-1"])')
      .evaluateAll((nodes, input) => {
        const { attribute, max } = input as { attribute: string; max: number };
        document.querySelectorAll(`[${attribute}]`).forEach((node) => node.removeAttribute(attribute));
        return nodes
          .filter((node) => {
            const element = node as HTMLElement;
            const rect = element.getBoundingClientRect();
            const style = getComputedStyle(element);
            return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
          })
          .slice(0, max)
          .map((node, index) => {
            const element = node as HTMLInputElement;
            const ref = `pw-${index + 1}`;
            element.setAttribute(attribute, ref);
            return {
              ref,
              text: (
                element.innerText ||
                element.value ||
                element.getAttribute("aria-label") ||
                element.getAttribute("name") ||
                element.id ||
                ""
              )
                .trim()
                .slice(0, 140),
              tag: element.tagName.toLowerCase(),
              role: element.getAttribute("role") || element.getAttribute("type") || "",
              href: element instanceof HTMLAnchorElement ? element.href : undefined,
              name: element.getAttribute("name") || undefined,
              placeholder: element.getAttribute("placeholder") || undefined,
              disabled: element.matches(":disabled") || element.getAttribute("aria-disabled") === "true"
            };
          });
      }, { attribute: AGENT_REF_ATTRIBUTE, max: MAX_AUTOMATION_ELEMENTS });
    return {
      url: page.url(),
      elements: elements.map(({ ref, ...element }) => ({
        selector: automationSelectorForRef(ref),
        ...element
      }))
    };
  };

  const clickElement = async ({ selector: selectorValue }: { selector: string }) => {
    const { selector, page, locator } = await locatorFor(selectorValue);
    const submitsForm = await locator.evaluate((node) => {
      const element = node as HTMLElement;
      if (element instanceof HTMLInputElement) {
        return ["submit", "image"].includes(element.type.toLowerCase());
      }
      if (element instanceof HTMLButtonElement) {
        return (element.getAttribute("type") || "submit").toLowerCase() === "submit" && Boolean(element.form);
      }
      return false;
    });
    if (submitsForm) {
      throw new Error("Use submitForm for a submit control so Radar can apply form-action policy.");
    }
    const targetUrl = await potentialActionUrl(locator);
    if (isHttpUrl(targetUrl) && !isAllowedTarget(targetUrl, options.allowlist())) {
      throw new Error(`Playwright blocked an out-of-scope click target: ${targetUrl}`);
    }
    await keepActionInVisibleTab(locator);
    await runScopedAction(async () => {
      await locator.scrollIntoViewIfNeeded();
      await locator.click({ timeout: AUTOMATION_ACTION_TIMEOUT_MS });
    });
    return { clicked: true, selector, url: selectPage()?.url() || page.url() };
  };

  const fillInput = async ({ selector: selectorValue, value }: { selector: string; value: string }) => {
    const { selector, locator } = await locatorFor(selectorValue);
    await runScopedAction(async () => {
      await locator.scrollIntoViewIfNeeded();
      await locator.fill(String(value));
    });
    return { filled: true, selector };
  };

  const submitForm = async ({ selector: selectorValue }: { selector: string }) => {
    const { selector, page, locator } = await locatorFor(selectorValue);
    const targetUrl = await potentialActionUrl(locator);
    if (isHttpUrl(targetUrl) && !isAllowedTarget(targetUrl, options.allowlist())) {
      throw new Error(`Playwright blocked an out-of-scope form target: ${targetUrl}`);
    }
    await keepActionInVisibleTab(locator);
    await runScopedAction(async () => {
      await locator.evaluate((node) => {
        const element = node as HTMLElement;
        const form = element instanceof HTMLFormElement ? element : element.closest("form");
        if (!form) throw new Error("No form exists for the selected browser element.");
        form.requestSubmit();
      });
    });
    return { submitted: true, selector, url: selectPage()?.url() || page.url() };
  };

  const getCookies = async () => {
    const page = await ensurePage();
    if (!context) throw new Error("Playwright is not connected to the Radar browser.");
    const cookies = await context.cookies(page.url());
    return { cookies: cookies.map(normalizeCookie).filter((cookie) => cookie.name) };
  };

  const getStorageState = async (): Promise<AgentStorageState> => {
    const page = await ensurePage();
    const storage = await page.evaluate(() => ({
      localStorage: Object.fromEntries(Object.entries(localStorage)),
      sessionStorage: Object.fromEntries(Object.entries(sessionStorage))
    }));
    const cookies = await getCookies();
    const pageUrl = page.url();
    return {
      url: pageUrl,
      origin: new URL(pageUrl).origin,
      cookies: cookies.cookies,
      localStorage: storage.localStorage,
      sessionStorage: storage.sessionStorage
    };
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
