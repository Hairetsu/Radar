import type { DatabaseSync } from "node:sqlite";
import type { InstalledPlugin, PluginAuditEntry } from "../../../shared/domain.js";
import {
  approveInstalledPlugin,
  MAX_PLUGIN_AUDIT_ENTRIES,
  MAX_PLUGINS,
  normalizeInstalledPlugin,
  normalizeInstalledPlugins,
  normalizePluginAuditEntries,
  normalizePluginAuditEntry
} from "../../../shared/plugins.js";
import { parseJsonObject } from "../json.js";
import type { PluginAuditRow, PluginRow } from "../rows.js";
import { runImmediateTransaction } from "../transactions.js";

function nowIso() {
  return new Date().toISOString();
}

export function createPluginsRepository(db: DatabaseSync) {
  const listPlugins = (workspaceId: string) => {
    const rows = db
      .prepare("SELECT plugin_json FROM workspace_plugins WHERE workspace_id = ? ORDER BY updated_at DESC, plugin_id ASC")
      .all(workspaceId) as PluginRow[];
    return normalizeInstalledPlugins(
      rows.map((row) => parseJsonObject<InstalledPlugin | null>(row.plugin_json, null)).filter(Boolean)
    );
  };

  const getPlugin = (workspaceId: string, pluginId: string) => {
    const row = db
      .prepare("SELECT plugin_json FROM workspace_plugins WHERE workspace_id = ? AND plugin_id = ?")
      .get(workspaceId, pluginId) as PluginRow | undefined;
    return row ? normalizeInstalledPlugin(parseJsonObject<InstalledPlugin | null>(row.plugin_json, null)) : null;
  };

  const upsertPlugin = (workspaceId: string, input: InstalledPlugin) => {
    const plugin = normalizeInstalledPlugin(input);
    if (!plugin) {
      throw new Error("Plugin record was invalid.");
    }
    if (listPlugins(workspaceId).length >= MAX_PLUGINS && !getPlugin(workspaceId, plugin.id)) {
      throw new Error("Plugin registry is full.");
    }
    runImmediateTransaction(db, () => {
      db.prepare(`
        INSERT INTO workspace_plugins (workspace_id, plugin_id, updated_at, plugin_json)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(workspace_id, plugin_id) DO UPDATE SET
          updated_at = excluded.updated_at,
          plugin_json = excluded.plugin_json
      `).run(workspaceId, plugin.id, plugin.updatedAt, JSON.stringify(plugin));
      db.prepare("UPDATE workspaces SET updated_at = ? WHERE id = ?").run(plugin.updatedAt, workspaceId);
    });
    return plugin;
  };

  const approvePlugin = (workspaceId: string, pluginId: string, grantedPermissions: unknown) => {
    const plugin = getPlugin(workspaceId, pluginId);
    if (!plugin) {
      throw new Error("Plugin was not found.");
    }
    return upsertPlugin(workspaceId, approveInstalledPlugin(plugin, Array.isArray(grantedPermissions) ? grantedPermissions : []));
  };

  const setPluginStatus = (workspaceId: string, pluginId: string, status: InstalledPlugin["status"]) => {
    const plugin = getPlugin(workspaceId, pluginId);
    if (!plugin) {
      throw new Error("Plugin was not found.");
    }
    const nextStatus = status === "approved" || status === "disabled" || status === "blocked" ? status : "pending";
    return upsertPlugin(workspaceId, {
      ...plugin,
      status: nextStatus,
      updatedAt: nowIso()
    });
  };

  const deletePlugin = (workspaceId: string, pluginId: string) => {
    runImmediateTransaction(db, () => {
      db.prepare("DELETE FROM workspace_plugins WHERE workspace_id = ? AND plugin_id = ?").run(workspaceId, pluginId);
      db.prepare("UPDATE workspaces SET updated_at = ? WHERE id = ?").run(nowIso(), workspaceId);
    });
    return listPlugins(workspaceId);
  };

  const listPluginAudit = (workspaceId: string, limit = 80) => {
    const rows = db
      .prepare("SELECT audit_json FROM workspace_plugin_audit WHERE workspace_id = ? ORDER BY created_at DESC, id DESC LIMIT ?")
      .all(workspaceId, Math.max(1, Math.min(Number(limit) || 80, MAX_PLUGIN_AUDIT_ENTRIES))) as PluginAuditRow[];
    return normalizePluginAuditEntries(
      rows.map((row) => parseJsonObject<PluginAuditEntry | null>(row.audit_json, null)).filter(Boolean)
    );
  };

  const appendPluginAudit = (workspaceId: string, input: PluginAuditEntry) => {
    const entry = normalizePluginAuditEntry(input);
    if (!entry) {
      throw new Error("Plugin audit entry was invalid.");
    }
    runImmediateTransaction(db, () => {
      db.prepare(`
        INSERT INTO workspace_plugin_audit (workspace_id, id, plugin_id, created_at, audit_json)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(workspace_id, id) DO UPDATE SET
          plugin_id = excluded.plugin_id,
          created_at = excluded.created_at,
          audit_json = excluded.audit_json
      `).run(workspaceId, entry.id, entry.pluginId, entry.createdAt, JSON.stringify(entry));
      db.prepare(`
        DELETE FROM workspace_plugin_audit
        WHERE workspace_id = ?
          AND id NOT IN (
            SELECT id FROM workspace_plugin_audit
            WHERE workspace_id = ?
            ORDER BY created_at DESC, id DESC
            LIMIT ?
          )
      `).run(workspaceId, workspaceId, MAX_PLUGIN_AUDIT_ENTRIES);
    });
    return entry;
  };
  return {
    listPlugins,
    getPlugin,
    upsertPlugin,
    approvePlugin,
    setPluginStatus,
    deletePlugin,
    listPluginAudit,
    appendPluginAudit
  };
}

