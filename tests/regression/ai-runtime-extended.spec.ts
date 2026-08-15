import type { Page } from "@playwright/test";
import { configureFixtureAi, expect, launchRadarApplication, loadDemo, openAiOperatorWindow, openView, setScope, startProxy, test } from "./fixtures";
import { sendThroughRadarProxy } from "./target-lab";

type OperatorPanel = "inspector" | "runs";

const operatorPanels: Record<OperatorPanel, { panelTestId: string; toggleTestId: string }> = {
  inspector: { panelTestId: "aiMissionInspector", toggleTestId: "toggleAiInspector" },
  runs: { panelTestId: "aiRunRail", toggleTestId: "toggleAiRunRail" }
};

async function setOperatorPanel(page: Page, panel: OperatorPanel, open: boolean) {
  const definition = operatorPanels[panel];
  const toggle = page.getByTestId(definition.toggleTestId);
  const expanded = await toggle.getAttribute("aria-expanded");
  if ((expanded === "true") !== open) {
    await toggle.click();
  }
  await expect(toggle).toHaveAttribute("aria-expanded", String(open));
  if (open) {
    await expect(page.getByTestId(definition.panelTestId)).toBeVisible();
  } else {
    await expect(page.getByTestId(definition.panelTestId)).toHaveCount(0);
  }
}

async function closeOperatorPanels(page: Page) {
  await setOperatorPanel(page, "runs", false);
  await setOperatorPanel(page, "inspector", false);
}

async function openInspectorTab(page: Page, tab: "authority" | "memory" | "mission") {
  await setOperatorPanel(page, "inspector", true);
  const tabButton = page.getByTestId(`aiInspector-${tab}`);
  await tabButton.click();
  await expect(tabButton).toHaveAttribute("aria-pressed", "true");
}

async function selectVisibleRun(page: Page, runId: string) {
  await setOperatorPanel(page, "runs", true);
  await page.getByTestId(`aiRun-${runId}`).click();
  if (!(await page.getByTestId("capabilityPermissionBackdrop").isVisible())) {
    await setOperatorPanel(page, "runs", false);
  }
}

async function grantPendingCapability(page: Page) {
  await expect(page.getByTestId("agentCapabilityReview")).toBeVisible();
  await page.getByTestId("capabilityPermissionGrant").click();
  await expect(page.getByTestId("capabilityPermissionBackdrop")).toHaveCount(0);
}

async function startVisibleRun(page: Page, goal: string, profileId?: string) {
  const operator = await openAiOperatorWindow(page);
  await closeOperatorPanels(operator);
  if (!(await operator.getByTestId("startAgentRun").isVisible())) {
    await setOperatorPanel(operator, "runs", true);
    await operator.getByTestId("newAiMission").click();
    await setOperatorPanel(operator, "runs", false);
  }
  await expect(operator.getByTestId("startAgentRun")).toBeVisible();
  if (profileId) await operator.getByTestId("agentProfileSelect").selectOption(profileId);
  await operator.getByTestId("agentGoalInput").fill(goal);
  await operator.getByTestId("startAgentRun").click();
  return operator;
}

async function expectSelectedRunStatus(page: Page, status: RegExp | string) {
  const pattern = typeof status === "string"
    ? new RegExp(status, "i")
    : new RegExp(status.source, status.flags.includes("i") ? status.flags : `${status.flags}i`);
  await expect(page.getByTestId("aiOperatorComposer")).toContainText(pattern, { timeout: 20_000 });
}

async function selectedRunId(page: Page) {
  await setOperatorPanel(page, "runs", true);
  const selectedRun = page.locator('[data-testid^="aiRun-"][data-selected="true"]');
  await expect(selectedRun).toBeVisible();
  const testId = await selectedRun.getAttribute("data-testid");
  await setOperatorPanel(page, "runs", false);
  return testId?.replace("aiRun-", "") || "";
}

test("[REG-AIF-003] @ai @security enforces visible tool, replay, workflow, and capture-sample budgets without charging planner wait time", async ({ radarPage: page, targetLab }) => {
  test.setTimeout(90_000);
  await loadDemo(page);
  const operator = await configureFixtureAi(page, targetLab);
  await setScope(page, [targetLab.origin]);
  const scenarios = [
    { goal: "fixture:budget-steps", profileId: "passive-map", policy: { maxSteps: 1, maxRuntimeMs: 10_000, maxReplay: 0, maxWorkflowRequests: 0, maxCaptureSample: 1 } },
    { goal: `fixture:budget-replay ${targetLab.origin}`, profileId: "advanced-api-review", policy: { maxSteps: 4, maxRuntimeMs: 10_000, maxReplay: 0, maxWorkflowRequests: 1, maxCaptureSample: 1 } },
    { goal: "fixture:budget-workflow", profileId: "advanced-api-review", policy: { maxSteps: 4, maxRuntimeMs: 10_000, maxReplay: 1, maxWorkflowRequests: 0, maxCaptureSample: 1 } },
    { goal: "fixture:planner-budget-delay", profileId: "passive-map", policy: { maxSteps: 4, maxRuntimeMs: 10_000, maxReplay: 0, maxWorkflowRequests: 0, maxCaptureSample: 1 } }
  ];
  const ids: string[] = [];
  for (const scenario of scenarios) {
    const id = await operator.evaluate(async (input) => (await window.radarOperator!.startAgentRun(input)).id, scenario);
    ids.push(id);
    await expect
      .poll(async () => (await operator.evaluate((runId) => window.radarOperator!.getAgentRun(runId), id))?.status, { timeout: 15_000 })
      .toMatch(/failed|paused|completed/);
    const status = await operator.evaluate((runId) => window.radarOperator!.getAgentRun(runId).then((run) => run?.status), id);
    if (status === "paused") {
      await selectVisibleRun(operator, id);
      if (await operator.getByTestId("capabilityPermissionBackdrop").isVisible()) {
        await grantPendingCapability(operator);
        await setOperatorPanel(operator, "runs", false);
        await operator.getByTestId("resumeAgentRun").click();
        await expect
          .poll(async () => (await operator.evaluate((runId) => window.radarOperator!.getAgentRun(runId), id))?.status, { timeout: 15_000 })
          .toMatch(/failed|paused|completed/);
      }
    }
  }
  await operator.reload();
  await operator.getByTestId("aiOperatorShell").waitFor();
  for (const id of ids) {
    await selectVisibleRun(operator, id);
    await expect(operator.getByTestId("aiOperatorComposer")).toContainText(/steps|replay|workflow|captures|timeout/i);
  }
  const providerBodies = targetLab.requests.filter((request) => request.path === "/v1/chat/completions").map((request) => request.body);
  const plannerPrompts = providerBodies
    .flatMap((body) => {
      const payload = JSON.parse(body) as { messages?: Array<{ content?: string }> };
      return payload.messages?.map((message) => message.content || "") || [];
    })
    .join("\n");
  expect(plannerPrompts).toMatch(/"maxCaptureSample"\s*:\s*1/);
  await selectVisibleRun(operator, ids[1]!);
  await expect(operator.getByTestId("agentTimeline")).toContainText(/replay budget/i);
  await selectVisibleRun(operator, ids[2]!);
  await expect(operator.getByTestId("agentTimeline")).toContainText(/workflow request budget/i);
  await selectVisibleRun(operator, ids[3]!);
  await expect(operator.getByTestId("agentTimeline")).toContainText("Deterministic passive review complete");
  await expect(operator.getByTestId("agentTimeline")).not.toContainText(/runtime budget|aborted due to timeout/i);
  expect(targetLab.requests.filter((request) => request.path.startsWith("/api/"))).toHaveLength(0);
});

test("[REG-AIF-004] @ai pauses a delayed planner and resumes the same durable run", async ({ radarPage: page, targetLab }) => {
  await configureFixtureAi(page, targetLab);
  const operator = await startVisibleRun(page, "fixture:planner-delay pause and resume this deterministic run");
  await expect(operator.getByTestId("pauseAgentRun")).toBeEnabled();
  await operator.getByTestId("pauseAgentRun").click();
  await expectSelectedRunStatus(operator, /PAUSED/);
  const runId = await selectedRunId(operator);
  await operator.waitForTimeout(1_800);
  await operator.getByTestId("resumeAgentRun").click();
  await expectSelectedRunStatus(operator, /COMPLETED/);
  expect(await selectedRunId(operator)).toBe(runId);
  await expect(operator.getByTestId("agentTimeline")).toContainText(/paused|resume/i);
});

test("[REG-AIF-005] @ai @security keeps a stopped delayed run terminal after its provider response arrives", async ({ radarPage: page, targetLab }) => {
  await configureFixtureAi(page, targetLab);
  const operator = await startVisibleRun(page, "fixture:planner-delay stop before the deterministic planner returns");
  await expect(operator.getByTestId("stopAgentRun")).toBeEnabled();
  await operator.getByTestId("stopAgentRun").click();
  await expectSelectedRunStatus(operator, /STOPPED/);
  const timeline = await operator.getByTestId("agentTimeline").textContent();
  await operator.waitForTimeout(2_000);
  await expectSelectedRunStatus(operator, /STOPPED/);
  expect(await operator.getByTestId("agentTimeline").textContent()).toBe(timeline);
});

test("[REG-AIF-006] @ai records retry, retry-with-evidence, skip, and stop recovery choices", async ({ radarPage: page, targetLab }) => {
  test.setTimeout(90_000);
  await configureFixtureAi(page, targetLab);
  for (const action of ["retry-tool", "retry-with-evidence", "skip-and-continue", "stop-run"] as const) {
    const operator = await startVisibleRun(page, `fixture:browser-tool-failure exercise ${action}`);
    await expectSelectedRunStatus(operator, /PAUSED/);
    await operator.getByTestId(`agentRecovery-${action}`).last().click();
    if (action === "skip-and-continue") await expectSelectedRunStatus(operator, /COMPLETED/);
    else if (action === "stop-run") await expectSelectedRunStatus(operator, /STOPPED/);
    else {
      await expect(operator.getByTestId("agentTimeline")).toContainText(/retried|retry/i, { timeout: 15_000 });
      await expectSelectedRunStatus(operator, /PAUSED/);
    }
  }
});

test("[REG-AIF-007] @ai creates a low-confidence reviewable finding draft from a failed recovery", async ({ radarPage: page, targetLab }) => {
  await configureFixtureAi(page, targetLab);
  const operator = await startVisibleRun(page, "fixture:browser-tool-failure draft a finding from this failed step");
  await expectSelectedRunStatus(operator, /PAUSED/);
  await operator.getByTestId("agentRecovery-draft-finding").click();
  await expect(operator.getByText("Review failed getPageText step", { exact: true })).toBeVisible();
  await expect(operator.getByText("low", { exact: true }).first()).toBeVisible();
  await expect(operator.getByTestId("agentTimeline")).toContainText("draft finding");
});

test("[REG-AIF-009] @ai @persistence confirms, dismisses, searches, and restores project run memory", async ({ userDataDir, proxyPort, targetLab }, testInfo) => {
  const debugPort = 22_223 + testInfo.workerIndex * 20;
  const firstApp = await launchRadarApplication({ userDataDir, proxyPort, debugPort });
  const first = await firstApp.firstWindow();
  await first.getByTestId("radarShell").waitFor();
  await configureFixtureAi(first, targetLab);
  const firstOperator = await startVisibleRun(first, "fixture:memory-proposal confirm this proposal");
  await expectSelectedRunStatus(firstOperator, /COMPLETED/);
  await firstOperator.locator('[data-testid^="agentMemoryConfirm-"]').click();
  await openInspectorTab(firstOperator, "memory");
  await expect(firstOperator.locator('[data-testid^="agentMemory-"]').filter({ hasText: "Fixture proposed memory" })).toBeVisible();
  await startVisibleRun(first, "fixture:memory-proposal dismiss this proposal");
  await expectSelectedRunStatus(firstOperator, /COMPLETED/);
  await firstOperator.locator('[data-testid^="agentMemoryDismiss-"]').click();
  await openInspectorTab(firstOperator, "memory");
  await firstOperator.getByTestId("agentMemoryTitle").fill("Manual restart memory");
  await firstOperator.getByTestId("agentMemoryNotes").fill("Durable operator-authored regression memory.");
  await firstOperator.getByTestId("agentMemoryCreate").click();
  await firstOperator.getByTestId("agentMemorySearch").fill("Manual restart");
  await expect(firstOperator.locator('[data-testid^="agentMemory-"]').filter({ hasText: "Manual restart memory" })).toBeVisible();
  await firstApp.close();

  const secondApp = await launchRadarApplication({ userDataDir, proxyPort, debugPort });
  try {
    const second = await secondApp.firstWindow();
    await second.getByTestId("radarShell").waitFor();
    const secondOperator = await openAiOperatorWindow(second);
    await openInspectorTab(secondOperator, "memory");
    const proposedMemory = secondOperator.locator('article[data-testid^="agentMemory-"]').filter({ hasText: "Fixture proposed memory" });
    await expect(proposedMemory).toHaveCount(2);
    await expect(proposedMemory.filter({ hasText: "confirmed" })).toHaveCount(1);
    await expect(proposedMemory.filter({ hasText: "dismissed" })).toHaveCount(1);
    await expect(secondOperator.locator('article[data-testid^="agentMemory-"]').filter({ hasText: "Manual restart memory" })).toHaveCount(1);
  } finally {
    await secondApp.close();
  }
});

test("[REG-AIF-010] @ai @security rejects an invisible plugin mutation and creates no side effect", async ({ radarPage: page, targetLab }) => {
  await loadDemo(page);
  await configureFixtureAi(page, targetLab);
  const operator = await startVisibleRun(page, "fixture:unsafe-invisible attempt a prohibited background plugin install");
  await expectSelectedRunStatus(operator, /FAILED/);
  await expect(operator.getByTestId("agentTimeline")).toContainText(/invalid|tool|failed/i);
  await openView(page, "plugins");
  await expect(page.locator('[data-testid^="pluginRow-"]')).toHaveCount(1);
});

test("[REG-AIF-011] @ai steers a paused mission and grants then revokes an exact capability lease", async ({ radarPage: page, targetLab }) => {
  await configureFixtureAi(page, targetLab);
  await setScope(page, [targetLab.origin]);
  const operator = await startVisibleRun(page, `fixture:planner-delay ${targetLab.origin} pause for mission steering`, "advanced-api-review");
  await operator.getByTestId("pauseAgentRun").click();
  await expectSelectedRunStatus(operator, /PAUSED/);
  await operator.waitForTimeout(1_800);
  await openInspectorTab(operator, "mission");
  await operator.getByTestId("missionNewItemInput").fill("Operator regression hypothesis");
  await operator.getByTestId("missionAddItem").click();
  await expect(operator.getByTestId("agentMissionGraph")).toContainText("Operator regression hypothesis");
  await operator.getByTestId("aiInspector-authority").click();
  await operator.getByTestId("capabilityTemplateSelect").selectOption("replay");
  await operator.getByTestId("capabilityOriginInput").fill(targetLab.origin);
  await operator.getByTestId("capabilityPropose").click();
  const lease = operator.locator('[data-testid^="capabilityLease-"]').last();
  await expect(lease).toContainText("draft");
  await grantPendingCapability(operator);
  await expect(lease).toContainText("granted");
  await lease.locator('[data-testid^="capabilityRevoke-"]').click();
  await expect(lease).toContainText("revoked");
  await expect(lease).toContainText(targetLab.origin);
  await expect(lease).toContainText("sendReplay");
  await expect(operator.getByTestId("agentCapabilityLedger")).toContainText("r3");
  await expect(operator.getByTestId("capabilityReceipts")).toContainText("No capability decisions recorded");
});

test("[REG-AIF-012] @ai @persistence restores completed, stopped, and failed AI runs after restart", async ({ userDataDir, proxyPort, targetLab }, testInfo) => {
  const debugPort = 22_423 + testInfo.workerIndex * 20;
  const firstApp = await launchRadarApplication({ userDataDir, proxyPort, debugPort });
  const first = await firstApp.firstWindow();
  await first.getByTestId("radarShell").waitFor();
  await configureFixtureAi(first, targetLab);
  const firstOperator = await startVisibleRun(first, "Complete this passive persistence run");
  await expectSelectedRunStatus(firstOperator, /COMPLETED/);
  await startVisibleRun(first, "fixture:unsafe-invisible persist a failed run");
  await expectSelectedRunStatus(firstOperator, /FAILED/);
  await startVisibleRun(first, "fixture:planner-delay persist a stopped run");
  await firstOperator.getByTestId("stopAgentRun").click();
  await expectSelectedRunStatus(firstOperator, /STOPPED/);
  await firstApp.close();

  const secondApp = await launchRadarApplication({ userDataDir, proxyPort, debugPort });
  try {
    const second = await secondApp.firstWindow();
    await second.getByTestId("radarShell").waitFor();
    const secondOperator = await openAiOperatorWindow(second);
    await setOperatorPanel(secondOperator, "runs", true);
    await expect(secondOperator.getByTestId("aiRunRail")).toContainText("completed");
    await expect(secondOperator.getByTestId("aiRunRail")).toContainText("failed");
    await expect(secondOperator.getByTestId("aiRunRail")).toContainText("stopped");
  } finally {
    await secondApp.close();
  }
});

test("[REG-FIND-009] @ai @security rejects malformed AI finding evidence before it enters the inbox", async ({ radarPage: page, targetLab }) => {
  await loadDemo(page);
  await configureFixtureAi(page, targetLab);
  const operator = await startVisibleRun(page, "Return an incomplete finding for REG-FIND-009");
  await expectSelectedRunStatus(operator, /FAILED|COMPLETED/);
  await openView(page, "findings");
  await expect(page.getByText("Incomplete fixture finding", { exact: true })).toHaveCount(0);
});

test("[REG-INT-008] @ai @network @security prepares a visible intercept edit while leaving the request paused", async ({ radarPage: page, targetLab, proxyPort }) => {
  await setScope(page, [targetLab.origin]);
  await configureFixtureAi(page, targetLab);
  await startProxy(page, proxyPort);
  await openView(page, "intercept");
  await page.getByTestId("toggleRequestIntercept").click();
  const pending = sendThroughRadarProxy(proxyPort, `${targetLab.origin}/api/echo?fixture=ai-intercept`).catch(() => null);
  await expect(page.locator('[data-testid^="interceptRow-"]')).toHaveCount(1);
  const operator = await startVisibleRun(page, `fixture:intercept-edit ${targetLab.origin}`, "api-hardening");
  await expectSelectedRunStatus(operator, /COMPLETED/);
  await openView(page, "intercept");
  await expect(page.getByTestId("interceptMethod")).toHaveValue("POST");
  await expect(page.getByTestId("interceptHeaders")).toContainText("x-ai-prepared");
  expect(targetLab.requests.filter((request) => request.path.startsWith("/api/"))).toHaveLength(0);
  await page.getByTestId("dropIntercept").click();
  await pending;
});

test("[REG-PLUG-010] @ai @security reads plugin inventory but rejects a requested install mutation", async ({ radarPage: page, targetLab }) => {
  await loadDemo(page);
  await configureFixtureAi(page, targetLab);
  const operator = await startVisibleRun(page, "fixture:plugin-safety inspect then attempt plugin operation", "report-from-evidence");
  await expectSelectedRunStatus(operator, /FAILED/);
  await expect(operator.getByTestId("agentTimeline")).toContainText("getPluginInventory");
  await openView(page, "plugins");
  await expect(page.locator('[data-testid^="pluginRow-"]')).toHaveCount(1);
  await expect(page.getByTestId("pluginAudit")).not.toContainText("/tmp/forbidden");
});

test("[REG-WF-010] @ai @security prepares a visible workflow draft without saving or running it", async ({ radarPage: page, targetLab }) => {
  await configureFixtureAi(page, targetLab);
  const operator = await startVisibleRun(page, "fixture:prepare-workflow prepare a review-only workflow", "api-hardening");
  await expectSelectedRunStatus(operator, /COMPLETED/);
  await expect(page.getByTestId("view-workflows")).toHaveAttribute("aria-current", "page");
  await expect(page.getByTestId("workflowDefinition")).toHaveValue(/Fixture AI Prepared Workflow/);
  await expect(page.getByTestId("workflowRunHistory")).not.toContainText("Fixture AI Prepared Workflow");
  await expect(page.getByTestId("workflowCatalog")).not.toContainText("Fixture AI Prepared Workflow");
});

test("[REG-WF-011] @ai @network @security reuses the normal workflow contract after an exact capability grant", async ({ radarPage: page, targetLab, proxyPort }) => {
  await configureFixtureAi(page, targetLab);
  await setScope(page, [targetLab.origin]);
  await startProxy(page, proxyPort);
  await sendThroughRadarProxy(proxyPort, `${targetLab.origin}/api/account`, {
    headers: { authorization: "Bearer fixture-token" }
  });
  await targetLab.waitForRequests(2);
  await openView(page, "traffic");
  const sourceRow = page.locator('[data-testid^="trafficRow-"]').filter({ hasText: "/api/account" });
  await expect(sourceRow).toBeVisible();
  const rowTestId = await sourceRow.getAttribute("data-testid");
  const captureId = rowTestId?.replace("trafficRow-", "") || "";
  expect(captureId).not.toBe("");
  const operator = await startVisibleRun(page, `fixture:run-workflow ${targetLab.origin} capture-id:${captureId}`, "advanced-api-review");
  await expectSelectedRunStatus(operator, /PAUSED/);
  await expect(operator.getByTestId("agentCapabilityReview")).toContainText(targetLab.origin);
  await expect(operator.getByTestId("agentCapabilityReview")).toContainText("runWorkflow");
  await grantPendingCapability(operator);
  await operator.getByTestId("resumeAgentRun").click();
  await expectSelectedRunStatus(operator, /COMPLETED/);
  await expect(operator.getByTestId("agentTimeline")).toContainText("runWorkflow");
  await openView(page, "workflows");
  await expect(page.getByTestId("workflowRunHistory")).toContainText("Unauthenticated Access Check");
});

test("[REG-ID-007] @ai @security keeps identity-adjacent raw capture secrets opt-in", async ({ radarPage: page, targetLab }) => {
  await loadDemo(page);
  await configureFixtureAi(page, targetLab);
  await openView(page, "traffic");
  await page.getByTestId("trafficRow-demo-cap-account").click();
  await openView(page, "advanced");
  await page.getByTestId("toggleIdentityLab").click();
  await page.getByTestId("openAiPalette").click();
  await page.getByTestId("aiPreviewContext").click();
  await expect(page.getByTestId("aiContextPreview")).not.toContainText("demo-operator-token");
  await page.getByTestId("aiIncludeRaw").check();
  await page.getByTestId("aiPreviewContext").click();
  await expect(page.getByTestId("aiContextPreview")).toContainText(/raw/i);
  await expect(page.getByTestId("aiContextPreview")).toContainText("demo-operator-token");
});
