import type { IpcMain } from "electron";
import type {
  AiConnectPresetId,
  AiCustomSkill,
  AiProviderId,
  AiRunRequest,
  AiSettings
} from "../../shared/ai-types.js";

interface AiIpcOperations {
  getSettings: () => unknown;
  saveSettings: (settings: Partial<AiSettings>) => unknown;
  previewContext: (request: Partial<AiRunRequest>) => unknown;
  run: (request: Partial<AiRunRequest>) => Promise<unknown>;
  getSkills: () => unknown;
  saveSkill: (skill: AiCustomSkill) => unknown;
  deleteSkill: (id: string) => unknown;
  snapshotAudit: () => unknown;
  connect: (presetId: AiConnectPresetId) => Promise<unknown>;
  probe: (settings: AiSettings) => Promise<unknown>;
  cursorLogin: () => Promise<unknown>;
  getModels: (provider: AiProviderId | string) => unknown;
  refreshModels: (settings?: AiSettings) => Promise<unknown>;
}

export function registerAiIpc(
  ipcMain: IpcMain,
  operations: AiIpcOperations
) {
  ipcMain.handle("ai:settings:get", () => operations.getSettings());
  ipcMain.handle("ai:settings:set", (_event, settings: Partial<AiSettings>) =>
    operations.saveSettings(settings)
  );
  ipcMain.handle("ai:context:preview", (_event, payload: Partial<AiRunRequest>) =>
    operations.previewContext(payload || {})
  );
  ipcMain.handle("ai:run", (_event, payload: Partial<AiRunRequest>) =>
    operations.run(payload || {})
  );
  ipcMain.handle("ai:skills:get", () => operations.getSkills());
  ipcMain.handle("ai:skills:save", (_event, skill: AiCustomSkill) =>
    operations.saveSkill(skill)
  );
  ipcMain.handle("ai:skills:delete", (_event, id) =>
    operations.deleteSkill(String(id || ""))
  );
  ipcMain.handle("ai:audit:snapshot", () => operations.snapshotAudit());
  ipcMain.handle("ai:connect", (_event, presetId: AiConnectPresetId) =>
    operations.connect(presetId)
  );
  ipcMain.handle("ai:connect:probe", (_event, settings: AiSettings) =>
    operations.probe(settings)
  );
  ipcMain.handle("ai:cursor:login", () => operations.cursorLogin());
  ipcMain.handle("ai:models:get", (_event, provider) =>
    operations.getModels(String(provider || ""))
  );
  ipcMain.handle("ai:models:refresh", (_event, settings: AiSettings) =>
    operations.refreshModels(settings)
  );
}
