import type { Page, TestInfo } from "@playwright/test";
import { expect } from "../fixtures";
import type { RequiredControl, UiState } from "./uiStates";
import type { UiTheme } from "./fontAudit";
import type { AppliedWindowProfile } from "./windowProfiles";

export type LayoutViolation = {
  kind: "missing" | "hidden" | "clipped" | "unlabelled" | "target-size" | "document-overflow";
  selector: string;
  message: string;
};

export type ElementMetric = {
  selector: string;
  tag: string;
  name: string;
  visible: boolean;
  disabled: boolean;
  rect: { x: number; y: number; width: number; height: number };
  fontFamily: string;
  fontSize: number;
  effectiveFontSize: number;
  fontWeight: string;
  lineHeight: string;
  overflow: string;
  textOverflow: string;
  scrollAncestor: string;
  scrollRange: { x: number; y: number };
};

export type LayoutMetrics = {
  theme: UiTheme;
  state: UiState;
  profile: string;
  zoom: number;
  viewport: { width: number; height: number };
  outer: { width: number; height: number };
  document: { scrollWidth: number; clientWidth: number; scrollHeight: number; clientHeight: number };
  elements: ElementMetric[];
  violations: LayoutViolation[];
};

export async function assertRequiredControls(page: Page, controls: RequiredControl[]) {
  for (const control of controls) {
    const locator = page.locator(control.selector).first();
    await expect(locator, `${control.label} should exist`).toHaveCount(1);
    await locator.scrollIntoViewIfNeeded();
    await expect(locator, `${control.label} should be reachable`).toBeVisible();
    if (control.focus && (await locator.isEnabled())) {
      await locator.focus();
      await expect(locator, `${control.label} should receive focus`).toBeFocused();
    }
  }
}

export async function collectLayoutMetrics({
  page,
  profile,
  theme,
  state,
  required,
  testInfo
}: {
  page: Page;
  profile: AppliedWindowProfile;
  theme: UiTheme;
  state: UiState;
  required: RequiredControl[];
  testInfo?: TestInfo;
}): Promise<LayoutMetrics> {
  const metrics = await page.evaluate(({ controls, zoom, activeTheme, activeState, profileId, outer }) => {
    const visible = (element: Element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) > 0 && rect.width > 0 && rect.height > 0;
    };
    const accessibleName = (element: Element) => {
      if (!(element instanceof HTMLElement)) return "";
      const labelledBy = element.getAttribute("aria-labelledby");
      const labelText = labelledBy
        ? labelledBy.split(/\s+/).map((id) => document.getElementById(id)?.textContent || "").join(" ")
        : "";
      const nativeLabel = element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement
        ? element.labels?.[0]?.textContent || ""
        : "";
      return (
        element.getAttribute("aria-label") ||
        labelText ||
        nativeLabel ||
        element.getAttribute("title") ||
        element.innerText ||
        element.textContent ||
        ""
      ).trim().replace(/\s+/g, " ").slice(0, 180);
    };
    const scrollAncestor = (element: Element) => {
      let current = element.parentElement;
      while (current) {
        const style = getComputedStyle(current);
        const declaresScrolling = /(auto|scroll)/.test(`${style.overflow}${style.overflowX}${style.overflowY}`);
        const hasScrollRange = current.scrollHeight > current.clientHeight || current.scrollWidth > current.clientWidth;
        if (declaresScrolling && hasScrollRange) return current;
        current = current.parentElement;
      }
      return document.scrollingElement || document.documentElement;
    };
    const descriptor = (element: Element) =>
      element instanceof HTMLElement
        ? element.dataset.testid || element.dataset.component || element.id || element.tagName.toLowerCase()
        : element.tagName.toLowerCase();
    const elementMetric = (element: Element, selector: string): ElementMetric => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      const ancestor = scrollAncestor(element);
      return {
        selector,
        tag: element.tagName.toLowerCase(),
        name: accessibleName(element),
        visible: visible(element),
        disabled: element instanceof HTMLButtonElement || element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement
          ? element.disabled
          : element.getAttribute("aria-disabled") === "true",
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        fontFamily: style.fontFamily,
        fontSize: Number.parseFloat(style.fontSize) || 0,
        effectiveFontSize: (Number.parseFloat(style.fontSize) || 0) * zoom,
        fontWeight: style.fontWeight,
        lineHeight: style.lineHeight,
        overflow: `${style.overflow}/${style.overflowX}/${style.overflowY}`,
        textOverflow: style.textOverflow,
        scrollAncestor: descriptor(ancestor),
        scrollRange: {
          x: Math.max(0, ancestor.scrollWidth - ancestor.clientWidth),
          y: Math.max(0, ancestor.scrollHeight - ancestor.clientHeight)
        }
      };
    };

    const elements: ElementMetric[] = [];
    const violations: LayoutViolation[] = [];
    for (const control of controls) {
      const element = document.querySelector(control.selector);
      if (!element) {
        violations.push({ kind: "missing", selector: control.selector, message: `${control.label} is absent.` });
        continue;
      }
      const metric = elementMetric(element, control.selector);
      elements.push(metric);
      if (!metric.visible) {
        violations.push({ kind: "hidden", selector: control.selector, message: `${control.label} is not visibly rendered.` });
        continue;
      }
      const rect = element.getBoundingClientRect();
      const viewportIntersection = rect.right > 0 && rect.bottom > 0 && rect.left < window.innerWidth && rect.top < window.innerHeight;
      const ancestor = scrollAncestor(element);
      const canScrollToElement = ancestor.scrollHeight > ancestor.clientHeight || ancestor.scrollWidth > ancestor.clientWidth;
      if (!viewportIntersection && !canScrollToElement) {
        violations.push({ kind: "clipped", selector: control.selector, message: `${control.label} is offscreen without a scroll path.` });
      }
    }

    const interactive = Array.from(document.querySelectorAll<HTMLElement>(
      "button:not([hidden]), input:not([type='hidden']), select, textarea, a[href], [role='button'], [tabindex]:not([tabindex='-1'])"
    )).filter(visible);
    for (const element of interactive) {
      if (!accessibleName(element)) {
        violations.push({ kind: "unlabelled", selector: descriptor(element), message: "Visible interactive control has no accessible name." });
      }
      if (element.hasAttribute("data-layout-critical")) {
        const rect = element.getBoundingClientRect();
        if (rect.width < 32 || rect.height < 28) {
          violations.push({ kind: "target-size", selector: descriptor(element), message: `Critical target is ${rect.width.toFixed(1)} × ${rect.height.toFixed(1)} CSS pixels.` });
        }
      }
    }

    const root = document.documentElement;
    if (root.scrollWidth > root.clientWidth + 1) {
      violations.push({ kind: "document-overflow", selector: "html", message: `Document is ${root.scrollWidth - root.clientWidth}px wider than the viewport.` });
    }
    return {
      theme: activeTheme,
      state: activeState,
      profile: profileId,
      zoom,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      outer,
      document: {
        scrollWidth: root.scrollWidth,
        clientWidth: root.clientWidth,
        scrollHeight: root.scrollHeight,
        clientHeight: root.clientHeight
      },
      elements,
      violations
    };
  }, {
    controls: required,
    zoom: profile.zoom,
    activeTheme: theme,
    activeState: state,
    profileId: profile.id,
    outer: { width: profile.outer.width, height: profile.outer.height }
  });

  if (testInfo) {
    testInfo.annotations.push({ type: "ui-state", description: state });
    await testInfo.attach(`layout-metrics-${theme}-${profile.id}-${state}.json`, {
      body: Buffer.from(`${JSON.stringify(metrics, null, 2)}\n`),
      contentType: "application/json"
    });
  }
  return metrics;
}

export function blockingLayoutViolations(metrics: LayoutMetrics) {
  return metrics.violations.filter((violation) => violation.kind !== "target-size");
}

export async function assertNoGlobalHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);
}
