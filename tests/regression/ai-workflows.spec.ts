import type { Page } from "@playwright/test";
import { configureFixtureAi, expect, loadDemo, openView, test } from "./fixtures";
import type { TargetLab } from "./target-lab";

async function openTrafficAi(page: Page) {
  await page.getByTestId("trafficRow-demo-cap-account").click();
  await page.getByTestId("openAiPalette").click();
  await expect(page.getByTestId("commandPalette")).toBeVisible();
}

function chatRequests(targetLab: TargetLab) {
  return targetLab.requests.filter((request) => request.path === "/v1/chat/completions");
}

test("[REG-AIM-001] @ai configures, probes, and persists the deterministic local provider", async ({
  radarPage: page,
  targetLab
}) => {
  await configureFixtureAi(page, targetLab);
  await page.getByTestId("openAiSettings").click();
  await expect(page.getByTestId("aiProvider")).toHaveValue("openai-compatible");
  await expect(page.getByTestId("aiModel")).toHaveValue("radar-fixture-model");
  await expect(page.getByTestId("aiApiKey")).toHaveAttribute("type", "password");
  await page.getByTestId("aiProbeConnection").click();
  await expect(page.getByTestId("aiConnectionStatus")).toContainText("Connected");
});

test("[REG-AIM-002] @ai @security sends redacted scoped context by default", async ({ radarPage: page, targetLab }) => {
  await loadDemo(page);
  await configureFixtureAi(page, targetLab);
  targetLab.reset();
  await openTrafficAi(page);
  await page.getByTestId("aiPreviewContext").click();
  await expect(page.getByTestId("aiContextPreview")).toContainText("redacted");
  await expect(page.getByTestId("aiContextPreview")).not.toContainText("demo-operator-token");
  await page.getByTestId("aiRunTask").click();
  await expect(page.getByTestId("aiResult")).toContainText("Deterministic fixture summary");
  const body = chatRequests(targetLab).at(-1)?.body || "";
  expect(body).toContain("[REDACTED]");
  expect(body).not.toContain("demo-operator-token");
  expect(body).not.toContain("AKIAIOSFODNN7EXAMPLE");
});

test("[REG-AIM-003] @ai @security sends raw evidence only after explicit opt-in", async ({ radarPage: page, targetLab }) => {
  await loadDemo(page);
  await configureFixtureAi(page, targetLab);
  targetLab.reset();
  await openTrafficAi(page);
  await page.getByTestId("aiIncludeRaw").check();
  await page.getByTestId("aiPreviewContext").click();
  await expect(page.getByTestId("aiContextPreview")).toContainText("raw");
  await expect(page.getByTestId("aiContextPreview")).toContainText("demo-operator-token");
  await page.getByTestId("aiRunTask").click();
  await expect(page.getByTestId("aiResult")).toBeVisible();
  expect(chatRequests(targetLab).at(-1)?.body).toContain("demo-operator-token");
});

test("[REG-AIM-004] @ai runs summary, notes, checklist, TLS, and WebSocket analysis tasks", async ({
  radarPage: page,
  targetLab
}) => {
  await loadDemo(page);
  await configureFixtureAi(page, targetLab);

  const runTask = async (view: string, task: string, expected: string) => {
    await openView(page, view);
    await page.getByTestId("openAiPalette").click();
    await page.getByTestId(`aiTask-${task}`).click();
    await page.getByTestId("aiRunTask").click();
    await expect(page.getByTestId("aiResult")).toContainText(expected);
    await page.getByTestId("commandPaletteClose").click();
  };

  await page.getByTestId("trafficRow-demo-cap-dashboard").click();
  await runTask("traffic", "capture_summary", "Deterministic fixture summary");
  await runTask("findings", "report_notes", "Deterministic fixture report notes");
  await runTask("workflows", "scope_checklist", "Review fixture scope");
  await runTask("ssl", "tls_review", "Fixture TLS observation");
  await runTask("websocket", "capture_summary", "Deterministic fixture summary");
  expect(chatRequests(targetLab)).toHaveLength(5);
});

test("[REG-AIM-005] @ai @security applies a prepared Repeater draft without transmitting it", async ({
  radarPage: page,
  targetLab
}) => {
  await loadDemo(page);
  await configureFixtureAi(page, targetLab);
  targetLab.reset();
  await openView(page, "repeater");
  await page.getByTestId("openAiPalette").click();
  await page.getByTestId("aiTask-repeater_drafts").click();
  await page.getByTestId("aiRunTask").click();
  await expect(page.getByTestId("aiResult")).toContainText("Fixture replay draft");
  await page.getByTestId("aiApplyPrepared").click();
  await expect(page.getByTestId("repeaterUrl")).toHaveValue("http://127.0.0.1/fixture");
  expect(targetLab.requests.filter((request) => request.path.startsWith("/api/"))).toHaveLength(0);
});

test("[REG-AIM-006] @ai saves, runs, and deletes a local custom skill", async ({ radarPage: page, targetLab }) => {
  await loadDemo(page);
  await configureFixtureAi(page, targetLab);
  await openTrafficAi(page);
  await page.getByTestId("aiToggleSkillForm").click();
  await page.getByTestId("aiSkillLabel").fill("Regression Evidence Brief");
  await page.getByTestId("aiSkillHint").fill("Fixture-specific evidence brief");
  await page.getByTestId("aiSkillInstructions").fill("Return a concise deterministic evidence brief.");
  await page.getByTestId("aiSaveSkill").click();
  const skill = page.locator('[data-testid^="aiSkill-"]').filter({ hasText: "Regression Evidence Brief" });
  await expect(skill).toBeVisible();
  await skill.click();
  await page.getByTestId("aiRunTask").click();
  await expect(page.getByTestId("aiResult")).toContainText("Deterministic custom skill output");
  const deleteSkill = page.locator('[data-testid^="aiDeleteSkill-"]').filter({ hasText: "Remove skill" });
  await deleteSkill.click();
  await expect(skill).toHaveCount(0);
});

test("[REG-AIM-007] @ai recovers from malformed, HTTP-error, and timeout provider responses", async ({
  radarPage: page,
  targetLab
}) => {
  await loadDemo(page);
  await configureFixtureAi(page, targetLab);
  await openTrafficAi(page);

  for (const [prompt, expected] of [
    ["fixture:malformed", "did not contain JSON"],
    ["fixture:http-error", "Scripted provider failure"],
    ["fixture:timeout", "timeout"]
  ]) {
    await page.getByTestId("aiUserPrompt").fill(prompt);
    await page.getByTestId("aiRunTask").click();
    await expect(page.getByTestId("commandPalette")).toContainText(expected, { ignoreCase: true });
  }
  await expect(page.getByTestId("aiPacketPicker")).toContainText("api.demo.radar.test");
});

test("[REG-AIM-008] @ai @security does not reuse a hidden session's packet selection", async ({ radarPage: page, targetLab }) => {
  await loadDemo(page);
  await configureFixtureAi(page, targetLab);
  await openTrafficAi(page);
  await page.getByTestId("aiPreviewContext").click();
  await expect(page.getByTestId("aiContextPreview")).toContainText("1 packets");
  await page.getByTestId("commandPaletteClose").click();
  await page.getByTestId("createLocalSession").click();
  await page.getByTestId("newSessionNameInput").fill("AI Context Isolation");
  await page.getByTestId("confirmNewSession").click();
  await page.getByTestId("openAiPalette").click();
  await expect(page.getByTestId("aiPacketPicker")).toContainText("No HTTP or WebSocket packets");
});

test("[REG-AIF-001] @ai @smoke completes a passive AI-First goal with a visible timeline", async ({
  radarPage: page,
  targetLab
}) => {
  await loadDemo(page);
  await configureFixtureAi(page, targetLab);
  await page.getByTestId("aiFirstMode").click();
  await page.getByTestId("agentGoalInput").fill("Review the existing scoped evidence passively");
  await page.getByTestId("startAgentRun").click();
  await expect(page.getByTestId("agentRunSelect")).toContainText("COMPLETED");
  await expect(page.getByTestId("agentTimeline")).toContainText("Deterministic passive review complete");
  await expect(page.getByTestId("agentBudgetChips")).toBeVisible();
});

test("[REG-AIF-002] @ai @security policy-blocks an out-of-scope planner action", async ({ radarPage: page, targetLab }) => {
  await loadDemo(page);
  await configureFixtureAi(page, targetLab);
  targetLab.reset();
  await page.getByTestId("aiFirstMode").click();
  await page.getByTestId("agentGoalInput").fill("Attempt an out-of-scope navigation policy check");
  await page.getByTestId("startAgentRun").click();
  await expect(page.getByTestId("agentTimeline")).toContainText(/scope|policy|blocked/i);
  expect(targetLab.requests.filter((request) => request.path.startsWith("/api/"))).toHaveLength(0);
});

test("[REG-AIF-008] @ai @security rejects incomplete findings and accepts complete evidence contracts", async ({
  radarPage: page,
  targetLab
}) => {
  await loadDemo(page);
  await configureFixtureAi(page, targetLab);
  await page.getByTestId("aiFirstMode").click();
  await page.getByTestId("agentGoalInput").fill("Return an incomplete finding");
  await page.getByTestId("startAgentRun").click();
  await expect(page.getByTestId("agentRunSelect")).toContainText(/FAILED|COMPLETED/);
  await expect(page.getByText("Incomplete fixture finding", { exact: true })).toHaveCount(0);

  await page.getByTestId("agentGoalInput").fill("Return a complete finding");
  await page.getByTestId("startAgentRun").click();
  await expect(page.getByText("Fixture evidence finding", { exact: true })).toBeVisible();
  await expect(page.getByTestId("agentTimeline")).toContainText("Fixture review complete");
});
