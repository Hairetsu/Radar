import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow } from "electron";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..", "..");
const OUT = path.join(ROOT, "docs", "screens");
const PREVIEW_URL = "http://127.0.0.1:4173";
const SCREENSHOT_PRELOAD = path.join(__dirname, "screenshotPreload.js");

let previewProcess: ChildProcess | undefined;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function waitForServer(url: string, timeoutMs = 60000) {
  return new Promise<void>((resolve, reject) => {
    const started = Date.now();
    const probe = () => {
      http
        .get(url, (response) => {
          response.resume();
          resolve();
        })
        .on("error", () => {
          if (Date.now() - started > timeoutMs) {
            reject(new Error(`Timed out waiting for ${url}`));
            return;
          }
          setTimeout(probe, 400);
        });
    };
    probe();
  });
}

async function waitForTestId(win: BrowserWindow, testId: string, timeoutMs = 10000) {
  const found = await win.webContents.executeJavaScript(`
    new Promise((resolve) => {
      const started = Date.now();
      const check = () => {
        if (document.querySelector('[data-testid="${testId}"]')) {
          resolve(true);
          return;
        }
        if (Date.now() - started > ${timeoutMs}) {
          resolve(false);
          return;
        }
        setTimeout(check, 100);
      };
      check();
    });
  `);
  if (!found) {
    throw new Error(`Could not find screenshot target: ${testId}`);
  }
}

async function clickTestId(win: BrowserWindow, testId: string) {
  await waitForTestId(win, testId);
  const clicked = await win.webContents.executeJavaScript(`
    (() => {
      const button = document.querySelector('[data-testid="${testId}"]');
      if (!button) {
        return false;
      }
      button.click();
      return true;
    })();
  `);
  if (!clicked) {
    throw new Error(`Could not click screenshot target: ${testId}`);
  }
}

async function fillTestId(win: BrowserWindow, testId: string, value: string) {
  await waitForTestId(win, testId);
  const filled = await win.webContents.executeJavaScript(`
    (() => {
      const field = document.querySelector('[data-testid="${testId}"]');
      if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement)) {
        return false;
      }
      const prototype = field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
      if (!setter) {
        return false;
      }
      setter.call(field, ${JSON.stringify(value)});
      field.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    })();
  `);
  if (!filled) {
    throw new Error(`Could not fill screenshot target: ${testId}`);
  }
}

async function rightClickTestId(win: BrowserWindow, testId: string, clientX: number, clientY: number) {
  await waitForTestId(win, testId);
  const opened = await win.webContents.executeJavaScript(`
    new Promise((resolve) => {
      const target = document.querySelector('[data-testid="${testId}"]');
      if (!target) {
        resolve(false);
        return;
      }
      target.dispatchEvent(new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        button: 2,
        buttons: 2,
        clientX: ${clientX},
        clientY: ${clientY},
        view: window
      }));
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          resolve(Boolean(document.querySelector('[data-testid="requestContextMenu"]')));
        });
      });
    });
  `);
  if (!opened) {
    throw new Error(`Could not open context menu from screenshot target: ${testId}`);
  }
}

async function pressEscape(win: BrowserWindow) {
  await win.webContents.executeJavaScript(`
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  `);
}

async function capture(win: BrowserWindow, filename: string) {
  await sleep(900);
  const image = await win.webContents.capturePage();
  fs.writeFileSync(path.join(OUT, filename), image.toPNG());
}

async function run() {
  fs.mkdirSync(OUT, { recursive: true });

  previewProcess = spawn("pnpm", ["exec", "vite", "preview", "--host", "127.0.0.1", "--port", "4173"], {
    cwd: ROOT,
    stdio: "ignore",
    shell: process.platform === "win32"
  });

  try {
    await waitForServer(PREVIEW_URL);

    const win = new BrowserWindow({
      width: 1480,
      height: 940,
      show: false,
      backgroundColor: "#07110f",
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        preload: SCREENSHOT_PRELOAD,
        sandbox: false
      }
    });

    await win.loadURL(PREVIEW_URL);
    await win.webContents.executeJavaScript(`window.localStorage.setItem("radar.theme", "bureau");`);
    await win.loadURL(PREVIEW_URL);
    await sleep(2200);

    await capture(win, "radar-01-traffic.png");
    await rightClickTestId(win, "trafficRow-cap-auth", 720, 360);
    await capture(win, "radar-06-request-menu.png");
    await pressEscape(win);
    await clickTestId(win, "view-repeater");
    await capture(win, "radar-02-repeater.png");
    await clickTestId(win, "view-automate");
    await fillTestId(win, "automateMarkerName", "role");
    await fillTestId(win, "automatePayloads", "admin\ntrue\n../etc/passwd");
    await clickTestId(win, "markAutomateUrl");
    await waitForTestId(win, "automateResults");
    await capture(win, "radar-07-automate.png");
    await clickTestId(win, "view-scope");
    await capture(win, "radar-03-scope.png");
    await clickTestId(win, "view-ssl");
    await capture(win, "radar-04-ssl.png");
    await clickTestId(win, "view-scope");
    await clickTestId(win, "openAiPalette");
    await sleep(300);
    await capture(win, "radar-05-ai-palette.png");
  } finally {
    previewProcess.kill("SIGTERM");
    app.quit();
  }
}

app.whenReady().then(run).catch((error) => {
  console.error(error);
  previewProcess?.kill("SIGTERM");
  app.quit();
  process.exitCode = 1;
});

app.on("window-all-closed", () => {
  if (previewProcess) {
    previewProcess.kill("SIGTERM");
  }
});
