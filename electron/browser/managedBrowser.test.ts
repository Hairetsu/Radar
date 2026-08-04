import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BrowserState } from "../../shared/domain.js";

const browserMocks = vi.hoisted(() => {
  const processListeners = new Map<string, (...args: unknown[]) => void>();
  const child = {
    killed: false,
    kill: vi.fn(),
    unref: vi.fn(),
    once: vi.fn((event: string, listener: (...args: unknown[]) => void) => {
      processListeners.set(event, listener);
      if (event === "spawn") void Promise.resolve().then(() => listener());
    })
  };
  const automationState = {
    status: "connected",
    url: "https://target.example/",
    title: "Target",
    loading: false,
    pageCount: 1,
    error: ""
  };
  const automation = {
    state: vi.fn(() => automationState),
    connect: vi.fn(async () => undefined),
    reload: vi.fn(async () => undefined),
    navigate: vi.fn(async (url: string) => {
      automationState.url = url;
    }),
    reset: vi.fn()
  };
  return { processListeners, child, automation, automationState };
});

vi.mock("node:child_process", () => ({ spawn: vi.fn(() => browserMocks.child) }));
vi.mock("node:net", () => ({
  createServer: () => {
    const server = {
      unref: () => undefined,
      once: () => server,
      listen: (_port: number, _host: string, listener: () => void) => {
        listener();
        return server;
      },
      close: (listener: () => void) => listener()
    };
    return server;
  }
}));
vi.mock("../playwrightBrowser.js", () => ({
  createPlaywrightBrowserController: () => browserMocks.automation
}));
vi.mock("../systemBrowser.js", () => ({
  findSystemBrowser: () => ({ executablePath: "/Applications/Test Browser", channel: "test" })
}));
vi.mock("../trustCa.js", () => ({
  trustProxyCa: vi.fn(() => null),
  ensureRadarKeychainInSearchList: vi.fn()
}));
vi.mock("./cdpClient.js", () => ({
  fetchCdpTargets: vi.fn(async () => []),
  waitForChromeDebugger: vi.fn(async () => [])
}));
vi.mock("../chromeDebugging.js", () => ({
  findCdpEndpointForUrl: vi.fn(async () => "")
}));

import { createManagedBrowser } from "./managedBrowser.js";

const temporaryDirectories: string[] = [];

afterEach(() => {
  vi.clearAllMocks();
  browserMocks.processListeners.clear();
  browserMocks.automationState.url = "https://target.example/";
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

function createBrowser(
  electronSurfaceState: () => BrowserState | null = () => null,
  startProxy = vi.fn(async () => ({
    running: true,
    port: 8_088,
    proxyUrl: "http://127.0.0.1:8088",
    caCertPath: "/tmp/ca.pem",
    caKeyPath: "/tmp/ca-key.pem",
    caFingerprint: "fingerprint"
  }))
) {
  const captureObserver = { start: vi.fn(async () => undefined), stop: vi.fn() };
  const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), "radar-managed-browser-"));
  temporaryDirectories.push(userDataPath);
  const onProcessExit = vi.fn();
  const browser = createManagedBrowser({
    userDataPath,
    defaultDebugPort: 9_223,
    profileId: () => "profile-1",
    allowlist: () => ["https://target.example"],
    startProxy,
    proxyState: () => ({
      running: false,
      port: 8_088,
      proxyUrl: "http://127.0.0.1:8088",
      caCertPath: "",
      caKeyPath: "",
      caFingerprint: ""
    }),
    captureObserver,
    electronSurfaceState,
    onProcessExit
  });
  return { browser, captureObserver, onProcessExit, startProxy, userDataPath };
}

describe("managed browser", () => {
  it("projects an Electron browser surface through the shared browser state contract", () => {
    const { browser } = createBrowser(() => ({
      open: true,
      url: "https://target.example/",
      title: "Target",
      loading: false,
      engine: "electron"
    }));

    expect(browser.state()).toEqual(
      expect.objectContaining({ open: true, engine: "electron", title: "Target" })
    );
  });

  it("fails closed without a debugging endpoint and resets owned lifecycle state", async () => {
    const { browser, captureObserver } = createBrowser();
    await expect(browser.ensureAutomation()).rejects.toThrow("No Chrome debugging endpoint");

    browser.setDedicatedProfileDir("/tmp/radar-managed-browser-test/dedicated");
    expect(browser.reset()).toEqual(
      expect.objectContaining({ open: false, engine: "none", loading: false })
    );
    browser.clearDedicatedProfileDir();
    expect(captureObserver.stop).toHaveBeenCalledOnce();
  });

  it("launches, navigates, observes, and stops the managed Chrome lifecycle", async () => {
    const { browser, captureObserver, onProcessExit, userDataPath } = createBrowser();
    browser.setDedicatedProfileDir(path.join(userDataPath, "identity-profile"));

    await expect(browser.open("https://target.example/start")).resolves.toEqual(
      expect.objectContaining({ open: true, engine: "chrome", channel: "test" })
    );
    expect(captureObserver.start).toHaveBeenCalledWith(expect.stringMatching(/^http:\/\/127\.0\.0\.1:/));
    expect(browserMocks.automation.connect).toHaveBeenCalledOnce();
    expect(browserMocks.automation.reload).toHaveBeenCalledOnce();

    await browser.navigate("https://target.example/next");
    expect(browserMocks.automation.navigate).toHaveBeenCalledWith("https://target.example/next");
    expect(browser.state().url).toBe("https://target.example/next");

    browser.stop();
    expect(browserMocks.child.kill).toHaveBeenCalled();

    await browser.open("https://target.example/reopened");
    browserMocks.processListeners.get("exit")?.(0, null);
    expect(onProcessExit).toHaveBeenCalledOnce();
    expect(browser.rawState().open).toBe(false);
  });

  it("uses the next local proxy port when the preferred port is occupied", async () => {
    const addressInUse = Object.assign(
      new Error("listen EADDRINUSE: address already in use :::8088"),
      { code: "EADDRINUSE" }
    );
    const startProxy = vi.fn()
      .mockRejectedValueOnce(addressInUse)
      .mockResolvedValueOnce({
        running: true,
        port: 8_089,
        proxyUrl: "http://127.0.0.1:8089",
        caCertPath: "/tmp/ca.pem",
        caKeyPath: "/tmp/ca-key.pem",
        caFingerprint: "fingerprint"
      });
    const { browser } = createBrowser(() => null, startProxy);

    await expect(browser.open("https://target.example/start")).resolves.toEqual(
      expect.objectContaining({ open: true, engine: "chrome" })
    );
    expect(startProxy).toHaveBeenNthCalledWith(1, 8_088);
    expect(startProxy).toHaveBeenNthCalledWith(2, 8_089);
  });
});
