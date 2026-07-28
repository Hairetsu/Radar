import type { IpcMain } from "electron";
import type {
  AutomatePayloadSet,
  AutomateSession
} from "../../shared/domain.js";

interface AutomateIpcOperations {
  getPayloadSets: () => AutomatePayloadSet[];
  setPayloadSets: (sets: unknown) => AutomatePayloadSet[];
  listSessions: () => AutomateSession[];
  getSession: (id: string) => AutomateSession | null;
  start: (payload: unknown) => unknown;
  pause: (id: string) => unknown;
  resume: (id: string) => unknown;
  stop: (id: string) => unknown;
  retry: (id: string) => unknown;
  promoteToRepeater: (payload: unknown) => unknown;
  promoteToFinding: (payload: unknown) => unknown;
}

export function registerAutomateIpc(
  ipcMain: IpcMain,
  operations: AutomateIpcOperations
) {
  ipcMain.handle("automate:payload-sets:get", () => operations.getPayloadSets());
  ipcMain.handle("automate:payload-sets:set", (_event, payloadSets) =>
    operations.setPayloadSets(payloadSets)
  );
  ipcMain.handle("automate:sessions:list", () => operations.listSessions());
  ipcMain.handle("automate:session:get", (_event, id) =>
    operations.getSession(String(id || ""))
  );
  ipcMain.handle("automate:session:start", (_event, payload) =>
    operations.start(payload)
  );
  ipcMain.handle("automate:session:pause", (_event, id) =>
    operations.pause(String(id || ""))
  );
  ipcMain.handle("automate:session:resume", (_event, id) =>
    operations.resume(String(id || ""))
  );
  ipcMain.handle("automate:session:stop", (_event, id) =>
    operations.stop(String(id || ""))
  );
  ipcMain.handle("automate:session:retry", (_event, id) =>
    operations.retry(String(id || ""))
  );
  ipcMain.handle("automate:result:promote", (_event, payload) =>
    operations.promoteToRepeater(payload)
  );
  ipcMain.handle("automate:result:finding", (_event, payload) =>
    operations.promoteToFinding(payload)
  );
}
