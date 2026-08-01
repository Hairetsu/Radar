import { describe, expect, it, vi } from "vitest";
import type { BrowserContext, Locator, Page, Route } from "playwright-core";
import { createPlaywrightActions } from "./playwrightActions.js";

type ActionFixtureOptions = {
  evaluateResults?: unknown[];
  requestUrl?: string;
  pageUrl?: string;
};

function actionFixture({
  evaluateResults = [],
  requestUrl = "https://allowed.test/api",
  pageUrl = "https://allowed.test/account"
}: ActionFixtureOptions = {}) {
  let routeHandler: ((route: Route) => Promise<void>) | undefined;
  const route = {
    request: () => ({ url: () => requestUrl }),
    continue: vi.fn().mockResolvedValue(undefined),
    abort: vi.fn().mockResolvedValue(undefined)
  } as unknown as Route;
  const results = [...evaluateResults];
  const locator = {
    first: () => locator,
    count: async () => 1,
    evaluate: async () => results.shift(),
    scrollIntoViewIfNeeded: vi.fn().mockResolvedValue(undefined),
    click: vi.fn(async () => routeHandler?.(route)),
    fill: vi.fn(async () => routeHandler?.(route))
  } as unknown as Locator;
  const page = {
    url: () => pageUrl,
    locator: () => locator
  } as unknown as Page;
  const context = {
    route: vi.fn(async (_pattern: string, handler: (route: Route) => Promise<void>) => {
      routeHandler = handler;
    }),
    unroute: vi.fn().mockResolvedValue(undefined)
  } as unknown as BrowserContext;
  const actions = createPlaywrightActions({
    allowlist: () => ["https://allowed.test"],
    context: () => context,
    ensurePage: async () => page,
    selectPage: () => page,
    settlePage: async () => page
  });
  return { actions, context, locator, route };
}

describe("Playwright scoped actions", () => {
  it("allows an in-scope click and removes the temporary route guard", async () => {
    const { actions, context, locator, route } = actionFixture({ evaluateResults: [false, "", undefined] });

    await expect(actions.clickElement({ selector: "#account" })).resolves.toEqual({
      clicked: true,
      selector: "#account",
      url: "https://allowed.test/account"
    });

    expect(route.continue).toHaveBeenCalled();
    expect(locator.click).toHaveBeenCalled();
    expect(context.unroute).toHaveBeenCalled();
  });

  it("fails closed when an action emits an out-of-scope request", async () => {
    const { actions, context, route } = actionFixture({
      evaluateResults: [false, "", undefined],
      requestUrl: "https://blocked.test/collect"
    });

    await expect(actions.clickElement({ selector: "#account" })).rejects.toThrow("out-of-scope browser request");
    expect(route.abort).toHaveBeenCalledWith("blockedbyclient");
    expect(context.unroute).toHaveBeenCalled();
  });

  it("rejects explicit out-of-scope click targets and submit controls", async () => {
    const blockedTarget = actionFixture({ evaluateResults: [false, "https://blocked.test/leave"] });
    await expect(blockedTarget.actions.clickElement({ selector: "a.external" })).rejects.toThrow("out-of-scope click target");

    const submitControl = actionFixture({ evaluateResults: [true] });
    await expect(submitControl.actions.clickElement({ selector: "button[type=submit]" })).rejects.toThrow("Use submitForm");
  });

  it("fills inputs and submits forms under the same route guard", async () => {
    const fill = actionFixture();
    await expect(fill.actions.fillInput({ selector: "#email", value: "operator@example.test" })).resolves.toEqual({
      filled: true,
      selector: "#email"
    });
    expect(fill.locator.fill).toHaveBeenCalledWith("operator@example.test");

    const submit = actionFixture({ evaluateResults: ["", undefined, undefined] });
    await expect(submit.actions.submitForm({ selector: "#login" })).resolves.toEqual({
      submitted: true,
      selector: "#login",
      url: "https://allowed.test/account"
    });
  });

  it("rejects missing elements and disconnected action contexts", async () => {
    const page = {
      locator: () => ({ first: () => ({ count: async () => 0 }) })
    } as unknown as Page;
    const actions = createPlaywrightActions({
      allowlist: () => [],
      context: () => null,
      ensurePage: async () => page,
      selectPage: () => page,
      settlePage: async () => page
    });

    await expect(actions.fillInput({ selector: "#missing", value: "x" })).rejects.toThrow("was not found");
  });
});
