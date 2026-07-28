import type { DatabaseSync } from "node:sqlite";
import type {
  WorkflowDefinition,
  WorkflowRevision,
  WorkflowRun
} from "../../../shared/domain.js";
import {
  createWorkflowRevision,
  MAX_WORKFLOWS,
  normalizeWorkflowDefinition,
  normalizeWorkflowDefinitions,
  normalizeWorkflowRevision,
  normalizeWorkflowRun,
  normalizeWorkflowRuns
} from "../../../shared/workflows.js";
import { parseJsonObject } from "../json.js";
import type {
  WorkflowDefinitionRow,
  WorkflowRevisionRow,
  WorkflowRunRow
} from "../rows.js";
import { runImmediateTransaction } from "../transactions.js";

function nowIso() {
  return new Date().toISOString();
}

export function createWorkflowsRepository(db: DatabaseSync) {
  const listWorkflowDefinitions = (workspaceId: string) => {
    const rows = db
      .prepare("SELECT workflow_json FROM workspace_workflows WHERE workspace_id = ? ORDER BY position ASC")
      .all(workspaceId) as WorkflowDefinitionRow[];
    return normalizeWorkflowDefinitions(
      rows.map((row) => parseJsonObject<WorkflowDefinition | null>(row.workflow_json, null)).filter(Boolean)
    ).filter((workflow) => !workflow.builtIn);
  };

  const setWorkflowDefinitions = (workspaceId: string, workflows: WorkflowDefinition[]) => {
    const next = normalizeWorkflowDefinitions(workflows).filter((workflow) => !workflow.builtIn);
    db.exec("BEGIN IMMEDIATE");
    try {
      db.prepare("DELETE FROM workspace_workflows WHERE workspace_id = ?").run(workspaceId);
      const insert = db.prepare(
        "INSERT INTO workspace_workflows (workspace_id, position, workflow_json) VALUES (?, ?, ?)"
      );
      next.slice(0, MAX_WORKFLOWS).forEach((workflow, index) => insert.run(workspaceId, index, JSON.stringify(workflow)));
      db.prepare("UPDATE workspaces SET updated_at = ? WHERE id = ?").run(nowIso(), workspaceId);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    return next;
  };

  const listWorkflowRevisions = (workspaceId: string, workflowId: string, limit = 40) => {
    const rows = db
      .prepare(
        "SELECT revision_json FROM workspace_workflow_revisions WHERE workspace_id = ? AND workflow_id = ? ORDER BY saved_at DESC, revision_id DESC LIMIT ?"
      )
      .all(workspaceId, workflowId, Math.max(1, Math.min(Number(limit) || 40, 80))) as WorkflowRevisionRow[];
    return rows
      .map((row) => normalizeWorkflowRevision(parseJsonObject<WorkflowRevision | null>(row.revision_json, null)))
      .filter((entry): entry is WorkflowRevision => Boolean(entry));
  };

  const appendWorkflowRevision = (workspaceId: string, input: WorkflowRevision) => {
    const revision = normalizeWorkflowRevision(input);
    if (!revision) {
      throw new Error("Workflow revision was invalid.");
    }
    runImmediateTransaction(db, () => {
      db.prepare(`
        INSERT INTO workspace_workflow_revisions (workspace_id, workflow_id, revision_id, saved_at, revision_json)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(workspace_id, workflow_id, revision_id) DO UPDATE SET
          saved_at = excluded.saved_at,
          revision_json = excluded.revision_json
      `).run(workspaceId, revision.workflowId, revision.id, revision.savedAt, JSON.stringify(revision));
      db.prepare(`
        DELETE FROM workspace_workflow_revisions
        WHERE workspace_id = ?
          AND workflow_id = ?
          AND revision_id NOT IN (
            SELECT revision_id FROM workspace_workflow_revisions
            WHERE workspace_id = ? AND workflow_id = ?
            ORDER BY saved_at DESC, revision_id DESC
            LIMIT 80
          )
      `).run(workspaceId, revision.workflowId, workspaceId, revision.workflowId);
    });
    return revision;
  };

  const upsertWorkflowDefinition = (workspaceId: string, input: WorkflowDefinition) => {
    const workflow = normalizeWorkflowDefinition({ ...input, builtIn: false, updatedAt: nowIso() });
    if (!workflow) {
      throw new Error("Workflow definition was invalid.");
    }
    const existing = listWorkflowDefinitions(workspaceId);
    const previous = existing.find((item) => item.id === workflow.id) || null;
    const saved = setWorkflowDefinitions(workspaceId, [workflow, ...existing.filter((item) => item.id !== workflow.id)])[0];
    appendWorkflowRevision(workspaceId, createWorkflowRevision(saved, previous));
    return saved;
  };

  const deleteWorkflowDefinition = (workspaceId: string, workflowId: string) => {
    const next = listWorkflowDefinitions(workspaceId).filter((workflow) => workflow.id !== workflowId);
    setWorkflowDefinitions(workspaceId, next);
    return next;
  };
  const listWorkflowRuns = (sessionId: string, limit = 60) => {
    const rows = db
      .prepare(
        "SELECT id, started_at, run_json FROM session_workflow_runs WHERE session_id = ? ORDER BY started_at DESC, id DESC LIMIT ?"
      )
      .all(sessionId, Math.max(1, Math.min(Number(limit) || 60, 200))) as WorkflowRunRow[];
    return normalizeWorkflowRuns(rows.map((row) => parseJsonObject<WorkflowRun | null>(row.run_json, null)));
  };

  const getWorkflowRun = (sessionId: string, runId: string) => {
    const row = db
      .prepare("SELECT run_json FROM session_workflow_runs WHERE session_id = ? AND id = ?")
      .get(sessionId, runId) as { run_json: string } | undefined;
    return row ? normalizeWorkflowRun(parseJsonObject<WorkflowRun | null>(row.run_json, null)) : null;
  };

  const upsertWorkflowRun = (sessionId: string, input: WorkflowRun) => {
    const run = normalizeWorkflowRun(input);
    if (!run) {
      throw new Error("Workflow run was invalid.");
    }
    runImmediateTransaction(db, () => {
      db.prepare(`
        INSERT INTO session_workflow_runs (session_id, id, started_at, run_json)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(session_id, id) DO UPDATE SET
          started_at = excluded.started_at,
          run_json = excluded.run_json
      `).run(sessionId, run.id, run.startedAt, JSON.stringify(run));
      db.prepare("UPDATE sessions SET updated_at = ? WHERE id = ?").run(run.completedAt || run.startedAt, sessionId);
    });
    return run;
  };

  return {
    listWorkflowDefinitions,
    setWorkflowDefinitions,
    listWorkflowRevisions,
    appendWorkflowRevision,
    upsertWorkflowDefinition,
    deleteWorkflowDefinition,
    listWorkflowRuns,
    getWorkflowRun,
    upsertWorkflowRun
  };
}
