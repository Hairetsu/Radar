import type { IpcMain } from "electron";
import type {
  AiConnectPresetId,
  AiCustomSkill,
  AiProviderId,
  AiRunRequest,
  AiSettings
} from "../../shared/ai-types.js";

interface AiIpcOperations {
  authorize: (webContentsId: number, action: AiIpcAction) => boolean;
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

export type AiIpcAction =
  | "settings-read"
  | "settings-write"
  | "preview"
  | "run"
  | "skills-read"
  | "skills-write"
  | "audit"
  | "connect"
  | "probe"
  | "login"
  | "models-read"
  | "models-refresh";

function requireAuthorized(operations: AiIpcOperations, webContentsId: number, action: AiIpcAction) {
  if (!operations.authorize(webContentsId, action)) {
    throw new Error("This Radar window is not authorized for that AI operation.");
  }
}

export function registerAiIpc(
  ipcMain: IpcMain,
  operations: AiIpcOperations
) {
  ipcMain.handle("ai:settings:get", (event) => {
    requireAuthorized(operations, event.sender.id, "settings-read");
    return operations.getSettings();
  });
  ipcMain.handle("ai:settings:set", (event, settings: Partial<AiSettings>) => {
    requireAuthorized(operations, event.sender.id, "settings-write");
    return operations.saveSettings(settings);
  });
  ipcMain.handle("ai:context:preview", (event, payload: Partial<AiRunRequest>) => {
    requireAuthorized(operations, event.sender.id, "preview");
    return operations.previewContext(payload || {});
  });
  ipcMain.handle("ai:run", (event, payload: Partial<AiRunRequest>) => {
    requireAuthorized(operations, event.sender.id, "run");
    return operations.run(payload || {});
  });
  ipcMain.handle("ai:skills:get", (event) => {
    requireAuthorized(operations, event.sender.id, "skills-read");
    return operations.getSkills();
  });
  ipcMain.handle("ai:skills:save", (event, skill: AiCustomSkill) => {
    requireAuthorized(operations, event.sender.id, "skills-write");
    return operations.saveSkill(skill);
  });
  ipcMain.handle("ai:skills:delete", (event, id) => {
    requireAuthorized(operations, event.sender.id, "skills-write");
    return operations.deleteSkill(String(id || ""));
  });
  ipcMain.handle("ai:audit:snapshot", (event) => {
    requireAuthorized(operations, event.sender.id, "audit");
    return operations.snapshotAudit();
  });
  ipcMain.handle("ai:connect", (event, presetId: AiConnectPresetId) => {
    requireAuthorized(operations, event.sender.id, "connect");
    return operations.connect(presetId);
  });
  ipcMain.handle("ai:connect:probe", (event, settings: AiSettings) => {
    requireAuthorized(operations, event.sender.id, "probe");
    return operations.probe(settings);
  });
  ipcMain.handle("ai:cursor:login", (event) => {
    requireAuthorized(operations, event.sender.id, "login");
    return operations.cursorLogin();
  });
  ipcMain.handle("ai:models:get", (event, provider) => {
    requireAuthorized(operations, event.sender.id, "models-read");
    return operations.getModels(String(provider || ""));
  });
  ipcMain.handle("ai:models:refresh", (event, settings: AiSettings) => {
    requireAuthorized(operations, event.sender.id, "models-refresh");
    return operations.refreshModels(settings);
  });
}
