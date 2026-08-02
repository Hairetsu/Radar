import type { Locator, Page, TestInfo } from "@playwright/test";
import { expect } from "../fixtures";
import { waitForFonts, type UiTheme } from "./fontAudit";

export async function stabilizeVisuals(page: Page, theme: UiTheme) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await waitForFonts(page, theme);
  await page.evaluate(() => {
    const prior = document.getElementById("radar-regression-visual-stability");
    prior?.remove();
    const style = document.createElement("style");
    style.id = "radar-regression-visual-stability";
    style.textContent = `
      *, *::before, *::after {
        animation-delay: 0s !important;
        animation-duration: 0s !important;
        caret-color: transparent !important;
        scroll-behavior: auto !important;
        transition-delay: 0s !important;
        transition-duration: 0s !important;
      }
    `;
    document.head.append(style);
  });
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  });
}

export function assertBaselineUpdateAllowed() {
  const updating = process.argv.some((argument) => argument.includes("update-snapshots"));
  if (updating && process.env.UPDATE_RADAR_UI_BASELINES !== "1") {
    throw new Error("Set UPDATE_RADAR_UI_BASELINES=1 before updating Radar UI baselines.");
  }
}

export async function expectVisualAnchor({
  page,
  name,
  mask = [],
  dense = false,
  testInfo
}: {
  page: Page;
  name: string;
  mask?: Locator[];
  dense?: boolean;
  testInfo: TestInfo;
}) {
  assertBaselineUpdateAllowed();
  await expect(page).toHaveScreenshot(`${name}-${process.platform}.png`, {
    animations: "disabled",
    caret: "hide",
    mask,
    threshold: 0.15,
    maxDiffPixelRatio: dense ? 0.003 : 0.001,
    fullPage: false
  });
  testInfo.annotations.push({ type: "ui-visual-anchor", description: name });
}

export async function attachActualVisual({
  page,
  name,
  mask = [],
  testInfo
}: {
  page: Page;
  name: string;
  mask?: Locator[];
  testInfo: TestInfo;
}) {
  await testInfo.attach(`actual-${name}-${process.platform}.png`, {
    body: await page.screenshot({ animations: "disabled", caret: "hide", mask }),
    contentType: "image/png"
  });
  testInfo.annotations.push({ type: "ui-actual", description: name });
}
