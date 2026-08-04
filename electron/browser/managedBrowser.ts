import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import { createServer } from "node:net";
import path from "node:path";
import type { BrowserState, ProxyState } from "../../shared/domain.js";
import { normalizeUrl } from "../../shared/url.js";
import { findCdpEndpointForUrl } from "../chromeDebugging.js";
import { createPlaywrightBrowserController } from "../playwrightBrowser.js";
import { findSystemBrowser } from "../systemBrowser.js";
import { ensureRadarKeychainInSearchList, trustProxyCa } from "../trustCa.js";
import { fetchCdpTargets, waitForChromeDebugger } from "./cdpClient.js";

type ManagedBrowserOptions = {
  userDataPath: string;
  defaultDebugPort: number;
  profileId: () => string;
  allowlist: () => string[];
  startProxy: (port: number) => Promise<ProxyState>;
  proxyState: () => ProxyState;
  captureObserver: { start: (endpoint: string) => Promise<void>; stop: () => void };
  electronSurfaceState: () => BrowserState | null;
  onProcessExit: () => void;
};

async function canUsePort(port: number) {
  return new Promise<boolean>((resolve) => {
    const server = createServer();
    server.unref();
    server.once("error", () => resolve(false));
    server.listen(port, "127.0.0.1", () => server.close(() => resolve(true)));
  });
}

async function findOpenPort(startPort: number) {
  for (let port = startPort; port < startPort + 80; port += 1) {
    if (await canUsePort(port)) return port;
  }
  throw new Error(`No open local port found for Chrome debugging near ${startPort}.`);
}

function isAddressInUseError(error: unknown) {
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    error.code === "EADDRINUSE"
  ) {
    return true;
  }
  const message = error instanceof Error ? error.message : String(error || "");
  return /EADDRINUSE|address already in use/i.test(message);
}

async function startManagedProxy(
  startPort: number,
  startProxy: (port: number) => Promise<ProxyState>
) {
  for (let offset = 0; offset < 80 && startPort + offset <= 65_535; offset += 1) {
    const port = startPort + offset;
    try {
      return await startProxy(port);
    } catch (error) {
      if (!isAddressInUseError(error)) {
        throw error;
      }
    }
  }
  throw new Error(`No open local port found for the Radar proxy near ${startPort}.`);
}

export function createManagedBrowser({
  userDataPath,
  defaultDebugPort,
  profileId,
  allowlist,
  startProxy,
  proxyState,
  captureObserver,
  electronSurfaceState,
  onProcessExit
}: ManagedBrowserOptions) {
  let chromeProcess: ChildProcess | null = null;
  let dedicatedProfileDir = "";
  let state: BrowserState = {
    open: false,
    url: "",
    title: "",
    loading: false,
    engine: "none"
  };
  const automation = createPlaywrightBrowserController({
    allowlist,
    onStateChange: (next) => {
      state = {
        ...state,
        url: next.url || state.url,
        title: next.title || state.title,
        loading: next.loading,
        automation: next.status,
        automationPageCount: next.pageCount,
        automationError: next.error
      };
    }
  });

  function currentState() {
    if (state.engine === "chrome" && state.open) {
      const next = automation.state();
      state = {
        ...state,
        url: next.url || state.url,
        title: next.title || state.title,
        loading: next.loading,
        automation: next.status,
        automationPageCount: next.pageCount,
        automationError: next.error
      };
      return state;
    }
    const electronState = electronSurfaceState();
    if (electronState) {
      state = electronState;
      return state;
    }
    state = { ...state, open: false, loading: false, engine: state.engine || "none" };
    return state;
  }

  function profileDirectory() {
    if (dedicatedProfileDir) {
      fs.mkdirSync(dedicatedProfileDir, { recursive: true, mode: 0o700 });
      return dedicatedProfileDir;
    }
    const directory = path.join(
      userDataPath,
      "profiles",
      profileId() || "default",
      "proxy-browser-profile"
    );
    fs.mkdirSync(directory, { recursive: true });
    return directory;
  }

  function stop() {
    captureObserver.stop();
    automation.reset();
    if (chromeProcess && !chromeProcess.killed) {
      try {
        chromeProcess.kill();
      } catch {
        /* Process shutdown remains best-effort. */
      }
    }
    chromeProcess = null;
    state = { ...state, open: false, loading: false };
  }

  async function ensureAutomation() {
    const endpoint = state.remoteDebuggingUrl;
    if (!endpoint) {
      throw new Error("No Chrome debugging endpoint is available for Playwright automation.");
    }
    await automation.connect(endpoint);
    return automation;
  }

  async function open(urlString: string) {
    const nextUrl = normalizeUrl(urlString);
    const browser = findSystemBrowser();
    const currentProxy = proxyState();
    const proxy = currentProxy.running
      ? currentProxy
      : await startManagedProxy(currentProxy.port, startProxy);
    const remoteDebuggingPort = await findOpenPort(defaultDebugPort);
    const profileDir = profileDirectory();
    stop();
    const radarKeychain = trustProxyCa(proxy.caCertPath, path.dirname(proxy.caCertPath));
    if (radarKeychain) ensureRadarKeychainInSearchList(radarKeychain);
    const args = [
      `--user-data-dir=${profileDir}`,
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
    const launched = await new Promise<ChildProcess>((resolve, reject) => {
      const child = spawn(browser.executablePath, args, { detached: true, stdio: "ignore" });
      child.once("error", reject);
      child.once("spawn", () => resolve(child));
    });
    chromeProcess = launched;
    launched.unref();
    launched.once("exit", (code, signal) => {
      if (code && code !== 0) {
        console.error(`[radar] browser exited code=${code} signal=${signal}`);
      }
      if (chromeProcess !== launched) return;
      onProcessExit();
      state = { ...state, open: false, loading: false };
      chromeProcess = null;
    });
    const remoteDebuggingUrl = `http://127.0.0.1:${remoteDebuggingPort}`;
    state = {
      open: true,
      url: nextUrl,
      title: browser.channel,
      loading: false,
      engine: "chrome",
      automation: "connecting",
      automationPageCount: 0,
      remoteDebuggingUrl,
      profileDir,
      executablePath: browser.executablePath,
      channel: browser.channel
    };
    try {
      await waitForChromeDebugger(remoteDebuggingUrl, 8_000);
      await captureObserver.start(remoteDebuggingUrl);
      await automation.connect(remoteDebuggingUrl);
      await automation.reload();
    } catch (error) {
      const recoveredDebuggingUrl = await findCdpEndpointForUrl({
        requestedUrl: nextUrl,
        fetchTargets: fetchCdpTargets
      });
      if (recoveredDebuggingUrl) {
        state = { ...state, open: true, loading: false, remoteDebuggingUrl: recoveredDebuggingUrl };
        await captureObserver.start(recoveredDebuggingUrl);
        await automation.connect(recoveredDebuggingUrl);
        await automation.reload();
        console.warn(
          `[radar] Chrome reused an existing debugging endpoint at ${recoveredDebuggingUrl}: ${
            error instanceof Error ? error.message : "unknown error"
          }`
        );
        return state;
      }
      if (
        chromeProcess !== launched ||
        !state.open ||
        state.remoteDebuggingUrl !== remoteDebuggingUrl
      ) {
        throw error;
      }
      console.warn(
        `[radar] Chrome debugging endpoint was not ready after launch: ${
          error instanceof Error ? error.message : "unknown error"
        }`
      );
    }
    return state;
  }

  async function navigate(urlString: string) {
    const nextUrl = normalizeUrl(urlString);
    if (!state.open || state.engine !== "chrome" || !state.remoteDebuggingUrl) return open(nextUrl);
    await (await ensureAutomation()).navigate(nextUrl);
    return currentState();
  }

  return {
    state: currentState,
    rawState: () => state,
    open,
    navigate,
    stop,
    reset() {
      stop();
      state = { open: false, url: state.url, title: "", loading: false, engine: "none" };
      return state;
    },
    ensureAutomation,
    setDedicatedProfileDir: (directory: string) => {
      dedicatedProfileDir = directory;
    },
    clearDedicatedProfileDir: () => {
      dedicatedProfileDir = "";
    }
  };
}
