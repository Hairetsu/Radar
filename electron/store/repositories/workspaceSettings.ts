import type { DatabaseSync } from "node:sqlite";
import { DEFAULT_ALLOWLIST, normalizeTargetRules } from "../../../shared/allowlist.js";
import { MAX_CLIENT_OVERRIDES } from "../../../shared/clientOverrides.js";
import type { ClientOverride, InterceptRule, MatchReplaceRule, ProxyProfile, SavedFilter } from "../../../shared/domain.js";
import { defaultProxyProfiles, normalizeProxyProfile } from "../../../shared/proxyProfiles.js";
import { normalizeSavedFilters } from "../../../shared/savedFilters.js";
import { nowIso } from "../ids.js";
import { parseJsonObject } from "../json.js";
import type { ClientOverrideRow, InterceptRuleRow, MatchReplaceRuleRow, ProxyProfileRow } from "../rows.js";

export function createWorkspaceSettingsRepository(db: DatabaseSync) {
  const setTargets = (workspaceId: string, targets: string[]) => {
    const saved = normalizeTargetRules(targets);

    db.exec("BEGIN IMMEDIATE");
    try {
      db.prepare("DELETE FROM workspace_targets WHERE workspace_id = ?").run(workspaceId);
      const insert = db.prepare(
        "INSERT INTO workspace_targets (workspace_id, position, target) VALUES (?, ?, ?)"
      );
      saved.forEach((target, index) => insert.run(workspaceId, index, target));
      db.prepare("UPDATE workspaces SET updated_at = ? WHERE id = ?").run(nowIso(), workspaceId);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }

    return saved;
  };

  const getTargets = (workspaceId: string) => {
    const rows = db
      .prepare("SELECT target FROM workspace_targets WHERE workspace_id = ? ORDER BY position ASC")
      .all(workspaceId) as Array<{ target: string }>;
    if (rows.length === 0) {
      return setTargets(workspaceId, [...DEFAULT_ALLOWLIST]);
    }
    return rows.map((row) => row.target);
  };

  const listInterceptRules = (workspaceId: string) => {
    const rows = db
      .prepare("SELECT rule_json FROM workspace_intercept_rules WHERE workspace_id = ? ORDER BY position ASC")
      .all(workspaceId) as InterceptRuleRow[];
    return rows
      .map((row) => parseJsonObject<InterceptRule | null>(row.rule_json, null))
      .filter((rule): rule is InterceptRule => Boolean(rule));
  };

  const setInterceptRules = (workspaceId: string, rules: InterceptRule[]) => {
    const next = rules.slice(0, 40);
    db.exec("BEGIN IMMEDIATE");
    try {
      db.prepare("DELETE FROM workspace_intercept_rules WHERE workspace_id = ?").run(workspaceId);
      const insert = db.prepare(
        "INSERT INTO workspace_intercept_rules (workspace_id, position, rule_json) VALUES (?, ?, ?)"
      );
      next.forEach((rule, index) => insert.run(workspaceId, index, JSON.stringify(rule)));
      db.prepare("UPDATE workspaces SET updated_at = ? WHERE id = ?").run(nowIso(), workspaceId);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    return next;
  };

  const listMatchReplaceRules = (workspaceId: string) => {
    const rows = db
      .prepare("SELECT rule_json FROM workspace_match_replace_rules WHERE workspace_id = ? ORDER BY position ASC")
      .all(workspaceId) as MatchReplaceRuleRow[];
    return rows
      .map((row) => parseJsonObject<MatchReplaceRule | null>(row.rule_json, null))
      .filter((rule): rule is MatchReplaceRule => Boolean(rule));
  };

  const setMatchReplaceRules = (workspaceId: string, rules: MatchReplaceRule[]) => {
    const next = rules.slice(0, 40);
    db.exec("BEGIN IMMEDIATE");
    try {
      db.prepare("DELETE FROM workspace_match_replace_rules WHERE workspace_id = ?").run(workspaceId);
      const insert = db.prepare(
        "INSERT INTO workspace_match_replace_rules (workspace_id, position, rule_json) VALUES (?, ?, ?)"
      );
      next.forEach((rule, index) => insert.run(workspaceId, index, JSON.stringify(rule)));
      db.prepare("UPDATE workspaces SET updated_at = ? WHERE id = ?").run(nowIso(), workspaceId);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    return next;
  };

  const listClientOverrides = (workspaceId: string) => {
    const rows = db
      .prepare("SELECT override_json FROM workspace_client_overrides WHERE workspace_id = ? ORDER BY position ASC")
      .all(workspaceId) as ClientOverrideRow[];
    return rows
      .map((row) => parseJsonObject<ClientOverride | null>(row.override_json, null))
      .filter((override): override is ClientOverride => Boolean(override));
  };

  const setClientOverrides = (workspaceId: string, overrides: ClientOverride[]) => {
    const next = overrides.slice(0, MAX_CLIENT_OVERRIDES);
    db.exec("BEGIN IMMEDIATE");
    try {
      db.prepare("DELETE FROM workspace_client_overrides WHERE workspace_id = ?").run(workspaceId);
      const insert = db.prepare(
        "INSERT INTO workspace_client_overrides (workspace_id, position, override_json) VALUES (?, ?, ?)"
      );
      next.forEach((override, index) => insert.run(workspaceId, index, JSON.stringify(override)));
      db.prepare("UPDATE workspaces SET updated_at = ? WHERE id = ?").run(nowIso(), workspaceId);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    return next;
  };

  const listProxyProfiles = (workspaceId: string): ProxyProfile[] => {
    const rows = db
      .prepare("SELECT profile_id, notes, updated_at FROM workspace_proxy_profiles WHERE workspace_id = ?")
      .all(workspaceId) as ProxyProfileRow[];
    const saved = new Map(rows.map((row) => [row.profile_id, row]));
    return defaultProxyProfiles().map((profile) => {
      const row = saved.get(profile.id);
      return row
        ? {
            ...profile,
            notes: row.notes,
            updatedAt: row.updated_at
          }
        : profile;
    });
  };

  const saveProxyProfile = (workspaceId: string, input: { id?: unknown; notes?: unknown }) => {
    const profile = normalizeProxyProfile(input);
    if (!profile) {
      throw new Error("Proxy profile id was not recognized.");
    }
    db.prepare(`
      INSERT INTO workspace_proxy_profiles (workspace_id, profile_id, notes, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(workspace_id, profile_id) DO UPDATE SET
        notes = excluded.notes,
        updated_at = excluded.updated_at
    `).run(workspaceId, profile.id, profile.notes, profile.updatedAt);
    db.prepare("UPDATE workspaces SET updated_at = ? WHERE id = ?").run(profile.updatedAt, workspaceId);
    return listProxyProfiles(workspaceId);
  };

  const listSavedFilters = (workspaceId: string) => {
    const rows = db
      .prepare("SELECT filter_json FROM workspace_saved_filters WHERE workspace_id = ? ORDER BY position ASC")
      .all(workspaceId) as Array<{ filter_json: string }>;
    return normalizeSavedFilters(rows.map((row) => parseJsonObject(row.filter_json, null)).filter(Boolean));
  };

  const setSavedFilters = (workspaceId: string, filters: SavedFilter[]) => {
    const next = normalizeSavedFilters(filters);
    db.exec("BEGIN IMMEDIATE");
    try {
      db.prepare("DELETE FROM workspace_saved_filters WHERE workspace_id = ?").run(workspaceId);
      const insert = db.prepare(
        "INSERT INTO workspace_saved_filters (workspace_id, position, filter_json) VALUES (?, ?, ?)"
      );
      next.forEach((filter, index) => insert.run(workspaceId, index, JSON.stringify(filter)));
      db.prepare("UPDATE workspaces SET updated_at = ? WHERE id = ?").run(nowIso(), workspaceId);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    return next;
  };
  return {
    setTargets,
    getTargets,
    listInterceptRules,
    setInterceptRules,
    listMatchReplaceRules,
    setMatchReplaceRules,
    listClientOverrides,
    setClientOverrides,
    listProxyProfiles,
    saveProxyProfile,
    listSavedFilters,
    setSavedFilters
  };
}
