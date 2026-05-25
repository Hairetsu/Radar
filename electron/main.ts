import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow, ipcMain, shell, webContents, nativeImage } from "electron";
import { generateCACertificate, generateSPKIFingerprint, getLocal } from "mockttp";
import {
  DEFAULT_ALLOWLIST,
  shouldTrustLocalCertificate
} from "../shared/allowlist.js";
import { toCaptureEntry, proxyRequestToCapture } from "../shared/capture.js";
import type { BrowserState, CapturedRequest, LocalContext, ProxyState, ReplayDraft, SslEvent } from "../shared/domain.js";
import { normalizeDraft, MAX_REPLAY_BODY } from "../shared/draft.js";
import { safeJsonHeaders } from "../shared/headers.js";
import { MAX_CAPTURED_BODY, truncateText } from "../shared/text.js";
import { normalizeUrl as normalizeBrowserUrl } from "../shared/url.js";
import { openLocalStore, type LocalStore } from "./localStore.js";
import {
  loadSettings as loadAiSettings,
  saveSettings as saveAiSettings,
  previewContext as previewAiContext,
  runAiTask,
  snapshotAudit as snapshotAiAudit,
  connectPreset as connectAiPreset,
  probeSettings as probeAiSettings
} from "./ai/index.js";
import { findSystemBrowser } from "./systemBrowser.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const MAX_BURST_COUNT = 50;
const MAX_BURST_CONCURRENCY = 5;
const HOT_CAPTURE_LIMIT = 500;

const defaultAllowlist = DEFAULT_ALLOWLIST;

let mainWindow: BrowserWindow | null = null;
let targetBrowserWindow: BrowserWindow | undefined;
let chromeProcess: ChildProcess | null = null;
let proxyServer: ReturnType<typeof getLocal> | undefined;
let allowlist = [...defaultAllowlist];
const captured = new Map<string, CapturedRequest>();
const attachedContents = new Set<number>();
const sslEvents: SslEvent[] = [];
let localStore: LocalStore | null = null;
let localContext: LocalContext | null = null;
let browserState: BrowserState = {
  open: false,
  url: "",
  title: "",
  loading: false,
  engine: "none"
};
let proxyState: ProxyState = {
  running: false,
  port: 8088,
  proxyUrl: "http://127.0.0.1:8088",
  caCertPath: "",
  caKeyPath: "",
  caFingerprint: ""
};

function activeLocalContext() {
  if (!localContext) {
    throw new Error("Local workspace is not ready.");
  }
  return localContext;
}

function rememberCapture(entry: CapturedRequest) {
  captured.set(entry.id, entry);
  while (captured.size > HOT_CAPTURE_LIMIT) {
    const oldest = captured.keys().next().value;
    if (!oldest) {
      break;
    }
    captured.delete(oldest);
  }

  if (localStore && localContext) {
    localStore.upsertCapture(localContext.session.id, entry);
  }
}

function rememberSslEvent(event: SslEvent) {
  sslEvents.unshift(event);
  sslEvents.splice(80);

  if (localStore && localContext) {
    localStore.insertSslEvent(localContext.session.id, event);
  }
}

function hydrateActiveLocalState() {
  if (!localStore || !localContext) {
    return;
  }

  allowlist = localStore.getTargets(localContext.workspace.id);
  captured.clear();
  for (const entry of localStore.listCaptures(localContext.session.id, HOT_CAPTURE_LIMIT).reverse()) {
    captured.set(entry.id, entry);
  }

  sslEvents.splice(0, sslEvents.length, ...localStore.listSslEvents(localContext.session.id, 80));
}

function initializeLocalState() {
  localStore = openLocalStore(app.getPath("userData"));
  localContext = localStore.getActiveContext();
  hydrateActiveLocalState();
}

function loadAppIcon() {
  const base = path.join(__dirname, "..", "..", "resources");
  const candidates =
    process.platform === "darwin"
      ? [path.join(base, "icon.icns"), path.join(base, "icon.png")]
      : [path.join(base, "icon.png")];

  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) {
      continue;
    }
    const image = nativeImage.createFromPath(candidate);
    if (!image.isEmpty()) {
      return image;
    }
  }

  return null;
}

function applyAppIcon() {
  const icon = loadAppIcon();
  if (!icon || process.platform !== "darwin" || !app.dock) {
    return;
  }
  app.dock.setIcon(icon);
}

function createWindow() {
  const icon = loadAppIcon();
  mainWindow = new BrowserWindow({
    width: 1480,
    height: 940,
    minWidth: 1120,
    minHeight: 760,
    title: "Radar",
    ...(icon ? { icon } : {}),
    backgroundColor: "#07110f",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
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

  mainWindow.webContents.on("before-input-event", (_event, input) => {
    if (input.type !== "keyDown") return;
    const key = input.key?.toLowerCase();
    const toggleCombo =
      (process.platform === "darwin" && input.meta && input.alt && key === "i") ||
      (process.platform !== "darwin" && input.control && input.shift && key === "i") ||
      key === "f12";
    if (toggleCombo) {
      mainWindow!.webContents.toggleDevTools();
    }
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    mainWindow.loadURL(devUrl);
  } else {
    mainWindow.loadFile(path.join(__dirname, "..", "..", "dist", "index.html"));
  }
}

app.whenReady().then(() => {
  initializeLocalState();
  applyAppIcon();
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

app.on("before-quit", () => {
  localStore?.close();
  localStore = null;
});

app.on("certificate-error", (event, _contents, url, error, certificate, callback) => {
  const trusted = shouldTrustLocalCertificate(url);
  rememberSslEvent({
    id: `${Date.now()}-${sslEvents.length}`,
    url,
    error,
    trusted,
    subjectName: certificate?.subjectName,
    issuerName: certificate?.issuerName,
    createdAt: new Date().toISOString()
  });

  if (trusted) {
    event.preventDefault();
    callback(true);
    return;
  }

  callback(false);
});

function currentBrowserState(): BrowserState {
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
  const profileId = localContext?.profile.id || "default";
  const profileDir = path.join(app.getPath("userData"), "profiles", profileId, "proxy-browser-profile");
  fs.mkdirSync(profileDir, { recursive: true });
  return profileDir;
}

function stopChromeProcess() {
  if (!chromeProcess || chromeProcess.killed) {
    chromeProcess = null;
    return;
  }
  try {
    chromeProcess.kill();
  } catch {
    /* ignore */
  }
  chromeProcess = null;
}

async function openRealChrome(urlString: string) {
  const nextUrl = normalizeBrowserUrl(urlString);
  const browser = findSystemBrowser();
  const proxy = await startMitmProxy(proxyState.port);
  const remoteDebuggingPort = 9223;

  stopChromeProcess();

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

  const launched = await new Promise<ChildProcess>((resolve, reject) => {
    const child = spawn(browser.executablePath, args, {
      detached: true,
      stdio: "ignore"
    });
    child.once("error", reject);
    child.once("spawn", () => resolve(child));
  });

  chromeProcess = launched;
  launched.unref();
  launched.once("exit", (code, signal) => {
    if (code && code !== 0) {
      console.error(`[radar] browser exited code=${code} signal=${signal}`);
    }
    browserState = {
      ...browserState,
      open: false,
      loading: false
    };
    chromeProcess = null;
  });

  browserState = {
    open: true,
    url: nextUrl,
    title: browser.channel,
    loading: false,
    engine: "chrome",
    remoteDebuggingUrl: `http://127.0.0.1:${remoteDebuggingPort}`,
    profileDir: chromeProfileDir(),
    executablePath: browser.executablePath,
    channel: browser.channel
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
    rememberCapture(proxyRequestToCapture({ req, bodyText: truncateText(text), rules: allowlist }));
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
    rememberCapture(entry);
  });

  await proxyServer.on("tls-client-error", (event) => {
    rememberSslEvent({
      id: `${Date.now()}-${sslEvents.length}`,
      url: event.remoteIpAddress || "tls-client",
      error: event.failureCause || "tls-client-error",
      trusted: false,
      createdAt: new Date().toISOString()
    });
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

async function captureResponseBody(
  debuggerApi: { sendCommand: (method: string, params: { requestId: string }) => Promise<{ base64Encoded?: boolean; body?: string }> },
  requestId: string
) {
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

function attachDebugger(contentsId: number) {
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
      const next = toCaptureEntry({
        requestId: params.requestId,
        request: params.request || {},
        rules: allowlist
      });
      rememberCapture(next);
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
      rememberCapture(entry);
    }

    if (method === "Network.loadingFinished") {
      entry.responseBody = await captureResponseBody(target.debugger, params.requestId);
      if (typeof params.encodedDataLength === "number") {
        entry.encodedDataLength = params.encodedDataLength;
      }
      rememberCapture(entry);
    }

    if (method === "Network.loadingFailed") {
      entry.statusText = params.errorText || "Failed";
      rememberCapture(entry);
    }
  });

  target.once("destroyed", () => {
    attachedContents.delete(id);
  });
}

async function sendRequest(input: ReplayDraft | Parameters<typeof normalizeDraft>[0]) {
  const draft = normalizeDraft(input);

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

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

ipcMain.handle("capture:attach", (_event, contentsId) => {
  attachDebugger(contentsId);
  return { ok: true };
});

ipcMain.handle("local:context", () => activeLocalContext());

ipcMain.handle("local:session:create", (_event, name) => {
  const context = activeLocalContext();
  const session = localStore?.createSession(context.workspace.id, typeof name === "string" ? name : undefined);
  if (!session) {
    throw new Error("Local store is not ready.");
  }
  localContext = {
    ...context,
    session
  };
  hydrateActiveLocalState();
  return localContext;
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
  if (localStore && localContext) {
    return localStore
      .listCaptures(localContext.session.id, 2000)
      .filter((entry) => entry.url.startsWith("http://") || entry.url.startsWith("https://"))
      .slice(0, 400);
  }
  return Array.from(captured.values())
    .filter((entry) => entry.url.startsWith("http://") || entry.url.startsWith("https://"))
    .slice(-400)
    .reverse();
});

ipcMain.handle("capture:clear", () => {
  captured.clear();
  if (localStore && localContext) {
    localStore.clearCaptures(localContext.session.id);
  }
  return { ok: true };
});

ipcMain.handle("ssl:snapshot", () => sslEvents.slice(0, 80));

ipcMain.handle("targets:get", () => allowlist);

ipcMain.handle("targets:set", (_event, targets) => {
  const next = Array.isArray(targets)
    ? targets.map((target) => String(target).trim()).filter(Boolean).slice(0, 40)
    : defaultAllowlist;
  allowlist = next.length > 0 ? next : [...defaultAllowlist];
  if (localStore && localContext) {
    allowlist = localStore.setTargets(localContext.workspace.id, allowlist);
  }
  return allowlist;
});

ipcMain.handle("repeater:send", async (_event, input) => {
  return sendRequest(input);
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
  return connectAiPreset({ userDataPath: app.getPath("userData"), presetId });
});

ipcMain.handle("ai:connect:probe", async (_event, settings) => {
  return probeAiSettings(settings || {});
});

ipcMain.handle("repeater:burst", async (_event, input) => {
  const draft = normalizeDraft(input.request || input);
  const count = Math.min(Math.max(Number(input.count || 1), 1), MAX_BURST_COUNT);
  const concurrency = Math.min(Math.max(Number(input.concurrency || 1), 1), MAX_BURST_CONCURRENCY);
  const delayMs = Math.min(Math.max(Number(input.delayMs || 0), 0), 10_000);
  const results: Array<{
    index: number;
    ok: boolean;
    status: number;
    statusText: string;
    durationMs: number;
    headers: Record<string, string>;
    body: string;
    bytes: number;
  }> = [];
  let cursor = 0;

  async function worker() {
    while (cursor < count) {
      const index = cursor;
      cursor += 1;
      if (delayMs > 0 && index > 0) {
        await delay(delayMs);
      }
      try {
        const response = await sendRequest(draft);
        results[index] = { ...response, index: index + 1 };
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
