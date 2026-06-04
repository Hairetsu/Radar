import fs from "node:fs";
import path from "node:path";
import type { InstalledPlugin, PluginInstallPreview } from "../shared/domain.js";
import { buildPluginInstallPreview, parsePluginManifestJson } from "../shared/plugins.js";

function nowIso() {
  return new Date().toISOString();
}

function normalizeSourcePath(sourcePath: unknown) {
  return path.resolve(String(sourcePath || "").trim());
}

function pluginRootForManifest(manifestPath: string) {
  const parent = path.basename(path.dirname(manifestPath));
  if (parent === ".radar-plugin") {
    return path.dirname(path.dirname(manifestPath));
  }
  return path.dirname(manifestPath);
}

export function pluginManifestCandidates(sourcePath: unknown) {
  const root = normalizeSourcePath(sourcePath);
  if (!root || root === path.parse(root).root) {
    return [];
  }
  const stats = fs.existsSync(root) ? fs.statSync(root) : null;
  if (stats?.isFile()) {
    return [root];
  }
  return [path.join(root, ".radar-plugin", "plugin.json"), path.join(root, "plugin.json")];
}

export function readPluginInstallPreview(sourcePath: unknown): PluginInstallPreview {
  const candidates = pluginManifestCandidates(sourcePath);
  const manifestPath = candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
  if (!manifestPath) {
    throw new Error("Plugin manifest was not found.");
  }
  const text = fs.readFileSync(manifestPath, "utf8");
  const manifest = parsePluginManifestJson(text);
  const preview = buildPluginInstallPreview({
    manifest,
    sourcePath: pluginRootForManifest(manifestPath),
    manifestPath
  });
  if (!preview) {
    throw new Error("Plugin manifest was invalid.");
  }
  return preview;
}

export function installedPluginFromPreview(preview: PluginInstallPreview, status: InstalledPlugin["status"] = "pending"): InstalledPlugin {
  const installedAt = nowIso();
  return {
    id: preview.manifest.id,
    manifest: preview.manifest,
    sourcePath: preview.sourcePath,
    grantedPermissions: [],
    status,
    warnings: preview.warnings,
    installedAt,
    updatedAt: installedAt
  };
}
