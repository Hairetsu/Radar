import type { IpcMain } from "electron";
import type {
  IdentityActivationRecord,
  IdentityProfile,
  IdentityProfileDraft
} from "../../shared/identityProfiles.js";

interface IdentityIpcOperations {
  listProfiles: () => IdentityProfile[];
  createProfile: (draft: IdentityProfileDraft) => IdentityProfile;
  updateProfile: (payload: {
    id: string;
    draft: Partial<IdentityProfileDraft>;
  }) => IdentityProfile;
  activateProfile: (payload: { identityId: string }) => Promise<unknown>;
  verifyProfile: (identityId: string) => Promise<IdentityProfile>;
  archiveProfile: (identityId: string) => unknown;
  listActivations: () => IdentityActivationRecord[];
}

export function registerIdentityIpc(
  ipcMain: IpcMain,
  operations: IdentityIpcOperations
) {
  ipcMain.handle("identity:profiles:list", () => operations.listProfiles());
  ipcMain.handle(
    "identity:profiles:create",
    (_event, draft: IdentityProfileDraft) => operations.createProfile(draft)
  );
  ipcMain.handle("identity:profiles:update", (_event, payload) =>
    operations.updateProfile(payload)
  );
  ipcMain.handle("identity:profiles:activate", (_event, payload) =>
    operations.activateProfile(payload)
  );
  ipcMain.handle("identity:profiles:verify", (_event, id) =>
    operations.verifyProfile(String(id || ""))
  );
  ipcMain.handle("identity:profiles:archive", (_event, id) =>
    operations.archiveProfile(String(id || ""))
  );
  ipcMain.handle("identity:activations:list", () => operations.listActivations());
}
