import { expect, openView, setScope, startProxy, test } from "./fixtures";
import { sendThroughRadarProxy, startTargetLab } from "./target-lab";

test("[REG-HTTP-001] @network @smoke captures real GET and POST traffic through Radar's proxy", async ({
  radarPage: page,
  targetLab,
  proxyPort
}) => {
  await setScope(page, [targetLab.origin]);
  await startProxy(page, proxyPort);
  const get = await sendThroughRadarProxy(proxyPort, `${targetLab.origin}/api/users?role=auditor`);
  const post = await sendThroughRadarProxy(proxyPort, `${targetLab.origin}/api/echo`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-regression": "real-traffic" },
    body: '{"source":"playwright"}'
  });

  expect(get.status).toBe(200);
  expect(post.status).toBe(200);
  await targetLab.waitForRequests(2);
  await openView(page, "traffic");
  await expect(page.locator('[data-testid^="trafficRow-"]')).toHaveCount(2);
  await expect(page.locator('[data-testid^="trafficRow-"]').filter({ hasText: "/api/echo" })).toBeVisible();
  await expect(page.locator('[data-testid^="trafficRow-"]').filter({ hasText: "auditor" })).toBeVisible();
});

test("[REG-HTTP-002] @network @security hides real out-of-scope traffic", async ({ radarPage: page, targetLab, proxyPort }) => {
  const secondLab = await startTargetLab();
  try {
    await setScope(page, [targetLab.origin]);
    await startProxy(page, proxyPort);
    await sendThroughRadarProxy(proxyPort, `${targetLab.origin}/api/users?role=in-scope`);
    await sendThroughRadarProxy(proxyPort, `${secondLab.origin}/api/users?role=out-of-scope`);
    await targetLab.waitForRequests(1);
    await secondLab.waitForRequests(1);
    await openView(page, "traffic");
    await expect(page.locator('[data-testid^="trafficRow-"]')).toHaveCount(1);
    await expect(page.locator('[data-testid^="trafficRow-"]').first()).toContainText("in-scope");
    await page.getByTestId("openGlobalSearch").click();
    await page.getByTestId("globalSearchInput").fill("out-of-scope");
    await page.getByTestId("runGlobalSearch").click();
    await expect(page.getByText("No local project results matched that query.")).toBeVisible();
  } finally {
    await secondLab.close();
  }
});

test("[REG-REP-001] @network @smoke sends an edited real request and renders its response", async ({ radarPage: page, targetLab }) => {
  await openView(page, "repeater");
  await page.getByTestId("repeaterMethod").selectOption("POST");
  await page.getByTestId("repeaterUrl").fill(`${targetLab.origin}/api/echo?flow=repeater`);
  await page.getByTestId("repeaterHeaders").fill('{"Content-Type":"application/json","X-Regression":"repeater"}');
  await page.getByTestId("repeaterBody").fill('{"operator":"radar"}');
  await page.getByTestId("transmitReplay").click();

  const [received] = await targetLab.waitForRequests(1);
  expect(received.method).toBe("POST");
  expect(received.body).toBe('{"operator":"radar"}');
  expect(received.headers["x-regression"]).toBe("repeater");
  await expect(page.getByText("200 OK", { exact: false }).last()).toBeVisible();
});

test("[REG-REP-007] @network obeys real burst count and bounded concurrency controls", async ({ radarPage: page, targetLab }) => {
  await openView(page, "repeater");
  await page.getByTestId("repeaterUrl").fill(`${targetLab.origin}/api/slow?ms=40`);
  await page.getByTestId("repeaterHeaders").fill("{}");
  await page.getByTestId("burstCount").fill("4");
  await page.getByTestId("burstConcurrency").fill("2");
  await page.getByTestId("burstDelay").fill("10");
  await page.getByTestId("runBurst").click();
  await targetLab.waitForRequests(4);
  await expect.poll(() => targetLab.requests.length).toBe(4);
  await expect(page.getByText("0 flagged", { exact: false })).toBeVisible();
});

test("[REG-REP-008] @network @security clamps burst values before transmission", async ({ radarPage: page, targetLab }) => {
  await openView(page, "repeater");
  await page.getByTestId("repeaterUrl").fill(`${targetLab.origin}/api/status/204`);
  await page.getByTestId("repeaterHeaders").fill("{}");
  await page.getByTestId("burstCount").fill("999");
  await page.getByTestId("burstConcurrency").fill("99");
  await page.getByTestId("burstDelay").fill("-50");
  await page.getByTestId("runBurst").click();
  await targetLab.waitForRequests(50, 30_000);
  await expect.poll(() => targetLab.requests.length).toBe(50);
  await expect(page.getByTestId("burstCount")).toHaveValue("50");
  await expect(page.getByTestId("burstConcurrency")).toHaveValue("5");
  await expect(page.getByTestId("burstDelay")).toHaveValue("0");
});

test("[REG-INT-001] @network pauses a real scoped request before upstream", async ({ radarPage: page, targetLab, proxyPort }) => {
  await setScope(page, [targetLab.origin]);
  await startProxy(page, proxyPort);
  await openView(page, "intercept");
  await page.getByTestId("toggleRequestIntercept").click();
  const pending = sendThroughRadarProxy(proxyPort, `${targetLab.origin}/api/echo?flow=paused`).catch(() => null);
  await expect(page.locator('[data-testid^="interceptRow-"]')).toHaveCount(1);
  expect(targetLab.requests).toHaveLength(0);
  await page.getByTestId("dropIntercept").click();
  await pending;
  expect(targetLab.requests).toHaveLength(0);
});

test("[REG-INT-002] @network edits and forwards a real paused request", async ({ radarPage: page, targetLab, proxyPort }) => {
  await setScope(page, [targetLab.origin]);
  await startProxy(page, proxyPort);
  await openView(page, "intercept");
  await page.getByTestId("toggleRequestIntercept").click();
  const pending = sendThroughRadarProxy(proxyPort, `${targetLab.origin}/api/echo?flow=original`);
  await expect(page.locator('[data-testid^="interceptRow-"]')).toHaveCount(1);
  await page.getByTestId("interceptMethod").selectOption("POST");
  await page.getByTestId("interceptUrl").fill(`${targetLab.origin}/api/echo?flow=edited`);
  await page.getByTestId("interceptHeaders").fill('{"Content-Type":"application/json","X-Intercept":"edited"}');
  await page.getByTestId("interceptBody").fill('{"edited":true}');
  await page.getByTestId("forwardIntercept").click();
  const response = await pending;
  expect(response.status).toBe(200);
  const [received] = await targetLab.waitForRequests(1);
  expect(received.method).toBe("POST");
  expect(received.path).toContain("flow=edited");
  expect(received.body).toBe('{"edited":true}');
  expect(received.headers["x-intercept"]).toBe("edited");
});

test("[REG-INT-003] @network drops a real queued request without upstream delivery", async ({ radarPage: page, targetLab, proxyPort }) => {
  await setScope(page, [targetLab.origin]);
  await startProxy(page, proxyPort);
  await openView(page, "intercept");
  await page.getByTestId("toggleRequestIntercept").click();
  const pending = sendThroughRadarProxy(proxyPort, `${targetLab.origin}/api/account`).catch(() => null);
  await expect(page.locator('[data-testid^="interceptRow-"]')).toHaveCount(1);
  await page.getByTestId("dropIntercept").click();
  await pending;
  expect(targetLab.requests).toHaveLength(0);
  await expect(page.locator('[data-testid^="interceptRow-"]')).toHaveCount(0);
});

test("[REG-INT-005] @core @persistence saves normalized intercept rules", async ({ radarPage: page }) => {
  await openView(page, "intercept");
  await page.getByTestId("interceptRulesText").fill(JSON.stringify([
    { name: "Regression POST", stage: "request", method: "post", path: "/api/echo" }
  ]));
  await page.getByTestId("saveInterceptRules").click();
  await expect(page.getByTestId("interceptRulesText")).toContainText('"method": "POST"');
  await expect(page.getByTestId("interceptRulesText")).toContainText("Regression POST");
});

test("[REG-INT-007] @network applies real scoped match/replace transformations", async ({ radarPage: page, targetLab, proxyPort }) => {
  await setScope(page, [targetLab.origin]);
  await startProxy(page, proxyPort);
  await openView(page, "intercept");
  await page.getByTestId("matchReplaceRulesText").fill(JSON.stringify([
    { name: "Promote role", stage: "request", target: "body", match: "viewer", replace: "auditor" }
  ]));
  await page.getByTestId("saveMatchReplaceRules").click();
  await sendThroughRadarProxy(proxyPort, `${targetLab.origin}/api/echo`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: '{"role":"viewer"}'
  });
  const [received] = await targetLab.waitForRequests(1);
  expect(received.body).toBe('{"role":"auditor"}');
});

test("[REG-INT-009] @network delivers an edited client file override", async ({ radarPage: page, targetLab, proxyPort }) => {
  await setScope(page, [targetLab.origin]);
  await startProxy(page, proxyPort);
  await sendThroughRadarProxy(proxyPort, `${targetLab.origin}/api/echo`);
  await openView(page, "traffic");
  await page.locator('[data-testid^="trafficRow-"]').filter({ hasText: "/api/echo" }).click();
  await page.getByTestId("cloneToClientOverride").click();
  await expect(page.getByTestId("clientOverrideBody")).toBeVisible();
  await page.getByTestId("clientOverrideBody").fill('{"overridden":true}');
  await page.getByTestId("saveClientOverride").click();
  await expect(page.getByText("Saved client file override", { exact: false })).toBeVisible();
  const second = await sendThroughRadarProxy(proxyPort, `${targetLab.origin}/api/echo`);
  expect(second.body).toBe('{"overridden":true}');
});

test("[REG-SSL-001] @network starts and stops the isolated proxy and releases its port", async ({ radarPage: page, proxyPort }) => {
  await startProxy(page, proxyPort);
  await expect(page.getByText(`http://127.0.0.1:${proxyPort}`, { exact: false }).first()).toBeVisible();
  await page.getByTestId("stopProxy").click();
  await expect(page.getByText("Proxy stopped", { exact: false }).first()).toBeVisible();
});
