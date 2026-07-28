import type { DatabaseSync } from "node:sqlite";
import type { ReplayCollection, ReplayEnvironment, ReplayTabState } from "../../../shared/domain.js";
import { normalizeReplayCollections } from "../../../shared/replayCollections.js";
import { normalizeReplayEnvironments } from "../../../shared/replayVariables.js";
import { normalizeReplayTabState } from "../../../shared/replayTabs.js";
import { parseJsonObject } from "../json.js";

function nowIso() {
  return new Date().toISOString();
}

export function createRepeaterRepository(db: DatabaseSync) {
  const getReplayTabState = (workspaceId: string) => {
    const row = db
      .prepare("SELECT state_json FROM workspace_replay_tabs WHERE workspace_id = ?")
      .get(workspaceId) as { state_json: string } | undefined;
    return normalizeReplayTabState(row ? parseJsonObject(row.state_json, null) : null);
  };

  const setReplayTabState = (workspaceId: string, state: ReplayTabState) => {
    const next = normalizeReplayTabState(state);
    db.prepare(`
      INSERT INTO workspace_replay_tabs (workspace_id, state_json, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(workspace_id) DO UPDATE SET
        state_json = excluded.state_json,
        updated_at = excluded.updated_at
    `).run(workspaceId, JSON.stringify(next), nowIso());
    db.prepare("UPDATE workspaces SET updated_at = ? WHERE id = ?").run(nowIso(), workspaceId);
    return next;
  };

  const listReplayEnvironments = (workspaceId: string) => {
    const rows = db
      .prepare("SELECT environment_json FROM workspace_replay_environments WHERE workspace_id = ? ORDER BY position ASC")
      .all(workspaceId) as Array<{ environment_json: string }>;
    return normalizeReplayEnvironments(rows.map((row) => parseJsonObject(row.environment_json, null)).filter(Boolean));
  };

  const setReplayEnvironments = (workspaceId: string, environments: ReplayEnvironment[]) => {
    const next = normalizeReplayEnvironments(environments);
    db.exec("BEGIN IMMEDIATE");
    try {
      db.prepare("DELETE FROM workspace_replay_environments WHERE workspace_id = ?").run(workspaceId);
      const insert = db.prepare(
        "INSERT INTO workspace_replay_environments (workspace_id, position, environment_json) VALUES (?, ?, ?)"
      );
      next.forEach((environment, index) => insert.run(workspaceId, index, JSON.stringify(environment)));
      db.prepare("UPDATE workspaces SET updated_at = ? WHERE id = ?").run(nowIso(), workspaceId);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    return next;
  };

  const listReplayCollections = (workspaceId: string) => {
    const rows = db
      .prepare("SELECT collection_json FROM workspace_replay_collections WHERE workspace_id = ? ORDER BY position ASC")
      .all(workspaceId) as Array<{ collection_json: string }>;
    return normalizeReplayCollections(rows.map((row) => parseJsonObject(row.collection_json, null)).filter(Boolean));
  };

  const setReplayCollections = (workspaceId: string, collections: ReplayCollection[]) => {
    const next = normalizeReplayCollections(collections);
    db.exec("BEGIN IMMEDIATE");
    try {
      db.prepare("DELETE FROM workspace_replay_collections WHERE workspace_id = ?").run(workspaceId);
      const insert = db.prepare(
        "INSERT INTO workspace_replay_collections (workspace_id, position, collection_json) VALUES (?, ?, ?)"
      );
      next.forEach((collection, index) => insert.run(workspaceId, index, JSON.stringify(collection)));
      db.prepare("UPDATE workspaces SET updated_at = ? WHERE id = ?").run(nowIso(), workspaceId);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    return next;
  };
  return {
    getReplayTabState,
    setReplayTabState,
    listReplayEnvironments,
    setReplayEnvironments,
    listReplayCollections,
    setReplayCollections
  };
}

