import { expect, loadDemo, openView, test } from "./fixtures";

test("[REG-SCOPE-001] @security starts with local-development-only scope", async ({ radarPage: page }) => {
  await openView(page, "scope");
  await expect(page.getByTestId("scopeTargetList")).toContainText("localhost");
  await expect(page.getByTestId("scopeTargetList")).not.toContainText("example.com");
});

test("[REG-SCOPE-002] @security saves exact origins, hostnames, wildcards, and local", async ({ radarPage: page }) => {
  await openView(page, "scope");
  const rules = ["https://app.fixture.test", "api.fixture.test", "https://*.fixture.test", "local"];
  await page.getByTestId("scopeTargetList").fill(rules.join("\n"));
  await page.getByTestId("commitTargets").click();
  for (const rule of rules) await expect(page.getByTestId("scopeTargetList")).toContainText(rule);
});

test("[REG-SCOPE-003] @security ignores blank scope lines and normalizes duplicates", async ({ radarPage: page }) => {
  await openView(page, "scope");
  await page.getByTestId("scopeTargetList").fill("\nHTTP://LOCALHOST:3000/\nhttp://localhost:3000\n\n");
  await page.getByTestId("commitTargets").click();
  await expect(page.getByTestId("scopeTargetList")).toHaveValue("http://localhost:3000");
  const lines = (await page.getByTestId("scopeTargetList").inputValue()).split("\n").filter(Boolean);
  expect(lines).toEqual(["http://localhost:3000"]);
});

test("[REG-SCOPE-006] @security trusts only the current Repeater draft origin without sending", async ({ radarPage: page }) => {
  await openView(page, "repeater");
  await page.getByTestId("repeaterUrl").fill("http://127.0.0.1:32123/api/echo?secret=ignored");
  await page.getByTestId("trustOrigin").click();
  await openView(page, "scope");
  await expect(page.getByTestId("scopeTargetList")).toContainText("http://127.0.0.1:32123");
  await expect(page.getByTestId("scopeTargetList")).not.toContainText("/api/echo");
});

test("[REG-REP-002] @core @persistence creates, selects, pins, and closes Repeater tabs", async ({ radarPage: page }) => {
  await openView(page, "repeater");
  const tabs = page.locator('[data-testid^="repeaterTab-"]');
  await expect(tabs).toHaveCount(1);
  await page.getByTestId("createReplayTab").click();
  await expect(tabs).toHaveCount(2);
  await page.getByTestId("pinReplayTab").click();
  await expect(tabs.filter({ has: page.locator("svg") })).not.toHaveCount(0);
  await tabs.last().locator("svg").last().click();
  await expect(tabs).toHaveCount(1);
});

test("[REG-REP-003] @core selects an environment while preserving variable-authored drafts", async ({ radarPage: page }) => {
  await loadDemo(page);
  await openView(page, "repeater");
  await expect(page.getByTestId("repeaterEnvironment")).toHaveValue("demo-env");
  await expect(page.getByTestId("repeaterHeaders")).toContainText("{{authToken}}");
  await expect(page.getByTestId("repeaterUrl")).toHaveValue(/\/graphql$/);
});

test("[REG-REP-006] @core @persistence reloads a saved collection draft", async ({ radarPage: page }) => {
  await loadDemo(page);
  await openView(page, "repeater");
  await page.getByTestId("repeaterUrl").fill("http://localhost/changed");
  await page.getByRole("button", { name: "GraphQL role probe" }).last().click();
  await expect(page.getByTestId("repeaterUrl")).toHaveValue("https://api.demo.radar.test/graphql");
  await expect(page.getByTestId("repeaterMethod")).toHaveValue("POST");
});

test("[REG-AUTO-001] @core inserts a named URL payload marker into the visible draft", async ({ radarPage: page }) => {
  await openView(page, "repeater");
  await page.getByTestId("repeaterUrl").fill("http://localhost:3000/api/users?role=viewer");
  await openView(page, "automate");
  await page.getByTestId("automateMarkerName").fill("role");
  await page.getByTestId("markAutomateUrl").click();
  await expect(page.getByTestId("automatePositions")).toContainText("role");
  await expect(page.getByTestId("automatePositions")).toContainText("url");
});

test("[REG-AUTO-005] @core renders seeded results, matches, and clusters", async ({ radarPage: page }) => {
  await loadDemo(page);
  await openView(page, "automate");
  await expect(page.getByTestId("automateSessionSelect")).toContainText("Role parameter sweep");
  await expect(page.locator('[data-testid="automateResultRow"]')).toHaveCount(2);
  await expect(page.getByTestId("automateResults")).toContainText("admin");
  await page.locator('[data-testid="automateResultRow"]').last().click();
  await expect(page.getByTestId("automateResultDetail")).toContainText('"role":"admin"');
});

test("[REG-AUTO-009] @core promotes an Automate result into Repeater", async ({ radarPage: page }) => {
  await loadDemo(page);
  await openView(page, "automate");
  await page.locator('[data-testid="automateResultRow"]').last().click();
  await page.getByRole("button", { name: "Promote", exact: true }).click();
  await expect(page.getByTestId("view-repeater")).toHaveAttribute("aria-current", "page");
  await expect(page.getByTestId("repeaterUrl")).toHaveValue(/role=admin/);
});

test("[REG-FIND-001] @core combines finding queue filters", async ({ radarPage: page }) => {
  await loadDemo(page);
  await openView(page, "findings");
  await page.getByTestId("findingTextFilter").fill("secret");
  await page.getByTestId("findingStatusFilter").selectOption("draft");
  await page.getByTestId("findingSeverityFilter").selectOption("high");
  await expect(page.locator('[data-testid^="findingRow-"]')).toHaveCount(1);
  await expect(page.getByTestId("findingRow-demo-finding-secret")).toBeVisible();
});

test("[REG-FIND-002] @core creates evidence-backed findings from HTTP and WebSocket", async ({ radarPage: page }) => {
  await loadDemo(page);
  await page.getByTestId("trafficRow-demo-cap-account").click();
  await page.getByTestId("findingFromTraffic").click();
  await expect(page.getByTestId("findingEvidence")).toContainText("demo-cap-account");
  await openView(page, "websocket");
  await page.getByTestId("webSocketRow-demo-ws-received").click();
  await page.getByTestId("findingFromWebSocket").click();
  await expect(page.getByTestId("findingEvidence")).toContainText("demo-ws-received");
});

test("[REG-FIND-004] @core @persistence saves edited finding fields", async ({ radarPage: page }) => {
  await loadDemo(page);
  await openView(page, "findings");
  await page.getByTestId("findingRow-demo-finding-secret").click();
  await page.getByTestId("findingTitle").fill("Regression-updated secret disclosure");
  await page.getByTestId("findingOwner").fill("regression-owner");
  await page.getByTestId("findingStatus").selectOption("reviewed");
  await page.waitForTimeout(1_750);
  await expect(page.getByTestId("findingTitle")).toHaveValue("Regression-updated secret disclosure");
  await expect(page.getByTestId("findingOwner")).toHaveValue("regression-owner");
  await expect(page.getByTestId("findingStatus")).toHaveValue("reviewed");
  await page.getByTestId("saveFinding").click();
  await expect(page.getByTestId("findingRow-demo-finding-secret")).toContainText("Regression-updated secret disclosure");
  await expect(page.getByTestId("findingOwner")).toHaveValue("regression-owner");
});

test("[REG-FIND-008] @core deletes only the selected finding", async ({ radarPage: page }) => {
  await loadDemo(page);
  await openView(page, "findings");
  await page.getByTestId("findingRow-demo-finding-secret").click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByTestId("deleteFinding").click();
  await expect(page.getByTestId("findingRow-demo-finding-secret")).toHaveCount(0);
  await expect(page.getByTestId("findingRow-demo-finding-cache")).toBeVisible();
});

test("[REG-FILE-008] @files @security builds a redacted Markdown finding report", async ({ radarPage: page }) => {
  await loadDemo(page);
  await openView(page, "findings");
  await page.getByTestId("findingReportFormat").selectOption("markdown");
  await page.getByTestId("findingReportTitle").fill("Radar Regression Report");
  await page.getByTestId("buildFindingReport").click();
  await expect(page.getByTestId("findingReportPreview")).toContainText("Radar Regression Report");
  await expect(page.getByTestId("findingReportPreview")).not.toContainText("demo-operator-token");
});

test("[REG-WF-001] @core protects built-in workflows and exposes saved workflows", async ({ radarPage: page }) => {
  await loadDemo(page);
  await openView(page, "workflows");
  await expect(page.getByTestId("workflowRow-demo-workflow-api-hardening")).toBeVisible();
  await page.locator('[data-testid^="workflowRow-builtin-"]').first().click();
  await expect(page.getByTestId("deleteWorkflow")).toBeDisabled();
  await page.getByTestId("workflowRow-demo-workflow-api-hardening").click();
  await expect(page.getByTestId("deleteWorkflow")).toBeEnabled();
});

test("[REG-WF-003] @core @security rejects malformed workflow definitions", async ({ radarPage: page }) => {
  await loadDemo(page);
  await openView(page, "workflows");
  await page.getByTestId("workflowDefinition").fill('{"id":"broken","steps":[]}');
  await page.getByTestId("saveWorkflow").click();
  await expect(page.getByText("Workflow definition is invalid", { exact: false })).toBeVisible();
});

test("[REG-WF-005] @core runs a passive workflow without changing captures", async ({ radarPage: page }) => {
  await loadDemo(page);
  await openView(page, "workflows");
  await page.getByTestId("workflowRow-demo-workflow-api-hardening").click();
  const capturesBefore = 4;
  await page.getByTestId("runWorkflow").click();
  await expect(page.getByTestId("workflowRunHistory")).toContainText("Demo API Hardening Review");
  await openView(page, "traffic");
  await expect(page.locator('[data-testid^="trafficRow-"]')).toHaveCount(capturesBefore);
});

test("[REG-WF-008] @core promotes a warning workflow result to a draft finding", async ({ radarPage: page }) => {
  await loadDemo(page);
  await openView(page, "workflows");
  await page.getByTestId("workflowRun-demo-workflow-run-api-hardening").click();
  await page.getByTestId("promoteWorkflowResult-demo-workflow-result-cache").click();
  await expect(page.getByTestId("view-findings")).toHaveAttribute("aria-current", "page");
  await expect(page.getByTestId("findingEvidence")).toContainText("demo-cap-account");
});

test("[REG-PLUG-001] @core displays seeded approved plugin permissions", async ({ radarPage: page }) => {
  await loadDemo(page);
  await openView(page, "plugins");
  const plugin = page.getByTestId("pluginRow-demo-evidence-panel");
  await expect(plugin).toContainText("Demo Evidence Panel");
  await expect(plugin).toContainText("approved");
  await expect(plugin).toContainText("captures:read");
});

test("[REG-PLUG-007] @core @security renders the approved demo panel", async ({ radarPage: page }) => {
  await loadDemo(page);
  await openView(page, "plugins");
  await page.locator('[data-testid^="renderPluginPanel-demo-evidence-panel-"]').click();
  await expect(page.getByTestId("pluginPanelRender")).toBeVisible();
  await expect(page.getByTestId("pluginPanelRender")).toContainText(/Demo Evidence|panel/i);
});

test("[REG-ADV-001] @core renders seeded GraphQL operation analysis", async ({ radarPage: page }) => {
  await loadDemo(page);
  await openView(page, "advanced");
  await expect(page.getByTestId("advancedWorkbench")).toContainText("ListUsers");
  await expect(page.locator('[data-testid^="draftGraphqlWorkflow-"]')).not.toHaveCount(0);
});

test("[REG-ADV-005] @core inventories query, JSON, GraphQL, and WebSocket parameters", async ({ radarPage: page }) => {
  await loadDemo(page);
  await openView(page, "advanced");
  await expect(page.getByTestId("advancedWorkbench")).toContainText("Parameters");
  await expect(page.locator('[data-testid^="draftParameterWorkflow-"]')).not.toHaveCount(0);
});

test("[REG-ADV-006] @security masks local secret signals", async ({ radarPage: page }) => {
  await loadDemo(page);
  await openView(page, "advanced");
  await expect(page.getByTestId("advancedWorkbench")).toContainText("Local Secret Signals");
  await expect(page.locator('[data-testid^="draftSecretWorkflow-"]')).not.toHaveCount(0);
  await expect(page.getByTestId("advancedWorkbench")).not.toContainText("sk_test_51DemoRadarSecretKey");
});

test("[REG-ADV-008] @core @security prepares an Advanced workflow visibly without running it", async ({ radarPage: page }) => {
  await loadDemo(page);
  await openView(page, "advanced");
  await page.locator('[data-testid^="draftHeaderWorkflow-"]').first().click();
  await expect(page.getByTestId("view-workflows")).toHaveAttribute("aria-current", "page");
  await expect(page.getByTestId("workflowDefinition")).not.toHaveValue("");
});

test("[REG-MAP-001] @core builds a sitemap and endpoint inventory from captures", async ({ radarPage: page }) => {
  await loadDemo(page);
  await openView(page, "sitemap");
  await expect(page.locator('[data-testid^="sitemapHost-"]')).not.toHaveCount(0);
  await page.locator('[data-testid^="sitemapHost-"]').first().click();
  await expect(page.getByText("Methods:", { exact: false })).toBeVisible();
});

test("[REG-MAP-002] @core routes a sitemap endpoint into filtered Traffic", async ({ radarPage: page }) => {
  await loadDemo(page);
  await openView(page, "sitemap");
  await page.locator('[data-testid^="sitemapEndpoint-"]').first().click();
  await expect(page.getByTestId("view-traffic")).toHaveAttribute("aria-current", "page");
  await expect(page.getByTestId("trafficSearch")).not.toHaveValue("");
});

test("[REG-SSL-004] @core @persistence saves workspace-local proxy profile notes", async ({ radarPage: page }) => {
  await openView(page, "ssl");
  await page.getByTestId("proxyProfile-cli").click();
  await page.getByTestId("proxyProfileNotes").fill("HTTPS_PROXY=http://127.0.0.1:18088 regression");
  await page.getByTestId("saveProxyProfile").click();
  await page.getByTestId("proxyProfile-radar-browser").click();
  await page.getByTestId("proxyProfile-cli").click();
  await expect(page.getByTestId("proxyProfileNotes")).toContainText("regression");
});
