import type {
  AgentCookie,
  AgentStorageState
} from "../../shared/agent-types.js";
import type {
  BrowserState
} from "../../shared/domain.js";
import type {
  createPlaywrightBrowserController
} from "../playwrightBrowser.js";

type PageEvaluator = <T>(
  expression: string
) => Promise<T | null | undefined>;
type CdpCommand = (
  method: string,
  params?: Record<string, unknown>
) => Promise<unknown>;

type PageInspectionDeps = {
  browserState: () => BrowserState;
  ensureAutomation: () => Promise<
    ReturnType<typeof createPlaywrightBrowserController>
  >;
  evaluateElectron: PageEvaluator;
  evaluateChrome: PageEvaluator;
  withCdpPage: <T>(
    callback: (sendCommand: CdpCommand) => Promise<T>
  ) => Promise<T>;
  trimText: (value: unknown, max?: number) => string;
};

function normalizeCookie(
  cookie: Record<string, unknown>
): AgentCookie {
  return {
    name: String(cookie.name || ""),
    value: String(cookie.value || ""),
    domain: cookie.domain ? String(cookie.domain) : undefined,
    path: cookie.path ? String(cookie.path) : undefined,
    expires:
      typeof cookie.expires === "number"
        ? cookie.expires
        : undefined,
    httpOnly: Boolean(cookie.httpOnly),
    secure: Boolean(cookie.secure),
    sameSite: cookie.sameSite
      ? String(cookie.sameSite)
      : undefined
  };
}

export function createPageInspectionController(
  deps: PageInspectionDeps
) {
  function useAutomation() {
    return deps.browserState().engine === "chrome";
  }

  async function evaluate<T>(expression: string) {
    return (
      (await deps.evaluateElectron<T>(expression)) ||
      (await deps.evaluateChrome<T>(expression))
    );
  }

  async function getPageText() {
    if (useAutomation()) {
      return (await deps.ensureAutomation()).getPageText();
    }
    const result = await evaluate<{
      url: string;
      title: string;
      text: string;
    }>(`(() => ({
      url: location.href,
      title: document.title,
      text: document.body ? document.body.innerText : ""
    }))()`);
    if (!result) {
      throw new Error("No active browser page is available.");
    }
    return {
      url: result.url || "",
      title: result.title || "",
      text: deps.trimText(result.text)
    };
  }

  async function getDomSummary() {
    if (useAutomation()) {
      return (await deps.ensureAutomation()).getDomSummary();
    }
    const result = await evaluate<{
      url: string;
      title: string;
      text: string;
      links: Array<{ text: string; href: string }>;
      buttons: string[];
      forms: Array<{
        action: string;
        method: string;
        inputs: string[];
      }>;
    }>(`(() => ({
      url: location.href,
      title: document.title,
      text: document.body ? document.body.innerText.slice(0, 6000) : "",
      links: Array.from(document.querySelectorAll('a[href]')).slice(0, 80).map((node) => ({ text: (node.innerText || node.getAttribute('aria-label') || '').trim().slice(0, 120), href: node.href })),
      buttons: Array.from(document.querySelectorAll('button, [role="button"], input[type="submit"], input[type="button"]')).slice(0, 80).map((node) => (node.innerText || node.value || node.getAttribute('aria-label') || '').trim().slice(0, 120)).filter(Boolean),
      forms: Array.from(document.querySelectorAll('form')).slice(0, 20).map((form) => ({ action: form.action || location.href, method: (form.method || 'GET').toUpperCase(), inputs: Array.from(form.querySelectorAll('input, textarea, select')).map((input) => input.name || input.id || input.type || input.tagName).filter(Boolean).slice(0, 40) }))
    }))()`);
    if (!result) {
      throw new Error("No active browser page is available.");
    }
    return {
      url: result.url || "",
      title: result.title || "",
      text: deps.trimText(result.text, 6000),
      ariaSnapshot: "",
      links: Array.isArray(result.links) ? result.links : [],
      buttons: Array.isArray(result.buttons) ? result.buttons : [],
      forms: Array.isArray(result.forms) ? result.forms : []
    };
  }

  async function getClickableElements() {
    if (useAutomation()) {
      return (await deps.ensureAutomation()).getClickableElements();
    }
    const result = await evaluate<{
      url: string;
      elements: Array<{
        selector: string;
        text: string;
        tag: string;
        role: string;
        href?: string;
      }>;
    }>(`(() => {
      const cssPath = (node) => {
        if (!node || node.nodeType !== Node.ELEMENT_NODE) return "";
        if (node.id && document.querySelectorAll("#" + CSS.escape(node.id)).length === 1) return "#" + CSS.escape(node.id);
        const parts = [];
        let current = node;
        while (current && current.nodeType === Node.ELEMENT_NODE && parts.length < 5) {
          let part = current.localName.toLowerCase();
          if (current.classList.length) part += "." + Array.from(current.classList).slice(0, 2).map((item) => CSS.escape(item)).join(".");
          const siblings = Array.from(current.parentElement ? current.parentElement.children : []);
          const sameTag = siblings.filter((item) => item.localName === current.localName);
          if (sameTag.length > 1) part += ":nth-of-type(" + (sameTag.indexOf(current) + 1) + ")";
          parts.unshift(part);
          current = current.parentElement;
        }
        return parts.join(" > ");
      };
      const nodes = Array.from(document.querySelectorAll('a[href], button, [role="button"], input, textarea, select, summary, [tabindex]:not([tabindex="-1"])'));
      return {
        url: location.href,
        elements: nodes.slice(0, 120).map((node) => ({
          selector: cssPath(node),
          text: (node.innerText || node.value || node.getAttribute('aria-label') || node.name || node.id || '').trim().slice(0, 140),
          tag: node.tagName.toLowerCase(),
          role: node.getAttribute('role') || node.type || '',
          href: node.href || undefined
        })).filter((item) => item.selector)
      };
    })()`);
    if (!result) {
      throw new Error("No active browser page is available.");
    }
    return {
      url: result.url || "",
      elements: Array.isArray(result.elements)
        ? result.elements
        : []
    };
  }

  async function clickElement({ selector }: { selector: string }) {
    if (useAutomation()) {
      return (await deps.ensureAutomation()).clickElement({ selector });
    }
    const result = await evaluate<{
      clicked: boolean;
      selector: string;
      url: string;
    }>(`(() => {
      const selector = ${JSON.stringify(selector)};
      const node = document.querySelector(selector);
      if (!node) throw new Error("Element not found: " + selector);
      node.scrollIntoView({ block: "center", inline: "center" });
      node.click();
      return { clicked: true, selector, url: location.href };
    })()`);
    if (!result) {
      throw new Error("No active browser page is available.");
    }
    return result;
  }

  async function fillInput({
    selector,
    value
  }: {
    selector: string;
    value: string;
  }) {
    if (useAutomation()) {
      return (await deps.ensureAutomation()).fillInput({
        selector,
        value
      });
    }
    const result = await evaluate<{
      filled: boolean;
      selector: string;
    }>(`(() => {
      const selector = ${JSON.stringify(selector)};
      const value = ${JSON.stringify(value)};
      const node = document.querySelector(selector);
      if (!node) throw new Error("Input not found: " + selector);
      node.focus();
      if ("value" in node) {
        node.value = value;
        node.dispatchEvent(new Event("input", { bubbles: true }));
        node.dispatchEvent(new Event("change", { bubbles: true }));
      } else if (node.isContentEditable) {
        node.textContent = value;
        node.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
      } else {
        throw new Error("Element is not fillable: " + selector);
      }
      return { filled: true, selector };
    })()`);
    if (!result) {
      throw new Error("No active browser page is available.");
    }
    return result;
  }

  async function submitForm({ selector }: { selector: string }) {
    if (useAutomation()) {
      return (await deps.ensureAutomation()).submitForm({ selector });
    }
    const result = await evaluate<{
      submitted: boolean;
      selector: string;
      url: string;
    }>(`(() => {
      const selector = ${JSON.stringify(selector)};
      const node = document.querySelector(selector);
      if (!node) throw new Error("Form target not found: " + selector);
      const form = node.tagName && node.tagName.toLowerCase() === "form" ? node : node.closest("form");
      if (!form) throw new Error("No form found for selector: " + selector);
      if (form.requestSubmit) form.requestSubmit();
      else form.submit();
      return { submitted: true, selector, url: location.href };
    })()`);
    if (!result) {
      throw new Error("No active browser page is available.");
    }
    return result;
  }

  async function getCookies() {
    if (useAutomation()) {
      return (await deps.ensureAutomation()).getCookies();
    }
    const result = await deps.withCdpPage((sendCommand) =>
      sendCommand("Network.getAllCookies")
    ) as { cookies?: Array<Record<string, unknown>> };
    return {
      cookies: Array.isArray(result.cookies)
        ? result.cookies
            .map(normalizeCookie)
            .filter((cookie) => cookie.name)
        : []
    };
  }

  async function getStorageState(): Promise<AgentStorageState> {
    if (useAutomation()) {
      return (await deps.ensureAutomation()).getStorageState();
    }
    const page = await getPageText();
    const storage =
      (await evaluate<{
        localStorage: Record<string, string>;
        sessionStorage: Record<string, string>;
      }>(`(() => ({
        localStorage: Object.fromEntries(Object.entries(localStorage)),
        sessionStorage: Object.fromEntries(Object.entries(sessionStorage))
      }))()`)) || {
        localStorage: {},
        sessionStorage: {}
      };
    const cookies = await getCookies();
    return {
      url: page.url,
      origin: new URL(page.url).origin,
      cookies: cookies.cookies,
      localStorage: storage.localStorage || {},
      sessionStorage: storage.sessionStorage || {}
    };
  }

  return {
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
