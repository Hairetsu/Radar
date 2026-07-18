import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { expect, launchRadarApplication, test } from "./fixtures";

function prepareMigrationLedger(userDataDir: string, version: number, name: string) {
  fs.mkdirSync(userDataDir, { recursive: true });
  const databasePath = path.join(userDataDir, "radar-local.sqlite");
  const database = new DatabaseSync(databasePath);
  database.exec("CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)");
  database.prepare("INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)").run(
    version,
    name,
    "2026-01-01T00:00:00.000Z"
  );
  database.close();
  return databasePath;
}

test("[REG-DATA-004] @persistence @security fails closed against a newer database without modifying it", async ({
  userDataDir,
  proxyPort
}, testInfo) => {
  const databasePath = prepareMigrationLedger(userDataDir, 999, "future-radar-schema");
  const before = fs.readFileSync(databasePath);
  const app = await launchRadarApplication({
    userDataDir,
    proxyPort,
    debugPort: 21_223 + testInfo.workerIndex * 20
  });
  try {
    const page = await app.firstWindow();
    await expect(page.locator('[data-testid="startupError"]')).toBeVisible();
    await expect(page.getByText(/newer than this Radar build supports/i)).toBeVisible();
    expect(fs.readFileSync(databasePath)).toEqual(before);
  } finally {
    await app.close();
  }
});

test("[REG-DATA-005] @persistence migrates a supported older database once and remains idempotent", async ({
  userDataDir,
  proxyPort
}, testInfo) => {
  const databasePath = prepareMigrationLedger(userDataDir, 19, "supported-older-fixture");
  const debugPort = 21_423 + testInfo.workerIndex * 20;
  const firstApp = await launchRadarApplication({ userDataDir, proxyPort, debugPort });
  const firstPage = await firstApp.firstWindow();
  await expect(firstPage.getByTestId("radarShell")).toBeVisible();
  await firstApp.close();

  const migrated = new DatabaseSync(databasePath);
  const firstRows = migrated.prepare("SELECT version FROM schema_migrations ORDER BY version").all() as Array<{ version: number }>;
  migrated.close();
  expect(firstRows.map((row) => row.version)).toEqual([19, 20]);

  const secondApp = await launchRadarApplication({ userDataDir, proxyPort, debugPort });
  try {
    const secondPage = await secondApp.firstWindow();
    await expect(secondPage.getByTestId("radarShell")).toBeVisible();
  } finally {
    await secondApp.close();
  }
  const repeated = new DatabaseSync(databasePath);
  const secondRows = repeated.prepare("SELECT version FROM schema_migrations ORDER BY version").all() as Array<{ version: number }>;
  repeated.close();
  expect(secondRows.map((row) => row.version)).toEqual([19, 20]);
});
