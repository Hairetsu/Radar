const { app, BrowserWindow } = require("electron");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "docs", "screens");
const PREVIEW_URL = "http://127.0.0.1:4173";

let previewProcess;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function waitForServer(url, timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
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

async function clickView(win, label) {
  await win.webContents.executeJavaScript(`
    (() => {
      const button = [...document.querySelectorAll(".view-switch button")].find((item) =>
        item.textContent.includes("${label}")
      );
      button?.click();
    })();
  `);
}

async function openAiPalette(win) {
  await win.webContents.executeJavaScript(`
    (() => {
      const button = [...document.querySelectorAll("button.line-button")].find((item) =>
        item.textContent.includes("AI")
      );
      button?.click();
    })();
  `);
}

async function capture(win, filename) {
  await sleep(900);
  const image = await win.webContents.capturePage();
  fs.writeFileSync(path.join(OUT, filename), image.toPNG());
  console.log(`saved ${filename}`);
}

async function run() {
  fs.mkdirSync(OUT, { recursive: true });

  previewProcess = spawn("pnpm", ["exec", "vite", "preview", "--host", "127.0.0.1", "--port", "4173"], {
    cwd: ROOT,
    stdio: "ignore",
    shell: true
  });

  await waitForServer(PREVIEW_URL);

  const win = new BrowserWindow({
    width: 1480,
    height: 940,
    show: false,
    backgroundColor: "#07110f",
    webPreferences: {
      preload: path.join(ROOT, "electron", "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  await win.loadURL(PREVIEW_URL);
  await sleep(2200);

  await capture(win, "radar-01-traffic.png");
  await clickView(win, "Repeater");
  await capture(win, "radar-02-repeater.png");
  await clickView(win, "Scope");
  await capture(win, "radar-03-scope.png");
  await clickView(win, "SSL");
  await capture(win, "radar-04-ssl.png");
  await clickView(win, "Traffic");
  await openAiPalette(win);
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
