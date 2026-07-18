import { expect, launchRadarApplication, loadDemo, openView, test } from "./fixtures";

test("[REG-PROJ-001] @core @persistence creates, renames, and restores an independent project", async ({
  userDataDir,
  proxyPort
}, testInfo) => {
  const debugPort = 20_423 + testInfo.workerIndex * 20;
  const firstApp = await launchRadarApplication({ userDataDir, proxyPort, debugPort });
  const first = await firstApp.firstWindow();
  await first.getByTestId("radarShell").waitFor();
  await first.getByTestId("openProfileSessionPanel").click();
  await first.getByTestId("profileNameInput").fill("Regression Client Project");
  await first.getByTestId("createProfile").click();
  await expect(first.getByText("Project opened: Regression Client Project", { exact: true })).toBeVisible();
  await first.getByTestId("profileNameInput").fill("Regression Client Renamed");
  await first.getByTestId("saveProfile").click();
  await expect(first.getByText("Project saved: Regression Client Renamed", { exact: true })).toBeVisible();
  await firstApp.close();

  const secondApp = await launchRadarApplication({ userDataDir, proxyPort, debugPort });
  try {
    const second = await secondApp.firstWindow();
    await second.getByTestId("radarShell").waitFor();
    await second.getByTestId("openProfileSessionPanel").click();
    await expect(second.locator('[data-testid^="profileRow-"]').filter({ hasText: "Regression Client Renamed" })).toBeVisible();
    await expect(second.getByTestId("profileNameInput")).toHaveValue("Regression Client Renamed");
  } finally {
    await secondApp.close();
  }
});

test("[REG-DATA-001] @persistence restores representative project state after a real app restart", async ({
  userDataDir,
  proxyPort
}, testInfo) => {
  const debugPort = 20_223 + testInfo.workerIndex * 20;
  const firstApp = await launchRadarApplication({ userDataDir, proxyPort, debugPort });
  const first = await firstApp.firstWindow();
  await first.getByTestId("radarShell").waitFor();
  await first.getByTestId("openAppearanceSettings").click();
  await first.getByTestId("themeOption-vellum").click();
  await first.getByLabel("Close appearance settings").click();
  await openView(first, "scope");
  await first.getByTestId("scopeTargetList").fill("https://persisted.fixture.test");
  await first.getByTestId("commitTargets").click();
  await expect(first.getByText("Targets saved", { exact: true }).first()).toBeVisible();
  await first.getByTestId("openProjectArtifacts").click();
  await first.getByTestId("newProjectNote").click();
  await first.getByTestId("projectNoteTitle").fill("Restart persistence marker");
  await first.getByTestId("projectNoteBody").fill("Durable across a full Electron restart.");
  await first.getByTestId("saveProjectNote").click();
  await expect(first.getByText("Project note saved: Restart persistence marker", { exact: true })).toBeVisible();
  await firstApp.close();

  const secondApp = await launchRadarApplication({ userDataDir, proxyPort, debugPort });
  try {
    const second = await secondApp.firstWindow();
    await second.getByTestId("radarShell").waitFor();
    await expect.poll(() => second.evaluate(() => document.documentElement.dataset.theme)).toBe("vellum");
    await openView(second, "scope");
    await expect(second.getByTestId("scopeTargetList")).toHaveValue("https://persisted.fixture.test");
    await second.getByTestId("openProjectArtifacts").click();
    await expect(second.locator('[data-testid^="projectNote-"]').filter({ hasText: "Restart persistence marker" })).toBeVisible();
  } finally {
    await secondApp.close();
  }
});

test("[REG-DATA-003] @persistence keeps session evidence isolated and recoverable", async ({ radarPage: page }) => {
  await loadDemo(page);
  const seededId = await page.getByTestId("sessionSelector").inputValue();
  await page.getByTestId("createLocalSession").click();
  await page.getByTestId("newSessionNameInput").fill("Empty Retest Session");
  await page.getByTestId("confirmNewSession").click();
  await expect(page.locator('[data-testid^="trafficRow-"]')).toHaveCount(0);
  await page.getByTestId("sessionSelector").selectOption(seededId);
  await expect(page.locator('[data-testid^="trafficRow-demo-cap-"]')).toHaveCount(4);
});

test("[REG-DATA-002] @persistence @security keeps notes and evidence isolated between projects", async ({ radarPage: page }) => {
  await loadDemo(page);
  await page.getByTestId("openProjectArtifacts").click();
  await page.getByTestId("newProjectNote").click();
  await page.getByTestId("projectNoteTitle").fill("Demo-only note");
  await page.getByTestId("saveProjectNote").click();
  await page.getByTestId("closeProjectArtifacts").click();
  await page.getByTestId("openProfileSessionPanel").click();
  const demoProfile = page.locator('[data-testid^="profileRow-"]').filter({ hasText: "Radar Demo Project" });
  const demoLoadId = await demoProfile.getByRole("button", { name: "Load" }).getAttribute("data-testid");
  await page.getByTestId("profileNameInput").fill("Isolated Empty Project");
  await page.getByTestId("createProfile").click();
  await page.getByLabel("Close projects and sessions panel").click();
  await expect(page.locator('[data-testid^="trafficRow-"]')).toHaveCount(0);
  await page.getByTestId("openProjectArtifacts").click();
  await expect(page.locator('[data-testid^="projectNote-"]').filter({ hasText: "Demo-only note" })).toHaveCount(0);
  await page.getByTestId("closeProjectArtifacts").click();
  await page.getByTestId("openProfileSessionPanel").click();
  if (!demoLoadId) throw new Error("Demo project load control was unavailable.");
  await page.getByTestId(demoLoadId.replace("loadProfile-", "loadProfile-")).click();
  await page.getByLabel("Close projects and sessions panel").click();
  await expect(page.locator('[data-testid^="trafficRow-demo-cap-"]')).toHaveCount(4);
  await page.getByTestId("openProjectArtifacts").click();
  await expect(page.locator('[data-testid^="projectNote-"]').filter({ hasText: "Demo-only note" })).toBeVisible();
});

test("[REG-ID-001] @core @persistence creates, edits, and archives a local identity", async ({ radarPage: page }) => {
  await openView(page, "advanced");
  await page.getByTestId("toggleIdentityLab").click();
  await page.getByLabel("Identity label").fill("Regression Auditor");
  await page.getByRole("textbox", { name: "Role", exact: true }).fill("auditor");
  await page.getByLabel("Tenant", { exact: true }).fill("fixture-tenant");
  await page.getByLabel("Target origin", { exact: true }).fill("http://localhost:3000");
  await page.getByLabel("Operator notes", { exact: true }).fill("Isolated regression identity");
  await page.getByTestId("identitySubmit").click();
  const identity = page.locator('[data-testid^="identityRoster-"]').filter({ hasText: "Regression Auditor" });
  await expect(identity).toBeVisible();
  await identity.getByLabel("Edit Regression Auditor").click();
  await expect(page.getByText("Edit identity", { exact: true })).toBeVisible();
  await page.getByTestId("identityNotes").fill("Edited identity notes");
  await page.getByTestId("identitySubmit").click();
  await expect(page.getByText("Identity updated: Regression Auditor", { exact: true })).toBeVisible();
  await identity.getByLabel("Edit Regression Auditor").click();
  await expect(page.getByTestId("identityNotes")).toHaveValue("Edited identity notes");
  await page.getByLabel("Cancel identity edit").click();
  await identity.getByLabel("Archive Regression Auditor").click();
  await expect(page.getByText("Identity archived; browser profile data remains on disk.", { exact: true })).toBeVisible();
  await expect(identity).toHaveCount(0);
});

test("[REG-ID-002] @security blocks activation of an identity outside saved scope", async ({ radarPage: page }) => {
  await openView(page, "advanced");
  await page.getByTestId("toggleIdentityLab").click();
  await page.getByLabel("Identity label").fill("Out of Scope Identity");
  await page.getByRole("textbox", { name: "Role", exact: true }).fill("viewer");
  await page.getByLabel("Tenant", { exact: true }).fill("external");
  await page.getByLabel("Target origin", { exact: true }).fill("https://outside.fixture.test");
  await page.getByTestId("identitySubmit").click();
  await expect(page.getByRole("alert")).toContainText("outside the current saved Scope");
  await expect(page.locator('[data-testid^="identityRoster-"]').filter({ hasText: "Out of Scope Identity" })).toHaveCount(0);
});

test("[REG-ID-005] @core renders the Identity Lab matrix safety interpretation", async ({ radarPage: page }) => {
  await loadDemo(page);
  await openView(page, "advanced");
  await page.getByTestId("toggleIdentityLab").click();
  await expect(page.getByTestId("identityMatrix")).toBeVisible();
  await expect(page.getByLabel("Evidence interpretation rules")).toContainText(/not proof|observ/i);
});

test("[REG-ID-006] @core permits a one-dimension comparison only for eligible attributed recordings", async ({ radarPage: page }) => {
  await loadDemo(page);
  await openView(page, "advanced");
  await page.getByTestId("toggleIdentityLab").click();
  await expect(page.getByTestId("identityComparisonState")).toContainText(/Choose an attributed recording|changes only the identity dimension/i);
  await expect(page.getByLabel("First recorded request")).toBeDisabled();
  await expect(page.getByLabel("Matching recorded request")).toBeDisabled();
  await expect(page.getByTestId("identityComparisonState")).toContainText(/recorded|identity/i);
});
