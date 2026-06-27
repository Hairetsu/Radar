/* global console, process */
import fs from "node:fs";
import path from "node:path";

const sourceArg = process.argv.slice(2).find((arg) => arg !== "--") || "";
const root = path.resolve(sourceArg || ".");
const manifestCandidates = fs.existsSync(root) && fs.statSync(root).isFile()
  ? [root]
  : [path.join(root, ".radar-plugin", "plugin.json"), path.join(root, "plugin.json")];

function isSafeRelative(entry) {
  return Boolean(entry) && !path.isAbsolute(entry) && !entry.split(/[\\/]+/).includes("..");
}

function pluginRootForManifest(manifestPath) {
  return path.basename(path.dirname(manifestPath)) === ".radar-plugin"
    ? path.dirname(path.dirname(manifestPath))
    : path.dirname(manifestPath);
}

const errors = [];
const warnings = [];
const manifestPath = manifestCandidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile());

if (!manifestPath) {
  errors.push("Plugin manifest was not found.");
} else {
  const pluginRoot = pluginRootForManifest(manifestPath);
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    if (manifest.schemaVersion !== 1) {
      errors.push("schemaVersion must be 1.");
    }
    if (!/^[a-z0-9][a-z0-9._-]{1,78}[a-z0-9]$/.test(String(manifest.id || ""))) {
      errors.push("id must be a lowercase Radar plugin id.");
    }
    if (!manifest.name) {
      errors.push("name is required.");
    }
    if (!/^\d+\.\d+\.\d+(?:[-+][a-z0-9.-]+)?$/i.test(String(manifest.version || ""))) {
      errors.push("version must be semantic version text.");
    }
    const panels = Array.isArray(manifest.panels) ? manifest.panels : [];
    if (!manifest.entry && panels.length === 0) {
      errors.push("entry or at least one panel is required.");
    }
    for (const [label, entry] of [
      ["entry", manifest.entry],
      ...panels.map((panel) => [`panel:${panel?.id || "unknown"}`, panel?.entry])
    ]) {
      if (!entry) {
        continue;
      }
      if (!isSafeRelative(String(entry))) {
        errors.push(`${label} escapes the plugin root.`);
        continue;
      }
      const entryPath = path.resolve(pluginRoot, String(entry));
      const relative = path.relative(pluginRoot, entryPath);
      if (relative.startsWith("..") || path.isAbsolute(relative) || !fs.existsSync(entryPath) || !fs.statSync(entryPath).isFile()) {
        errors.push(`${label} file is missing: ${entry}`);
      }
    }
    if (!String(manifest.sdkVersion || "").startsWith("0.1")) {
      warnings.push("sdkVersion differs from Radar SDK 0.1.");
    }
    console.log(JSON.stringify({ ok: errors.length === 0, manifestPath, id: manifest.id, errors, warnings }, null, 2));
  } catch (error) {
    errors.push(error instanceof Error ? error.message : "Manifest JSON could not be parsed.");
    console.log(JSON.stringify({ ok: false, manifestPath, errors, warnings }, null, 2));
  }
}

if (!manifestPath) {
  console.log(JSON.stringify({ ok: false, sourcePath: root, errors, warnings }, null, 2));
}

process.exitCode = errors.length === 0 ? 0 : 1;
