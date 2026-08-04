import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import {
  _electron as electron,
  test as base,
  expect,
  type ElectronApplication,
  type Page
} from "@playwright/test";
import { startTargetLab, type TargetLab } from "./target-lab";

type RadarFixtures = {
  electronApp: ElectronApplication;
  radarPage: Page;
  targetLab: TargetLab;
  proxyPort: number;
  userDataDir: string;
};

export function launchRadarApplication({
  userDataDir,
  proxyPort,
  debugPort
}: {
  userDataDir: string;
  proxyPort: number;
  debugPort: number;
}) {
  return electron.launch({
    args: [path.join(process.cwd(), "dist-electron", "electron", "main.js")],
    env: {
      ...process.env,
      RADAR_REGRESSION_USER_DATA_DIR: userDataDir,
      RADAR_REGRESSION_ARTIFACT_DIR: path.join(userDataDir, "regression-artifacts"),
      RADAR_REGRESSION_PROXY_PORT: String(proxyPort),
      RADAR_REGRESSION_DEBUG_PORT: String(debugPort)
    },
    timeout: 30_000
  });
}

export const test = base.extend<RadarFixtures>({
  userDataDir: async ({}, use, testInfo) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), `radar-regression-${testInfo.workerIndex}-`));
    await use(directory);
    fs.rmSync(directory, { recursive: true, force: true });
  },

  proxyPort: async ({}, use, testInfo) => {
    await use(18_088 + testInfo.workerIndex * 20);
  },

  electronApp: async ({ userDataDir, proxyPort }, use, testInfo) => {
    const portOffset = testInfo.workerIndex * 20;
    const startupStartedAt = Date.now();
    const application = await launchRadarApplication({
      userDataDir,
      proxyPort,
      debugPort: 19_223 + portOffset
    });
    const startupPage = await application.firstWindow();
    await startupPage.getByTestId("radarShell").waitFor();
    testInfo.annotations.push({ type: "radar-startup-ms", description: String(Date.now() - startupStartedAt) });

    try {
      await use(application);
    } finally {
      await Promise.all(
        application.windows().map((page) =>
          page.evaluate(() => window.radar?.stopProxy()).catch(() => undefined)
        )
      );
      await application.close();
    }
  },

  radarPage: async ({ electronApp }, use) => {
    const page = await electronApp.firstWindow();
    await page.getByTestId("radarShell").waitFor();
    await use(page);
  },

  targetLab: async ({}, use) => {
    const lab = await startTargetLab();
    await use(lab);
    await lab.close();
  }
});

export { expect };

export async function loadDemo(page: Page) {
  await page.getByTestId("openProfileSessionPanel").click();
  await page.getByTestId("profileSessionPanel").waitFor();
  await page.getByTestId("seedDemoProject").click();
  await expect(page.getByText("Demo project loaded", { exact: false })).toBeVisible();
  await page.getByLabel("Close projects and sessions panel").click();
}

export async function openView(page: Page, view: string) {
  await page.getByTestId(`view-${view}`).click();
  await expect(page.getByTestId(`view-${view}`)).toHaveAttribute("aria-current", "page");
}

export async function setScope(page: Page, targets: string[]) {
  await openView(page, "scope");
  await page.getByTestId("scopeTargetList").fill(targets.join("\n"));
  await page.getByTestId("commitTargets").click();
  await expect(page.getByText("Targets saved", { exact: true }).first()).toBeVisible();
}

export async function startProxy(page: Page, proxyPort: number) {
  await openView(page, "ssl");
  await page.getByTestId("startProxy").click();
  const startedAt = Date.now();
  while (Date.now() - startedAt < 30_000) {
    const open = await new Promise<boolean>((resolve) => {
      const socket = net.createConnection({ host: "127.0.0.1", port: proxyPort });
      socket.once("connect", () => {
        socket.destroy();
        resolve(true);
      });
      socket.once("error", () => resolve(false));
    });
    if (open) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Radar proxy did not listen on 127.0.0.1:${proxyPort}.`);
}

export async function openAiOperatorWindow(page: Page, section: "runs" | "settings" = "runs") {
  const context = page.context();
  let operator = context.pages().find((candidate) => candidate.url().includes("surface=ai-operator"));
  const launch = page.getByTestId(section === "settings" ? "openAiSettings" : "openAiOperatorSidebar");
  if (!operator) {
    const opened = context.waitForEvent("page");
    await launch.click();
    operator = await opened;
  } else {
    await launch.click();
  }
  await operator.getByTestId("aiOperatorShell").waitFor();
  if (section === "settings") {
    await expect(operator.getByTestId("aiOperatorConnectionPanel")).toBeVisible();
  } else if (await operator.getByTestId("aiOperatorConnectionPanel").isVisible().catch(() => false)) {
    await operator.getByTestId("aiOperatorSettings").click();
  }
  return operator;
}

export async function configureFixtureAi(page: Page, targetLab: TargetLab) {
  const operator = await openAiOperatorWindow(page, "settings");
  await operator.getByTestId("aiProvider").selectOption("openai-compatible");
  await operator.getByTestId("aiApiKey").fill("radar-fixture-key");
  await operator.getByTestId("aiBaseUrl").fill(`${targetLab.origin}/v1`);
  await operator.getByTestId("aiSaveSettings").click();
  await expect(operator.getByTestId("aiConnectionStatus")).toContainText("Connected");
  await expect(operator.getByTestId("aiModel")).toHaveValue("radar-fixture-model");
  await operator.getByTestId("aiOperatorSettings").click();
  return operator;
}
