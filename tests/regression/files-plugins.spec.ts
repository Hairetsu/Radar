import fs from "node:fs";
import path from "node:path";
import { expect, loadDemo, openView, test } from "./fixtures";

const graphqlPluginPath = path.join(process.cwd(), "plugins", "examples", "graphql-helper");

function demoBundlePath(userDataDir: string) {
  return path.join(userDataDir, "regression-artifacts", "Radar-Demo-Project.radar-bundle.json");
}

test("[REG-FILE-001] @files @security previews every project bundle redaction profile", async ({ radarPage: page }) => {
  await loadDemo(page);
  await page.getByTestId("openProjectArtifacts").click();
  for (const profile of ["metadata-only", "redacted-evidence", "reviewed-findings", "raw-evidence"]) {
    await page.getByTestId("bundleRedaction").selectOption(profile);
    await page.getByTestId("previewProjectBundleExport").click();
    await expect(page.getByTestId("bundleExportPreview")).toContainText(/capture|finding|warning/i);
  }
  await page.getByTestId("bundleRedaction").selectOption("raw-evidence");
  await page.getByTestId("previewProjectBundleExport").click();
  await expect(page.getByTestId("bundleExportPreview")).toContainText(/raw|sensitive|authorization/i);
});

test("[REG-FILE-002] @files @security exports a parseable redacted project bundle", async ({ radarPage: page, userDataDir }) => {
  await loadDemo(page);
  await page.getByTestId("openProjectArtifacts").click();
  await page.getByTestId("bundleRedaction").selectOption("redacted-evidence");
  await page.getByTestId("writeProjectBundle").click();
  await expect(page.getByText(/Project bundle exported:/).first()).toBeVisible();
  const bundlePath = demoBundlePath(userDataDir);
  expect(fs.existsSync(bundlePath)).toBe(true);
  const text = fs.readFileSync(bundlePath, "utf8");
  const bundle = JSON.parse(text) as { sessions?: unknown[]; targets?: string[] };
  expect(bundle.sessions?.length).toBeGreaterThan(0);
  expect(bundle.targets).toContain("https://api.demo.radar.test");
  expect(text).not.toContain("demo-operator-token");
  expect(text).not.toContain("AKIAIOSFODNN7EXAMPLE");
});

test("[REG-FILE-003] @files @security previews conflicts and proposed scope without applying", async ({ radarPage: page, userDataDir }) => {
  await loadDemo(page);
  await page.getByTestId("openProjectArtifacts").click();
  await page.getByTestId("writeProjectBundle").click();
  const source = JSON.parse(fs.readFileSync(demoBundlePath(userDataDir), "utf8")) as { targets: string[] };
  source.targets = [...source.targets, "https://proposed.fixture.test"];
  const fixturePath = path.join(userDataDir, "conflicting.radar-bundle.json");
  fs.writeFileSync(fixturePath, JSON.stringify(source), "utf8");
  await page.getByTestId("bundleImportPath").fill(fixturePath);
  await page.getByTestId("previewProjectBundleImport").click();
  await expect(page.getByTestId("bundleImportPreview")).toContainText("Conflicts:");
  await expect(page.getByTestId("bundleImportPreview")).toContainText("proposed.fixture.test");
  await expect(page.getByTestId("applyProjectBundleImport")).toBeEnabled();
});

test("[REG-FILE-004] @files @persistence applies a valid import into an independent project", async ({ radarPage: page, userDataDir }) => {
  await loadDemo(page);
  await page.getByTestId("openProjectArtifacts").click();
  await page.getByTestId("writeProjectBundle").click();
  const bundlePath = demoBundlePath(userDataDir);
  await page.getByTestId("closeProjectArtifacts").click();
  await page.getByTestId("openProfileSessionPanel").click();
  await page.getByTestId("profileNameInput").fill("Imported Regression Project");
  await page.getByTestId("createProfile").click();
  await expect(page.getByText("Project opened: Imported Regression Project", { exact: true })).toBeVisible();
  await page.getByLabel("Close projects and sessions panel").click();
  await page.getByTestId("openProjectArtifacts").click();
  await page.getByTestId("bundleImportPath").fill(bundlePath);
  await page.getByTestId("previewProjectBundleImport").click();
  await expect(page.getByTestId("applyProjectBundleImport")).toBeEnabled();
  await page.getByTestId("applyProjectBundleImport").click();
  await expect(page.getByText(/Bundle imported/i).first()).toBeVisible();
  await page.reload();
  await openView(page, "findings");
  await expect(page.locator('[data-testid^="findingRow-"]')).not.toHaveCount(0);
});

test("[REG-FILE-005] @files @security rejects corrupt and unsupported-newer bundles", async ({ radarPage: page, userDataDir }) => {
  await loadDemo(page);
  await page.getByTestId("openProjectArtifacts").click();
  const corruptPath = path.join(userDataDir, "corrupt.radar-bundle.json");
  fs.writeFileSync(corruptPath, "{not-json", "utf8");
  await page.getByTestId("bundleImportPath").fill(corruptPath);
  await page.getByTestId("previewProjectBundleImport").click();
  await expect(page.getByTestId("applyProjectBundleImport")).toBeDisabled();
  await expect(page.getByText(/invalid|parse|JSON/i).first()).toBeVisible();

  await page.getByTestId("writeProjectBundle").click();
  const newer = JSON.parse(fs.readFileSync(demoBundlePath(userDataDir), "utf8")) as Record<string, unknown>;
  newer.schemaVersion = 999;
  const newerPath = path.join(userDataDir, "newer.radar-bundle.json");
  fs.writeFileSync(newerPath, JSON.stringify(newer), "utf8");
  await page.getByTestId("bundleImportPath").fill(newerPath);
  await page.getByTestId("previewProjectBundleImport").click();
  await expect(page.getByTestId("applyProjectBundleImport")).toBeDisabled();
  await expect(page.getByText(/newer|unsupported|version/i).first()).toBeVisible();
});

test("[REG-FILE-006] @files @security previews a default reviewed-finding handoff", async ({ radarPage: page }) => {
  await loadDemo(page);
  await page.getByTestId("openProjectArtifacts").click();
  await page.getByTestId("handoffTitle").fill("Regression Handoff");
  await page.getByTestId("previewHandoffPackage").click();
  await expect(page.getByTestId("handoffPreview")).toContainText(/reviewed|finding/i);
});

test("[REG-FILE-007] @files opts draft findings into the handoff preview", async ({ radarPage: page }) => {
  await loadDemo(page);
  await page.getByTestId("openProjectArtifacts").click();
  await page.getByTestId("handoffTitle").fill("Draft-inclusive Handoff");
  await page.getByTestId("handoffIncludeDraftFindings").check();
  await page.getByTestId("previewHandoffPackage").click();
  await expect(page.getByTestId("handoffPreview")).toContainText(/2 findings|findingCount.*2|Findings.*2/i);
});

test("[REG-PROJ-003] @core creates, edits, searches, opens, and selectively deletes a project note", async ({ radarPage: page }) => {
  await page.getByTestId("openProjectArtifacts").click();
  for (const title of ["Keep Note", "Delete Note"]) {
    await page.getByTestId("newProjectNote").click();
    await page.getByTestId("projectNoteTitle").fill(title);
    await page.getByTestId("projectNoteBody").fill(`${title} body`);
    await page.getByTestId("saveProjectNote").click();
  }
  await page.locator('[data-testid^="projectNote-"]').filter({ hasText: "Delete Note" }).click();
  await page.getByTestId("projectNoteTitle").fill("Edited Delete Note");
  await page.getByTestId("projectNoteBody").fill("Edited note body found through global search.");
  await page.getByTestId("saveProjectNote").click();
  await page.getByTestId("closeProjectArtifacts").click();
  await page.getByTestId("openGlobalSearch").click();
  await page.getByTestId("globalSearchInput").fill("kind:note Edited Delete Note");
  await page.getByTestId("runGlobalSearch").click();
  await expect(page.getByTestId("globalSearchResult-note")).toContainText("Edited Delete Note");
  await page.getByTestId("globalSearchResult-note").click();
  await expect(page.getByTestId("projectNoteTitle")).toHaveValue("Edited Delete Note");
  await page.getByTestId("deleteProjectNote").click();
  await expect(page.locator('[data-testid^="projectNote-"]').filter({ hasText: "Edited Delete Note" })).toHaveCount(0);
  await expect(page.locator('[data-testid^="projectNote-"]').filter({ hasText: "Keep Note" })).toBeVisible();
});

test("[REG-HTTP-006] @core bulk-tags and deletes only selected captures", async ({ radarPage: page }) => {
  await loadDemo(page);
  await page.getByTestId("trafficRow-demo-cap-dashboard").click();
  await page.getByTestId("trafficRow-demo-cap-account").click({ modifiers: [process.platform === "darwin" ? "Meta" : "Control"] });
  await page.getByTestId("bulkTagInput").fill("bulk-regression");
  await page.getByTestId("bulkTagCaptures").click();
  await expect(page.getByText("Tagged 2 captures", { exact: true })).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByTestId("bulkDeleteCaptures").click();
  await expect(page.getByTestId("trafficRow-demo-cap-dashboard")).toHaveCount(0);
  await expect(page.getByTestId("trafficRow-demo-cap-account")).toHaveCount(0);
  await expect(page.getByTestId("trafficRow-demo-cap-graphql")).toBeVisible();
});

test("[REG-WS-003] @core @persistence preserves seeded WebSocket annotations", async ({ radarPage: page }) => {
  await loadDemo(page);
  await expect
    .poll(() => page.evaluate(() => window.radar.getEvidenceAnnotations()))
    .toContainEqual(
      expect.objectContaining({
        evidenceId: "demo-ws-received",
        kind: "websocket",
        tags: expect.arrayContaining(["websocket"])
      })
    );
  await openView(page, "websocket");
  await page.getByTestId("webSocketRow-demo-ws-received").click();
  await expect(page.getByTestId("webSocketTags")).toHaveValue(/websocket/);
  await expect(page.getByTestId("webSocketComment")).toHaveValue(/token-shaped value/);
});

test("[REG-FIND-003] @core creates a draft from a selected finding template", async ({ radarPage: page }) => {
  await loadDemo(page);
  await page.getByTestId("trafficRow-demo-cap-account").click();
  await openView(page, "findings");
  const options = page.getByTestId("findingTemplateSelect").locator("option");
  const templateId = await options.nth(1).getAttribute("value");
  if (!templateId) throw new Error("No finding template was available.");
  await page.getByTestId("findingTemplateSelect").selectOption(templateId);
  await page.getByTestId("createFindingFromCapture").click();
  await expect(page.getByTestId("findingTitle")).not.toHaveValue("");
  await expect(page.getByTestId("findingImpact")).not.toHaveValue("");
  await expect(page.getByTestId("findingRemediation")).not.toHaveValue("");
  await expect(page.getByTestId("findingStatus")).toHaveValue("draft");
});

test("[REG-FILE-009] @files @security includes raw report evidence only after explicit opt-in", async ({ radarPage: page }) => {
  await loadDemo(page);
  await openView(page, "findings");
  await page.getByTestId("findingRow-demo-finding-cache").click();
  await page.getByTestId("findingReportPreset").selectOption("raw-technical-appendix");
  await page.getByLabel("Raw evidence", { exact: true }).check();
  await page.getByTestId("buildFindingReport").click();
  await expect(page.getByTestId("findingReportPreview")).toContainText(/demo-operator-token|AKIAIOSFODNN7EXAMPLE/);
});

test("[REG-WF-002] @core inserts a supported workflow step into the visible graph", async ({ radarPage: page }) => {
  await loadDemo(page);
  await openView(page, "workflows");
  await page.getByTestId("workflowRow-demo-workflow-api-hardening").click();
  await page.locator('[data-testid^="workflowTemplate-"]').first().click();
  await expect(page.getByTestId("workflowDefinition")).toContainText(/steps|title/i);
  await expect(page.getByText("Workflow dry run: 5 runnable steps", { exact: true })).toBeVisible();
});

test("[REG-PLUG-002] @files @security previews a local plugin without installing it", async ({ radarPage: page }) => {
  await openView(page, "plugins");
  await page.getByTestId("pluginInstallPath").fill(graphqlPluginPath);
  await page.getByTestId("previewPlugin").click();
  await expect(page.getByTestId("pluginInstallPreview")).toContainText("GraphQL Helper");
  await expect(page.getByTestId("pluginRegistry")).toContainText("No local plugins installed");
});

test("[REG-PLUG-003] @files @security reports invalid plugin sources without installing", async ({ radarPage: page, userDataDir }) => {
  await openView(page, "plugins");
  await page.getByTestId("pluginInstallPath").fill(path.join(userDataDir, "missing-plugin"));
  await page.getByTestId("validatePlugin").click();
  await expect(page.getByTestId("pluginDeveloperValidation")).toContainText("failed");
  await expect(page.getByTestId("pluginRegistry")).toContainText("No local plugins installed");
});

test("[REG-PLUG-004] @files installs a valid local plugin as pending", async ({ radarPage: page }) => {
  await openView(page, "plugins");
  await page.getByTestId("pluginInstallPath").fill(graphqlPluginPath);
  await page.getByTestId("installPlugin").click();
  const plugin = page.getByTestId("pluginRow-graphql-helper");
  await expect(plugin).toBeVisible();
  await expect(plugin).toContainText("pending");
  await expect(page.getByTestId("approvePlugin-graphql-helper")).toBeEnabled();
});

test("[REG-PLUG-005] @files @security grants only requested plugin permissions", async ({ radarPage: page }) => {
  await openView(page, "plugins");
  await page.getByTestId("pluginInstallPath").fill(graphqlPluginPath);
  await page.getByTestId("installPlugin").click();
  await page.getByTestId("approvePlugin-graphql-helper").click();
  const plugin = page.getByTestId("pluginRow-graphql-helper");
  await expect(plugin).toContainText("approved");
  await expect(plugin).toContainText("captures:read");
  await expect(plugin).not.toContainText("replay:send");
});

test("[REG-PLUG-006] @core @persistence disables and blocks only the selected plugin", async ({ radarPage: page }) => {
  await loadDemo(page);
  await openView(page, "plugins");
  await page.getByTestId("disablePlugin-demo-evidence-panel").click();
  await expect(page.getByTestId("pluginRow-demo-evidence-panel")).toContainText("disabled");
  await page.getByTestId("blockPlugin-demo-evidence-panel").click();
  await expect(page.getByTestId("pluginRow-demo-evidence-panel")).toContainText("blocked");
});

test("[REG-PLUG-008] @security audits allowed and denied bounded SDK actions", async ({ radarPage: page }) => {
  await loadDemo(page);
  await openView(page, "plugins");
  await page.getByTestId("pluginApiRequest").fill(JSON.stringify({
    pluginId: "demo-evidence-panel",
    action: "captures:list",
    input: { query: "method:POST" }
  }));
  await page.getByTestId("runPluginApi").click();
  await expect(page.getByTestId("pluginApiResult")).toContainText('"ok": true');
  await page.getByTestId("pluginApiRequest").fill(JSON.stringify({
    pluginId: "demo-evidence-panel",
    action: "replay:send",
    input: { draft: { method: "GET", url: "https://api.demo.radar.test", headers: {}, body: "" } }
  }));
  await page.getByTestId("runPluginApi").click();
  await expect(page.getByTestId("pluginApiResult")).toContainText('"ok": false');
  await expect(page.getByTestId("pluginAudit")).toContainText("blocked");
});

test("[REG-PLUG-009] @core removes only the selected plugin", async ({ radarPage: page }) => {
  await loadDemo(page);
  await openView(page, "plugins");
  await page.getByTestId("pluginInstallPath").fill(graphqlPluginPath);
  await page.getByTestId("installPlugin").click();
  await page.getByTestId("removePlugin-graphql-helper").click();
  await expect(page.getByTestId("pluginRow-graphql-helper")).toHaveCount(0);
  await expect(page.getByTestId("pluginRow-demo-evidence-panel")).toBeVisible();
});

test("[REG-ADV-004] @core summarizes observed auth-state behavior", async ({ radarPage: page }) => {
  await loadDemo(page);
  await openView(page, "advanced");
  await expect(page.getByTestId("advancedWorkbench")).toContainText("Auth Matrix");
  await expect(page.locator('[data-testid^="draftAuthWorkflow-"]')).not.toHaveCount(0);
});

test("[REG-ADV-007] @core links cache, CORS, host, and redirect signals to workflows", async ({ radarPage: page }) => {
  await loadDemo(page);
  await openView(page, "advanced");
  await expect(page.getByTestId("advancedWorkbench")).toContainText("Header Behavior");
  await expect(page.locator('[data-testid^="draftHeaderWorkflow-"]')).not.toHaveCount(0);
  await expect(page.getByTestId("advancedWorkbench")).toContainText(/cache|CORS|redirect/i);
});
