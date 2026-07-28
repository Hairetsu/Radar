import type { IpcMain } from "electron";
import type {
  InstalledPlugin,
  PluginAuditEntry
} from "../../shared/domain.js";

interface PluginIpcOperations {
  list: () => InstalledPlugin[];
  preview: (sourcePath: unknown) => unknown;
  install: (sourcePath: unknown) => unknown;
  approve: (payload: unknown) => unknown;
  setStatus: (payload: unknown) => unknown;
  remove: (id: unknown) => unknown;
  audit: () => PluginAuditEntry[];
  renderPanel: (payload: unknown) => unknown;
  validate: (sourcePath: unknown) => unknown;
  runApi: (request: unknown) => unknown;
}

export function registerPluginIpc(
  ipcMain: IpcMain,
  operations: PluginIpcOperations
) {
  ipcMain.handle("plugins:list", () => operations.list());
  ipcMain.handle("plugins:preview", (_event, sourcePath) =>
    operations.preview(sourcePath)
  );
  ipcMain.handle("plugins:install", (_event, sourcePath) =>
    operations.install(sourcePath)
  );
  ipcMain.handle("plugins:approve", (_event, payload) =>
    operations.approve(payload)
  );
  ipcMain.handle("plugins:status", (_event, payload) =>
    operations.setStatus(payload)
  );
  ipcMain.handle("plugins:remove", (_event, id) => operations.remove(id));
  ipcMain.handle("plugins:audit", () => operations.audit());
  ipcMain.handle("plugins:panel", (_event, payload) =>
    operations.renderPanel(payload)
  );
  ipcMain.handle("plugins:validate", (_event, sourcePath) =>
    operations.validate(sourcePath)
  );
  ipcMain.handle("plugins:api", (_event, request) =>
    operations.runApi(request)
  );
}
