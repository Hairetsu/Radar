/* global HTMLElement, HTMLFormElement, HTMLAnchorElement, HTMLInputElement, HTMLButtonElement */
import type { BrowserContext, Locator, Page, Route } from "playwright-core";
import { isAllowedTarget } from "../../shared/allowlist.js";
import {
  AGENT_REF_ATTRIBUTE,
  AUTOMATION_ACTION_TIMEOUT_MS,
  MAX_AUTOMATION_SELECTOR_LENGTH
} from "./playwrightConstants.js";

type PlaywrightActionOptions = {
  allowlist: () => string[];
  context: () => BrowserContext | null;
  ensurePage: () => Promise<Page>;
  selectPage: () => Page | null;
  settlePage: (page: Page) => Promise<Page>;
};

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

export function createPlaywrightActions(options: PlaywrightActionOptions) {
  async function runScopedAction<T>(action: (page: Page) => Promise<T>) {
    const page = await options.ensurePage();
    const context = options.context();
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
      const selected = await options.settlePage(page);
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
  }

  async function locatorFor(selectorValue: unknown) {
    const selector = normalizeAutomationSelector(selectorValue);
    const page = await options.ensurePage();
    const locator = page.locator(selector).first();
    if ((await locator.count()) === 0) {
      throw new Error(`Browser element was not found: ${selector}`);
    }
    return { selector, page, locator };
  }

  async function clickElement({ selector: selectorValue }: { selector: string }) {
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
    return { clicked: true, selector, url: options.selectPage()?.url() || page.url() };
  }

  async function fillInput({ selector: selectorValue, value }: { selector: string; value: string }) {
    const { selector, locator } = await locatorFor(selectorValue);
    await runScopedAction(async () => {
      await locator.scrollIntoViewIfNeeded();
      await locator.fill(String(value));
    });
    return { filled: true, selector };
  }

  async function submitForm({ selector: selectorValue }: { selector: string }) {
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
    return { submitted: true, selector, url: options.selectPage()?.url() || page.url() };
  }

  return { clickElement, fillInput, submitForm };
}
