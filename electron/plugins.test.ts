import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { installedPluginFromPreview, pluginManifestCandidates, readPluginInstallPreview } from "./plugins.js";

describe("electron plugin registry helpers", () => {
  let tmpDir = "";

  afterEach(() => {
    if (tmpDir) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = "";
    }
  });

  function makeDir() {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "radar-plugin-"));
    return tmpDir;
  }

  function writeManifest(root: string, relativePath = ".radar-plugin/plugin.json") {
    const manifestPath = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
    fs.writeFileSync(
      manifestPath,
      JSON.stringify({
        id: "jwt-helper",
        name: "JWT Helper",
        version: "1.0.0",
        entry: "dist/index.js",
        permissions: ["captures:read"]
      }),
      "utf8"
    );
    return manifestPath;
  }

  it("discovers manifests in plugin directories and files", () => {
    const root = makeDir();
    const manifestPath = writeManifest(root);

    expect(pluginManifestCandidates(root)).toContain(manifestPath);
    expect(pluginManifestCandidates(manifestPath)).toEqual([manifestPath]);

    const preview = readPluginInstallPreview(root);
    expect(preview.manifest.id).toBe("jwt-helper");
    expect(preview.sourcePath).toBe(root);
    expect(preview.manifestPath).toBe(manifestPath);

    const installed = installedPluginFromPreview(preview);
    expect(installed.status).toBe("pending");
    expect(installed.grantedPermissions).toEqual([]);
  });

  it("falls back to root plugin.json and rejects invalid manifests", () => {
    const root = makeDir();
    const manifestPath = writeManifest(root, "plugin.json");
    expect(readPluginInstallPreview(root).manifestPath).toBe(manifestPath);

    fs.writeFileSync(manifestPath, JSON.stringify({ id: "bad id", name: "Bad", version: "1.0.0" }), "utf8");
    expect(() => readPluginInstallPreview(root)).toThrow(/invalid/);
  });

  it("loads bundled first-party example manifests", () => {
    const examples = [
      ["jwt-helper", ["captures:read", "ui:panel"]],
      ["graphql-helper", ["captures:read", "replay:prepare", "ui:panel"]],
      ["openapi-importer", ["files:read", "workflows:write", "ui:panel"]],
      ["parameter-miner", ["captures:read", "frames:read", "workflows:write", "ui:panel"]],
      ["report-exporter", ["captures:read", "frames:read", "ui:panel"]]
    ] as const;

    for (const [id, permissions] of examples) {
      const preview = readPluginInstallPreview(path.join(process.cwd(), "plugins", "examples", id));
      expect(preview.manifest.id).toBe(id);
      expect(preview.manifest.permissions).toEqual([...permissions]);
      expect(preview.manifest.panels).toHaveLength(1);
    }
  });
});
