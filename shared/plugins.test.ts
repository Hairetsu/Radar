import { describe, expect, it } from "vitest";
import {
  approveInstalledPlugin,
  buildPluginInstallPreview,
  hasPluginPermission,
  normalizeInstalledPlugin,
  normalizeInstalledPlugins,
  normalizePluginManifest,
  normalizePluginAuditEntry,
  parsePluginManifestJson,
  pluginCompatibilityWarnings,
  pluginDeveloperValidation,
  pluginPermissionLabel,
  pluginPermissionSummary,
  pluginTrustLevel
} from "./plugins.js";

const manifest = {
  id: "jwt-helper",
  name: "JWT Helper",
  version: "1.2.3",
  description: "Inspects token-shaped request values.",
  author: "Radar",
  entry: "dist/index.js",
  permissions: ["captures:read", "captures:read", "replay:send", "unknown"],
  panels: [{ id: "token-panel", title: "Token Panel", entry: "panel.html" }]
};

describe("plugins", () => {
  it("normalizes valid manifests and permission summaries", () => {
    const normalized = normalizePluginManifest(manifest);
    expect(normalized?.id).toBe("jwt-helper");
    expect(normalized?.permissions).toEqual(["captures:read", "replay:send", "ui:panel"]);
    expect(normalized?.panels[0]?.entry).toBe("panel.html");
    expect(pluginPermissionLabel("captures:read")).toBe("Read in-scope HTTP/S captures");

    const preview = buildPluginInstallPreview({ manifest, sourcePath: "/tmp/jwt-helper" });
    expect(preview?.permissionSummary).toContain("Read in-scope HTTP/S captures");
    expect(preview?.manifestPath).toBe("");
    expect(preview?.trustLevel).toBe("first-party");
    expect(preview?.warnings.join(" ")).toMatch(/Replay sending/);
  });

  it("rejects malformed manifests and unsafe paths", () => {
    expect(normalizePluginManifest({ ...manifest, id: "Bad Id" })).toBeNull();
    expect(normalizePluginManifest({ ...manifest, version: "next" })).toBeNull();
    expect(normalizePluginManifest({ ...manifest, entry: "../index.js", panels: [] })).toBeNull();
    expect(parsePluginManifestJson("{")).toBeNull();
    expect(parsePluginManifestJson(JSON.stringify({ ...manifest, entry: "/abs.js", panels: [] }))).toBeNull();
  });

  it("normalizes installed plugin grants and approval", () => {
    const installed = normalizeInstalledPlugin({
      manifest,
      sourcePath: "/tmp/jwt-helper",
      grantedPermissions: ["captures:read", "files:read"],
      status: "approved"
    });
    expect(installed?.grantedPermissions).toEqual(["captures:read"]);
    expect(hasPluginPermission(installed!, "captures:read")).toBe(true);
    expect(hasPluginPermission(installed!, "replay:send")).toBe(false);

    const approved = approveInstalledPlugin(installed!, ["captures:read", "replay:send"]);
    expect(hasPluginPermission(approved, "replay:send")).toBe(true);
    expect(pluginPermissionSummary(approved)).toContain("Send scoped replay requests through Radar caps");
  });

  it("dedupes installed plugin records and caps invalid entries", () => {
    const normalized = normalizeInstalledPlugins([
      { manifest: { ...manifest, name: "First" }, sourcePath: "/tmp/one" },
      { manifest: { ...manifest, name: "Second" }, sourcePath: "/tmp/two" },
      { manifest: { id: "bad", name: "", version: "0.0.1", entry: "index.js" } }
    ]);
    expect(normalized).toHaveLength(1);
    expect(normalized[0].manifest.name).toBe("Second");
  });

  it("marks compatibility, trust, and audit metadata", () => {
    const normalized = normalizePluginManifest({ ...manifest, sdkVersion: "9.9.0", minRadarVersion: "9.0.0" })!;
    expect(pluginCompatibilityWarnings(normalized).join(" ")).toMatch(/Requires Radar 9.0.0/);
    expect(pluginTrustLevel({ manifest: normalized, sourcePath: "/tmp/plugin", manifestPath: "/tmp/plugin.json" })).toBe("first-party");

    const audit = normalizePluginAuditEntry({
      pluginId: "jwt-helper",
      pluginName: "JWT Helper",
      action: "captures:list",
      permission: "captures:read",
      ok: true,
      inputSummary: { query: "status:200" },
      outputSummary: ["cap-1"]
    });
    expect(audit).toMatchObject({ pluginId: "jwt-helper", action: "captures:list", ok: true });
    expect(normalizePluginAuditEntry({ pluginName: "Missing Id" })).toBeNull();
    expect(normalizePluginAuditEntry({ pluginId: "jwt-helper", action: "unknown", ok: false })?.action).toBe("plugin:validate");

    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(normalizePluginAuditEntry({ pluginId: "jwt-helper", inputSummary: circular })?.inputSummary).toBe("");
    expect(pluginDeveloperValidation({ sourcePath: "", errors: ["bad manifest"] })).toMatchObject({
      ok: false,
      trustLevel: "untrusted"
    });
  });
});
