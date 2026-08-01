// @vitest-environment jsdom
/* global document, Element, HTMLElement, localStorage, sessionStorage */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BrowserContext, Locator, Page } from "playwright-core";
import {
  inspectPlaywrightClickableElements,
  inspectPlaywrightCookies,
  inspectPlaywrightDom,
  inspectPlaywrightPageText,
  inspectPlaywrightStorage
} from "./playwrightInspection.js";

function inspectionPage() {
  const page = {
    url: () => "https://allowed.test/account",
    title: async () => "Account",
    locator: (selector: string) => ({
      innerText: vi.fn().mockResolvedValue(document.body.textContent || ""),
      ariaSnapshot: vi.fn().mockResolvedValue("document\n  heading Account"),
      evaluateAll: async (
        callback: (nodes: Element[], input?: unknown) => unknown,
        input?: unknown
      ) => callback(Array.from(document.querySelectorAll(selector)), input)
    } as unknown as Locator),
    evaluate: async <T>(callback: () => T) => callback()
  } as unknown as Page;
  return page;
}

function cookieContext() {
  return {
    cookies: vi.fn().mockResolvedValue([
      {
        name: "session",
        value: "secret",
        domain: "allowed.test",
        path: "/",
        expires: -1,
        httpOnly: true,
        secure: true,
        sameSite: "Lax"
      },
      {
        name: "",
        value: "ignored",
        domain: "allowed.test",
        path: "/",
        expires: -1,
        httpOnly: false,
        secure: true,
        sameSite: "Lax"
      }
    ])
  } as unknown as BrowserContext;
}

describe("Playwright inspection", () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <h1>Account</h1>
      <a href="https://allowed.test/account" aria-label="Account link">Account</a>
      <button type="button" aria-label="Save">Save</button>
      <form action="https://allowed.test/save" method="post">
        <input name="email" value="operator@example.test" />
        <textarea name="notes"></textarea>
        <select name="role"><option>user</option></select>
      </form>
      <button style="display:none" aria-label="Hidden">Hidden</button>
    `;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      width: 120,
      height: 24,
      top: 0,
      right: 120,
      bottom: 24,
      left: 0,
      toJSON: () => ({})
    });
    localStorage.clear();
    sessionStorage.clear();
  });

  it("reads bounded visible text and a structured DOM summary", async () => {
    const page = inspectionPage();

    await expect(inspectPlaywrightPageText(page)).resolves.toMatchObject({
      url: "https://allowed.test/account",
      title: "Account",
      text: expect.stringContaining("Account")
    });
    await expect(inspectPlaywrightDom(page)).resolves.toMatchObject({
      url: "https://allowed.test/account",
      title: "Account",
      links: [{ text: "Account link" }],
      buttons: ["Save", "Hidden"],
      forms: [{ method: "POST", inputs: ["email", "notes", "role"] }]
    });
  });

  it("maps visible page references to stable selectors and excludes hidden controls", async () => {
    const page = inspectionPage();

    const result = await inspectPlaywrightClickableElements(page);

    expect(result.url).toBe("https://allowed.test/account");
    expect(result.elements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ selector: '[data-radar-agent-ref="pw-1"]', tag: "a", text: "Account link" }),
        expect.objectContaining({ tag: "button", disabled: false }),
        expect.objectContaining({ tag: "input", name: "email" })
      ])
    );
    expect(result.elements.some((element) => element.text === "Hidden")).toBe(false);
  });

  it("normalizes cookies and combines them with page storage", async () => {
    const page = inspectionPage();
    const context = cookieContext();
    localStorage.setItem("theme", "dark");
    sessionStorage.setItem("step", "2");

    await expect(inspectPlaywrightCookies(context, page)).resolves.toMatchObject({
      cookies: [expect.objectContaining({ name: "session", httpOnly: true })]
    });
    await expect(inspectPlaywrightStorage(context, page)).resolves.toMatchObject({
      origin: "https://allowed.test",
      localStorage: { theme: "dark" },
      sessionStorage: { step: "2" },
      cookies: [expect.objectContaining({ name: "session" })]
    });
  });
});
