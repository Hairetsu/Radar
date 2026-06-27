import fs from "node:fs";
import path from "node:path";
import type { InstalledPlugin, PluginDeveloperValidation, PluginInstallPreview, PluginPanelRender } from "../shared/domain.js";
import { buildPluginInstallPreview, hasPluginPermission, parsePluginManifestJson, pluginDeveloperValidation } from "../shared/plugins.js";

const MAX_PANEL_BYTES = 220_000;

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
    trustLevel: preview.trustLevel,
    compatibilityWarnings: preview.compatibilityWarnings,
    warnings: preview.warnings,
    installedAt,
    updatedAt: installedAt
  };
}

function isInsideRoot(root: string, target: string) {
  const relative = path.relative(root, target);
  return Boolean(relative) && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function resolvePluginEntry(sourcePath: string, entry: string) {
  const root = normalizeSourcePath(sourcePath);
  const target = path.resolve(root, entry);
  if (!isInsideRoot(root, target)) {
    throw new Error("Plugin entry path escapes the plugin root.");
  }
  return target;
}

export function validatePluginSource(sourcePath: unknown): PluginDeveloperValidation {
  try {
    const preview = readPluginInstallPreview(sourcePath);
    const errors: string[] = [];
    const warnings: string[] = [];
    const checkEntry = (entry: string, label: string) => {
      try {
        const entryPath = resolvePluginEntry(preview.sourcePath, entry);
        if (!fs.existsSync(entryPath) || !fs.statSync(entryPath).isFile()) {
          errors.push(`${label} does not exist: ${entry}`);
        }
      } catch (error) {
        errors.push(error instanceof Error ? error.message : `${label} path was invalid.`);
      }
    };
    if (preview.manifest.entry) {
      checkEntry(preview.manifest.entry, "Plugin runtime entry");
    } else {
      warnings.push("Plugin has no runtime entry and only exposes panels.");
    }
    for (const panel of preview.manifest.panels) {
      checkEntry(panel.entry, `Panel ${panel.id}`);
    }
    return pluginDeveloperValidation({
      sourcePath: preview.sourcePath,
      manifest: preview.manifest,
      manifestPath: preview.manifestPath,
      warnings,
      errors
    });
  } catch (error) {
    return pluginDeveloperValidation({
      sourcePath: normalizeSourcePath(sourcePath),
      warnings: [],
      errors: [error instanceof Error ? error.message : "Plugin validation failed."]
    });
  }
}

export function renderInstalledPluginPanel(plugin: InstalledPlugin, panelId: unknown): PluginPanelRender {
  const panelKey = String(panelId || "").trim();
  const panel = plugin.manifest.panels.find((item) => item.id === panelKey);
  if (!panel) {
    return {
      ok: false,
      pluginId: plugin.id,
      panelId: panelKey,
      title: "Missing panel",
      html: "",
      sourcePath: plugin.sourcePath,
      runtimeStatus: "failed",
      warnings: [],
      error: "Plugin panel was not found."
    };
  }
  if (!hasPluginPermission(plugin, "ui:panel")) {
    return {
      ok: false,
      pluginId: plugin.id,
      panelId: panel.id,
      title: panel.title,
      html: "",
      sourcePath: plugin.sourcePath,
      runtimeStatus: "failed",
      warnings: [],
      error: "Plugin is not approved for ui:panel."
    };
  }
  try {
    const entryPath = resolvePluginEntry(plugin.sourcePath, panel.entry);
    const stats = fs.statSync(entryPath);
    if (!stats.isFile()) {
      throw new Error("Plugin panel entry is not a file.");
    }
    if (stats.size > MAX_PANEL_BYTES) {
      throw new Error("Plugin panel entry exceeds the sandbox preview size limit.");
    }
    const source = fs.readFileSync(entryPath, "utf8");
    const isHtml = entryPath.endsWith(".html") || entryPath.endsWith(".htm");
    const html = isHtml
      ? source
      : `<!doctype html><meta charset="utf-8"><style>body{font:12px monospace;background:#060807;color:#d8e2d5;padding:16px;white-space:pre-wrap}</style><body>${escapeHtml(
          source
        )}</body>`;
    return {
      ok: true,
      pluginId: plugin.id,
      panelId: panel.id,
      title: panel.title,
      html,
      sourcePath: entryPath,
      runtimeStatus: "ready",
      warnings: isHtml ? [] : ["JavaScript module panels are shown as source in the no-script sandbox preview."]
    };
  } catch (error) {
    return {
      ok: false,
      pluginId: plugin.id,
      panelId: panel.id,
      title: panel.title,
      html: "",
      sourcePath: plugin.sourcePath,
      runtimeStatus: "failed",
      warnings: [],
      error: error instanceof Error ? error.message : "Plugin panel render failed."
    };
  }
}
