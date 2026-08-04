import type { Page } from "@playwright/test";
import { configureFixtureAi, expect, loadDemo, openView, setScope, startProxy, test } from "./fixtures";
import { exchangeWebSocketThroughRadarProxy, sendThroughRadarProxy, startTargetLab } from "./target-lab";

async function waitForTrafficCount(page: Page, count: number) {
  await openView(page, "traffic");
  await expect(page.locator('[data-testid^="trafficRow-"]')).toHaveCount(count, { timeout: 15_000 });
}

test("[REG-PROJ-006] @network @security excludes a known out-of-scope capture from global search", async ({ radarPage: page, targetLab, proxyPort }) => {
  const outsideLab = await startTargetLab();
  try {
    await setScope(page, [targetLab.origin]);
    await startProxy(page, proxyPort);
    await sendThroughRadarProxy(proxyPort, `${outsideLab.origin}/api/echo?fixture=hidden-project-search`);
    await outsideLab.waitForRequests(1);
    await page.getByTestId("openGlobalSearch").click();
    await page.getByTestId("globalSearchInput").fill("hidden-project-search");
    await page.getByTestId("runGlobalSearch").click();
    await expect(page.getByText("No local project results matched that query.")).toBeVisible();
  } finally {
    await outsideLab.close();
  }
});

test("[REG-HTTP-011] @network safely captures redirects, query strings, JSON, form, empty, and truncated bodies", async ({ radarPage: page, targetLab, proxyPort }) => {
  await setScope(page, [targetLab.origin]);
  await startProxy(page, proxyPort);
  await sendThroughRadarProxy(proxyPort, `${targetLab.origin}/api/redirect?source=regression`);
  await sendThroughRadarProxy(proxyPort, `${targetLab.origin}/api/users?role=query-auditor`);
  await sendThroughRadarProxy(proxyPort, `${targetLab.origin}/api/echo`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: '{"fixture":"json-body"}'
  });
  await sendThroughRadarProxy(proxyPort, `${targetLab.origin}/api/login`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: "username=fixture&role=auditor"
  });
  await sendThroughRadarProxy(proxyPort, `${targetLab.origin}/api/echo`, { method: "POST", body: "" });
  await sendThroughRadarProxy(proxyPort, `${targetLab.origin}/api/large`);
  await targetLab.waitForRequests(6);
  await waitForTrafficCount(page, 6);

  await expect(page.locator('[data-testid^="trafficRow-"]').filter({ hasText: "query-auditor" })).toBeVisible();
  await expect(page.locator('[data-testid^="trafficRow-"]').filter({ hasText: "/api/redirect" })).toContainText("302");
  await page.locator('[data-testid^="trafficRow-"]').filter({ hasText: "/api/large" }).click();
  await page.getByTestId("detailTabResponse").click();
  await expect(page.getByTestId("trafficDetailText")).toContainText("[truncated:");
});

test("[REG-HTTP-012] @network @security keeps authorization and cookie fixture values out of search and default export", async ({ radarPage: page, targetLab, proxyPort }) => {
  const bearerSecret = "regression-super-secret";
  const cookieSecret = "regression-cookie-secret";
  await setScope(page, [targetLab.origin]);
  await startProxy(page, proxyPort);
  await sendThroughRadarProxy(proxyPort, `${targetLab.origin}/api/account?auth=bearer`, {
    headers: { authorization: `Bearer ${bearerSecret}` }
  });
  await sendThroughRadarProxy(proxyPort, `${targetLab.origin}/api/account?auth=cookie`, {
    headers: { cookie: `radar_session=${cookieSecret}` }
  });
  await targetLab.waitForRequests(2);
  await waitForTrafficCount(page, 2);
  const rowText = (await page.locator('[data-testid^="trafficRow-"]').allTextContents()).join("\n");
  expect(rowText).not.toContain(bearerSecret);
  expect(rowText).not.toContain(cookieSecret);

  await page.getByTestId("openGlobalSearch").click();
  await page.getByTestId("globalSearchInput").fill(bearerSecret);
  await page.getByTestId("runGlobalSearch").click();
  await expect(page.getByText("No local project results matched that query.")).toBeVisible();
  await page.getByTestId("closeGlobalSearch").click();

  for (const row of await page.locator('[data-testid^="trafficRow-"]').all()) await row.click({ modifiers: [process.platform === "darwin" ? "Meta" : "Control"] });
  await page.getByTestId("bulkExportCaptures").click();
  const exported = await page.evaluate(() => navigator.clipboard.readText());
  expect(exported).toContain("[REDACTED]");
  expect(exported).not.toContain(bearerSecret);
  expect(exported).not.toContain(cookieSecret);
});

test("[REG-WS-001] @network records a real proxied WebSocket handshake, text exchange, and close in order", async ({ radarPage: page, targetLab, proxyPort }) => {
  await setScope(page, [targetLab.origin]);
  await startProxy(page, proxyPort);
  const replies = await exchangeWebSocketThroughRadarProxy(proxyPort, targetLab.socketUrl, '{"fixture":"ws-roundtrip"}');
  expect(replies).toContain('{"fixture":"ws-roundtrip"}');
  await expect.poll(() => targetLab.socketMessages).toContain('{"fixture":"ws-roundtrip"}');
  await openView(page, "websocket");
  await expect(page.locator('[data-testid^="webSocketRow-"]')).toHaveCount(6, { timeout: 15_000 });
  await expect(page.getByTestId("view-websocket")).toContainText("6/6 frames");
  const rows = page.locator('[data-testid^="webSocketRow-"]');
  await expect(rows.first()).toContainText(/closed/i);
  await expect(rows.nth(4)).toContainText(/handshake/i);
  await expect(rows.nth(5)).toContainText(/handshake/i);
  const lifecycle = (await rows.allTextContents()).join("\n");
  expect(lifecycle.match(/received/gi)).toHaveLength(2);
  expect(lifecycle.match(/sent/gi)).toHaveLength(1);
});

test("[REG-WS-005] @network replays a captured WebSocket frame to the real loopback lab", async ({ radarPage: page, targetLab, proxyPort }) => {
  await setScope(page, [targetLab.origin]);
  await startProxy(page, proxyPort);
  await exchangeWebSocketThroughRadarProxy(proxyPort, targetLab.socketUrl, '{"fixture":"source-frame"}');
  await openView(page, "websocket");
  const source = page.locator('[data-testid^="webSocketRow-"]').filter({ hasText: "source-frame" }).first();
  await expect(source).toBeVisible({ timeout: 15_000 });
  await source.click();
  await page.getByTestId("replayWebSocketFrame").click();
  await expect(page.getByTestId("webSocketReplayPayload")).toHaveValue('{"fixture":"source-frame"}');
  const before = targetLab.socketMessages.length;
  await page.getByTestId("sendWebSocketReplay").click();
  await expect(page.getByText(/Reply in \d+ ms/)).toBeVisible();
  await expect.poll(() => targetLab.socketMessages.length).toBe(before + 1);
});

test("[REG-WS-006] @security shows a bounded WebSocket replay error without disturbing HTTP evidence", async ({ radarPage: page }) => {
  await loadDemo(page);
  await openView(page, "websocket");
  await page.getByTestId("webSocketRow-demo-ws-received").click();
  await page.getByTestId("replayWebSocketFrame").click();
  await page.getByTestId("sendWebSocketReplay").click();
  await expect(page.getByText(/timed out|failed|unavailable/i).first()).toBeVisible({ timeout: 15_000 });
  await openView(page, "traffic");
  await expect(page.locator('[data-testid^="trafficRow-"]')).toHaveCount(4);
});

test("[REG-SCOPE-007] @ai @network @security policy-blocks out-of-scope AI navigation without a target send", async ({ radarPage: page, targetLab }) => {
  await loadDemo(page);
  const operator = await configureFixtureAi(page, targetLab);
  targetLab.reset();
  await operator.getByTestId("agentGoalInput").fill("Attempt https://outside.invalid/navigation for REG-SCOPE-007");
  await operator.getByTestId("startAgentRun").click();
  await expect(page.getByTestId("scopeTargetList")).toContainText("https://outside.invalid");
  await expect(operator.getByTestId("aiOperatorComposer")).toContainText(/scope consent required/i);
  expect(targetLab.requests.filter((request) => request.path.startsWith("/api/"))).toHaveLength(0);
});

test("[REG-INT-004] @network resumes several intercepted requests exactly once", async ({ radarPage: page, targetLab, proxyPort }) => {
  await setScope(page, [targetLab.origin]);
  await startProxy(page, proxyPort);
  await openView(page, "intercept");
  await page.getByTestId("toggleRequestIntercept").click();
  const pending = [1, 2, 3].map((index) => sendThroughRadarProxy(proxyPort, `${targetLab.origin}/api/echo?queued=${index}`));
  await expect(page.locator('[data-testid^="interceptRow-"]')).toHaveCount(3);
  expect(targetLab.requests).toHaveLength(0);
  await page.getByTestId("resumeAllIntercepts").click();
  await Promise.all(pending);
  await targetLab.waitForRequests(3);
  expect(targetLab.requests.map((request) => request.path).sort()).toEqual([
    "/api/echo?queued=1",
    "/api/echo?queued=2",
    "/api/echo?queued=3"
  ]);
  await expect(page.locator('[data-testid^="interceptRow-"]')).toHaveCount(0);
});

test("[REG-REP-010] @network @security strips hop-by-hop and proxy credentials before real replay", async ({ radarPage: page, targetLab }) => {
  await setScope(page, [targetLab.origin]);
  await openView(page, "repeater");
  await page.getByTestId("repeaterUrl").fill(`${targetLab.origin}/api/echo`);
  await page.getByTestId("repeaterHeaders").fill(JSON.stringify({
    Host: "unsafe.fixture",
    Connection: "keep-alive",
    "Keep-Alive": "timeout=5",
    "Proxy-Authorization": "Basic fixture-secret",
    TE: "trailers",
    Trailer: "Expires",
    "Transfer-Encoding": "chunked",
    Upgrade: "websocket",
    "X-Radar-Safe": "retained"
  }));
  await page.getByTestId("transmitReplay").click();
  const [received] = await targetLab.waitForRequests(1);
  expect(received.headers["x-radar-safe"]).toBe("retained");
  expect(received.headers.host).not.toBe("unsafe.fixture");
  for (const header of ["connection", "keep-alive", "proxy-authorization", "te", "trailer", "transfer-encoding", "upgrade"]) {
    expect(received.headers[header] || "").not.toContain("fixture-secret");
  }
});

test("[REG-ADV-002] @files @security previews OpenAPI and Postman drafts without transmitting", async ({ radarPage: page, targetLab }) => {
  await openView(page, "advanced");
  const openApi = {
    openapi: "3.0.3",
    info: { title: "Regression API", version: "1" },
    servers: [{ url: targetLab.origin }],
    paths: { "/api/users": { get: { operationId: "listRegressionUsers", responses: { "200": { description: "OK" } } } } }
  };
  await page.getByTestId("advancedImportText").fill(JSON.stringify(openApi));
  await expect(page.getByTestId("advancedImportPreview")).toContainText("/api/users");
  await expect(page.getByTestId("advancedWorkbench").locator(".." )).toContainText("openapi");
  expect(targetLab.requests).toHaveLength(0);

  const postman = {
    info: { name: "Regression Postman", schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json" },
    item: [{ name: "Echo", request: { method: "POST", header: [], url: `${targetLab.origin}/api/echo`, body: { mode: "raw", raw: '{"fixture":true}' } } }]
  };
  await page.getByTestId("advancedImportText").fill(JSON.stringify(postman));
  await expect(page.getByTestId("advancedImportPreview")).toContainText("/api/echo");
  expect(targetLab.requests).toHaveLength(0);
});

test("[REG-ADV-003] @files saves an imported draft and loads it visibly without transmission", async ({ radarPage: page, targetLab }) => {
  await openView(page, "advanced");
  await page.getByTestId("advancedImportText").fill(JSON.stringify({
    openapi: "3.0.3",
    info: { title: "Collection fixture", version: "1" },
    servers: [{ url: targetLab.origin }],
    paths: { "/api/echo": { post: { operationId: "echoFixture", responses: { "200": { description: "OK" } } } } }
  }));
  await expect(page.getByTestId("saveAdvancedImportCollection")).toBeEnabled();
  await page.getByTestId("saveAdvancedImportCollection").click();
  await expect(page.getByText(/Saved.*collection/i).first()).toBeVisible();
  await openView(page, "advanced");
  await page.getByTestId("loadAdvancedImportDraft").click();
  await expect(page.getByTestId("repeaterUrl")).toHaveValue(`${targetLab.origin}/api/echo`);
  await expect(page.getByTestId("repeaterMethod")).toHaveValue("POST");
  expect(targetLab.requests).toHaveLength(0);
});

test("[REG-MAP-003] @core @persistence compares baseline and active sessions visibly", async ({ radarPage: page }) => {
  await loadDemo(page);
  const baseline = await page.getByTestId("sessionSelector").inputValue();
  await page.getByTestId("createLocalSession").click();
  await page.getByTestId("newSessionNameInput").fill("Empty diff session");
  await page.getByTestId("confirmNewSession").click();
  await openView(page, "sitemap");
  await page.getByTestId("diffBaselineSession").selectOption(baseline);
  await page.getByTestId("runSessionDiff").click();
  await expect(page.getByText(/removed/i).first()).toBeVisible();
  await expect(page.getByText(/api\.demo\.radar\.test/i).first()).toBeVisible();
});
