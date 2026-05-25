import fs from "node:fs";

export type SystemBrowser = {
  executablePath: string;
  channel: string;
};

type BrowserCandidate = {
  channel: string;
  executablePath: string;
};

function macApp(appName: string, binaryName = appName): BrowserCandidate {
  return {
    channel: appName,
    executablePath: `/Applications/${appName}.app/Contents/MacOS/${binaryName}`
  };
}

function browserCandidates(): BrowserCandidate[] {
  if (process.platform === "darwin") {
    return [
      macApp("Google Chrome"),
      macApp("Google Chrome Canary"),
      macApp("Chromium"),
      macApp("Microsoft Edge", "Microsoft Edge"),
      macApp("Brave Browser", "Brave Browser")
    ];
  }

  if (process.platform === "win32") {
    const localAppData = process.env.LOCALAPPDATA || "";
    const programFiles = process.env.ProgramFiles || "C:\\Program Files";
    const programFilesX86 = process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";
    return [
      { channel: "Google Chrome", executablePath: `${programFiles}\\Google\\Chrome\\Application\\chrome.exe` },
      { channel: "Google Chrome", executablePath: `${programFilesX86}\\Google\\Chrome\\Application\\chrome.exe` },
      { channel: "Google Chrome", executablePath: `${localAppData}\\Google\\Chrome\\Application\\chrome.exe` },
      { channel: "Microsoft Edge", executablePath: `${programFiles}\\Microsoft\\Edge\\Application\\msedge.exe` },
      { channel: "Microsoft Edge", executablePath: `${programFilesX86}\\Microsoft\\Edge\\Application\\msedge.exe` }
    ];
  }

  return [
    { channel: "Google Chrome", executablePath: "/usr/bin/google-chrome-stable" },
    { channel: "Google Chrome", executablePath: "/usr/bin/google-chrome" },
    { channel: "Chromium", executablePath: "/usr/bin/chromium-browser" },
    { channel: "Chromium", executablePath: "/usr/bin/chromium" },
    { channel: "Microsoft Edge", executablePath: "/usr/bin/microsoft-edge" }
  ];
}

export function findSystemBrowser(): SystemBrowser {
  for (const candidate of browserCandidates()) {
    if (!fs.existsSync(candidate.executablePath)) {
      continue;
    }
    try {
      fs.accessSync(candidate.executablePath, fs.constants.X_OK);
    } catch {
      continue;
    }
    return candidate;
  }

  throw new Error(
    "No supported browser found. Install Google Chrome, Microsoft Edge, or Chromium, then try Deploy again."
  );
}
