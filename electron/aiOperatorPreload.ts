import { contextBridge, ipcRenderer } from "electron";
import type { IpcRendererEvent } from "electron";
import type { RadarAiOperatorApi } from "../shared/api/aiOperatorApi.js";
import { WINDOW_CHANNELS } from "../shared/windowCoordination.js";

function subscribe<T>(channel: string, listener: (payload: T) => void) {
  const handler = (_event: IpcRendererEvent, payload: T) => listener(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

const radarOperator: RadarAiOperatorApi = {
  getLocalContext: () => ipcRenderer.invoke("local:context"),
  getTargets: () => ipcRenderer.invoke("targets:get"),
  getAiSettings: (provider) => ipcRenderer.invoke("ai:settings:get", provider),
  setAiSettings: (settings) => ipcRenderer.invoke("ai:settings:set", settings),
  connectAi: (presetId) => ipcRenderer.invoke("ai:connect", presetId),
  probeAiConnection: (settings) => ipcRenderer.invoke("ai:connect:probe", settings),
  loginCursor: () => ipcRenderer.invoke("ai:cursor:login"),
  loginGrok: () => ipcRenderer.invoke("ai:grok:login"),
  getAiModels: (provider) => ipcRenderer.invoke("ai:models:get", provider),
  refreshAiModels: (settings) => ipcRenderer.invoke("ai:models:refresh", settings),
  startAgentRun: (payload) => ipcRenderer.invoke("agent:start", payload),
  pauseAgentRun: (id) => ipcRenderer.invoke("agent:pause", id),
  resumeAgentRun: (id) => ipcRenderer.invoke("agent:resume", id),
  recoverAgentRun: (id, request) => ipcRenderer.invoke("agent:recover", id, request),
  steerAgentMission: (id, request) => ipcRenderer.invoke("agent:mission:steer", id, request),
  updateAgentCapabilities: (id, request) => ipcRenderer.invoke("agent:capabilities:update", id, request),
  stopAgentRun: (id) => ipcRenderer.invoke("agent:stop", id),
  stopAgentTraffic: () => ipcRenderer.invoke("agent:stop-traffic"),
  getAgentRun: (id) => ipcRenderer.invoke("agent:get", id),
  listAgentRuns: () => ipcRenderer.invoke("agent:list"),
  getAgentRunMemory: () => ipcRenderer.invoke("agent-memory:list"),
  saveAgentRunMemory: (entry) => ipcRenderer.invoke("agent-memory:save", entry),
  deleteAgentRunMemory: (id) => ipcRenderer.invoke("agent-memory:delete", id),
  openAiOperator: (section) => ipcRenderer.invoke(WINDOW_CHANNELS.openAiOperator, section),
  getWorkspaceContext: () => ipcRenderer.invoke(WINDOW_CHANNELS.getWorkspaceContext),
  dispatchWorkspaceIntent: (intent) => ipcRenderer.invoke(WINDOW_CHANNELS.dispatchWorkspaceIntent, intent),
  focusWorkspace: () => ipcRenderer.invoke(WINDOW_CHANNELS.focusWorkspace),
  getAiOperatorWindowState: () => ipcRenderer.invoke(WINDOW_CHANNELS.getAiOperatorState),
  getAppMode: () => ipcRenderer.invoke(WINDOW_CHANNELS.getAppMode),
  setAppMode: (mode) => ipcRenderer.invoke(WINDOW_CHANNELS.setAppMode, mode),
  onWorkspaceContextChanged: (listener) => subscribe(WINDOW_CHANNELS.workspaceContextChanged, listener),
  onAiOperatorWindowState: (listener) => subscribe(WINDOW_CHANNELS.aiOperatorStateChanged, listener),
  onAppModeChanged: (listener) => subscribe(WINDOW_CHANNELS.appModeChanged, listener),
  onAgentChanged: (listener) => subscribe(WINDOW_CHANNELS.agentChanged, listener),
  onAiConnectionChanged: (listener) => subscribe(WINDOW_CHANNELS.aiConnectionChanged, listener)
};

contextBridge.exposeInMainWorld("radarSurface", "ai-operator");
contextBridge.exposeInMainWorld("radarOperator", radarOperator);
