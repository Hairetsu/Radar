import fs from "node:fs";
import { test, expect } from "./fixtures";

test("[REG-APP-002] @core @security each worker receives isolated Radar data and service ports", async ({ electronApp, radarPage }) => {
  const runtime = await electronApp.evaluate(async ({ app }) => ({
    userData: app.getPath("userData"),
    proxyPort: process.env.RADAR_REGRESSION_PROXY_PORT,
    debugPort: process.env.RADAR_REGRESSION_DEBUG_PORT
  }));

  expect(runtime.userData).toContain("radar-regression-");
  expect(fs.existsSync(runtime.userData)).toBe(true);
  expect(Number(runtime.proxyPort)).toBeGreaterThan(10_000);
  expect(Number(runtime.debugPort)).toBeGreaterThan(10_000);
  await expect(radarPage.getByTestId("radarShell")).toBeVisible();
});
