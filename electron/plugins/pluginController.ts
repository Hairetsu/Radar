import { randomUUID } from "node:crypto";
import type {
  LocalContext,
  PluginApiRequest,
  PluginAuditEntry,
  PluginInstallStatus,
  PluginPermission,
  ReplayDraft,
  ReplayResult,
  WorkflowDefinition,
  WorkflowRun
} from "../../shared/domain.js";
import {
  installedPluginFromPreview,
  readPluginInstallPreview,
  renderInstalledPluginPanel,
  validatePluginSource
} from "../plugins.js";
import {
  runPluginApiAction
} from "../pluginApi.js";
import type { LocalStore } from "../localStore.js";

type PluginControllerDeps = {
  store: () => LocalStore;
  context: () => LocalContext;
  allowlist: () => string[];
  listWorkflows: () => WorkflowDefinition[];
  saveWorkflow: (input: unknown) => WorkflowDefinition;
  runWorkflow: (input: unknown) => Promise<WorkflowRun>;
  sendReplay: (draft: ReplayDraft) => Promise<ReplayResult>;
};

function summarizeAuditValue(value: unknown) {
  if (typeof value === "string") {
    return value.slice(0, 500);
  }
  try {
    return JSON.stringify(value).slice(0, 500);
  } catch {
    return "";
  }
}

function pluginAuditEntry(
  input: Omit<
    PluginAuditEntry,
    "id" | "createdAt" | "durationMs"
  > & { durationMs?: number }
): PluginAuditEntry {
  return {
    ...input,
    id: `plugin_audit_${randomUUID()}`,
    durationMs: input.durationMs || 0,
    createdAt: new Date().toISOString()
  };
}

export function createPluginController(deps: PluginControllerDeps) {
  function list() {
    return deps.store().listPlugins(deps.context().workspace.id);
  }

  function preview(sourcePath: unknown) {
    return readPluginInstallPreview(sourcePath);
  }

  function install(sourcePath: unknown) {
    const installPreview = readPluginInstallPreview(sourcePath);
    return deps
      .store()
      .upsertPlugin(
        deps.context().workspace.id,
        installedPluginFromPreview(installPreview)
      );
  }

  function approve(input: unknown) {
    const payload =
      input && typeof input === "object" && !Array.isArray(input)
        ? (input as Record<string, unknown>)
        : {};
    const pluginId = String(payload.id || "").trim();
    const permissions = Array.isArray(payload.permissions)
      ? (payload.permissions as PluginPermission[])
      : [];
    if (!pluginId) {
      throw new Error("Plugin id is required.");
    }
    return deps
      .store()
      .approvePlugin(
        deps.context().workspace.id,
        pluginId,
        permissions
      );
  }

  function setStatus(input: unknown) {
    const payload =
      input && typeof input === "object" && !Array.isArray(input)
        ? (input as Record<string, unknown>)
        : {};
    const pluginId = String(payload.id || "").trim();
    const status = String(payload.status || "").trim() as PluginInstallStatus;
    if (!pluginId) {
      throw new Error("Plugin id is required.");
    }
    if (status === "approved") {
      throw new Error("Use plugin approval to grant permissions.");
    }
    return deps
      .store()
      .setPluginStatus(
        deps.context().workspace.id,
        pluginId,
        status
      );
  }

  function remove(id: unknown) {
    const pluginId = String(id || "").trim();
    if (!pluginId) {
      return { ok: false, plugins: list() };
    }
    const plugins = deps
      .store()
      .deletePlugin(deps.context().workspace.id, pluginId);
    return { ok: true, plugins };
  }

  function appendAudit(entry: PluginAuditEntry) {
    return deps
      .store()
      .appendPluginAudit(deps.context().workspace.id, entry);
  }

  function audit() {
    return deps
      .store()
      .listPluginAudit(deps.context().workspace.id, 120);
  }

  function renderPanel(input: unknown) {
    const payload =
      input && typeof input === "object" && !Array.isArray(input)
        ? (input as Record<string, unknown>)
        : {};
    const pluginId = String(payload.pluginId || "").trim();
    const panelId = String(payload.panelId || "").trim();
    const plugin = pluginId
      ? deps
          .store()
          .getPlugin(deps.context().workspace.id, pluginId)
      : null;
    const started = Date.now();
    if (!plugin) {
      const message = "Plugin was not installed.";
      appendAudit(
        pluginAuditEntry({
          pluginId: pluginId || "unknown",
          pluginName: pluginId || "Unknown plugin",
          action: "panel:render",
          permission: "ui:panel",
          ok: false,
          message,
          inputSummary: summarizeAuditValue(payload),
          outputSummary: message
        })
      );
      return {
        ok: false,
        pluginId,
        panelId,
        title: "Missing panel",
        html: "",
        sourcePath: "",
        runtimeStatus: "failed" as const,
        warnings: [],
        error: message
      };
    }

    const render = renderInstalledPluginPanel(plugin, panelId);
    appendAudit(
      pluginAuditEntry({
        pluginId: plugin.id,
        pluginName: plugin.manifest.name,
        action: "panel:render",
        permission: "ui:panel",
        ok: render.ok,
        message: render.ok
          ? "Plugin panel rendered in sandbox."
          : render.error || "Plugin panel render failed.",
        inputSummary: summarizeAuditValue(payload),
        outputSummary: summarizeAuditValue({
          panelId: render.panelId,
          warnings: render.warnings,
          error: render.error
        }),
        durationMs: Date.now() - started
      })
    );
    return render;
  }

  function validate(sourcePath: unknown) {
    const started = Date.now();
    const validation = validatePluginSource(sourcePath);
    appendAudit(
      pluginAuditEntry({
        pluginId: validation.manifest?.id || "plugin-dev",
        pluginName:
          validation.manifest?.name || "Plugin validation",
        action: "plugin:validate",
        ok: validation.ok,
        message: validation.ok
          ? "Plugin developer validation passed."
          : "Plugin developer validation failed.",
        inputSummary: summarizeAuditValue({ sourcePath }),
        outputSummary: summarizeAuditValue({
          errors: validation.errors,
          warnings: validation.warnings
        }),
        durationMs: Date.now() - started
      })
    );
    return validation;
  }

  function runApi(input: unknown) {
    return runPluginApiAction(input as PluginApiRequest, {
      getPlugin: (pluginId) =>
        deps
          .store()
          .getPlugin(deps.context().workspace.id, pluginId),
      allowlist: deps.allowlist,
      listCaptures: () =>
        deps
          .store()
          .listCaptures(deps.context().session.id, 2000),
      listWebSocketEvents: () =>
        deps
          .store()
          .listWebSocketEvents(deps.context().session.id, 5000),
      saveFinding: (finding) =>
        deps
          .store()
          .upsertFinding(deps.context().session.id, finding),
      listWorkflows: deps.listWorkflows,
      saveWorkflow: deps.saveWorkflow,
      runWorkflow: deps.runWorkflow,
      sendReplay: deps.sendReplay,
      recordAudit: appendAudit
    });
  }

  return {
    list,
    preview,
    install,
    approve,
    setStatus,
    remove,
    audit,
    renderPanel,
    validate,
    runApi
  };
}
