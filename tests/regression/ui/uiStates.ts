import type { Page } from "@playwright/test";
import { expect } from "../fixtures";
import { openAiOperatorWindow } from "../fixtures";

export const WORKBENCH_VIEWS = [
  "traffic",
  "websocket",
  "intercept",
  "repeater",
  "automate",
  "findings",
  "workflows",
  "plugins",
  "advanced",
  "sitemap",
  "scope",
  "ssl"
] as const;

export type WorkbenchView = (typeof WORKBENCH_VIEWS)[number];
export type UiState = "empty" | "demo" | "dense" | "stress-copy";

export type RequiredControl = {
  selector: string;
  label: string;
  focus?: boolean;
};

const byTestId = (testId: string) => `[data-testid='${testId}']`;

export const PERSISTENT_REQUIRED_CONTROLS: RequiredControl[] = [
  { selector: byTestId("viewSwitch"), label: "view switch" },
  { selector: byTestId("sessionSelector"), label: "session selector", focus: true },
  { selector: byTestId("browserAddress"), label: "browser address", focus: true },
  { selector: byTestId("openBrowser"), label: "open browser", focus: true },
  { selector: byTestId("openGlobalSearch"), label: "global search", focus: true },
  { selector: byTestId("openProjectArtifacts"), label: "project artifacts", focus: true },
  { selector: byTestId("openAiPalette"), label: "AI palette", focus: true },
  { selector: byTestId("openProfileSessionPanel"), label: "projects and sessions", focus: true },
  { selector: byTestId("openAppearanceSettings"), label: "appearance settings", focus: true },
  { selector: byTestId("openAiSettings"), label: "AI settings", focus: true }
];

export const VIEW_REQUIRED_CONTROLS: Record<WorkbenchView, RequiredControl[]> = {
  traffic: [
    { selector: byTestId("trafficSearch"), label: "traffic search", focus: true },
    { selector: byTestId("trafficMethodFilter"), label: "method filter", focus: true },
    { selector: byTestId("trafficTypeFilter"), label: "type filter", focus: true },
    { selector: byTestId("trafficSortField"), label: "sort field", focus: true },
    { selector: "[data-component='trafficRow']", label: "traffic row", focus: true },
    { selector: byTestId("trafficDetailText"), label: "traffic evidence" },
    { selector: byTestId("detailTabRequest"), label: "request detail tab", focus: true },
    { selector: byTestId("detailTabResponse"), label: "response detail tab", focus: true },
    { selector: byTestId("cloneToRepeater"), label: "clone to Repeater", focus: true },
    { selector: byTestId("captureTags"), label: "capture tags", focus: true },
    { selector: byTestId("captureComment"), label: "capture comment", focus: true }
  ],
  websocket: [
    { selector: byTestId("webSocketDirectionFilter"), label: "direction filter", focus: true },
    { selector: byTestId("webSocketSearch"), label: "WebSocket search", focus: true },
    { selector: "[data-component='webSocketRow']", label: "WebSocket row", focus: true },
    { selector: byTestId("webSocketDetailText"), label: "WebSocket evidence" },
    { selector: byTestId("webSocketTags"), label: "WebSocket tags", focus: true },
    { selector: byTestId("copyWebSocketDetail"), label: "copy frame", focus: true },
    { selector: byTestId("replayWebSocketFrame"), label: "replay frame", focus: true },
    { selector: byTestId("findingFromWebSocket"), label: "frame finding", focus: true }
  ],
  intercept: [
    { selector: byTestId("interceptQueue"), label: "intercept queue" },
    { selector: byTestId("interceptRulesText"), label: "intercept rules", focus: true },
    { selector: byTestId("saveInterceptRules"), label: "save intercept rules", focus: true },
    { selector: byTestId("matchReplaceRulesText"), label: "match replace rules", focus: true },
    { selector: byTestId("saveMatchReplaceRules"), label: "save match replace rules", focus: true },
    { selector: byTestId("interceptHeaders"), label: "intercept headers", focus: true },
    { selector: byTestId("interceptBody"), label: "intercept body", focus: true },
    { selector: byTestId("forwardIntercept"), label: "forward intercept", focus: true },
    { selector: byTestId("dropIntercept"), label: "drop intercept", focus: true },
    { selector: byTestId("resetInterceptDraft"), label: "reset intercept", focus: true }
  ],
  repeater: [
    { selector: "[data-testid^='repeaterTab-']", label: "Repeater tab", focus: true },
    { selector: byTestId("repeaterMethod"), label: "Repeater method", focus: true },
    { selector: byTestId("repeaterUrl"), label: "Repeater URL", focus: true },
    { selector: byTestId("repeaterHeaders"), label: "Repeater headers", focus: true },
    { selector: byTestId("repeaterBody"), label: "Repeater body", focus: true },
    { selector: byTestId("repeaterEnvironment"), label: "Repeater environment", focus: true },
    { selector: byTestId("transmitReplay"), label: "transmit replay", focus: true },
    { selector: byTestId("runBurst"), label: "burst replay", focus: true },
    { selector: byTestId("webSocketReplayPayload"), label: "WebSocket replay editor", focus: true }
  ],
  automate: [
    { selector: byTestId("automateMarkerName"), label: "marker name", focus: true },
    { selector: byTestId("markAutomateUrl"), label: "mark URL", focus: true },
    { selector: byTestId("automatePayloads"), label: "payload values", focus: true },
    { selector: byTestId("automateCount"), label: "Automate count", focus: true },
    { selector: byTestId("automateWordlistPath"), label: "wordlist", focus: true },
    { selector: byTestId("automateRules"), label: "Automate rules", focus: true },
    { selector: byTestId("startAutomateSession"), label: "start Automate", focus: true },
    { selector: byTestId("automateResults"), label: "Automate results" },
    { selector: byTestId("automateResultDetail"), label: "Automate result detail" }
  ],
  findings: [
    { selector: byTestId("findingsList"), label: "findings list" },
    { selector: byTestId("findingFilters"), label: "finding filters" },
    { selector: byTestId("findingTemplateSelect"), label: "finding template", focus: true },
    { selector: byTestId("findingEditor"), label: "finding editor" },
    { selector: byTestId("findingTitle"), label: "finding title", focus: true },
    { selector: byTestId("findingEvidence"), label: "finding evidence" },
    { selector: byTestId("saveFinding"), label: "save finding", focus: true },
    { selector: byTestId("deleteFinding"), label: "delete finding", focus: true },
    { selector: byTestId("findingReportPreview"), label: "report preview" }
  ],
  workflows: [
    { selector: byTestId("workflowCatalog"), label: "workflow catalog" },
    { selector: byTestId("workflowDefinition"), label: "workflow definition", focus: true },
    { selector: byTestId("workflowStepTemplates"), label: "workflow templates" },
    { selector: byTestId("workflowGraph"), label: "workflow graph" },
    { selector: byTestId("workflowDryRun"), label: "workflow dry run" },
    { selector: byTestId("workflowRevisions"), label: "workflow revisions" },
    { selector: byTestId("workflowRunHistory"), label: "workflow history" },
    { selector: byTestId("workflowResults"), label: "workflow results" },
    { selector: byTestId("validateWorkflow"), label: "validate workflow", focus: true },
    { selector: byTestId("saveWorkflow"), label: "save workflow", focus: true },
    { selector: byTestId("runWorkflow"), label: "run workflow", focus: true }
  ],
  plugins: [
    { selector: byTestId("pluginInstallPath"), label: "plugin path", focus: true },
    { selector: byTestId("pluginInstallPreview"), label: "plugin preview" },
    { selector: byTestId("pluginDeveloperValidation"), label: "plugin validation" },
    { selector: byTestId("pluginRegistry"), label: "plugin registry" },
    { selector: byTestId("pluginPanels"), label: "plugin panels" },
    { selector: byTestId("pluginApiConsole"), label: "plugin API console" },
    { selector: byTestId("pluginApiResult"), label: "plugin API result" },
    { selector: byTestId("pluginAudit"), label: "plugin audit" }
  ],
  advanced: [
    { selector: byTestId("advancedWorkbench"), label: "Advanced workbench" },
    { selector: byTestId("advancedImportText"), label: "API import editor", focus: true },
    { selector: byTestId("advancedImportPreview"), label: "API import preview" },
    { selector: byTestId("saveAdvancedImportCollection"), label: "save API import", focus: true },
    { selector: byTestId("loadAdvancedImportDraft"), label: "load API import", focus: true },
    { selector: byTestId("draftAdvancedImportWorkflow"), label: "draft API workflow", focus: true }
  ],
  sitemap: [
    { selector: "[data-testid^='sitemapHost-']", label: "sitemap host", focus: true },
    { selector: "[data-testid^='sitemapPath-']", label: "sitemap path", focus: true },
    { selector: "[data-testid^='sitemapEndpoint-']", label: "sitemap endpoint", focus: true },
    { selector: byTestId("diffBaselineSession"), label: "diff baseline", focus: true },
    { selector: byTestId("runSessionDiff"), label: "run session diff", focus: true },
    { selector: byTestId("openSitemapInTraffic"), label: "open sitemap in traffic", focus: true }
  ],
  scope: [
    { selector: byTestId("scopeTargetList"), label: "scope targets", focus: true },
    { selector: byTestId("commitTargets"), label: "commit scope", focus: true },
    { selector: byTestId("scopeOpenAiPalette"), label: "scope AI action", focus: true }
  ],
  ssl: [
    { selector: byTestId("forgeCa"), label: "forge CA", focus: true },
    { selector: byTestId("startProxy"), label: "start proxy", focus: true },
    { selector: byTestId("stopProxy"), label: "stop proxy", focus: true },
    { selector: byTestId("proxyProfileNotes"), label: "proxy notes", focus: true },
    { selector: byTestId("saveProxyProfile"), label: "save proxy profile", focus: true }
  ]
};

export const IDENTITY_REQUIRED_CONTROLS: RequiredControl[] = [
  { selector: byTestId("identityLab"), label: "Identity Lab" },
  { selector: byTestId("identityForm"), label: "identity form" },
  { selector: byTestId("identityMatrix"), label: "identity matrix" },
  { selector: byTestId("identityComparisonState"), label: "identity comparison" },
  { selector: byTestId("causalEvidenceLedger"), label: "causal evidence ledger" }
];

export const AI_FIRST_REQUIRED_CONTROLS: RequiredControl[] = [
  { selector: byTestId("aiOperatorHeader"), label: "operator header" },
  { selector: byTestId("agentGoalInput"), label: "agent goal", focus: true },
  { selector: byTestId("agentProfileSelect"), label: "agent profile", focus: true },
  { selector: byTestId("agentTutorialToggle"), label: "tutorial mode", focus: true },
  { selector: byTestId("startAgentRun"), label: "start run", focus: true },
  { selector: byTestId("aiOperatorComposer"), label: "agent budgets" },
  { selector: byTestId("aiOperatorFeed"), label: "agent feed" }
];

export async function prepareRequiredViewState(page: Page, view: WorkbenchView) {
  if (view === "traffic") {
    if ((await page.locator("[data-component='trafficRow']").count()) === 0) {
      const clearFilters = page.getByTestId("clearTrafficFilters");
      if (await clearFilters.isEnabled()) {
        await clearFilters.click();
        await expect(page.locator("[data-component='trafficRow']").first()).toBeVisible();
      }
    }
    return;
  }

  if (view === "websocket") {
    if ((await page.locator("[data-component='webSocketRow']").count()) === 0) {
      const clearFilters = page.getByTestId("clearWebSocketFilters");
      if (await clearFilters.isEnabled()) {
        await clearFilters.click();
        await expect(page.locator("[data-component='webSocketRow']").first()).toBeVisible();
      }
    }
    return;
  }

  if (view === "sitemap") {
    if ((await page.getByTestId("openSitemapInTraffic").count()) === 0) {
      await page.locator("[data-testid^='sitemapHost-']").first().click();
      await expect(page.getByTestId("openSitemapInTraffic")).toBeVisible();
    }
    return;
  }

  if (view === "plugins") {
    if ((await page.getByTestId("pluginInstallPreview").count()) > 0 && (await page.getByTestId("pluginDeveloperValidation").count()) > 0) {
      return;
    }
    const fixturePath = `${process.cwd()}/plugins/examples/graphql-helper`;
    await page.getByTestId("pluginInstallPath").fill(fixturePath);
    await page.getByTestId("previewPlugin").click();
    await expect(page.getByTestId("pluginInstallPreview")).toBeVisible();
    await page.getByTestId("validatePlugin").click();
    await expect(page.getByTestId("pluginDeveloperValidation")).toBeVisible();
    const runPluginApi = page.getByTestId("runPluginApi");
    if (await runPluginApi.isEnabled()) {
      await runPluginApi.click();
      await expect(page.getByTestId("pluginApiResult")).toBeVisible();
    }
    return;
  }

  if (view !== "repeater" || (await page.getByTestId("webSocketReplayPayload").count()) > 0) {
    return;
  }

  await openWorkbenchView(page, "websocket");
  await prepareRequiredViewState(page, "websocket");
  const replayableFrame = page.getByTestId("webSocketRow-demo-ws-received");
  await expect(replayableFrame).toBeVisible();
  await replayableFrame.click();
  await expect(page.getByTestId("replayWebSocketFrame")).toBeEnabled();
  await page.getByTestId("replayWebSocketFrame").click();
  await expect(page.getByTestId("view-repeater")).toHaveAttribute("aria-current", "page");
  await expect(page.getByTestId("webSocketReplayPayload")).toBeVisible();
}

export async function openWorkbenchView(page: Page, view: WorkbenchView) {
  await page.getByTestId(`view-${view}`).click();
  await expect(page.getByTestId(`view-${view}`)).toHaveAttribute("aria-current", "page");
}

export async function openIdentityLab(page: Page) {
  await openWorkbenchView(page, "advanced");
  if (!(await page.getByTestId("identityLab").isVisible())) {
    await page.getByTestId("toggleIdentityLab").click();
  }
  await expect(page.getByTestId("identityLab")).toBeVisible();
}

export async function openAiFirstConsole(page: Page) {
  const operator = await openAiOperatorWindow(page, "runs");
  await expect(operator.getByTestId("aiOperatorShell")).toBeVisible();
  return operator;
}

export async function applyStressCopy(page: Page) {
  const longValue = "AUTHORIZATION BOUNDARY — tenant-west.example.test/api/v1/accounts/00000000-0000-4000-8000-000000000000?include=permissions&continuation=extremely-long-regression-token";
  await page.evaluate((value) => {
    const candidates = Array.from(document.querySelectorAll<HTMLElement>(
      "[data-testid='trafficDetailText'], [data-testid='findingTitle'], [data-testid='workflowDefinition'], [data-testid='agentGoalInput']"
    ));
    for (const candidate of candidates) {
      if (candidate instanceof HTMLInputElement || candidate instanceof HTMLTextAreaElement) {
        const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(candidate), "value");
        descriptor?.set?.call(candidate, value);
        candidate.dispatchEvent(new Event("input", { bubbles: true }));
      } else {
        candidate.textContent = `${value}\nPolicy blocked: destructive action requires explicit operator review.\nÀccented evidence · 安全证据 · 🔐`;
      }
    }
  }, longValue);
}
