import type { ElectronApplication, Page, TestInfo } from "@playwright/test";

export type WindowProfileId =
  | "minimum"
  | "laptop"
  | "default"
  | "wide"
  | "large"
  | "zoom-75"
  | "zoom-80"
  | "zoom-90"
  | "zoom-125"
  | "zoom-150"
  | "zoom-200";

export type WindowProfile = {
  id: WindowProfileId;
  width: number;
  height: number;
  zoom: number;
};

export type AppliedWindowProfile = WindowProfile & {
  outer: { x: number; y: number; width: number; height: number };
  content: { x: number; y: number; width: number; height: number };
  viewport: { width: number; height: number };
  devicePixelRatio: number;
  appliedZoom: number;
};

export const WINDOW_PROFILES: Record<WindowProfileId, WindowProfile> = {
  minimum: { id: "minimum", width: 1120, height: 760, zoom: 1 },
  laptop: { id: "laptop", width: 1366, height: 768, zoom: 1 },
  default: { id: "default", width: 1480, height: 940, zoom: 1 },
  wide: { id: "wide", width: 1920, height: 1080, zoom: 1 },
  large: { id: "large", width: 2560, height: 1440, zoom: 1 },
  "zoom-75": { id: "zoom-75", width: 1920, height: 1080, zoom: 0.75 },
  "zoom-80": { id: "zoom-80", width: 1480, height: 940, zoom: 0.8 },
  "zoom-90": { id: "zoom-90", width: 1480, height: 940, zoom: 0.9 },
  "zoom-125": { id: "zoom-125", width: 1480, height: 940, zoom: 1.25 },
  "zoom-150": { id: "zoom-150", width: 1920, height: 1080, zoom: 1.5 },
  "zoom-200": { id: "zoom-200", width: 2560, height: 1440, zoom: 2 }
};

async function waitForStableViewport(page: Page) {
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  });
}

export async function applyWindowProfile(
  electronApp: ElectronApplication,
  page: Page,
  profileId: WindowProfileId,
  testInfo?: TestInfo
): Promise<AppliedWindowProfile> {
  const profile = WINDOW_PROFILES[profileId];
  const windowState = await electronApp.evaluate(async ({ BrowserWindow }, requested) => {
    const window = BrowserWindow.getAllWindows().find((candidate) => !candidate.isDestroyed());
    if (!window) {
      throw new Error("Radar BrowserWindow is unavailable.");
    }

    window.webContents.setZoomFactor(1);
    await new Promise<void>((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
      window.once("resize", finish);
      window.setSize(requested.width, requested.height);
      setTimeout(finish, 500);
    });
    window.webContents.setZoomFactor(requested.zoom);

    return {
      outer: window.getBounds(),
      content: window.getContentBounds(),
      appliedZoom: window.webContents.getZoomFactor()
    };
  }, profile);

  await page.waitForFunction(
    ({ zoom }) => Math.abs((window.visualViewport?.scale || 1) - 1) < 0.01 && document.readyState === "complete" && zoom > 0,
    { zoom: profile.zoom }
  );
  await waitForStableViewport(page);

  const rendererState = await page.evaluate(() => ({
    viewport: { width: window.innerWidth, height: window.innerHeight },
    devicePixelRatio: window.devicePixelRatio
  }));
  const applied: AppliedWindowProfile = {
    ...profile,
    ...windowState,
    ...rendererState
  };

  if (testInfo) {
    testInfo.annotations.push(
      { type: "ui-profile", description: profile.id },
      { type: "ui-zoom", description: String(profile.zoom) },
      {
        type: "ui-dimensions",
        description: `${applied.outer.width}x${applied.outer.height} outer; ${applied.viewport.width}x${applied.viewport.height} renderer; dpr ${applied.devicePixelRatio}`
      }
    );
  }

  return applied;
}

export async function restoreDefaultWindowProfile(
  electronApp: ElectronApplication,
  page: Page
) {
  await applyWindowProfile(electronApp, page, "default");
}
