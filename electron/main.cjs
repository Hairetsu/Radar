const { app, BrowserWindow, ipcMain, shell, webContents } = require("electron");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const {
  Browser,
  BrowserTag,
  detectBrowserPlatform,
  getInstalledBrowsers,
  install,
  resolveBuildId
} = require("@puppeteer/browsers");
const { generateCACertificate, generateSPKIFingerprint, getLocal } = require("mockttp");
const {
  loadSettings: loadAiSettings,
  saveSettings: saveAiSettings,
  previewContext: previewAiContext,
  runAiTask,
  snapshotAudit: snapshotAiAudit,
  connectPreset: connectAiPreset,
  probeSettings: probeAiSettings
} = require("./ai/index.cjs");

const MAX_CAPTURED_BODY = 120_000;
const MAX_REPLAY_BODY = 500_000;
const MAX_BURST_COUNT = 50;
const MAX_BURST_CONCURRENCY = 5;

const defaultAllowlist = [
  "http://localhost:*",
  "http://127.0.0.1:*",
  "http://[::1]:*"
];

let mainWindow;
let targetBrowserWindow;
let chromeProcess;
let proxyServer;
let allowlist = [...defaultAllowlist];
const captured = new Map();
const attachedContents = new Set();
const sslEvents = [];
let browserState = {
  open: false,
  url: "",
  title: "",
  loading: false,
  engine: "none"
};
let proxyState = {
  running: false,
  port: 8088,
  proxyUrl: "http://127.0.0.1:8088",
  caCertPath: "",
  caKeyPath: "",
  caFingerprint: ""
};

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1480,
    height: 940,
    minWidth: 1120,
    minHeight: 760,
    title: "Radar",
    backgroundColor: "#07110f",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
      sandbox: false
    }
  });

  mainWindow.removeMenu();
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    mainWindow.loadURL(devUrl);
  } else {
    mainWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }
}

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("certificate-error", (event, _contents, url, error, certificate, callback) => {
  const trusted = shouldTrustLocalCertificate(url);
  sslEvents.unshift({
    id: `${Date.now()}-${sslEvents.length}`,
    url,
    error,
    trusted,
    subjectName: certificate?.subjectName,
    issuerName: certificate?.issuerName,
    createdAt: new Date().toISOString()
  });
  sslEvents.splice(80);

  if (trusted) {
    event.preventDefault();
    callback(true);
    return;
  }

  callback(false);
});

function truncateText(value, limit = MAX_CAPTURED_BODY) {
  if (!value) {
    return "";
  }
  const text = String(value);
  return text.length > limit ? `${text.slice(0, limit)}\n\n[truncated]` : text;
}

function normalizeBrowserUrl(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) {
    return "http://localhost:3000";
  }
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function safeJsonHeaders(headers = {}) {
  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key, Array.isArray(value) ? value.join(", ") : String(value)])
  );
}

function isLocalHost(hostname) {
  return hostname === "localhost" || hostname === "::1" || /^127\./.test(hostname);
}

function wildcardToRegExp(pattern) {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`, "i");
}

function ruleAllows(url, rule) {
  const trimmed = String(rule || "").trim();
  if (!trimmed) {
    return false;
  }

  if (trimmed === "local") {
    return isLocalHost(url.hostname);
  }

  const target = `${url.protocol}//${url.host}`;
  if (trimmed.includes("*")) {
    return wildcardToRegExp(trimmed).test(target) || wildcardToRegExp(trimmed).test(url.href);
  }

  try {
    const parsedRule = new URL(trimmed);
    return parsedRule.origin === url.origin;
  } catch {
    return trimmed.toLowerCase() === url.hostname.toLowerCase();
  }
}

function isAllowedTarget(urlString, rules = allowlist) {
  let parsed;
  try {
    parsed = new URL(urlString);
  } catch {
    return false;
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    return false;
  }

  const activeRules = Array.isArray(rules) && rules.length > 0 ? rules : defaultAllowlist;
  return activeRules.some((rule) => ruleAllows(parsed, rule));
}

function shouldTrustLocalCertificate(urlString) {
  try {
    const parsed = new URL(urlString);
    return parsed.protocol === "https:" && isLocalHost(parsed.hostname);
  } catch {
    return false;
  }
}

function currentBrowserState() {
  if (browserState.engine === "chrome" && browserState.open) {
    return browserState;
  }

  if (!targetBrowserWindow || targetBrowserWindow.isDestroyed()) {
    return {
      open: false,
      url: browserState.url,
      title: browserState.title,
      loading: false,
      engine: browserState.engine || "none"
    };
  }

  return {
    open: true,
    url: targetBrowserWindow.webContents.getURL(),
    title: targetBrowserWindow.getTitle(),
    loading: targetBrowserWindow.webContents.isLoading(),
    engine: "electron"
  };
}

function syncBrowserState() {
  browserState = currentBrowserState();
  return browserState;
}

function chromeProfileDir() {
  const profileDir = path.join(app.getPath("userData"), "isolated-chrome-profile");
  fs.mkdirSync(profileDir, { recursive: true });
  return profileDir;
}

function isolatedChromeCacheDir() {
  const cacheDir = path.join(app.getPath("userData"), "radar-browser");
  fs.mkdirSync(cacheDir, { recursive: true });
  return cacheDir;
}

async function ensureIsolatedChrome() {
  const cacheDir = isolatedChromeCacheDir();
  const platform = detectBrowserPlatform();
  if (!platform) {
    throw new Error("Cannot resolve a Radar Browser build for this platform.");
  }

  const buildId = await resolveBuildId(Browser.CHROMIUM, platform, BrowserTag.LATEST);
  const installed = await getInstalledBrowsers({ cacheDir });
  const existing = installed.find(
    (browser) =>
      browser.browser === Browser.CHROMIUM &&
      browser.platform === platform &&
      browser.buildId === buildId &&
      fs.existsSync(browser.executablePath)
  );

  if (existing) {
    return {
      executablePath: existing.executablePath,
      buildId,
      cacheDir
    };
  }

  const installOptions = {
    browser: Browser.CHROMIUM,
    buildId,
    buildIdAlias: "radar",
    cacheDir,
    platform
  };

  let downloaded;
  try {
    downloaded = await install(installOptions);
  } catch {
    fs.rmSync(path.join(cacheDir, Browser.CHROMIUM, `${platform}-${buildId}`), {
      recursive: true,
      force: true
    });
    downloaded = await install(installOptions);
  }

  return {
    executablePath: downloaded.executablePath,
    buildId,
    cacheDir,
    channel: "radar-browser",
    managedByRadar: true
  };
}

async function openRealChrome(urlString) {
  const nextUrl = normalizeBrowserUrl(urlString);
  const chrome = await ensureIsolatedChrome();
  const proxy = await startMitmProxy(proxyState.port);
  const remoteDebuggingPort = 9223;
  const args = [
    `--user-data-dir=${chromeProfileDir()}`,
    `--remote-debugging-port=${remoteDebuggingPort}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-features=Translate",
    `--proxy-server=${proxy.proxyUrl}`,
    "--proxy-bypass-list=<-loopback>",
    `--ignore-certificate-errors-spki-list=${proxy.caFingerprint}`,
    "--new-window",
    nextUrl
  ];

  if (process.platform === "darwin") {
    args.splice(4, 0, "--use-mock-keychain");
  }

  chromeProcess = spawn(chrome.executablePath, args, {
    detached: true,
    stdio: "ignore"
  });
  chromeProcess.unref();
  chromeProcess.once("exit", () => {
    browserState = {
      ...browserState,
      open: false,
      loading: false
    };
  });

  browserState = {
    open: true,
    url: nextUrl,
    title: "Radar Browser",
    loading: false,
    engine: "chrome",
    remoteDebuggingUrl: `http://127.0.0.1:${remoteDebuggingPort}`,
    profileDir: chromeProfileDir(),
    executablePath: chrome.executablePath,
    buildId: chrome.buildId,
    channel: chrome.channel
  };

  return browserState;
}

async function ensureProxyCa() {
  const caDir = path.join(app.getPath("userData"), "proxy-ca");
  const caCertPath = path.join(caDir, "radar-ca.pem");
  const caKeyPath = path.join(caDir, "radar-ca-key.pem");

  fs.mkdirSync(caDir, { recursive: true });

  if (!fs.existsSync(caCertPath) || !fs.existsSync(caKeyPath)) {
    const ca = await generateCACertificate({
      subject: {
        commonName: "Radar Local Proxy CA",
        organizationName: "Radar"
      }
    });
    fs.writeFileSync(caCertPath, ca.cert, { mode: 0o600 });
    fs.writeFileSync(caKeyPath, ca.key, { mode: 0o600 });
  }

  const cert = fs.readFileSync(caCertPath, "utf8");
  const caFingerprint = await generateSPKIFingerprint(cert);
  proxyState = {
    ...proxyState,
    caCertPath,
    caKeyPath,
    caFingerprint
  };
  return proxyState;
}

function proxyRequestToCapture(req, bodyText) {
  const entry = toCaptureEntry(req.id, {
    method: req.method,
    url: req.url,
    headers: req.headers || {},
    postData: bodyText || ""
  });
  entry.startedAt = new Date(req.timingEvents?.startTime || Date.now()).toISOString();
  entry.source = "proxy";
  entry.tls = req.url.startsWith("https:")
    ? {
        protocol: req.protocol || "https",
        issuer: "Radar Local Proxy CA",
        subjectName: req.destination?.hostname || "",
        validFrom: 0,
        validTo: 0
      }
    : null;
  return entry;
}

async function startMitmProxy(port = 8088) {
  if (proxyServer) {
    return proxyState;
  }

  const ca = await ensureProxyCa();
  proxyServer = getLocal({
    https: {
      keyPath: ca.caKeyPath,
      certPath: ca.caCertPath
    },
    http2: "fallback",
    passthrough: ["unknown-protocol"],
    recordTraffic: false,
    suggestChanges: false,
    maxBodySize: MAX_CAPTURED_BODY
  });

  await proxyServer.start(Number(port) || 8088);

  await proxyServer.on("request", async (req) => {
    const text = await req.body.getText().catch(() => "");
    captured.set(req.id, proxyRequestToCapture(req, truncateText(text)));
  });

  await proxyServer.on("response", async (res) => {
    const entry = captured.get(res.id);
    if (!entry) {
      return;
    }
    const text = await res.body.getText().catch(() => "");
    entry.status = res.statusCode;
    entry.statusText = res.statusMessage || "";
    entry.responseHeaders = safeJsonHeaders(res.headers || {});
    entry.responseBody = truncateText(text || "");
    entry.durationMs =
      typeof res.timingEvents?.responseSentTimestamp === "number" &&
      typeof res.timingEvents?.startTimestamp === "number"
        ? Math.max(0, Math.round(res.timingEvents.responseSentTimestamp - res.timingEvents.startTimestamp))
        : null;
    captured.set(res.id, entry);
  });

  await proxyServer.on("tls-client-error", (event) => {
    sslEvents.unshift({
      id: event.id || `${Date.now()}-${sslEvents.length}`,
      url: event.remoteIpAddress || "tls-client",
      error: event.failureCause || "tls-client-error",
      trusted: false,
      createdAt: new Date().toISOString()
    });
    sslEvents.splice(80);
  });

  await proxyServer.forAnyRequest().thenPassThrough();

  proxyState = {
    ...ca,
    running: true,
    port: proxyServer.port,
    proxyUrl: `http://127.0.0.1:${proxyServer.port}`
  };
  return proxyState;
}

async function stopMitmProxy() {
  if (proxyServer) {
    await proxyServer.stop();
    proxyServer = undefined;
  }
  proxyState = {
    ...proxyState,
    running: false
  };
  return proxyState;
}

function normalizeDraft(input = {}) {
  const method = String(input.method || "GET").toUpperCase();
  const headers = safeJsonHeaders(input.headers || {});
  const body = typeof input.body === "string" ? input.body : "";

  for (const header of ["host", "content-length", "connection", "upgrade", "proxy-connection"]) {
    delete headers[header];
    delete headers[header.toUpperCase()];
  }

  return {
    method,
    url: String(input.url || ""),
    headers,
    body: ["GET", "HEAD"].includes(method) ? "" : body.slice(0, MAX_REPLAY_BODY)
  };
}

function toCaptureEntry(requestId, request) {
  const url = request.url || "";
  let host = "";
  let pathName = "";
  try {
    const parsed = new URL(url);
    host = parsed.host;
    pathName = `${parsed.pathname}${parsed.search}`;
  } catch {
    host = url;
    pathName = "/";
  }

  return {
    id: requestId,
    startedAt: new Date().toISOString(),
    method: request.method || "GET",
    url,
    host,
    path: pathName,
    requestHeaders: safeJsonHeaders(request.headers || {}),
    requestBody: truncateText(request.postData || ""),
    status: null,
    statusText: "",
    mimeType: "",
    type: "Other",
    responseHeaders: {},
    responseBody: "",
    durationMs: null,
    allowed: isAllowedTarget(url),
    source: "browser"
  };
}

async function captureResponseBody(debuggerApi, requestId) {
  try {
    const bodyResult = await debuggerApi.sendCommand("Network.getResponseBody", { requestId });
    const buffer = bodyResult.base64Encoded
      ? Buffer.from(bodyResult.body || "", "base64")
      : Buffer.from(bodyResult.body || "", "utf8");
    return truncateText(buffer.toString("utf8"));
  } catch {
    return "";
  }
}

function attachDebugger(contentsId) {
  const id = Number(contentsId);
  const target = webContents.fromId(id);
  if (!target) {
    throw new Error("Browser surface was not found.");
  }

  if (attachedContents.has(id)) {
    return;
  }

  target.debugger.attach("1.3");
  target.debugger.sendCommand("Network.enable", {
    maxPostDataSize: MAX_REPLAY_BODY
  });

  attachedContents.add(id);

  target.debugger.on("message", async (_event, method, params) => {
    if (method === "Network.requestWillBeSent") {
      const next = toCaptureEntry(params.requestId, params.request || {});
      captured.set(params.requestId, next);
      return;
    }

    const entry = captured.get(params.requestId);
    if (!entry) {
      return;
    }

    if (method === "Network.responseReceived") {
      const response = params.response || {};
      const securityDetails = response.securityDetails || null;
      entry.status = response.status || null;
      entry.statusText = response.statusText || "";
      entry.mimeType = response.mimeType || "";
      entry.type = params.type || "Other";
      entry.responseHeaders = safeJsonHeaders(response.headers || {});
      entry.tls = securityDetails
        ? {
            protocol: securityDetails.protocol || "",
            issuer: securityDetails.issuer || "",
            subjectName: securityDetails.subjectName || "",
            validFrom: securityDetails.validFrom || 0,
            validTo: securityDetails.validTo || 0
          }
        : null;
      if (response.timing && typeof response.timing.receiveHeadersEnd === "number") {
        entry.durationMs = Math.max(0, Math.round(response.timing.receiveHeadersEnd));
      }
      captured.set(params.requestId, entry);
    }

    if (method === "Network.loadingFinished") {
      entry.responseBody = await captureResponseBody(target.debugger, params.requestId);
      if (typeof params.encodedDataLength === "number") {
        entry.encodedDataLength = params.encodedDataLength;
      }
      captured.set(params.requestId, entry);
    }

    if (method === "Network.loadingFailed") {
      entry.statusText = params.errorText || "Failed";
      captured.set(params.requestId, entry);
    }
  });

  target.once("destroyed", () => {
    attachedContents.delete(id);
  });
}

async function sendRequest(input, rules = allowlist) {
  const draft = normalizeDraft(input);
  if (!isAllowedTarget(draft.url, rules)) {
    throw new Error("Blocked by target allowlist. Add the target origin before replaying requests.");
  }

  const started = Date.now();
  const abort = new AbortController();
  const timeout = setTimeout(() => abort.abort(), 30_000);

  try {
    const response = await fetch(draft.url, {
      method: draft.method,
      headers: draft.headers,
      body: draft.body || undefined,
      redirect: "manual",
      signal: abort.signal
    });
    const buffer = Buffer.from(await response.arrayBuffer());
    const text = truncateText(buffer.toString("utf8"));

    return {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      durationMs: Date.now() - started,
      headers: Object.fromEntries(response.headers.entries()),
      body: text,
      bytes: buffer.length
    };
  } finally {
    clearTimeout(timeout);
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

ipcMain.handle("capture:attach", (_event, contentsId) => {
  attachDebugger(contentsId);
  return { ok: true };
});

ipcMain.handle("browser:open", (_event, url) => {
  return openRealChrome(url);
});

ipcMain.handle("browser:navigate", (_event, url) => {
  return openRealChrome(url);
});

ipcMain.handle("browser:back", () => {
  if (targetBrowserWindow && !targetBrowserWindow.isDestroyed() && targetBrowserWindow.webContents.canGoBack()) {
    targetBrowserWindow.webContents.goBack();
  }
  return syncBrowserState();
});

ipcMain.handle("browser:forward", () => {
  if (targetBrowserWindow && !targetBrowserWindow.isDestroyed() && targetBrowserWindow.webContents.canGoForward()) {
    targetBrowserWindow.webContents.goForward();
  }
  return syncBrowserState();
});

ipcMain.handle("browser:reload", () => {
  if (targetBrowserWindow && !targetBrowserWindow.isDestroyed()) {
    targetBrowserWindow.webContents.reload();
  }
  return syncBrowserState();
});

ipcMain.handle("browser:state", () => syncBrowserState());

ipcMain.handle("proxy:ca", () => ensureProxyCa());

ipcMain.handle("proxy:start", (_event, port) => startMitmProxy(port));

ipcMain.handle("proxy:stop", () => stopMitmProxy());

ipcMain.handle("proxy:state", () => proxyState);

ipcMain.handle("capture:snapshot", () => {
  return Array.from(captured.values())
    .filter((entry) => entry.url.startsWith("http://") || entry.url.startsWith("https://"))
    .slice(-400)
    .reverse();
});

ipcMain.handle("capture:clear", () => {
  captured.clear();
  return { ok: true };
});

ipcMain.handle("ssl:snapshot", () => sslEvents.slice(0, 80));

ipcMain.handle("targets:get", () => allowlist);

ipcMain.handle("targets:set", (_event, targets) => {
  const next = Array.isArray(targets)
    ? targets.map((target) => String(target).trim()).filter(Boolean).slice(0, 40)
    : defaultAllowlist;
  allowlist = next.length > 0 ? next : [...defaultAllowlist];
  return allowlist;
});

ipcMain.handle("repeater:send", async (_event, input) => {
  return sendRequest(input, allowlist);
});

ipcMain.handle("ai:settings:get", () => loadAiSettings(app.getPath("userData")));

ipcMain.handle("ai:settings:set", (_event, settings) => saveAiSettings(app.getPath("userData"), settings));

ipcMain.handle("ai:context:preview", (_event, payload) => {
  return previewAiContext({
    capturedMap: captured,
    allowlist,
    browserUrl: browserState.url || "",
    captureIds: payload?.captureIds,
    includeRaw: Boolean(payload?.includeRaw)
  });
});

ipcMain.handle("ai:run", async (_event, payload) => {
  return runAiTask({
    capturedMap: captured,
    allowlist,
    browserUrl: browserState.url || "",
    userDataPath: app.getPath("userData"),
    request: payload || {}
  });
});

ipcMain.handle("ai:audit:snapshot", () => snapshotAiAudit());

ipcMain.handle("ai:connect", async (_event, presetId) => {
  return connectAiPreset(app.getPath("userData"), presetId);
});

ipcMain.handle("ai:connect:probe", async (_event, settings) => {
  return probeAiSettings(settings || {});
});

ipcMain.handle("repeater:burst", async (_event, input) => {
  const draft = normalizeDraft(input.request || input);
  const count = Math.min(Math.max(Number(input.count || 1), 1), MAX_BURST_COUNT);
  const concurrency = Math.min(Math.max(Number(input.concurrency || 1), 1), MAX_BURST_CONCURRENCY);
  const delayMs = Math.min(Math.max(Number(input.delayMs || 0), 0), 10_000);
  const results = [];
  let cursor = 0;

  async function worker() {
    while (cursor < count) {
      const index = cursor;
      cursor += 1;
      if (delayMs > 0 && index > 0) {
        await delay(delayMs);
      }
      try {
        const response = await sendRequest(draft, allowlist);
        results[index] = { index: index + 1, ok: true, ...response };
      } catch (error) {
        results[index] = {
          index: index + 1,
          ok: false,
          status: 0,
          statusText: error instanceof Error ? error.message : "Replay failed",
          durationMs: 0,
          headers: {},
          body: "",
          bytes: 0
        };
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  return {
    count,
    concurrency,
    results,
    averageMs: Math.round(results.reduce((sum, item) => sum + item.durationMs, 0) / results.length),
    failures: results.filter((item) => !item.ok || item.status >= 400).length
  };
});
