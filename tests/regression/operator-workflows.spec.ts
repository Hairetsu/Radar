import { expect, loadDemo, openView, test } from "./fixtures";

test.describe("Manual-First operator workflows", () => {
  test("[REG-HTTP-009] @smoke @core loads demo evidence, filters traffic, and clones a request to Repeater", async ({ radarPage: page }) => {
    await loadDemo(page);

    await expect(page.locator('[data-testid^="trafficRow-"]')).not.toHaveCount(0);
    await page.getByTestId("trafficSearch").fill("auth");
    await expect(page.locator('[data-testid^="trafficRow-"]')).not.toHaveCount(0);
    await page.locator('[data-testid^="trafficRow-"]').first().click();
    await expect(page.getByTestId("trafficDetailText")).toContainText(/http|request|authorization/i);
    await page.getByTestId("cloneToRepeater").click();

    await expect(page.getByTestId("repeaterUrl")).not.toHaveValue("");
    await expect(page.getByTestId("repeaterHeaders")).not.toHaveValue("");
  });

});

test.describe("Workbench coverage", () => {
  test("[REG-APP-004] @smoke @core renders every primary workbench view with demo state", async ({ radarPage: page }) => {
    await loadDemo(page);
    const views = [
      "traffic", "websocket", "intercept", "repeater", "automate", "findings",
      "workflows", "plugins", "advanced", "sitemap", "scope", "ssl"
    ];

    for (const view of views) {
      await test.step(`open ${view}`, async () => {
        await openView(page, view);
        await expect(page.getByTestId("radarShell")).toBeVisible();
      });
    }
  });
});
