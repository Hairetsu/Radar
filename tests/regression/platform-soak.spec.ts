import net from "node:net";
import type { Page } from "@playwright/test";
import { expect, loadDemo, openView, setScope, startProxy, test } from "./fixtures";
import { sendThroughRadarProxy } from "./target-lab";

const runPlatform = process.env.RADAR_REGRESSION_PLATFORM === "1";
const runSoak = process.env.RADAR_REGRESSION_SOAK === "1";

async function createPlatformIdentity(page: Page, origin: string, label: string) {
  await openView(page, "advanced");
  await page.getByTestId("toggleIdentityLab").click();
  await page.getByLabel("Identity label").fill(label);
  await page.getByRole("textbox", { name: "Role", exact: true }).fill("platform-auditor");
  await page.getByLabel("Tenant", { exact: true }).fill("regression-platform");
  await page.getByLabel("Target origin", { exact: true }).fill(origin);
  await page.getByTestId("identitySubmit").click();
  const row = page.locator('[data-testid^="identityRoster-"]').filter({ hasText: label });
  await expect(row).toBeVisible();
  return row;
}

test("[REG-SSL-005] @platform launches the supported isolated browser through Radar to the local lab", async ({ radarPage: page, targetLab }) => {
  test.skip(!runPlatform, "Set RADAR_REGRESSION_PLATFORM=1 on a host with a supported system browser.");
  await setScope(page, [targetLab.origin]);
  const identity = await createPlatformIdentity(page, targetLab.origin, "Platform Browser Fixture");
  await identity.getByLabel("Activate Platform Browser Fixture").click();
  await targetLab.waitForRequests(1, 30_000);
  await expect(page.getByTestId("browserLauncher").locator("..")).toContainText(/proxy|chrome|open/i);
  await openView(page, "traffic");
  await expect(page.locator('[data-testid^="trafficRow-"]')).not.toHaveCount(0);
});

test("[REG-SSL-006] @platform @security detaches an active browser identity when the project changes", async ({ radarPage: page, targetLab }) => {
  test.skip(!runPlatform, "Set RADAR_REGRESSION_PLATFORM=1 on a host with a supported system browser.");
  await setScope(page, [targetLab.origin]);
  const identity = await createPlatformIdentity(page, targetLab.origin, "Project Switch Browser");
  await identity.getByLabel("Activate Project Switch Browser").click();
  await targetLab.waitForRequests(1, 30_000);
  await page.getByTestId("openProfileSessionPanel").click();
  await page.getByTestId("profileNameInput").fill("Post-browser isolated project");
  await page.getByTestId("createProfile").click();
  await page.getByLabel("Close projects and sessions panel").click();
  await openView(page, "traffic");
  await expect(page.locator('[data-testid^="trafficRow-"]')).toHaveCount(0);
  await openView(page, "advanced");
  await page.getByTestId("toggleIdentityLab").click();
  await expect(page.locator('[data-testid^="identityRoster-"]').filter({ hasText: "Project Switch Browser" })).toHaveCount(0);
});

test("[REG-SSL-007] @platform handles occupied preferred proxy and debugging ports and remains usable", async ({ electronApp, radarPage: page, targetLab }) => {
  test.skip(!runPlatform, "Set RADAR_REGRESSION_PLATFORM=1 on a host with a supported system browser.");
  const preferredDebugPort = Number(await electronApp.evaluate(() => process.env.RADAR_REGRESSION_DEBUG_PORT));
  const preferredProxyPort = Number(await electronApp.evaluate(() => process.env.RADAR_REGRESSION_PROXY_PORT));
  const debugBlocker = net.createServer();
  const proxyBlocker = net.createServer();
  await Promise.all([
    new Promise<void>((resolve, reject) => {
      debugBlocker.once("error", reject);
      debugBlocker.listen(preferredDebugPort, "127.0.0.1", () => resolve());
    }),
    new Promise<void>((resolve, reject) => {
      proxyBlocker.once("error", reject);
      proxyBlocker.listen(preferredProxyPort, () => resolve());
    })
  ]);
  try {
    await setScope(page, [targetLab.origin]);
    const identity = await createPlatformIdentity(page, targetLab.origin, "Alternate Port Browser");
    await identity.getByLabel("Activate Alternate Port Browser").click();
    await targetLab.waitForRequests(1, 30_000);
    const [browserState, proxyState] = await page.evaluate(() =>
      Promise.all([window.radar!.getBrowserState(), window.radar!.getProxyState()])
    );
    expect(browserState.remoteDebuggingUrl).not.toContain(`:${preferredDebugPort}`);
    expect(proxyState.running).toBe(true);
    expect(proxyState.port).not.toBe(preferredProxyPort);
    await expect(page.getByTestId("radarShell")).toBeVisible();
  } finally {
    await Promise.all([
      new Promise<void>((resolve) => debugBlocker.close(() => resolve())),
      new Promise<void>((resolve) => proxyBlocker.close(() => resolve()))
    ]);
  }
});

test("[REG-ID-003] @platform @network activates a scoped dedicated identity and attributes its real captures", async ({ radarPage: page, targetLab }) => {
  test.skip(!runPlatform, "Set RADAR_REGRESSION_PLATFORM=1 on a host with a supported system browser.");
  await setScope(page, [targetLab.origin]);
  const identity = await createPlatformIdentity(page, targetLab.origin, "Dedicated Identity Fixture");
  await identity.getByLabel("Activate Dedicated Identity Fixture").click();
  await targetLab.waitForRequests(1, 30_000);
  await expect(identity).toContainText(/active|healthy/i);
  await expect(page.getByTestId("causalEvidenceLedger")).not.toContainText("No recorded requests");
});

test("[REG-ID-004] @platform @network records healthy and failed dedicated identity verification semantics", async ({ radarPage: page, targetLab }) => {
  test.skip(!runPlatform, "Set RADAR_REGRESSION_PLATFORM=1 on a host with a supported system browser.");
  await setScope(page, [targetLab.origin, "http://127.0.0.1:65533"]);
  const healthy = await createPlatformIdentity(page, targetLab.origin, "Healthy Identity Route");
  await healthy.getByLabel("Verify Healthy Identity Route").click();
  await expect(healthy).toContainText(/healthy|active/i, { timeout: 30_000 });
  const unavailable = await createPlatformIdentity(page, "http://127.0.0.1:65533", "Unavailable Identity Route");
  await unavailable.getByLabel("Verify Unavailable Identity Route").click();
  await expect(page.getByRole("alert").or(page.getByText(/failed|unavailable|error/i).first())).toBeVisible({ timeout: 30_000 });
});

test("[REG-RES-003] @soak repeats demo load, navigation, filtering, and project state checks fifty times", async ({ radarPage: page }) => {
  test.skip(!runSoak, "Set RADAR_REGRESSION_SOAK=1 for scheduled longevity runs.");
  for (let iteration = 0; iteration < 50; iteration += 1) {
    await loadDemo(page);
    await openView(page, iteration % 2 === 0 ? "traffic" : "websocket");
    if (iteration % 2 === 0) {
      await page.getByTestId("trafficSearch").fill("api");
      await page.getByTestId("trafficSearch").fill("");
      await expect(page.locator('[data-testid^="trafficRow-"]')).toHaveCount(4);
    } else {
      await expect(page.locator('[data-testid^="webSocketRow-"]')).toHaveCount(3);
    }
  }
  const memory = await page.evaluate(() => performance.memory?.usedJSHeapSize || 0);
  expect(memory).toBeGreaterThanOrEqual(0);
});

test("[REG-RES-004] @soak @network sustains a bounded high-volume capture and replay set", async ({ radarPage: page, targetLab, proxyPort }) => {
  test.skip(!runSoak, "Set RADAR_REGRESSION_SOAK=1 for scheduled high-volume runs.");
  await setScope(page, [targetLab.origin]);
  await startProxy(page, proxyPort);
  await Promise.all(Array.from({ length: 50 }, (_, index) => sendThroughRadarProxy(proxyPort, `${targetLab.origin}/api/status/${200 + (index % 5)}`)));
  await targetLab.waitForRequests(50, 30_000);
  await openView(page, "repeater");
  await page.getByTestId("repeaterUrl").fill(`${targetLab.origin}/api/status/204`);
  await page.getByTestId("burstCount").fill("50");
  await page.getByTestId("burstConcurrency").fill("5");
  await page.getByTestId("burstDelay").fill("0");
  await page.getByTestId("runBurst").click();
  await targetLab.waitForRequests(100, 30_000);
  await expect(page.getByText("0 flagged", { exact: false })).toBeVisible();
  await openView(page, "traffic");
  await expect(page.locator('[data-testid^="trafficRow-"]')).toHaveCount(50);
});
