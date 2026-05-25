const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("radar", {
  openBrowser: (url) => ipcRenderer.invoke("browser:open", url),
  navigateBrowser: (url) => ipcRenderer.invoke("browser:navigate", url),
  browserBack: () => ipcRenderer.invoke("browser:back"),
  browserForward: () => ipcRenderer.invoke("browser:forward"),
  browserReload: () => ipcRenderer.invoke("browser:reload"),
  getBrowserState: () => ipcRenderer.invoke("browser:state"),
  ensureProxyCa: () => ipcRenderer.invoke("proxy:ca"),
  startProxy: (port) => ipcRenderer.invoke("proxy:start", port),
  stopProxy: () => ipcRenderer.invoke("proxy:stop"),
  getProxyState: () => ipcRenderer.invoke("proxy:state"),
  getCaptures: () => ipcRenderer.invoke("capture:snapshot"),
  clearCaptures: () => ipcRenderer.invoke("capture:clear"),
  getSslEvents: () => ipcRenderer.invoke("ssl:snapshot"),
  getTargets: () => ipcRenderer.invoke("targets:get"),
  setTargets: (targets) => ipcRenderer.invoke("targets:set", targets),
  sendReplay: (request) => ipcRenderer.invoke("repeater:send", request),
  runBurst: (payload) => ipcRenderer.invoke("repeater:burst", payload),
  getAiSettings: () => ipcRenderer.invoke("ai:settings:get"),
  setAiSettings: (settings) => ipcRenderer.invoke("ai:settings:set", settings),
  previewAiContext: (payload) => ipcRenderer.invoke("ai:context:preview", payload),
  runAiTask: (payload) => ipcRenderer.invoke("ai:run", payload),
  getAiAudit: () => ipcRenderer.invoke("ai:audit:snapshot"),
  connectAi: (presetId) => ipcRenderer.invoke("ai:connect", presetId),
  probeAiConnection: (settings) => ipcRenderer.invoke("ai:connect:probe", settings)
});
