import type { IpcMain } from "electron";
import type {
  BrowserState,
  ProxyProfile,
  ProxyState
} from "../../shared/domain.js";

interface BrowserIpcOperations {
  attachCaptureDebugger: (contentsId: number) => void;
  open: (url: string) => Promise<BrowserState>;
  navigate: (url: string) => Promise<BrowserState>;
  back: () => Promise<BrowserState>;
  forward: () => Promise<BrowserState>;
  reload: () => Promise<BrowserState>;
  state: () => BrowserState;
  ensureProxyCa: () => Promise<unknown>;
  startProxy: (port?: number) => Promise<ProxyState>;
  stopProxy: () => Promise<ProxyState>;
  proxyState: () => ProxyState;
  listProxyProfiles: () => ProxyProfile[];
  saveProxyProfile: (payload: { id?: string; notes?: string }) => ProxyProfile[];
}

export function registerBrowserIpc(
  ipcMain: IpcMain,
  operations: BrowserIpcOperations
) {
  ipcMain.handle("capture:attach", (_event, contentsId) => {
    operations.attachCaptureDebugger(Number(contentsId));
    return { ok: true };
  });
  ipcMain.handle("browser:open", (_event, url) =>
    operations.open(String(url || ""))
  );
  ipcMain.handle("browser:navigate", (_event, url) =>
    operations.navigate(String(url || ""))
  );
  ipcMain.handle("browser:back", () => operations.back());
  ipcMain.handle("browser:forward", () => operations.forward());
  ipcMain.handle("browser:reload", () => operations.reload());
  ipcMain.handle("browser:state", () => operations.state());
  ipcMain.handle("proxy:ca", () => operations.ensureProxyCa());
  ipcMain.handle("proxy:start", (_event, port) =>
    operations.startProxy(Number.isFinite(Number(port)) ? Number(port) : undefined)
  );
  ipcMain.handle("proxy:stop", () => operations.stopProxy());
  ipcMain.handle("proxy:state", () => operations.proxyState());
  ipcMain.handle("proxy:profiles:get", () => operations.listProxyProfiles());
  ipcMain.handle("proxy:profiles:save", (_event, payload) =>
    operations.saveProxyProfile({
      id: typeof payload?.id === "string" ? payload.id : undefined,
      notes: typeof payload?.notes === "string" ? payload.notes : undefined
    })
  );
}
