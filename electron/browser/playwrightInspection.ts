/* global document, location, localStorage, sessionStorage, getComputedStyle, HTMLElement, HTMLFormElement, HTMLAnchorElement, HTMLInputElement */
import type { BrowserContext, Page } from "playwright-core";
import type {
  AgentClickableElement,
  AgentCookie,
  AgentStorageState
} from "../../shared/agent-types.js";
import {
  AGENT_REF_ATTRIBUTE,
  AUTOMATION_ACTION_TIMEOUT_MS,
  MAX_AUTOMATION_ARIA,
  MAX_AUTOMATION_ELEMENTS,
  MAX_AUTOMATION_TEXT
} from "./playwrightConstants.js";
import { automationSelectorForRef } from "./playwrightActions.js";

export type PlaywrightDomSummary = {
  url: string;
  title: string;
  text: string;
  ariaSnapshot: string;
  links: Array<{ text: string; href: string }>;
  buttons: string[];
  forms: Array<{ action: string; method: string; inputs: string[] }>;
};

function clip(value: unknown, max: number) {
  const text = String(value || "").replace(/\s+\n/g, "\n").trim();
  return text.length > max ? `${text.slice(0, max)}...` : text;
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

export async function inspectPlaywrightPageText(page: Page) {
  const text = await page.locator("body").innerText({ timeout: AUTOMATION_ACTION_TIMEOUT_MS }).catch(() => "");
  const title = await page.title();
  return { url: page.url(), title, text: clip(text, MAX_AUTOMATION_TEXT) };
}

export async function inspectPlaywrightDom(page: Page): Promise<PlaywrightDomSummary> {
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
  return {
    url: page.url(),
    title: await page.title(),
    text: clip(text, 6_000),
    ariaSnapshot: clip(ariaSnapshot, MAX_AUTOMATION_ARIA),
    links,
    buttons,
    forms
  };
}

export async function inspectPlaywrightClickableElements(page: Page): Promise<{ url: string; elements: AgentClickableElement[] }> {
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
}

export async function inspectPlaywrightCookies(context: BrowserContext, page: Page) {
  const cookies = await context.cookies(page.url());
  return { cookies: cookies.map(normalizeCookie).filter((cookie) => cookie.name) };
}

export async function inspectPlaywrightStorage(context: BrowserContext, page: Page): Promise<AgentStorageState> {
  const storage = await page.evaluate(() => ({
    localStorage: Object.fromEntries(Object.entries(localStorage)),
    sessionStorage: Object.fromEntries(Object.entries(sessionStorage))
  }));
  const cookies = await inspectPlaywrightCookies(context, page);
  const pageUrl = page.url();
  return {
    url: pageUrl,
    origin: new URL(pageUrl).origin,
    cookies: cookies.cookies,
    localStorage: storage.localStorage,
    sessionStorage: storage.sessionStorage
  };
}
