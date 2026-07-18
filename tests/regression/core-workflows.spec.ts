import { expect, loadDemo, openView, test } from "./fixtures";

test("[REG-APP-001] @smoke launches the production Electron shell with preload state", async ({ radarPage: page }) => {
  await expect(page.getByRole("heading", { name: "Radar", level: 1 })).toBeVisible();
  await expect(page.getByTestId("radarShell")).toBeVisible();
  await expect(page.getByTestId("sessionSelector")).toHaveValue(/.+/);
  await expect(page.getByText("No in-scope HTTP/S requests intercepted")).toBeVisible();
});

test("[REG-APP-003] @smoke loads the complete seeded walkthrough", async ({ radarPage: page }) => {
  await loadDemo(page);
  await expect(page.getByText("Radar Demo Project", { exact: false }).first()).toBeVisible();
  await expect(page.getByTestId("sessionSelector")).toContainText("Seeded Walkthrough");
  await expect(page.locator('[data-testid^="trafficRow-demo-cap-"]')).toHaveCount(4);
  await openView(page, "websocket");
  await expect(page.locator('[data-testid^="webSocketRow-demo-ws-"]')).toHaveCount(3);
  await openView(page, "findings");
  await expect(page.locator('[data-testid^="findingRow-demo-finding-"]')).toHaveCount(2);
});

test("[REG-APP-005] @core switches and persists every appearance theme", async ({ radarPage: page }) => {
  for (const theme of ["bureau", "vellum", "specter"] as const) {
    await page.getByTestId("openAppearanceSettings").click();
    await page.getByTestId(`themeOption-${theme}`).click();
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe(theme);
    await page.getByLabel("Close appearance settings").click();
  }
  await expect.poll(() => page.evaluate(() => localStorage.getItem("radar.theme"))).toBe("specter");
    await page.reload();
    await page.getByTestId("radarShell").waitFor();
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe("specter");
});

test("[REG-APP-006] @core opens and dismisses every primary overlay", async ({ radarPage: page }) => {
  await page.getByTestId("openGlobalSearch").click();
  await expect(page.getByTestId("globalSearchOverlay")).toBeVisible();
  await page.getByTestId("closeGlobalSearch").click();

  await page.getByTestId("openProjectArtifacts").click();
  await expect(page.getByTestId("projectArtifactsOverlay")).toBeVisible();
  await page.getByTestId("closeProjectArtifacts").click();

  await page.getByTestId("openProfileSessionPanel").click();
  await expect(page.getByTestId("profileSessionPanel")).toBeVisible();
  await page.getByLabel("Close projects and sessions panel").click();

  await page.getByTestId("openAppearanceSettings").click();
  await expect(page.getByTestId("appearanceSettingsPanel")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("appearanceSettingsPanel")).toBeHidden();

  await page.getByTestId("openAiSettings").click();
  await expect(page.getByTestId("aiSettingsPanel")).toBeVisible();
  await page.getByTestId("aiSettingsClose").click();
});

test("[REG-APP-007] @core toggles operating mode without creating an agent run", async ({ radarPage: page }) => {
  await page.getByTestId("aiFirstMode").click();
  await expect(page.getByTestId("aiFirstConsole")).toBeVisible();
  await expect(page.getByTestId("agentTimeline")).toContainText("Prompt AI-First to start a scoped run.");
  await page.getByTestId("manualFirstMode").click();
  await expect(page.getByTestId("aiFirstConsole")).toBeHidden();
});

test("[REG-APP-008] @core creates and switches sessions through visible controls", async ({ radarPage: page }) => {
  await page.getByTestId("createLocalSession").click();
  await page.getByTestId("newSessionNameInput").fill("Regression Session Alpha");
  await page.getByTestId("confirmNewSession").click();
  await expect(page.getByTestId("sessionSelector")).toContainText("Regression Session Alpha");
  await page.getByTestId("createLocalSession").click();
  await page.getByTestId("newSessionNameInput").fill("Regression Session Beta");
  await page.getByTestId("confirmNewSession").click();
  await expect(page.getByTestId("sessionSelector")).toContainText("Regression Session Beta");
  const alphaId = await page.getByTestId("sessionSelector").locator("option").filter({ hasText: "Regression Session Alpha" }).getAttribute("value");
  if (!alphaId) throw new Error("Regression Session Alpha was not available in the quick selector.");
  await page.getByTestId("sessionSelector").selectOption(alphaId);
  await expect(page.getByTestId("sessionSelector")).toHaveValue(alphaId);
  await expect(page.getByTestId("sessionSelector").locator("option:checked")).toContainText("Regression Session Alpha");
});

test("[REG-APP-009] @core opens global search with the platform shortcut and Escape", async ({ radarPage: page }) => {
  await page.keyboard.press(process.platform === "darwin" ? "Meta+p" : "Control+p");
  await expect(page.getByTestId("globalSearchInput")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("globalSearchOverlay")).toBeHidden();
});

test("[REG-PROJ-002] @core @persistence renames a session and keeps it selectable", async ({ radarPage: page }) => {
  await page.getByTestId("openProfileSessionPanel").click();
  await page.getByTestId("sessionNameInput").fill("Named Regression Ledger");
  await page.getByTestId("saveSession").click();
  await expect(page.getByTestId("sessionNameInput")).toHaveValue("Named Regression Ledger");
  await page.getByLabel("Close projects and sessions panel").click();
  await expect(page.getByTestId("sessionSelector")).toContainText("Named Regression Ledger");
});

test("[REG-PROJ-004] @core @persistence saves and restores a filtered Traffic view", async ({ radarPage: page }) => {
  await loadDemo(page);
  await page.getByTestId("trafficSearch").fill("method:POST path:/graphql");
  await page.getByTestId("openProjectArtifacts").click();
  await page.getByTestId("savedViewName").fill("GraphQL Regression View");
  await page.getByTestId("savedViewDescription").fill("Restores the GraphQL evidence posture.");
  await page.getByTestId("saveCurrentView").click();
  await page.getByTestId("closeProjectArtifacts").click();
  await page.getByTestId("trafficSearch").fill("");
  await openView(page, "findings");
  await page.getByTestId("openProjectArtifacts").click();
  const row = page.locator('[data-testid^="savedView-"]').filter({ hasText: "GraphQL Regression View" });
  await row.locator('[data-testid^="openSavedView-"]').click();
  await expect(page.getByTestId("view-traffic")).toHaveAttribute("aria-current", "page");
  await expect(page.getByTestId("trafficSearch")).toHaveValue("method:POST path:/graphql");
});

test("[REG-PROJ-008] @core @persistence refreshes stable demo records without duplicates", async ({ radarPage: page }) => {
  await loadDemo(page);
  await expect(page.locator('[data-testid^="trafficRow-demo-cap-"]')).toHaveCount(4);
  await loadDemo(page);
  await expect(page.locator('[data-testid^="trafficRow-demo-cap-"]')).toHaveCount(4);
  await openView(page, "findings");
  await expect(page.locator('[data-testid^="findingRow-demo-finding-"]')).toHaveCount(2);
});

test("[REG-HTTP-003] @core combines method, type, sort, and query filters", async ({ radarPage: page }) => {
  await loadDemo(page);
  await page.getByTestId("trafficMethodFilter").selectOption("POST");
  await page.getByTestId("trafficTypeFilter").selectOption("Fetch");
  await page.getByTestId("trafficSortField").selectOption("path");
  await page.getByTestId("trafficSearch").fill("path:/graphql status:200");
  await expect(page.locator('[data-testid^="trafficRow-"]')).toHaveCount(1);
  await expect(page.getByTestId("trafficRow-demo-cap-graphql")).toBeVisible();
  await page.getByTestId("clearTrafficFilters").click();
  await expect(page.locator('[data-testid^="trafficRow-demo-cap-"]')).toHaveCount(4);
});

test("[REG-HTTP-004] @core saves and reapplies a Traffic filter", async ({ radarPage: page }) => {
  await loadDemo(page);
  await page.getByTestId("trafficSearch").fill("method:POST path:/graphql");
  await page.getByTestId("savedFilterName").fill("Regression GraphQL");
  await page.getByTestId("saveTrafficFilter").click();
  await page.getByTestId("clearTrafficFilters").click();
  await page.getByRole("button", { name: "Regression GraphQL" }).click();
  await expect(page.getByTestId("trafficSearch")).toHaveValue("method:POST path:/graphql");
  await expect(page.getByTestId("trafficRow-demo-cap-graphql")).toBeVisible();
});

test("[REG-HTTP-005] @core @persistence annotates evidence and exposes it to search", async ({ radarPage: page }) => {
  await loadDemo(page);
  await page.getByTestId("trafficRow-demo-cap-dashboard").click();
  await page.getByTestId("captureTags").fill("regression, dashboard");
  await page.getByTestId("captureComment").fill("Regression evidence comment");
  await page.waitForTimeout(1_250);
  await expect(page.getByTestId("captureTags")).toHaveValue("regression, dashboard");
  await expect(page.getByTestId("captureComment")).toHaveValue("Regression evidence comment");
  await page.getByTestId("saveCaptureAnnotation").click();
  await expect(page.getByText("Annotation saved", { exact: true })).toBeVisible();
  await page.getByTestId("openGlobalSearch").click();
  await page.getByTestId("globalSearchInput").fill("kind:capture Regression evidence comment");
  await page.getByTestId("runGlobalSearch").click();
  await expect(page.getByTestId("globalSearchResult-capture")).toContainText("dashboard");
});

test("[REG-HTTP-008] @core inspects request, response, and TLS evidence", async ({ radarPage: page }) => {
  await loadDemo(page);
  await page.getByTestId("trafficRow-demo-cap-account").click();
  await page.getByTestId("detailTabRequest").click();
  await expect(page.getByTestId("trafficDetailText")).toContainText("Authorization");
  await expect(page.getByTestId("trafficDetailText")).toContainText("TLS 1.3");
  await page.getByTestId("detailTabResponse").click();
  await expect(page.getByTestId("trafficDetailText")).toContainText("cache-control");
  await expect(page.getByTestId("copyTrafficDetail")).toBeEnabled();
});

test("[REG-HTTP-010] @core @security clears HTTP evidence without clearing WebSocket frames", async ({ radarPage: page }) => {
  await loadDemo(page);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByTestId("clearCaptures").click();
  await expect(page.locator('[data-testid^="trafficRow-"]')).toHaveCount(0);
  await openView(page, "websocket");
  await expect(page.locator('[data-testid^="webSocketRow-"]')).toHaveCount(3);
});

test("[REG-WS-002] @core filters WebSocket evidence by direction and payload", async ({ radarPage: page }) => {
  await loadDemo(page);
  await openView(page, "websocket");
  await page.getByTestId("webSocketDirectionFilter").selectOption("received");
  await page.getByTestId("webSocketSearch").fill("payload:admin");
  await expect(page.locator('[data-testid^="webSocketRow-"]')).toHaveCount(1);
  await expect(page.getByTestId("webSocketRow-demo-ws-received")).toBeVisible();
});

test("[REG-WS-004] @core renders complete selected frame detail", async ({ radarPage: page }) => {
  await loadDemo(page);
  await openView(page, "websocket");
  await page.getByTestId("webSocketRow-demo-ws-received").click();
  await expect(page.getByTestId("webSocketDetailText")).toContainText('"scope":"admin"');
  await expect(page.getByTestId("webSocketDetailText")).toContainText(/received/i);
  await expect(page.getByTestId("copyWebSocketDetail")).toBeEnabled();
});

test("[REG-WS-007] @core clears WebSocket frames without clearing HTTP evidence", async ({ radarPage: page }) => {
  await loadDemo(page);
  await openView(page, "websocket");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByTestId("clearWebSocketEvents").click();
  await expect(page.locator('[data-testid^="webSocketRow-"]')).toHaveCount(0);
  await openView(page, "traffic");
  await expect(page.locator('[data-testid^="trafficRow-"]')).toHaveCount(4);
});
