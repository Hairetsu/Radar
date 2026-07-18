import path from "node:path";
import { defineConfig } from "@playwright/test";

const regressionRoot = path.join(process.cwd(), "artifacts", "regression");

export default defineConfig({
  testDir: "./tests/regression",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  timeout: 45_000,
  expect: {
    timeout: 10_000
  },
  outputDir: path.join(regressionRoot, "results"),
  reporter: [
    ["list"],
    ["./tests/regression/reporters/regression-reporter.ts"],
    ["html", { outputFolder: path.join(regressionRoot, "html"), open: "never" }],
    ["json", { outputFile: path.join(regressionRoot, "results.json") }]
  ],
  use: {
    actionTimeout: 10_000,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure"
  }
});
