import type { Page } from "@playwright/test";
import path from "node:path";
import { expect, loadDemo, openView, setScope, startProxy, test } from "./fixtures";
import { sendSecureThroughRadarProxy, sendThroughRadarProxy, startHttpsTargetLab } from "./target-lab";

async function prepareAutomateRun(page: Page, origin: string, name: string, payloads: string[], route = "/api/slow?ms=250") {
  await setScope(page, [origin]);
  await openView(page, "repeater");
  await page.getByTestId("repeaterUrl").fill(`${origin}${route}`);
  await openView(page, "automate");
  await page.getByTestId("automateMarkerName").fill("case");
  await page.getByTestId("markAutomateUrl").click();
  await page.getByTestId("automateSessionName").fill(name);
  await page.getByTestId("automatePayloads").fill(payloads.join("\n"));
  await page.getByTestId("automateCount").fill(String(payloads.length));
  await page.getByTestId("automateConcurrency").fill("1");
  await page.getByTestId("automateDelay").fill("25");
  await page.getByTestId("automateTimeout").fill("3000");
}

test("[REG-AUTO-006] @network pauses and resumes a real slow Automate session without duplicate sends", async ({ radarPage: page, targetLab }) => {
  await prepareAutomateRun(page, targetLab.origin, "Pause Resume Fixture", ["one", "two", "three"]);
  await page.getByTestId("startAutomateSession").click();
  await targetLab.waitForRequests(1);
  await page.getByTestId("pauseAutomateSession").click();
  await expect(page.getByTestId("automateSessionSelect")).toContainText("paused");
  await page.waitForTimeout(600);
  expect(targetLab.requests).toHaveLength(1);
  await page.getByTestId("resumeAutomateSession").click();
  await targetLab.waitForRequests(3);
  await expect(page.getByTestId("automateSessionSelect")).toContainText("completed", { timeout: 15_000 });
  expect(targetLab.requests.map((request) => new URL(request.url).searchParams.get("case"))).toEqual(["one", "two", "three"]);
});

test("[REG-AUTO-007] @network stops only the selected Automate session while another completes", async ({ radarPage: page, targetLab }) => {
  await prepareAutomateRun(page, targetLab.origin, "Independent Session A", ["a1", "a2", "a3", "a4"]);
  await page.getByTestId("startAutomateSession").click();
  await expect(page.getByTestId("automateSessionSelect")).toContainText("Independent Session A");
  await page.getByTestId("automateSessionName").fill("Selected Session B");
  await page.getByTestId("automatePayloads").fill("b1\nb2\nb3\nb4");
  await page.getByTestId("startAutomateSession").click();
  await page.getByTestId("stopAutomateSession").click();
  await expect(page.getByTestId("automateSessionSelect")).toContainText("Selected Session B - stopped");
  const firstSessionValue = await page.getByTestId("automateSessionSelect").locator("option", { hasText: "Independent Session A" }).getAttribute("value");
  if (!firstSessionValue) throw new Error("Independent Automate session was not listed.");
  await page.getByTestId("automateSessionSelect").selectOption(firstSessionValue);
  await expect(page.getByTestId("automateSessionSelect")).toContainText("Independent Session A - completed", { timeout: 15_000 });
  const firstSessionPayloads = targetLab.requests
    .map((request) => new URL(request.url).searchParams.get("case"))
    .filter((payload) => payload?.startsWith("a"));
  expect(firstSessionPayloads).toEqual(["a1", "a2", "a3", "a4"]);
});

test("[REG-AUTO-008] @network retries only a failed Automate attempt after fixture recovery", async ({ radarPage: page, targetLab }) => {
  await prepareAutomateRun(page, targetLab.origin, "Recoverable Attempt", ["retry-me"], "/api/recoverable");
  await page.getByTestId("startAutomateSession").click();
  await expect(page.getByTestId("automateSessionSelect")).toContainText("completed", { timeout: 15_000 });
  await expect(page.locator('[data-testid="automateResultRow"]')).toHaveCount(1);
  await expect(page.getByTestId("automateResults")).toContainText("503");
  await page.getByTestId("retryAutomateSession").click();
  await expect(page.locator('[data-testid="automateResultRow"]')).toHaveCount(2, { timeout: 15_000 });
  await expect(page.getByTestId("automateResults")).toContainText("200");
  expect(targetLab.requests).toHaveLength(2);
});

test("[REG-WF-006] @network @security runs one selected in-scope active workflow request through the normal contract", async ({ radarPage: page, targetLab, proxyPort }) => {
  await setScope(page, [targetLab.origin]);
  await startProxy(page, proxyPort);
  await sendThroughRadarProxy(proxyPort, `${targetLab.origin}/api/account`, {
    headers: { authorization: "Bearer fixture-token" }
  });
  await targetLab.waitForRequests(1);
  await openView(page, "traffic");
  const row = page.locator('[data-testid^="trafficRow-"]').filter({ hasText: "/api/account" });
  await expect(row).toBeVisible();
  await row.click();
  targetLab.reset();
  await openView(page, "workflows");
  await page.getByTestId("workflowRow-builtin-auth-state-check").click();
  await page.getByTestId("workflowUseSelectedCapture").click();
  await expect(page.getByTestId("workflowInput-capture-id")).not.toHaveValue("");
  await page.getByTestId("runWorkflow").click();
  await targetLab.waitForRequests(1);
  await expect(page.getByTestId("workflowRunHistory")).toContainText("completed", { timeout: 15_000 });
  expect(targetLab.requests).toHaveLength(1);
  expect(targetLab.requests[0]?.headers.authorization).toBeUndefined();
});

test("[REG-WF-007] @network @security blocks an active workflow with no selected capture", async ({ radarPage: page, targetLab }) => {
  await loadDemo(page);
  await openView(page, "workflows");
  await page.getByTestId("workflowRow-builtin-auth-state-check").click();
  await page.getByTestId("runWorkflow").click();
  await expect(page.getByTestId("workflowRunHistory")).toContainText(/failed|selected capture/i, { timeout: 15_000 });
  expect(targetLab.requests).toHaveLength(0);
});

test("[REG-RES-001] @network surfaces a bounded replay failure when the target lab disappears and remains usable", async ({ radarPage: page, targetLab }) => {
  await setScope(page, [targetLab.origin]);
  await openView(page, "repeater");
  await page.getByTestId("repeaterUrl").fill(`${targetLab.origin}/api/slow?ms=5000`);
  await page.getByTestId("transmitReplay").click();
  await targetLab.waitForRequests(1);
  await targetLab.close();
  await expect(page.getByTestId("replayNotice")).toContainText(/failed|fetch|aborted|terminated/i, { timeout: 15_000 });
  await openView(page, "scope");
  await expect(page.getByTestId("scopeTargetList")).toContainText(targetLab.origin);
});

test("[REG-SSL-003] @network captures real HTTPS fixture traffic through Radar's isolated MITM proxy", async ({ radarPage: page, proxyPort, userDataDir }) => {
  await startProxy(page, proxyPort);
  const secureLab = await startHttpsTargetLab({
    caCertificatePath: path.join(userDataDir, "proxy-ca", "radar-ca.pem"),
    caKeyPath: path.join(userDataDir, "proxy-ca", "radar-ca-key.pem")
  });
  try {
    await setScope(page, [secureLab.origin]);
    const response = await sendSecureThroughRadarProxy(proxyPort, `${secureLab.origin}/api/users?role=tls-auditor`);
    expect(response.status, response.body).toBe(200);
    await expect.poll(() => secureLab.requests.length).toBe(1);
    await openView(page, "traffic");
    const row = page.locator('[data-testid^="trafficRow-"]').filter({ hasText: "tls-auditor" });
    await expect(row).toBeVisible({ timeout: 15_000 });
    await row.click();
    await expect(page.getByTestId("trafficDetailText")).toContainText("https://127.0.0.1");
    expect(secureLab.certificate).toContain("BEGIN CERTIFICATE");
  } finally {
    await secureLab.close();
  }
});
