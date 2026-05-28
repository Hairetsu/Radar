import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const KEYCHAIN_PASSWORD = "radar-proxy";
const CA_COMMON_NAME = "Radar Local Proxy CA";

function runSecurity(args: string[]) {
  execFileSync("security", args, { stdio: "ignore" });
}

function keychainExists(keychainPath: string) {
  return fs.existsSync(keychainPath);
}

function certIsTrusted(keychainPath: string) {
  try {
    runSecurity(["find-certificate", "-c", CA_COMMON_NAME, keychainPath]);
    return true;
  } catch {
    return false;
  }
}

export function readUserKeychainSearchList() {
  const result = spawnSync("security", ["list-keychains", "-d", "user"], { encoding: "utf8" });
  if (result.status !== 0) {
    return [] as string[];
  }

  return result.stdout
    .split("\n")
    .map((line) => line.replace(/^"|"$/g, "").trim())
    .filter(Boolean);
}

export function setUserKeychainSearchList(keychains: string[]) {
  if (keychains.length === 0) {
    return;
  }
  runSecurity(["list-keychains", "-d", "user", "-s", ...keychains]);
}

export function trustProxyCa(caCertPath: string, caDir: string) {
  if (process.platform !== "darwin") {
    return null;
  }

  const keychainPath = path.join(caDir, "radar.keychain-db");
  fs.mkdirSync(caDir, { recursive: true });

  if (!keychainExists(keychainPath)) {
    runSecurity(["create-keychain", "-p", KEYCHAIN_PASSWORD, keychainPath]);
    runSecurity(["set-keychain-settings", "-lut", "21600", keychainPath]);
  }

  runSecurity(["unlock-keychain", "-p", KEYCHAIN_PASSWORD, keychainPath]);

  if (!certIsTrusted(keychainPath)) {
    runSecurity([
      "add-trusted-cert",
      "-d",
      "-r",
      "trustRoot",
      "-p",
      "ssl",
      "-p",
      "basic",
      "-k",
      keychainPath,
      caCertPath
    ]);
  }

  return keychainPath;
}

export function ensureRadarKeychainInSearchList(keychainPath: string) {
  const existing = readUserKeychainSearchList();
  if (existing.includes(keychainPath)) {
    return existing;
  }

  setUserKeychainSearchList([keychainPath, ...existing]);
  return existing;
}
