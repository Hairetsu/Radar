import type { DatabaseSync } from "node:sqlite";
import type { AgentRunMemoryEntry } from "../../../shared/agent-types.js";
import type { ProjectNote, SavedView } from "../../../shared/domain.js";
import { MAX_AGENT_RUN_MEMORY, normalizeAgentRunMemory, normalizeAgentRunMemoryList } from "../../../shared/agentMemory.js";
import { MAX_PROJECT_NOTES, MAX_SAVED_VIEWS, normalizeProjectNote, normalizeSavedView } from "../../../shared/projectArtifacts.js";
import { createId, nowIso } from "../ids.js";
import { parseJsonObject } from "../json.js";
import type { AgentRunMemoryRow, ProjectNoteRow, SavedViewRow } from "../rows.js";
import { runImmediateTransaction } from "../transactions.js";

export function createProjectArtifactsRepository(db: DatabaseSync) {
  const listProjectNotes = (workspaceId: string, limit = MAX_PROJECT_NOTES) => {
    const rows = db
      .prepare("SELECT id, updated_at, note_json FROM workspace_project_notes WHERE workspace_id = ? ORDER BY updated_at DESC, id DESC LIMIT ?")
      .all(workspaceId, Math.max(1, Math.min(Number(limit) || MAX_PROJECT_NOTES, MAX_PROJECT_NOTES))) as ProjectNoteRow[];
    return rows
      .map((row) => normalizeProjectNote(parseJsonObject<ProjectNote | null>(row.note_json, null), row.id, row.updated_at))
      .filter((note): note is ProjectNote => Boolean(note));
  };

  const upsertProjectNote = (workspaceId: string, input: ProjectNote) => {
    const note = normalizeProjectNote(input, createId("note"));
    if (!note) {
      throw new Error("Project note was invalid.");
    }
    runImmediateTransaction(db, () => {
      db.prepare(`
        INSERT INTO workspace_project_notes (workspace_id, id, updated_at, note_json)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(workspace_id, id) DO UPDATE SET
          updated_at = excluded.updated_at,
          note_json = excluded.note_json
      `).run(workspaceId, note.id, note.updatedAt, JSON.stringify(note));
      db.prepare("UPDATE workspaces SET updated_at = ? WHERE id = ?").run(note.updatedAt, workspaceId);
    });
    return note;
  };

  const deleteProjectNote = (workspaceId: string, noteId: string) => {
    runImmediateTransaction(db, () => {
      db.prepare("DELETE FROM workspace_project_notes WHERE workspace_id = ? AND id = ?").run(workspaceId, noteId);
      db.prepare("UPDATE workspaces SET updated_at = ? WHERE id = ?").run(nowIso(), workspaceId);
    });
  };

  const listSavedViews = (workspaceId: string, limit = MAX_SAVED_VIEWS) => {
    const rows = db
      .prepare("SELECT id, updated_at, view_json FROM workspace_saved_views WHERE workspace_id = ? ORDER BY updated_at DESC, id DESC LIMIT ?")
      .all(workspaceId, Math.max(1, Math.min(Number(limit) || MAX_SAVED_VIEWS, MAX_SAVED_VIEWS))) as SavedViewRow[];
    return rows
      .map((row) => normalizeSavedView(parseJsonObject<SavedView | null>(row.view_json, null), row.id, row.updated_at))
      .filter((view): view is SavedView => Boolean(view));
  };

  const upsertSavedView = (workspaceId: string, input: SavedView) => {
    const view = normalizeSavedView(input, createId("view"));
    if (!view) {
      throw new Error("Saved view was invalid.");
    }
    runImmediateTransaction(db, () => {
      db.prepare(`
        INSERT INTO workspace_saved_views (workspace_id, id, updated_at, view_json)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(workspace_id, id) DO UPDATE SET
          updated_at = excluded.updated_at,
          view_json = excluded.view_json
      `).run(workspaceId, view.id, view.updatedAt, JSON.stringify(view));
      db.prepare("UPDATE workspaces SET updated_at = ? WHERE id = ?").run(view.updatedAt, workspaceId);
    });
    return view;
  };

  const deleteSavedView = (workspaceId: string, viewId: string) => {
    runImmediateTransaction(db, () => {
      db.prepare("DELETE FROM workspace_saved_views WHERE workspace_id = ? AND id = ?").run(workspaceId, viewId);
      db.prepare("UPDATE workspaces SET updated_at = ? WHERE id = ?").run(nowIso(), workspaceId);
    });
  };

  const listAgentRunMemory = (workspaceId: string, limit = MAX_AGENT_RUN_MEMORY) => {
    const rows = db
      .prepare("SELECT id, updated_at, memory_json FROM workspace_agent_memory WHERE workspace_id = ? ORDER BY updated_at DESC, id DESC LIMIT ?")
      .all(workspaceId, Math.max(1, Math.min(Number(limit) || MAX_AGENT_RUN_MEMORY, MAX_AGENT_RUN_MEMORY))) as AgentRunMemoryRow[];
    return normalizeAgentRunMemoryList(
      rows.map((row) => normalizeAgentRunMemory(parseJsonObject<AgentRunMemoryEntry | null>(row.memory_json, null), row.id, row.updated_at))
    );
  };

  const upsertAgentRunMemory = (workspaceId: string, input: AgentRunMemoryEntry) => {
    const memory = normalizeAgentRunMemory(input, createId("memory"));
    if (!memory) {
      throw new Error("Run memory entry was invalid.");
    }
    runImmediateTransaction(db, () => {
      db.prepare(`
        INSERT INTO workspace_agent_memory (workspace_id, id, updated_at, memory_json)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(workspace_id, id) DO UPDATE SET
          updated_at = excluded.updated_at,
          memory_json = excluded.memory_json
      `).run(workspaceId, memory.id, memory.updatedAt, JSON.stringify(memory));
      db.prepare("UPDATE workspaces SET updated_at = ? WHERE id = ?").run(memory.updatedAt, workspaceId);
    });
    return memory;
  };

  const deleteAgentRunMemory = (workspaceId: string, memoryId: string) => {
    runImmediateTransaction(db, () => {
      db.prepare("DELETE FROM workspace_agent_memory WHERE workspace_id = ? AND id = ?").run(workspaceId, memoryId);
      db.prepare("UPDATE workspaces SET updated_at = ? WHERE id = ?").run(nowIso(), workspaceId);
    });
    return listAgentRunMemory(workspaceId);
  };
  return {
    listProjectNotes,
    upsertProjectNote,
    deleteProjectNote,
    listSavedViews,
    upsertSavedView,
    deleteSavedView,
    listAgentRunMemory,
    upsertAgentRunMemory,
    deleteAgentRunMemory
  };
}
