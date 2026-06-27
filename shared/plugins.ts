import type {
  InstalledPlugin,
  PluginAuditEntry,
  PluginDeveloperValidation,
  PluginInstallPreview,
  PluginInstallStatus,
  PluginManifest,
  PluginManifestPanel,
  PluginPermission,
  PluginTrustLevel
} from "./domain.js";

export const PLUGIN_SCHEMA_VERSION = 1;
export const PLUGIN_SDK_VERSION = "0.1";
export const RADAR_PLUGIN_COMPAT_VERSION = "0.1.13";
export const MAX_PLUGINS = 80;
export const MAX_PLUGIN_PANELS = 6;
export const MAX_PLUGIN_AUDIT_ENTRIES = 300;

const MAX_LINE = 180;
const MAX_TEXT = 2000;
const pluginIdPattern = /^[a-z0-9][a-z0-9._-]{1,78}[a-z0-9]$/;
const versionPattern = /^\d+\.\d+\.\d+(?:[-+][a-z0-9.-]+)?$/i;
const pluginAuditActions = [
  "captures:list",
  "frames:list",
  "replay:prepare",
  "replay:send",
  "findings:create",
  "workflows:list",
  "workflows:save",
  "workflows:run",
  "panel:render",
  "plugin:validate"
] as const;

export const PLUGIN_PERMISSIONS: PluginPermission[] = [
  "captures:read",
  "frames:read",
  "replay:prepare",
  "replay:send",
  "files:read",
  "ai:context",
  "workflows:read",
  "workflows:run",
  "workflows:write",
  "findings:write",
  "ui:panel"
];

const permissionLabels: Record<PluginPermission, string> = {
  "captures:read": "Read in-scope HTTP/S captures",
  "frames:read": "Read in-scope WebSocket frames",
  "replay:prepare": "Prepare replay drafts without transmitting",
  "replay:send": "Send scoped replay requests through Radar caps",
  "files:read": "Read operator-selected local files",
  "ai:context": "Read redacted AI-visible context",
  "workflows:read": "Read saved workflow definitions and run history",
  "workflows:run": "Run existing scoped workflows",
  "workflows:write": "Create or update workflow definitions",
  "findings:write": "Create draft findings with evidence references",
  "ui:panel": "Render plugin panels inside the Radar console"
};

const permissionWarnings: Partial<Record<PluginPermission, string>> = {
  "replay:send": "Replay sending stays scope-checked and capped; review this permission before approving.",
  "files:read": "File reads must be operator-selected and should not include secrets unless intended.",
  "ai:context": "AI context remains redacted unless the operator explicitly opts into raw context elsewhere.",
  "workflows:write": "Workflow changes can affect repeatable testing behavior.",
  "workflows:run": "Workflow runs can perform active scoped replay steps when the workflow allows it."
};

const defaultManifest: PluginManifest = {
  schemaVersion: PLUGIN_SCHEMA_VERSION,
  id: "",
  name: "",
  version: "0.0.0",
  description: "",
  author: "",
  sdkVersion: PLUGIN_SDK_VERSION,
  minRadarVersion: "",
  entry: "",
  permissions: [],
  panels: []
};

function nowIso() {
  return new Date().toISOString();
}

function objectValue(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function cleanLine(value: unknown, fallback = "") {
  return String(value || fallback)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_LINE);
}

function cleanText(value: unknown) {
  return String(value || "").trim().slice(0, MAX_TEXT);
}

function cleanId(value: unknown, fallback = "") {
  return String(value || fallback).trim().toLowerCase().slice(0, 80);
}

function isValidPluginPath(value: string) {
  return Boolean(
    value &&
      !value.startsWith("/") &&
      !value.startsWith("\\") &&
      !/^[a-z]:/i.test(value) &&
      !value.split(/[\\/]+/).includes("..")
  );
}

function normalizePluginPath(value: unknown) {
  const next = String(value || "").trim().replace(/\\/g, "/").slice(0, 240);
  return isValidPluginPath(next) ? next : "";
}

function normalizePermissions(value: unknown) {
  const input = Array.isArray(value) ? value : [];
  return Array.from(new Set(input.filter((permission): permission is PluginPermission =>
    PLUGIN_PERMISSIONS.includes(permission as PluginPermission)
  )));
}

function normalizePanel(value: unknown, index: number): PluginManifestPanel | null {
  const input = objectValue(value);
  const id = cleanId(input.id, `panel-${index + 1}`);
  const title = cleanLine(input.title, id);
  const entry = normalizePluginPath(input.entry);
  if (!pluginIdPattern.test(id) || !title || !entry) {
    return null;
  }
  return { id, title, entry };
}

function permissionSummary(permissions: PluginPermission[]) {
  return permissions.map((permission) => permissionLabels[permission]);
}

function manifestWarnings(manifest: PluginManifest) {
  const warnings = new Set<string>();
  for (const permission of manifest.permissions) {
    const warning = permissionWarnings[permission];
    if (warning) {
      warnings.add(warning);
    }
  }
  if (manifest.entry && !manifest.entry.endsWith(".js") && !manifest.entry.endsWith(".mjs")) {
    warnings.add("Executable plugin entries should be JavaScript modules.");
  }
  for (const panel of manifest.panels) {
    if (!panel.entry.endsWith(".html") && !panel.entry.endsWith(".js") && !panel.entry.endsWith(".mjs")) {
      warnings.add("Panel entries should be HTML or JavaScript module files.");
    }
  }
  return Array.from(warnings);
}

function parseVersion(value: string) {
  const match = value.trim().match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) {
    return null;
  }
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3])
  };
}

function compareVersions(left: string, right: string) {
  const a = parseVersion(left);
  const b = parseVersion(right);
  if (!a || !b) {
    return 0;
  }
  for (const key of ["major", "minor", "patch"] as const) {
    if (a[key] > b[key]) {
      return 1;
    }
    if (a[key] < b[key]) {
      return -1;
    }
  }
  return 0;
}

function normalizeTrustLevel(value: unknown, fallback: PluginTrustLevel): PluginTrustLevel {
  const trust = cleanLine(value);
  if (trust === "first-party" || trust === "verified-local" || trust === "local" || trust === "untrusted") {
    return trust;
  }
  return fallback;
}

export function pluginCompatibilityWarnings(manifest: PluginManifest, radarVersion = RADAR_PLUGIN_COMPAT_VERSION) {
  const warnings = new Set<string>();
  const sdkMinor = manifest.sdkVersion.split(".").slice(0, 2).join(".");
  if (sdkMinor && sdkMinor !== PLUGIN_SDK_VERSION) {
    warnings.add(`Plugin SDK ${manifest.sdkVersion} differs from Radar SDK ${PLUGIN_SDK_VERSION}.`);
  }
  if (manifest.minRadarVersion && compareVersions(manifest.minRadarVersion, radarVersion) > 0) {
    warnings.add(`Requires Radar ${manifest.minRadarVersion} or newer.`);
  }
  return Array.from(warnings);
}

export function pluginTrustLevel(input: {
  manifest?: PluginManifest | null;
  sourcePath?: string;
  manifestPath?: string;
  errors?: string[];
}): PluginTrustLevel {
  const source = String(input.sourcePath || "").replace(/\\/g, "/").toLowerCase();
  const author = String(input.manifest?.author || "").toLowerCase();
  if (author.includes("radar") || author.includes("hairetsu") || source.includes("/plugins/examples/") || source.includes("/plugins/first-party/")) {
    return "first-party";
  }
  if (input.manifest && input.manifestPath && (input.errors || []).length === 0) {
    return "verified-local";
  }
  if (input.sourcePath) {
    return "local";
  }
  return "untrusted";
}

export function isPluginPermission(value: unknown): value is PluginPermission {
  return PLUGIN_PERMISSIONS.includes(value as PluginPermission);
}

export function pluginPermissionLabel(permission: PluginPermission) {
  return permissionLabels[permission];
}

export function normalizePluginManifest(input: unknown): PluginManifest | null {
  const value = objectValue(input);
  const id = cleanId(value.id);
  const name = cleanLine(value.name);
  const version = cleanLine(value.version, defaultManifest.version);
  if (!pluginIdPattern.test(id) || !name || !versionPattern.test(version)) {
    return null;
  }

  const permissions = normalizePermissions(value.permissions);
  const panels = (Array.isArray(value.panels) ? value.panels : [])
    .map((panel, index) => normalizePanel(panel, index))
    .filter((panel): panel is PluginManifestPanel => Boolean(panel))
    .slice(0, MAX_PLUGIN_PANELS);
  const entry = normalizePluginPath(value.entry);
  if (!entry && panels.length === 0) {
    return null;
  }
  const hasPanelPermission = permissions.includes("ui:panel");
  const nextPermissions: PluginPermission[] =
    panels.length > 0 && !hasPanelPermission ? [...permissions, "ui:panel"] : permissions;

  return {
    schemaVersion: PLUGIN_SCHEMA_VERSION,
    id,
    name,
    version,
    description: cleanText(value.description),
    author: cleanLine(value.author),
    sdkVersion: cleanLine(value.sdkVersion, PLUGIN_SDK_VERSION),
    minRadarVersion: cleanLine(value.minRadarVersion),
    entry,
    permissions: nextPermissions,
    panels
  };
}

export function parsePluginManifestJson(text: string): PluginManifest | null {
  try {
    return normalizePluginManifest(JSON.parse(text));
  } catch {
    return null;
  }
}

export function buildPluginInstallPreview(input: {
  manifest: unknown;
  sourcePath: string;
  manifestPath?: string;
}): PluginInstallPreview | null {
  const manifest = normalizePluginManifest(input.manifest);
  if (!manifest) {
    return null;
  }
  const compatibilityWarnings = pluginCompatibilityWarnings(manifest);
  return {
    manifest,
    sourcePath: String(input.sourcePath || ""),
    manifestPath: String(input.manifestPath || ""),
    requestedPermissions: manifest.permissions,
    permissionSummary: permissionSummary(manifest.permissions),
    trustLevel: pluginTrustLevel({ manifest, sourcePath: input.sourcePath, manifestPath: input.manifestPath }),
    compatibilityWarnings,
    warnings: [...manifestWarnings(manifest), ...compatibilityWarnings]
  };
}

export function normalizeInstalledPlugin(input: unknown, installedAt = nowIso()): InstalledPlugin | null {
  const value = objectValue(input);
  const manifest = normalizePluginManifest(value.manifest);
  if (!manifest) {
    return null;
  }
  const grantedPermissions = normalizePermissions(value.grantedPermissions).filter((permission) =>
    manifest.permissions.includes(permission)
  );
  const status = cleanLine(value.status) as PluginInstallStatus;
  const normalizedStatus: PluginInstallStatus =
    status === "approved" || status === "disabled" || status === "blocked" ? status : "pending";
  const compatibilityWarnings = Array.isArray(value.compatibilityWarnings)
    ? value.compatibilityWarnings.map((warning) => cleanLine(warning)).filter(Boolean).slice(0, 12)
    : pluginCompatibilityWarnings(manifest);
  return {
    id: manifest.id,
    manifest,
    sourcePath: cleanLine(value.sourcePath),
    grantedPermissions,
    status: normalizedStatus,
    trustLevel: normalizeTrustLevel(
      value.trustLevel,
      pluginTrustLevel({ manifest, sourcePath: cleanLine(value.sourcePath), manifestPath: "" })
    ),
    compatibilityWarnings,
    warnings: Array.isArray(value.warnings)
      ? value.warnings.map((warning) => cleanLine(warning)).filter(Boolean).slice(0, 12)
      : [...manifestWarnings(manifest), ...compatibilityWarnings],
    installedAt: cleanLine(value.installedAt, installedAt),
    updatedAt: cleanLine(value.updatedAt, installedAt)
  };
}

export function normalizeInstalledPlugins(input: unknown, installedAt = nowIso()) {
  const plugins = (Array.isArray(input) ? input : [])
    .map((plugin) => normalizeInstalledPlugin(plugin, installedAt))
    .filter((plugin): plugin is InstalledPlugin => Boolean(plugin));
  return Array.from(new Map(plugins.map((plugin) => [plugin.id, plugin])).values()).slice(0, MAX_PLUGINS);
}

export function approveInstalledPlugin(
  plugin: InstalledPlugin,
  grantedPermissions: unknown = plugin.manifest.permissions
): InstalledPlugin {
  const permissions = normalizePermissions(grantedPermissions).filter((permission) =>
    plugin.manifest.permissions.includes(permission)
  );
  return {
    ...plugin,
    grantedPermissions: permissions,
    status: "approved",
    updatedAt: nowIso()
  };
}

export function hasPluginPermission(plugin: InstalledPlugin, permission: PluginPermission) {
  return plugin.status === "approved" && plugin.grantedPermissions.includes(permission);
}

export function pluginPermissionSummary(plugin: InstalledPlugin | PluginManifest) {
  const permissions = "manifest" in plugin ? plugin.grantedPermissions : plugin.permissions;
  return permissionSummary(permissions);
}

function normalizeAuditAction(value: unknown): PluginAuditEntry["action"] {
  const action = cleanLine(value);
  return pluginAuditActions.includes(action as PluginAuditEntry["action"]) ? (action as PluginAuditEntry["action"]) : "plugin:validate";
}

function summarizeUnknown(value: unknown, fallback = "") {
  if (typeof value === "string") {
    return cleanText(value).slice(0, 500) || fallback;
  }
  try {
    return JSON.stringify(value).slice(0, 500) || fallback;
  } catch {
    return fallback;
  }
}

export function normalizePluginAuditEntry(input: unknown, createdAt = nowIso()): PluginAuditEntry | null {
  const value = objectValue(input);
  const pluginId = cleanId(value.pluginId);
  const pluginName = cleanLine(value.pluginName, pluginId || "Plugin");
  if (!pluginId) {
    return null;
  }
  const permission = isPluginPermission(value.permission) ? value.permission : undefined;
  return {
    id: cleanId(value.id, `plugin_audit_${createdAt.replace(/[^0-9]/g, "")}`),
    pluginId,
    pluginName,
    action: normalizeAuditAction(value.action),
    permission,
    ok: value.ok === true,
    message: cleanLine(value.message, value.ok === true ? "Plugin action completed." : "Plugin action failed."),
    inputSummary: summarizeUnknown(value.inputSummary),
    outputSummary: summarizeUnknown(value.outputSummary),
    durationMs: Math.max(0, Math.min(Number(value.durationMs) || 0, 60_000)),
    createdAt: cleanLine(value.createdAt, createdAt)
  };
}

export function normalizePluginAuditEntries(input: unknown) {
  return (Array.isArray(input) ? input : [])
    .map((entry) => normalizePluginAuditEntry(entry))
    .filter((entry): entry is PluginAuditEntry => Boolean(entry))
    .slice(0, MAX_PLUGIN_AUDIT_ENTRIES);
}

export function pluginDeveloperValidation(input: {
  sourcePath: string;
  manifest?: PluginManifest | null;
  warnings?: string[];
  errors?: string[];
  manifestPath?: string;
}): PluginDeveloperValidation {
  const manifestWarningsList = input.manifest ? manifestWarnings(input.manifest) : [];
  const compatibilityWarnings = input.manifest ? pluginCompatibilityWarnings(input.manifest) : [];
  const errors = (input.errors || []).map((error) => cleanLine(error)).filter(Boolean).slice(0, 20);
  return {
    ok: errors.length === 0,
    sourcePath: cleanLine(input.sourcePath),
    manifest: input.manifest || undefined,
    trustLevel: pluginTrustLevel({
      manifest: input.manifest,
      sourcePath: input.sourcePath,
      manifestPath: input.manifestPath,
      errors
    }),
    warnings: [...manifestWarningsList, ...compatibilityWarnings, ...(input.warnings || [])]
      .map((warning) => cleanLine(warning))
      .filter(Boolean)
      .slice(0, 24),
    errors
  };
}
