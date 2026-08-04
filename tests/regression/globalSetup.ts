import { constants } from "node:fs";
import { access } from "node:fs/promises";
import { createRequire } from "node:module";

const requireFromRegressionSetup = createRequire(import.meta.url);

export async function ensureElectronBinary() {
  const executablePath: unknown = requireFromRegressionSetup("electron");
  if (typeof executablePath !== "string" || !executablePath.trim()) {
    throw new Error("Electron did not resolve to an executable path.");
  }
  await access(executablePath, constants.X_OK);
}

export default ensureElectronBinary;
