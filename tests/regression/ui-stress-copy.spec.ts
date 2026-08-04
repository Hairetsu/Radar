import { expect, loadDemo, test } from "./fixtures";
import { assertNoGlobalHorizontalOverflow } from "./ui/layoutAudit";
import { applyStressCopy, openAiFirstConsole, openWorkbenchView } from "./ui/uiStates";
import { applyWindowProfile } from "./ui/windowProfiles";

const LONG_COPY = "Authorization boundary for tenant-west.example.test/api/v1/accounts/00000000-0000-4000-8000-000000000000?include=permissions&continuation=extremely-long-regression-token — Àccented evidence · 安全证据 · 🔐";

test("[REG-UI-023] @ui @usability keeps stress-copy content from hiding critical actions", async ({ electronApp, radarPage: page }, testInfo) => {
  await loadDemo(page);
  await applyWindowProfile(electronApp, page, "minimum", testInfo);

  await openWorkbenchView(page, "traffic");
  await applyStressCopy(page);
  await assertNoGlobalHorizontalOverflow(page);
  await expect(page.getByTestId("cloneToRepeater")).toBeVisible();

  await openWorkbenchView(page, "repeater");
  await page.getByTestId("repeaterUrl").fill(`https://tenant-west.example.test/${LONG_COPY}`);
  await page.getByTestId("repeaterBody").fill(`${LONG_COPY}\n`.repeat(12));
  await assertNoGlobalHorizontalOverflow(page);
  await expect(page.getByTestId("transmitReplay")).toBeVisible();

  await openWorkbenchView(page, "findings");
  await page.getByTestId("findingTitle").fill(LONG_COPY);
  await page.getByTestId("findingReproduction").fill(`${LONG_COPY}\n`.repeat(8));
  await assertNoGlobalHorizontalOverflow(page);
  await expect(page.getByTestId("saveFinding")).toBeVisible();

  await openWorkbenchView(page, "workflows");
  await page.getByTestId("workflowDefinition").fill(JSON.stringify({
    id: "stress-copy",
    name: LONG_COPY,
    description: LONG_COPY,
    mode: "passive",
    scope: { requireInScope: true, allowActive: false, requestCap: 0, timeoutMs: 1000, delayMs: 0, resultCap: 10 },
    inputs: [],
    steps: [{ id: "metadata", type: "metadata-exposure", name: LONG_COPY }]
  }, null, 2));
  await assertNoGlobalHorizontalOverflow(page);
  await expect(page.getByTestId("validateWorkflow")).toBeVisible();

  await openWorkbenchView(page, "advanced");
  await page.getByTestId("advancedImportText").fill(JSON.stringify({ openapi: "3.1.0", info: { title: LONG_COPY, version: "1" }, paths: {} }));
  await assertNoGlobalHorizontalOverflow(page);
  await expect(page.getByTestId("draftAdvancedImportWorkflow")).toBeVisible();

  const operator = await openAiFirstConsole(page);
  await applyWindowProfile(electronApp, operator, "minimum", testInfo);
  await operator.getByTestId("agentGoalInput").fill(`${LONG_COPY}\n${LONG_COPY}`);
  await assertNoGlobalHorizontalOverflow(operator);
  await expect(operator.getByTestId("startAgentRun")).toBeVisible();
});
