import { configureFixtureAi, expect, loadDemo, openAiOperatorWindow, test } from "./fixtures";

test("[REG-AIOP-001] @ai @smoke reuses one independently sized AI Operator window", async ({ electronApp, radarPage: workspace }) => {
  const operator = await openAiOperatorWindow(workspace);
  await expect(operator.getByTestId("aiOperatorShell")).toBeVisible();
  await workspace.getByTestId("openAiOperatorSidebar").click();
  expect(workspace.context().pages().filter((page) => page.url().includes("surface=ai-operator"))).toHaveLength(1);

  const preferences = await electronApp.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows().find((candidate) => candidate.webContents.getURL().includes("surface=ai-operator"));
    return window ? {
      minimum: window.getMinimumSize(),
      alwaysOnTop: window.isAlwaysOnTop(),
      parent: Boolean(window.getParentWindow()),
      webPreferences: window.webContents.getLastWebPreferences()
    } : null;
  });
  expect(preferences?.minimum).toEqual([760, 640]);
  expect(preferences?.alwaysOnTop).toBe(false);
  expect(preferences?.parent).toBe(false);
  expect(preferences?.webPreferences.nodeIntegration).toBe(false);
  expect(preferences?.webPreferences.contextIsolation).toBe(true);
  expect(preferences?.webPreferences.webviewTag).toBe(false);

  await workspace.getByTestId("openAppearanceSettings").click();
  await workspace.getByTestId("themeOption-vellum").click();
  await expect.poll(() => operator.evaluate(() => document.documentElement.dataset.theme)).toBe("vellum");
  await workspace.getByLabel("Close appearance settings").click();
});

test("[REG-AIOP-002] @ai hides and restores the companion while main safety controls remain", async ({ electronApp, radarPage: workspace, targetLab }) => {
  await configureFixtureAi(workspace, targetLab);
  const operator = await openAiOperatorWindow(workspace);
  await operator.getByTestId("agentGoalInput").fill("fixture:planner-delay keep controls visible while hidden");
  await operator.getByTestId("startAgentRun").click();
  await expect(workspace.getByTestId("agentMissionBar")).toBeVisible();
  await expect(workspace.getByTestId("missionPauseAgentRun")).toBeVisible();

  await electronApp.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows().find((candidate) => candidate.webContents.getURL().includes("surface=ai-operator"))?.close();
  });
  await expect(workspace.getByTestId("openAiOperatorSidebar")).toContainText("launch");
  await expect(workspace.getByTestId("agentMissionBar")).toBeVisible();

  const reopened = await openAiOperatorWindow(workspace);
  await expect(reopened.getByTestId("agentTimeline")).toBeVisible();
  await reopened.getByTestId("stopAgentRun").click();
  await expect(reopened.getByTestId("aiOperatorComposer")).toContainText("stopped");
});

test("[REG-AIOP-003] @ai @security pauses durably before returning to Manual-First", async ({ radarPage: workspace, targetLab }) => {
  await loadDemo(workspace);
  await configureFixtureAi(workspace, targetLab);
  const operator = await openAiOperatorWindow(workspace);
  await operator.getByTestId("agentGoalInput").fill("fixture:planner-delay checkpoint before manual control");
  await operator.getByTestId("startAgentRun").click();
  await expect(operator.getByTestId("returnToManual")).toBeVisible();
  await operator.getByTestId("returnToManual").click();

  await expect(operator.getByTestId("aiOperatorHeader")).toContainText("manual-first");
  await expect(operator.getByTestId("aiOperatorComposer")).toContainText("paused");
  await expect(workspace.getByTestId("agentMissionBar")).toContainText("paused");
});
