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

async function clickTestId(win: BrowserWindow, testId: string) {
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
    throw new Error(`Could not find screenshot target: ${testId}`);
  }
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

  await waitForServer(PREVIEW_URL);

  const win = new BrowserWindow({
    width: 1480,
    height: 940,
    show: false,
    backgroundColor: "#07110f",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  await win.loadURL(PREVIEW_URL);
  await win.webContents.executeJavaScript(`window.localStorage.setItem("radar.theme", "bureau");`);
  await win.loadURL(PREVIEW_URL);
  await sleep(2200);

  await capture(win, "radar-01-traffic.png");
  await clickTestId(win, "view-repeater");
  await capture(win, "radar-02-repeater.png");
  await clickTestId(win, "view-scope");
  await capture(win, "radar-03-scope.png");
  await clickTestId(win, "view-ssl");
  await capture(win, "radar-04-ssl.png");
  await clickTestId(win, "view-scope");
  await clickTestId(win, "openAiPalette");
  await sleep(300);
  await capture(win, "radar-05-ai-palette.png");

  previewProcess.kill("SIGTERM");
  app.quit();
}

app.whenReady().then(run);

app.on("window-all-closed", () => {
  if (previewProcess) {
    previewProcess.kill("SIGTERM");
  }
});
