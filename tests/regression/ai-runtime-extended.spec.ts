import type { Page } from "@playwright/test";
import { configureFixtureAi, expect, launchRadarApplication, loadDemo, openView, setScope, startProxy, test } from "./fixtures";
import { sendThroughRadarProxy } from "./target-lab";

async function startVisibleRun(page: Page, goal: string, profileId?: string) {
  await page.getByTestId("aiFirstMode").click();
  if (profileId) await page.getByTestId("agentProfileSelect").selectOption(profileId);
  await page.getByTestId("agentGoalInput").fill(goal);
  await page.getByTestId("startAgentRun").click();
}

async function expectSelectedRunStatus(page: Page, status: RegExp | string) {
  await expect(page.getByTestId("agentRunSelect").locator("option:checked")).toContainText(status, { timeout: 20_000 });
}

test("[REG-AIF-003] @ai @security enforces visible tool, replay, workflow, capture-sample, and runtime budgets", async ({ radarPage: page, targetLab }) => {
  await loadDemo(page);
  await configureFixtureAi(page, targetLab);
  await setScope(page, [targetLab.origin]);
  const scenarios = [
    { goal: "fixture:budget-steps", profileId: "passive-map", policy: { maxSteps: 1, maxRuntimeMs: 10_000, maxReplay: 0, maxWorkflowRequests: 0, maxCaptureSample: 1 } },
    { goal: `fixture:budget-replay ${targetLab.origin}`, profileId: "advanced-api-review", policy: { maxSteps: 4, maxRuntimeMs: 10_000, maxReplay: 0, maxWorkflowRequests: 1, maxCaptureSample: 1 } },
    { goal: "fixture:budget-workflow", profileId: "advanced-api-review", policy: { maxSteps: 4, maxRuntimeMs: 10_000, maxReplay: 1, maxWorkflowRequests: 0, maxCaptureSample: 1 } },
    { goal: "fixture:runtime-budget", profileId: "passive-map", policy: { maxSteps: 4, maxRuntimeMs: 10_000, maxReplay: 0, maxWorkflowRequests: 0, maxCaptureSample: 1 } }
  ];
  const ids: string[] = [];
  for (const scenario of scenarios) {
    const id = await page.evaluate(async (input) => (await window.radar!.startAgentRun(input)).id, scenario);
    ids.push(id);
    await expect
      .poll(async () => (await page.evaluate((runId) => window.radar!.getAgentRun(runId), id))?.status, { timeout: 15_000 })
      .toMatch(/failed|paused|completed/);
  }
  await page.reload();
  await page.getByTestId("aiFirstMode").click();
  for (const id of ids) {
    await page.getByTestId("agentRunSelect").selectOption(id);
    await expect(page.getByTestId("agentBudgetChips")).toContainText(/steps|replay|workflow|captures|timeout/i);
  }
  const providerBodies = targetLab.requests.filter((request) => request.path === "/v1/chat/completions").map((request) => request.body);
  const plannerPrompts = providerBodies
    .flatMap((body) => {
      const payload = JSON.parse(body) as { messages?: Array<{ content?: string }> };
      return payload.messages?.map((message) => message.content || "") || [];
    })
    .join("\n");
  expect(plannerPrompts).toMatch(/"maxCaptureSample"\s*:\s*1/);
  await page.getByTestId("agentRunSelect").selectOption(ids[1]!);
  await expect(page.getByTestId("agentTimeline")).toContainText(/replay budget/i);
  await page.getByTestId("agentRunSelect").selectOption(ids[2]!);
  await expect(page.getByTestId("agentTimeline")).toContainText(/workflow request budget/i);
  await page.getByTestId("agentRunSelect").selectOption(ids[3]!);
  await expect(page.getByTestId("agentTimeline")).toContainText(/runtime budget|aborted due to timeout/i);
  expect(targetLab.requests.filter((request) => request.path.startsWith("/api/"))).toHaveLength(0);
});

test("[REG-AIF-004] @ai pauses a delayed planner and resumes the same durable run", async ({ radarPage: page, targetLab }) => {
  await configureFixtureAi(page, targetLab);
  await startVisibleRun(page, "fixture:planner-delay pause and resume this deterministic run");
  await expect(page.getByTestId("pauseAgentRun")).toBeEnabled();
  await page.getByTestId("pauseAgentRun").click();
  await expectSelectedRunStatus(page, /PAUSED/);
  const runId = await page.getByTestId("agentRunSelect").inputValue();
  await page.waitForTimeout(1_800);
  await page.getByTestId("resumeAgentRun").click();
  await expectSelectedRunStatus(page, /COMPLETED/);
  await expect(page.getByTestId("agentRunSelect")).toHaveValue(runId);
  await expect(page.getByTestId("agentTimeline")).toContainText(/paused|resume/i);
});

test("[REG-AIF-005] @ai @security keeps a stopped delayed run terminal after its provider response arrives", async ({ radarPage: page, targetLab }) => {
  await configureFixtureAi(page, targetLab);
  await startVisibleRun(page, "fixture:planner-delay stop before the deterministic planner returns");
  await expect(page.getByTestId("stopAgentRun")).toBeEnabled();
  await page.getByTestId("stopAgentRun").click();
  await expectSelectedRunStatus(page, /STOPPED/);
  const timeline = await page.getByTestId("agentTimeline").textContent();
  await page.waitForTimeout(2_000);
  await expectSelectedRunStatus(page, /STOPPED/);
  expect(await page.getByTestId("agentTimeline").textContent()).toBe(timeline);
});

test("[REG-AIF-006] @ai records retry, retry-with-evidence, skip, and stop recovery choices", async ({ radarPage: page, targetLab }) => {
  await configureFixtureAi(page, targetLab);
  for (const action of ["retry-tool", "retry-with-evidence", "skip-and-continue", "stop-run"] as const) {
    await startVisibleRun(page, `fixture:browser-tool-failure exercise ${action}`);
    await expectSelectedRunStatus(page, /PAUSED/);
    await page.getByTestId(`agentRecovery-${action}`).last().click();
    if (action === "skip-and-continue") await expectSelectedRunStatus(page, /COMPLETED/);
    else if (action === "stop-run") await expectSelectedRunStatus(page, /STOPPED/);
    else {
      await expect(page.getByTestId("agentTimeline")).toContainText(/retried|retry/i, { timeout: 15_000 });
      await expectSelectedRunStatus(page, /PAUSED/);
    }
  }
});

test("[REG-AIF-007] @ai creates a low-confidence reviewable finding draft from a failed recovery", async ({ radarPage: page, targetLab }) => {
  await configureFixtureAi(page, targetLab);
  await startVisibleRun(page, "fixture:browser-tool-failure draft a finding from this failed step");
  await expectSelectedRunStatus(page, /PAUSED/);
  await page.getByTestId("agentRecovery-draft-finding").click();
  await expect(page.getByText("Review failed getPageText step", { exact: true })).toBeVisible();
  await expect(page.getByText("low", { exact: true }).first()).toBeVisible();
  await expect(page.getByTestId("agentTimeline")).toContainText("draft finding");
});

test("[REG-AIF-009] @ai @persistence confirms, dismisses, searches, and restores project run memory", async ({ userDataDir, proxyPort, targetLab }, testInfo) => {
  const debugPort = 22_223 + testInfo.workerIndex * 20;
  const firstApp = await launchRadarApplication({ userDataDir, proxyPort, debugPort });
  const first = await firstApp.firstWindow();
  await first.getByTestId("radarShell").waitFor();
  await configureFixtureAi(first, targetLab);
  await startVisibleRun(first, "fixture:memory-proposal confirm this proposal");
  await expectSelectedRunStatus(first, /COMPLETED/);
  await first.locator('[data-testid^="agentMemoryConfirm-"]').click();
  await expect(first.locator('[data-testid^="agentMemory-"]').filter({ hasText: "Fixture proposed memory" })).toBeVisible();
  await startVisibleRun(first, "fixture:memory-proposal dismiss this proposal");
  await expectSelectedRunStatus(first, /COMPLETED/);
  await first.locator('[data-testid^="agentMemoryDismiss-"]').click();
  await first.getByTestId("agentMemoryTitle").fill("Manual restart memory");
  await first.getByTestId("agentMemoryNotes").fill("Durable operator-authored regression memory.");
  await first.getByTestId("agentMemoryCreate").click();
  await first.getByTestId("agentMemorySearch").fill("Manual restart");
  await expect(first.locator('[data-testid^="agentMemory-"]').filter({ hasText: "Manual restart memory" })).toBeVisible();
  await firstApp.close();

  const secondApp = await launchRadarApplication({ userDataDir, proxyPort, debugPort });
  try {
    const second = await secondApp.firstWindow();
    await second.getByTestId("radarShell").waitFor();
    await second.getByTestId("aiFirstMode").click();
    const proposedMemory = second.locator('div[data-testid^="agentMemory-"]').filter({ hasText: "Fixture proposed memory" });
    await expect(proposedMemory).toHaveCount(2);
    await expect(proposedMemory.filter({ hasText: "confirmed" })).toHaveCount(1);
    await expect(proposedMemory.filter({ hasText: "dismissed" })).toHaveCount(1);
    await expect(second.locator('div[data-testid^="agentMemory-"]').filter({ hasText: "Manual restart memory" })).toHaveCount(1);
  } finally {
    await secondApp.close();
  }
});

test("[REG-AIF-010] @ai @security rejects an invisible plugin mutation and creates no side effect", async ({ radarPage: page, targetLab }) => {
  await loadDemo(page);
  await configureFixtureAi(page, targetLab);
  await startVisibleRun(page, "fixture:unsafe-invisible attempt a prohibited background plugin install");
  await expectSelectedRunStatus(page, /FAILED/);
  await expect(page.getByTestId("agentTimeline")).toContainText(/invalid|tool|failed/i);
  await openView(page, "plugins");
  await expect(page.locator('[data-testid^="pluginRow-"]')).toHaveCount(1);
});

test("[REG-AIF-011] @ai steers a paused mission and grants then revokes an exact capability lease", async ({ radarPage: page, targetLab }) => {
  await configureFixtureAi(page, targetLab);
  await setScope(page, [targetLab.origin]);
  await startVisibleRun(page, `fixture:planner-delay ${targetLab.origin} pause for mission steering`, "advanced-api-review");
  await page.getByTestId("pauseAgentRun").click();
  await expectSelectedRunStatus(page, /PAUSED/);
  await page.waitForTimeout(1_800);
  await page.getByTestId("missionNewItemInput").fill("Operator regression hypothesis");
  await page.getByTestId("missionAddItem").click();
  await expect(page.getByTestId("agentMissionGraph")).toContainText("Operator regression hypothesis");
  await page.getByTestId("capabilityTemplateSelect").selectOption("replay");
  await page.getByTestId("capabilityOriginInput").fill(targetLab.origin);
  await page.getByTestId("capabilityPropose").click();
  const lease = page.locator('[data-testid^="capabilityLease-"]').last();
  await expect(lease).toContainText("draft");
  await lease.locator('[data-testid^="capabilityGrant-"]').click();
  await expect(lease).toContainText("granted");
  await lease.locator('[data-testid^="capabilityRevoke-"]').click();
  await expect(lease).toContainText("revoked");
  await expect(lease).toContainText(targetLab.origin);
  await expect(lease).toContainText("sendReplay");
  await expect(page.getByTestId("agentCapabilityLedger")).toContainText("r3");
  await expect(page.getByTestId("capabilityReceipts")).toContainText("No capability decisions recorded");
});

test("[REG-AIF-012] @ai @persistence restores completed, stopped, and failed AI runs after restart", async ({ userDataDir, proxyPort, targetLab }, testInfo) => {
  const debugPort = 22_423 + testInfo.workerIndex * 20;
  const firstApp = await launchRadarApplication({ userDataDir, proxyPort, debugPort });
  const first = await firstApp.firstWindow();
  await first.getByTestId("radarShell").waitFor();
  await configureFixtureAi(first, targetLab);
  await startVisibleRun(first, "Complete this passive persistence run");
  await expectSelectedRunStatus(first, /COMPLETED/);
  await startVisibleRun(first, "fixture:unsafe-invisible persist a failed run");
  await expectSelectedRunStatus(first, /FAILED/);
  await startVisibleRun(first, "fixture:planner-delay persist a stopped run");
  await first.getByTestId("stopAgentRun").click();
  await expectSelectedRunStatus(first, /STOPPED/);
  await firstApp.close();

  const secondApp = await launchRadarApplication({ userDataDir, proxyPort, debugPort });
  try {
    const second = await secondApp.firstWindow();
    await second.getByTestId("radarShell").waitFor();
    await second.getByTestId("aiFirstMode").click();
    await expect(second.getByTestId("agentRunSelect")).toContainText("COMPLETED");
    await expect(second.getByTestId("agentRunSelect")).toContainText("FAILED");
    await expect(second.getByTestId("agentRunSelect")).toContainText("STOPPED");
  } finally {
    await secondApp.close();
  }
});

test("[REG-FIND-009] @ai @security rejects malformed AI finding evidence before it enters the inbox", async ({ radarPage: page, targetLab }) => {
  await loadDemo(page);
  await configureFixtureAi(page, targetLab);
  await startVisibleRun(page, "Return an incomplete finding for REG-FIND-009");
  await expectSelectedRunStatus(page, /FAILED|COMPLETED/);
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
  await startVisibleRun(page, `fixture:intercept-edit ${targetLab.origin}`, "api-hardening");
  await expectSelectedRunStatus(page, /COMPLETED/);
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
  await startVisibleRun(page, "fixture:plugin-safety inspect then attempt plugin operation", "report-from-evidence");
  await expectSelectedRunStatus(page, /FAILED/);
  await expect(page.getByTestId("agentTimeline")).toContainText("getPluginInventory");
  await openView(page, "plugins");
  await expect(page.locator('[data-testid^="pluginRow-"]')).toHaveCount(1);
  await expect(page.getByTestId("pluginAudit")).not.toContainText("/tmp/forbidden");
});

test("[REG-WF-010] @ai @security prepares a visible workflow draft without saving or running it", async ({ radarPage: page, targetLab }) => {
  await configureFixtureAi(page, targetLab);
  await startVisibleRun(page, "fixture:prepare-workflow prepare a review-only workflow", "api-hardening");
  await expectSelectedRunStatus(page, /COMPLETED/);
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
  await startVisibleRun(page, `fixture:run-workflow ${targetLab.origin} capture-id:${captureId}`, "advanced-api-review");
  await expectSelectedRunStatus(page, /PAUSED/);
  await page.getByTestId("capabilityTemplateSelect").selectOption("workflow");
  await page.getByTestId("capabilityOriginInput").fill(targetLab.origin);
  await page.getByTestId("capabilityPropose").click();
  const lease = page.locator('[data-testid^="capabilityLease-"]').last();
  await lease.locator('[data-testid^="capabilityGrant-"]').click();
  await page.getByTestId("agentRecovery-retry-tool").last().click();
  await expectSelectedRunStatus(page, /COMPLETED/);
  await expect(page.getByTestId("agentTimeline")).toContainText("runWorkflow");
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
