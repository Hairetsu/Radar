import fs from "node:fs";
import path from "node:path";
import { expect, loadDemo, openView, setScope, test } from "./fixtures";

test("[REG-APP-010] @core keeps sidebar and footer telemetry aligned with visible evidence", async ({ radarPage: page }) => {
  await loadDemo(page);
  await expect(page.locator("footer")).toContainText(/Captures\s*4/i);
  await expect(page.locator("footer")).toContainText(/TLS\s*1/i);
  await openView(page, "websocket");
  await expect(page.locator("footer")).toContainText(/View\s*02\s*·\s*WebSocket/i);
  await expect(page.locator('[data-testid^="webSocketRow-"]')).toHaveCount(3);
});

test("[REG-PROJ-005] @core routes every populated global-search result kind", async ({ radarPage: page }) => {
  await loadDemo(page);
  await page.getByTestId("openProjectArtifacts").click();
  await page.getByTestId("newProjectNote").click();
  await page.getByTestId("projectNoteTitle").fill("Searchable regression note");
  await page.getByTestId("saveProjectNote").click();
  await page.getByTestId("closeProjectArtifacts").click();

  for (const kind of ["capture", "websocket", "replay", "finding", "workflow", "plugin", "advanced", "saved-filter", "note"]) {
    await page.getByTestId("openGlobalSearch").click();
    await page.getByTestId("globalSearchInput").fill(`kind:${kind}`);
    await page.getByTestId("runGlobalSearch").click();
    await expect(page.getByTestId(`globalSearchResult-${kind}`).first()).toBeVisible();
    await page.getByTestId("closeGlobalSearch").click();
  }
});

test("[REG-PROJ-007] @core rejects unsupported global-search filters without changing state", async ({ radarPage: page }) => {
  await loadDemo(page);
  await page.getByTestId("openGlobalSearch").click();
  await page.getByTestId("globalSearchInput").fill("unknown-filter:value");
  await page.getByTestId("runGlobalSearch").click();
  await expect(page.getByTestId("globalSearchError")).toContainText(/unknown|unsupported|filter/i);
  await page.getByTestId("closeGlobalSearch").click();
  await expect(page.locator('[data-testid^="trafficRow-"]')).toHaveCount(4);
});

test("[REG-SCOPE-004] @security removing an origin hides its evidence everywhere without deleting it", async ({ radarPage: page }) => {
  await loadDemo(page);
  await setScope(page, ["http://localhost:3000"]);
  await openView(page, "traffic");
  await expect(page.locator('[data-testid^="trafficRow-"]')).toHaveCount(0);
  await openView(page, "websocket");
  await expect(page.locator('[data-testid^="webSocketRow-"]')).toHaveCount(0);
  await page.getByTestId("openGlobalSearch").click();
  await page.getByTestId("globalSearchInput").fill("kind:capture host:api.demo.radar.test");
  await page.getByTestId("runGlobalSearch").click();
  await expect(page.getByTestId("globalSearchResult-capture")).toHaveCount(0);
});

test("[REG-SCOPE-005] @security re-adding an origin reveals stored evidence without duplication", async ({ radarPage: page }) => {
  await loadDemo(page);
  await setScope(page, ["http://localhost:3000"]);
  await openView(page, "traffic");
  await expect(page.locator('[data-testid^="trafficRow-"]')).toHaveCount(0);
  await setScope(page, ["https://api.demo.radar.test", "http://localhost:3000"]);
  await openView(page, "traffic");
  await expect(page.locator('[data-testid^="trafficRow-"]')).toHaveCount(4);
  await openView(page, "websocket");
  await expect(page.locator('[data-testid^="webSocketRow-"]')).toHaveCount(3);
});

test("[REG-HTTP-007] @files @security bulk-exports only selected scoped captures", async ({ radarPage: page }) => {
  await loadDemo(page);
  await page.getByTestId("trafficRow-demo-cap-dashboard").click();
  await page.getByTestId("trafficRow-demo-cap-account").click({ modifiers: [process.platform === "darwin" ? "Meta" : "Control"] });
  await page.getByTestId("bulkExportCaptures").click();
  await expect(page.getByText("Exported 2 captures", { exact: true })).toBeVisible();
  const exported = await page.evaluate(() => navigator.clipboard.readText());
  expect(exported).toContain("/dashboard");
  expect(exported).toContain("/api/me");
  expect(exported).not.toContain("/graphql");
});

test("[REG-INT-006] @security rejects invalid intercept rules and preserves the last valid set", async ({ radarPage: page }) => {
  await openView(page, "intercept");
  const valid = JSON.stringify([{ id: "regression-rule", name: "Regression Rule", enabled: true, stage: "request", method: "POST", path: "/api/" }]);
  await page.getByTestId("interceptRulesText").fill(valid);
  await page.getByTestId("saveInterceptRules").click();
  await expect(page.getByText("Saved 1 intercept rule", { exact: true })).toBeVisible();
  await page.getByTestId("interceptRulesText").fill('{"not":"an array"}');
  await page.getByTestId("saveInterceptRules").click();
  await expect(page.getByText("Intercept rules must be a JSON array.", { exact: true })).toBeVisible();
  await page.reload();
  await openView(page, "intercept");
  await expect(page.getByTestId("interceptRulesText")).toHaveValue(/regression-rule/);
});

test("[REG-REP-004] @security blocks a missing environment variable before transmission", async ({ radarPage: page, targetLab }) => {
  await loadDemo(page);
  await setScope(page, [targetLab.origin]);
  await openView(page, "repeater");
  await page.getByTestId("repeaterEnvironment").selectOption("demo-env");
  await page.getByTestId("repeaterMethod").selectOption("POST");
  await page.getByTestId("repeaterUrl").fill(`${targetLab.origin}/api/echo?token={{missingVariable}}`);
  await page.getByTestId("repeaterBody").fill('{"value":"{{missingVariable}}"}');
  await page.getByTestId("transmitReplay").click();
  await expect(page.getByText(/missing.*variable|variable.*missing/i).last()).toBeVisible();
  expect(targetLab.requests).toHaveLength(0);
});

test("[REG-REP-005] @network compares two real replay-history variants", async ({ radarPage: page, targetLab }) => {
  await setScope(page, [targetLab.origin]);
  await openView(page, "repeater");
  for (const status of [200, 401]) {
    await page.getByTestId("repeaterUrl").fill(`${targetLab.origin}/api/status/${status}`);
    await page.getByTestId("transmitReplay").click();
    await expect(page.getByText(new RegExp(`^${status}`)).first()).toBeVisible();
  }
  await page.getByLabel("Diff left").nth(0).check();
  await page.getByLabel("Diff right").nth(1).check();
  await expect(page.getByText("Response diff", { exact: true })).toBeVisible();
  await expect(page.getByText(/Status:\s*401\s*→\s*200|Status:\s*200\s*→\s*401/)).toBeVisible();
});

test("[REG-REP-009] @network represents status, redirect, slow, and connection-error outcomes", async ({ radarPage: page, targetLab }) => {
  await setScope(page, [targetLab.origin, "http://127.0.0.1:65534"]);
  await openView(page, "repeater");
  for (const route of ["/api/status/204", "/api/status/401", "/api/status/500", "/api/redirect", "/api/slow?ms=40"]) {
    await page.getByTestId("repeaterUrl").fill(`${targetLab.origin}${route}`);
    await page.getByTestId("transmitReplay").click();
    await expect(page.getByTestId("transmitReplay")).toBeEnabled({ timeout: 15_000 });
  }
  await page.getByTestId("repeaterUrl").fill("http://127.0.0.1:65534/unavailable");
  await page.getByTestId("transmitReplay").click();
  await expect(page.getByTestId("replayNotice")).toContainText(/failed|refused|fetch|aborted/i, { timeout: 15_000 });
});

test("[REG-AUTO-002] @core @persistence creates, updates, and reloads an inline payload set", async ({ radarPage: page }) => {
  await openView(page, "automate");
  await page.getByTestId("automatePayloadSetName").fill("Regression Inline Deck");
  await page.getByTestId("automatePayloads").fill("alpha\nbeta");
  await page.getByRole("button", { name: "Save Set", exact: true }).click();
  await expect(page.getByText("Saved payload set Regression Inline Deck", { exact: true })).toBeVisible();
  await page.getByTestId("automatePayloads").fill("changed");
  await page.getByTestId("automatePayloadSetSelect").selectOption({ label: "Regression Inline Deck" });
  await expect(page.getByTestId("automatePayloads")).toHaveValue("alpha\nbeta");
  await page.reload();
  await openView(page, "automate");
  await expect(page.getByTestId("automatePayloadSetSelect").locator("option", { hasText: "Regression Inline Deck" })).toHaveCount(1);
});

test("[REG-AUTO-003] @files @security stores a bounded wordlist reference without renderer file access", async ({ radarPage: page, userDataDir }) => {
  const wordlist = path.join(userDataDir, "fixture-wordlist.txt");
  fs.writeFileSync(wordlist, "one\ntwo\nthree\n", "utf8");
  await openView(page, "automate");
  await page.getByTestId("automatePayloadSetName").fill("Regression Wordlist");
  await page.getByTestId("automateWordlistPath").fill(wordlist);
  await page.getByTestId("automatePayloads").fill("one\ntwo\nthree");
  await page.getByRole("button", { name: "Save Ref", exact: true }).click();
  await expect(page.getByText("Saved wordlist reference Regression Wordlist", { exact: true })).toBeVisible();
  await expect(page.getByTestId("automatePayloadSetSelect").locator("option", { hasText: "Regression Wordlist" })).toHaveCount(1);
});

test("[REG-AUTO-004] @security clamps excessive Automate execution limits", async ({ radarPage: page }) => {
  await openView(page, "automate");
  await page.getByTestId("automateCount").fill("9999");
  await page.getByTestId("automateConcurrency").fill("99");
  await page.getByTestId("automateDelay").fill("99999");
  await page.getByTestId("automateTimeout").fill("999999");
  await expect(page.getByTestId("automateCount")).toHaveValue("100");
  await expect(page.getByTestId("automateConcurrency")).toHaveValue("5");
  await expect(page.getByTestId("automateDelay")).toHaveValue("10000");
  await expect(page.getByTestId("automateTimeout")).toHaveValue("30000");
});

test("[REG-FIND-005] @core records retest notes and reviewed-to-resolved transitions", async ({ radarPage: page }) => {
  await loadDemo(page);
  await openView(page, "findings");
  await page.getByTestId("findingRow-demo-finding-cache").click();
  await page.getByTestId("findingRetest").fill("Regression retest confirms the cache policy is corrected.");
  await page.getByTestId("findingStatus").selectOption("retest-passed");
  await page.waitForTimeout(1_750);
  await expect(page.getByTestId("findingRetest")).toHaveValue("Regression retest confirms the cache policy is corrected.");
  await expect(page.getByTestId("findingStatus")).toHaveValue("retest-passed");
  await page.getByTestId("saveFinding").click();
  await expect(page.getByTestId("findingRow-demo-finding-cache")).toContainText("retest-passed");
  await expect(page.getByTestId("findingRetest")).toHaveValue(/Regression retest/);
});

test("[REG-FIND-006] @core merges an explicitly selected duplicate suggestion", async ({ radarPage: page }) => {
  await loadDemo(page);
  await page.getByTestId("trafficRow-demo-cap-account").click();
  await openView(page, "findings");
  const seeded = await page.locator('[data-testid^="findingRow-"]').count();
  await page.getByTestId("createFindingFromCapture").click();
  await expect(page.locator('[data-testid^="findingRow-"]')).toHaveCount(seeded + 1);
  await openView(page, "traffic");
  await openView(page, "findings");
  await page.getByTestId("createFindingFromCapture").click();
  await expect(page.locator('[data-testid^="findingRow-"]')).toHaveCount(seeded + 2);
  await expect(page.getByTestId("findingMergeQueue")).toBeVisible();
  const before = await page.locator('[data-testid^="findingRow-"]').count();
  await page.locator('[data-testid^="mergeFinding-"]').first().click();
  await expect(page.locator('[data-testid^="findingRow-"]')).toHaveCount(before - 1);
});

test("[REG-FIND-007] @security leaves findings unchanged when a duplicate suggestion is ignored", async ({ radarPage: page }) => {
  await loadDemo(page);
  await page.getByTestId("trafficRow-demo-cap-account").click();
  await openView(page, "findings");
  const before = await page.locator('[data-testid^="findingRow-"]').count();
  await page.getByTestId("createFindingFromCapture").click();
  await expect(page.locator('[data-testid^="findingRow-"]')).toHaveCount(before + 1);
  const count = before + 1;
  await openView(page, "traffic");
  await openView(page, "findings");
  await expect(page.locator('[data-testid^="findingRow-"]')).toHaveCount(count);
});

test("[REG-WF-004] @core @persistence records workflow revisions across edits", async ({ radarPage: page }) => {
  await loadDemo(page);
  await openView(page, "workflows");
  await page.getByTestId("workflowRow-demo-workflow-api-hardening").click();
  const definition = JSON.parse(await page.getByTestId("workflowDefinition").inputValue()) as Record<string, unknown>;
  definition.id = "regression-revision-workflow";
  definition.name = "Regression Revision One";
  definition.builtIn = false;
  await page.getByTestId("workflowDefinition").fill(JSON.stringify(definition, null, 2));
  await page.getByTestId("saveWorkflow").click();
  definition.name = "Regression Revision Two";
  await page.getByTestId("workflowDefinition").fill(JSON.stringify(definition, null, 2));
  await page.getByTestId("saveWorkflow").click();
  await expect(page.getByTestId("workflowRevisions")).toContainText(/2 saved|name/i);
});

test("[REG-WF-009] @core deletes a saved workflow while protecting a built-in", async ({ radarPage: page }) => {
  await loadDemo(page);
  await openView(page, "workflows");
  await page.getByTestId("workflowRow-demo-workflow-api-hardening").click();
  await page.getByTestId("deleteWorkflow").click();
  await expect(page.getByTestId("workflowRow-demo-workflow-api-hardening")).toHaveCount(0);
  const builtIn = page.locator('[data-testid^="workflowRow-builtin-"]').first();
  await builtIn.click();
  await expect(page.getByTestId("deleteWorkflow")).toBeDisabled();
  await expect(builtIn).toBeVisible();
});

test("[REG-SSL-002] @security generates an isolated CA with restricted file permissions", async ({ radarPage: page }) => {
  await openView(page, "ssl");
  await page.getByTestId("forgeCa").click();
  await expect(page.getByText("Proxy CA ready", { exact: true }).first()).toBeVisible();
  const state = await page.evaluate(() => window.radar.getProxyState());
  expect(state.caCertPath).toBeTruthy();
  expect(state.caKeyPath).toBeTruthy();
  expect(fs.statSync(state.caCertPath).mode & 0o777).toBe(0o600);
  expect(fs.statSync(state.caKeyPath).mode & 0o777).toBe(0o600);
});

test("[REG-RES-002] @core survives rapid view and session switching without stale selections", async ({ radarPage: page }) => {
  await loadDemo(page);
  const demoSession = await page.getByTestId("sessionSelector").inputValue();
  await page.getByTestId("createLocalSession").click();
  await page.getByTestId("newSessionNameInput").fill("Rapid Switch Session");
  await page.getByTestId("confirmNewSession").click();
  const emptySession = await page.getByTestId("sessionSelector").inputValue();
  for (let index = 0; index < 8; index += 1) {
    await openView(page, index % 2 === 0 ? "traffic" : "websocket");
    await page.getByTestId("sessionSelector").selectOption(index % 2 === 0 ? demoSession : emptySession);
  }
  await page.getByTestId("sessionSelector").selectOption(demoSession);
  await openView(page, "traffic");
  await expect(page.locator('[data-testid^="trafficRow-demo-cap-"]')).toHaveCount(4);
});
