import type { IpcMain } from "electron";
import type {
  LocalContext,
  LocalProfile,
  LocalSession,
  LocalSessionSummary
} from "../../shared/domain.js";

interface LocalIpcOperations {
  authorizeContextRead?: (webContentsId: number) => boolean;
  context: () => LocalContext;
  listProfiles: () => LocalProfile[];
  createProfile: (name?: string) => LocalContext;
  saveProfile: (id: string, name: string) => LocalProfile;
  loadProfile: (id: string) => LocalContext;
  listSessions: (profileId?: string) => LocalSessionSummary[];
  createSession: (name?: string) => LocalContext;
  saveSession: (id: string, name: string) => LocalSession;
  loadSession: (id: string) => LocalContext;
  seedDemo: () => LocalContext;
}

export function registerLocalIpc(
  ipcMain: IpcMain,
  operations: LocalIpcOperations
) {
  ipcMain.handle("local:context", (event) => {
    if (operations.authorizeContextRead && !operations.authorizeContextRead(event.sender.id)) {
      throw new Error("This Radar window is not authorized to read local context.");
    }
    return operations.context();
  });
  ipcMain.handle("local:profiles:list", () => operations.listProfiles());
  ipcMain.handle("local:profile:create", (_event, name) =>
    operations.createProfile(typeof name === "string" ? name : undefined)
  );
  ipcMain.handle("local:profile:save", (_event, payload) =>
    operations.saveProfile(
      String(payload?.id || ""),
      String(payload?.name || "")
    )
  );
  ipcMain.handle("local:profile:load", (_event, id) =>
    operations.loadProfile(String(id || ""))
  );
  ipcMain.handle("local:sessions:list", (_event, profileId) =>
    operations.listSessions(
      typeof profileId === "string" && profileId.trim()
        ? profileId
        : undefined
    )
  );
  ipcMain.handle("local:session:create", (_event, name) =>
    operations.createSession(typeof name === "string" ? name : undefined)
  );
  ipcMain.handle("local:session:save", (_event, payload) =>
    operations.saveSession(
      String(payload?.id || ""),
      String(payload?.name || "")
    )
  );
  ipcMain.handle("local:session:load", (_event, id) =>
    operations.loadSession(String(id || ""))
  );
  ipcMain.handle("local:demo:seed", () => operations.seedDemo());
}
