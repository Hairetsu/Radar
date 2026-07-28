import type { DatabaseSync } from "node:sqlite";
import type { AgentRun } from "../../../shared/agent-types.js";
import { toAgentRun } from "../rowMappers/agentRuns.js";
import type { AgentRunRow } from "../rows.js";
import { runImmediateTransaction } from "../transactions.js";

export function createAgentRunsRepository(db: DatabaseSync) {
  const upsertAgentRun = (sessionId: string, run: AgentRun) => {
    runImmediateTransaction(db, () => {
      db.prepare(`
        INSERT INTO agent_runs (
          session_id, id, created_at, updated_at, goal, profile_id, status, policy_json, timeline_json, findings_json, checkpoint_json, mission_json, capabilities_json, error
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(session_id, id) DO UPDATE SET
          updated_at = excluded.updated_at,
          goal = excluded.goal,
          profile_id = excluded.profile_id,
          status = excluded.status,
          policy_json = excluded.policy_json,
          timeline_json = excluded.timeline_json,
          findings_json = excluded.findings_json,
          checkpoint_json = excluded.checkpoint_json,
          mission_json = excluded.mission_json,
          capabilities_json = excluded.capabilities_json,
          error = excluded.error
      `).run(
        sessionId,
        run.id,
        run.createdAt,
        run.updatedAt,
        run.goal,
        run.profileId || "passive-map",
        run.status,
        JSON.stringify(run.policy),
        JSON.stringify(run.timeline),
        JSON.stringify(run.findings),
        JSON.stringify(run.checkpoint || {}),
        JSON.stringify(run.mission || {}),
        JSON.stringify(run.capabilities || {}),
        run.error ?? null
      );
      db.prepare("UPDATE sessions SET updated_at = ? WHERE id = ?").run(run.updatedAt, sessionId);
    });
    return run;
  };

  const getAgentRun = (sessionId: string, runId: string) => {
    const row = db
      .prepare("SELECT * FROM agent_runs WHERE session_id = ? AND id = ?")
      .get(sessionId, runId) as AgentRunRow | undefined;
    return row ? toAgentRun(row) : null;
  };

  const listAgentRuns = (sessionId: string, limit = 25) => {
    const rows = db
      .prepare("SELECT * FROM agent_runs WHERE session_id = ? ORDER BY updated_at DESC, created_at DESC LIMIT ?")
      .all(sessionId, Math.max(1, Math.min(Number(limit) || 25, 100))) as AgentRunRow[];
    return rows.map(toAgentRun);
  };
  return {
    upsertAgentRun,
    getAgentRun,
    listAgentRuns
  };
}
