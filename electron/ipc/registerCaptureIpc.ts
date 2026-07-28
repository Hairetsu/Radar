import type { IpcMain } from "electron";

interface CaptureIpcOperations {
  snapshot: () => unknown;
  query: (query: unknown) => unknown;
  session: (sessionId: string) => unknown;
  delete: (id: string) => boolean;
  clear: () => void;
  sslSnapshot: () => unknown;
  webSocketSnapshot: () => unknown;
  clearWebSockets: () => void;
  queryWebSockets: (query: unknown) => unknown;
  getFilters: () => unknown;
  setFilters: (filters: unknown) => unknown;
  getTargets: () => string[];
  setTargets: (targets: unknown) => string[];
}

export function registerCaptureIpc(
  ipcMain: IpcMain,
  operations: CaptureIpcOperations
) {
  ipcMain.handle("capture:snapshot", () => operations.snapshot());
  ipcMain.handle("capture:query", (_event, query) => operations.query(query));
  ipcMain.handle("capture:session", (_event, sessionId) =>
    operations.session(String(sessionId || "").trim())
  );
  ipcMain.handle("capture:delete", (_event, id) => ({
    ok: operations.delete(String(id || "").trim())
  }));
  ipcMain.handle("capture:clear", () => {
    operations.clear();
    return { ok: true };
  });
  ipcMain.handle("ssl:snapshot", () => operations.sslSnapshot());
  ipcMain.handle("websocket:snapshot", () => operations.webSocketSnapshot());
  ipcMain.handle("websocket:clear", () => {
    operations.clearWebSockets();
    return { ok: true };
  });
  ipcMain.handle("websocket:query", (_event, query) =>
    operations.queryWebSockets(query)
  );
  ipcMain.handle("filters:get", () => operations.getFilters());
  ipcMain.handle("filters:set", (_event, filters) =>
    operations.setFilters(filters)
  );
  ipcMain.handle("targets:get", () => operations.getTargets());
  ipcMain.handle("targets:set", (_event, targets) =>
    operations.setTargets(targets)
  );
}
