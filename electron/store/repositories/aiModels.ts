import type { DatabaseSync } from "node:sqlite";
import type { AiModelOption } from "../../../shared/ai-types.js";
import { sanitizeModelOption } from "../../../shared/ai-models.js";

function nowIso() {
  return new Date().toISOString();
}

export function createAiModelsRepository(db: DatabaseSync) {
  const saveAiModels = (provider: string, models: AiModelOption[]) => {
    const nextProvider = provider.trim();
    if (!nextProvider) {
      return [];
    }

    db.exec("BEGIN IMMEDIATE");
    try {
      db.prepare("DELETE FROM ai_models WHERE provider = ?").run(nextProvider);
      const insert = db.prepare(
        "INSERT INTO ai_models (provider, model_id, label, position, updated_at) VALUES (?, ?, ?, ?, ?)"
      );
      const updatedAt = nowIso();
      models.forEach((model, index) => {
        const cleaned = sanitizeModelOption(model);
        const id = cleaned.id;
        if (!id) {
          return;
        }
        insert.run(nextProvider, id, cleaned.label || id, index, updatedAt);
      });
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }

    return listAiModels(nextProvider);
  };

  const listAiModels = (provider: string) => {
    const rows = db
      .prepare("SELECT model_id, label FROM ai_models WHERE provider = ? ORDER BY position ASC")
      .all(provider.trim()) as Array<{ model_id: string; label: string }>;
    return rows.map((row) => sanitizeModelOption({ id: row.model_id, label: row.label }));
  };
  return {
    saveAiModels,
    listAiModels
  };
}

