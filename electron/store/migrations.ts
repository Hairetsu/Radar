import type { DatabaseSync } from "node:sqlite";

export const LOCAL_STORE_SCHEMA_VERSION = 20;

const SCHEMA_VERSION = String(LOCAL_STORE_SCHEMA_VERSION);

export type LocalStoreMigration = {
  version: number;
  name: string;
  up: () => void;
};

type SchemaMigrationRow = {
  version: number;
  name: string;
  applied_at: string;
};

function ensureSchemaMigrationTable(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);
}

function schemaMigrationRows(db: DatabaseSync) {
  ensureSchemaMigrationTable(db);
  return db
    .prepare("SELECT version, name, applied_at FROM schema_migrations ORDER BY version ASC")
    .all() as SchemaMigrationRow[];
}

export function assertSupportedLocalStoreVersion(db: DatabaseSync) {
  const table = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'")
    .get() as { name?: string } | undefined;
  if (!table?.name) {
    return;
  }
  const row = db
    .prepare("SELECT MAX(version) AS version FROM schema_migrations")
    .get() as { version?: number } | undefined;
  const latestApplied = Number(row?.version || 0);
  if (latestApplied > LOCAL_STORE_SCHEMA_VERSION) {
    throw new Error(
      `Local store schema version ${latestApplied} is newer than this Radar build supports (${LOCAL_STORE_SCHEMA_VERSION}).`
    );
  }
}

export function runLocalStoreMigrations(
  db: DatabaseSync,
  migrations: LocalStoreMigration[],
  appliedAt = () => new Date().toISOString()
) {
  const rows = schemaMigrationRows(db);
  const applied = new Set(rows.map((row) => Number(row.version)));
  const latestApplied = Math.max(0, ...Array.from(applied));
  if (latestApplied > LOCAL_STORE_SCHEMA_VERSION) {
    throw new Error(
      `Local store schema version ${latestApplied} is newer than this Radar build supports (${LOCAL_STORE_SCHEMA_VERSION}).`
    );
  }

  for (const migration of [...migrations].sort((left, right) => left.version - right.version)) {
    if (applied.has(migration.version)) {
      continue;
    }

    db.exec("BEGIN IMMEDIATE");
    try {
      migration.up();
      db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)").run(
        "schema_version",
        SCHEMA_VERSION
      );
      db.prepare(
        "INSERT OR REPLACE INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)"
      ).run(migration.version, migration.name, appliedAt());
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }

    applied.add(migration.version);
  }
}
