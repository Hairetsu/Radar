import type { DatabaseSync } from "node:sqlite";
import type { EvidenceAnnotation } from "../../../shared/domain.js";
import { normalizeEvidenceAnnotation, normalizeEvidenceAnnotations } from "../../../shared/evidenceTags.js";
import { nowIso } from "../ids.js";
import { parseJsonArray } from "../json.js";

export function createEvidenceAnnotationsRepository(db: DatabaseSync) {
  const listEvidenceAnnotations = (sessionId: string) => {
    const rows = db
      .prepare(
        "SELECT evidence_id, kind, tags_json, comment, updated_at FROM session_evidence_annotations WHERE session_id = ? ORDER BY updated_at DESC"
      )
      .all(sessionId) as Array<{
      evidence_id: string;
      kind: "capture" | "websocket";
      tags_json: string;
      comment: string;
      updated_at: string;
    }>;
    return normalizeEvidenceAnnotations(
      rows.map((row) => ({
        evidenceId: row.evidence_id,
        kind: row.kind,
        tags: parseJsonArray<string>(row.tags_json),
        comment: row.comment,
        updatedAt: row.updated_at
      }))
    );
  };

  const saveEvidenceAnnotation = (sessionId: string, input: Partial<EvidenceAnnotation>) => {
    const annotation = normalizeEvidenceAnnotation(input);
    if (!annotation) {
      throw new Error("Evidence annotation was invalid.");
    }
    db.prepare(`
      INSERT INTO session_evidence_annotations (session_id, evidence_id, kind, tags_json, comment, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(session_id, evidence_id, kind) DO UPDATE SET
        tags_json = excluded.tags_json,
        comment = excluded.comment,
        updated_at = excluded.updated_at
    `).run(
      sessionId,
      annotation.evidenceId,
      annotation.kind,
      JSON.stringify(annotation.tags),
      annotation.comment,
      annotation.updatedAt
    );
    db.prepare("UPDATE sessions SET updated_at = ? WHERE id = ?").run(annotation.updatedAt, sessionId);
    return annotation;
  };

  const saveEvidenceAnnotations = (sessionId: string, inputs: Partial<EvidenceAnnotation>[]) => {
    const updatedAt = nowIso();
    const next = inputs
      .map((input) => normalizeEvidenceAnnotation(input, updatedAt))
      .filter((item): item is EvidenceAnnotation => Boolean(item));
    db.exec("BEGIN IMMEDIATE");
    try {
      const upsert = db.prepare(`
        INSERT INTO session_evidence_annotations (session_id, evidence_id, kind, tags_json, comment, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(session_id, evidence_id, kind) DO UPDATE SET
          tags_json = excluded.tags_json,
          comment = excluded.comment,
          updated_at = excluded.updated_at
      `);
      for (const annotation of next) {
        upsert.run(
          sessionId,
          annotation.evidenceId,
          annotation.kind,
          JSON.stringify(annotation.tags),
          annotation.comment,
          annotation.updatedAt
        );
      }
      db.prepare("UPDATE sessions SET updated_at = ? WHERE id = ?").run(updatedAt, sessionId);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    return listEvidenceAnnotations(sessionId);
  };
  return {
    listEvidenceAnnotations,
    saveEvidenceAnnotation,
    saveEvidenceAnnotations
  };
}
