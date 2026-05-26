import { contextBridge, ipcRenderer } from "electron";
import type { RadarApi } from "../shared/radar-api.js";

const radar: RadarApi = {
  getLocalContext: () => ipcRenderer.invoke("local:context"),
  createLocalSession: (name?: string) => ipcRenderer.invoke("local:session:create", name),
  openBrowser: (url: string) => ipcRenderer.invoke("browser:open", url),
  navigateBrowser: (url: string) => ipcRenderer.invoke("browser:navigate", url),
  browserBack: () => ipcRenderer.invoke("browser:back"),
  browserForward: () => ipcRenderer.invoke("browser:forward"),
  browserReload: () => ipcRenderer.invoke("browser:reload"),
  getBrowserState: () => ipcRenderer.invoke("browser:state"),
  ensureProxyCa: () => ipcRenderer.invoke("proxy:ca"),
  startProxy: (port?: number) => ipcRenderer.invoke("proxy:start", port),
  stopProxy: () => ipcRenderer.invoke("proxy:stop"),
  getProxyState: () => ipcRenderer.invoke("proxy:state"),
  getCaptures: () => ipcRenderer.invoke("capture:snapshot"),
  clearCaptures: () => ipcRenderer.invoke("capture:clear"),
  getSslEvents: () => ipcRenderer.invoke("ssl:snapshot"),
  getTargets: () => ipcRenderer.invoke("targets:get"),
  setTargets: (targets: string[]) => ipcRenderer.invoke("targets:set", targets),
  sendReplay: (request) => ipcRenderer.invoke("repeater:send", request),
  runBurst: (payload) => ipcRenderer.invoke("repeater:burst", payload),
  getAiSettings: () => ipcRenderer.invoke("ai:settings:get"),
  setAiSettings: (settings) => ipcRenderer.invoke("ai:settings:set", settings),
  previewAiContext: (payload) => ipcRenderer.invoke("ai:context:preview", payload),
  runAiTask: (payload) => ipcRenderer.invoke("ai:run", payload),
  getAiAudit: () => ipcRenderer.invoke("ai:audit:snapshot"),
  getAiSkills: () => ipcRenderer.invoke("ai:skills:get"),
  saveAiSkill: (skill) => ipcRenderer.invoke("ai:skills:save", skill),
  deleteAiSkill: (id) => ipcRenderer.invoke("ai:skills:delete", id),
  connectAi: (presetId) => ipcRenderer.invoke("ai:connect", presetId),
  probeAiConnection: (settings) => ipcRenderer.invoke("ai:connect:probe", settings),
  loginCursor: () => ipcRenderer.invoke("ai:cursor:login"),
  getAiModels: (provider) => ipcRenderer.invoke("ai:models:get", provider),
  refreshAiModels: (settings) => ipcRenderer.invoke("ai:models:refresh", settings)
};

contextBridge.exposeInMainWorld("radar", radar);
