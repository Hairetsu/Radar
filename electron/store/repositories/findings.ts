import type { DatabaseSync } from "node:sqlite";
import type { Finding } from "../../../shared/domain.js";
import { MAX_FINDINGS, normalizeFinding, normalizeFindings } from "../../../shared/findings.js";
import { nowIso } from "../ids.js";
import { parseJsonObject } from "../json.js";
import type { FindingRow } from "../rows.js";
import { runImmediateTransaction } from "../transactions.js";

export function createFindingsRepository(db: DatabaseSync) {
  const listFindings = (sessionId: string, limit = MAX_FINDINGS) => {
    const rows = db
      .prepare("SELECT id, updated_at, finding_json FROM session_findings WHERE session_id = ? ORDER BY updated_at DESC, id DESC LIMIT ?")
      .all(sessionId, Math.max(1, Math.min(Number(limit) || MAX_FINDINGS, MAX_FINDINGS))) as FindingRow[];
    return normalizeFindings(rows.map((row) => parseJsonObject<Finding | null>(row.finding_json, null)));
  };

  const upsertFinding = (sessionId: string, input: Finding) => {
    const finding = normalizeFinding(input);
    if (!finding) {
      throw new Error("Finding was invalid.");
    }
    runImmediateTransaction(db, () => {
      db.prepare(`
        INSERT INTO session_findings (session_id, id, updated_at, finding_json)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(session_id, id) DO UPDATE SET
          updated_at = excluded.updated_at,
          finding_json = excluded.finding_json
      `).run(sessionId, finding.id, finding.updatedAt, JSON.stringify(finding));
      db.prepare("UPDATE sessions SET updated_at = ? WHERE id = ?").run(finding.updatedAt, sessionId);
    });
    return finding;
  };

  const deleteFinding = (sessionId: string, findingId: string) => {
    runImmediateTransaction(db, () => {
      db.prepare("DELETE FROM session_findings WHERE session_id = ? AND id = ?").run(sessionId, findingId);
      db.prepare("UPDATE sessions SET updated_at = ? WHERE id = ?").run(nowIso(), sessionId);
    });
  };
  return {
    listFindings,
    upsertFinding,
    deleteFinding
  };
}
