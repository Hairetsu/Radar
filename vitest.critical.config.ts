import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: [
      "electron/agent/**/*.test.ts",
      "electron/browser/chromeCaptureObserver.test.ts",
      "electron/browser/electronDebuggerCapture.test.ts",
      "electron/browser/cdpClient.test.ts",
      "electron/browser/managedBrowser.test.ts",
      "electron/browser/playwright*.test.ts",
      "electron/playwrightBrowser.test.ts",
      "electron/capture/**/*.test.ts",
      "electron/intercept/**/*.test.ts",
      "electron/proxy/**/*.test.ts",
      "src/hooks/workbench/agent/**/*.test.ts"
    ],
    setupFiles: ["src/test/setup.ts"],
    coverage: {
      provider: "v8",
      reportsDirectory: "coverage/critical",
      include: [
        "electron/agent/**/*.ts",
        "electron/browser/*Capture*.ts",
        "electron/browser/cdpClient.ts",
        "electron/browser/managedBrowser.ts",
        "electron/browser/playwright*.ts",
        "electron/playwrightBrowser.ts",
        "electron/capture/**/*.ts",
        "electron/intercept/**/*.ts",
        "electron/proxy/**/*.ts",
        "src/hooks/workbench/agent/**/*.ts"
      ],
      exclude: ["**/*.test.ts"],
      thresholds: {
        lines: 74,
        functions: 77,
        branches: 55,
        statements: 73
      }
    }
  }
});
