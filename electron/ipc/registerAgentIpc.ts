import type { IpcMain } from "electron";
import type {
  AgentCapabilityActionRequest,
  AgentMissionSteeringRequest,
  AgentRun,
  AgentRunMemoryEntry,
  AgentRunRecoveryRequest,
  AgentRunRequest
} from "../../shared/agent-types.js";

interface AgentIpcOperations {
  authorize: (webContentsId: number, action: AgentIpcAction) => boolean;
  start: (request: AgentRunRequest) => AgentRun;
  pause: (id: string) => AgentRun | null;
  resume: (id: string) => AgentRun | null;
  recover: (
    id: string,
    request: AgentRunRecoveryRequest
  ) => AgentRun | Promise<AgentRun | null> | null;
  steerMission: (
    id: string,
    request: AgentMissionSteeringRequest
  ) => AgentRun | Promise<AgentRun | null> | null;
  updateCapabilities: (
    id: string,
    request: AgentCapabilityActionRequest
  ) => AgentRun | Promise<AgentRun | null> | null;
  stop: (id: string) => AgentRun | null;
  get: (id: string) => AgentRun | null;
  list: () => AgentRun[];
  listMemory: () => AgentRunMemoryEntry[];
  saveMemory: (entry: AgentRunMemoryEntry) => AgentRunMemoryEntry;
  deleteMemory: (id: string) => AgentRunMemoryEntry[];
}

export type AgentIpcAction =
  | "start"
  | "pause"
  | "resume"
  | "recover"
  | "steer-mission"
  | "update-capabilities"
  | "stop"
  | "get"
  | "list"
  | "list-memory"
  | "save-memory"
  | "delete-memory";

function requireAuthorized(operations: AgentIpcOperations, webContentsId: number, action: AgentIpcAction) {
  if (!operations.authorize(webContentsId, action)) {
    throw new Error("This Radar window is not authorized for that agent operation.");
  }
}

export function registerAgentIpc(
  ipcMain: IpcMain,
  operations: AgentIpcOperations
) {
  ipcMain.handle("agent:start", (event, payload: AgentRunRequest) => {
    requireAuthorized(operations, event.sender.id, "start");
    return operations.start(payload || {});
  });
  ipcMain.handle("agent:pause", (event, id) => {
    requireAuthorized(operations, event.sender.id, "pause");
    return operations.pause(String(id || ""));
  });
  ipcMain.handle("agent:resume", (event, id) => {
    requireAuthorized(operations, event.sender.id, "resume");
    return operations.resume(String(id || ""));
  });
  ipcMain.handle(
    "agent:recover",
    (event, id, request: AgentRunRecoveryRequest) => {
      requireAuthorized(operations, event.sender.id, "recover");
      return operations.recover(
        String(id || ""),
        request || { action: "stop-run" }
      );
    }
  );
  ipcMain.handle(
    "agent:mission:steer",
    (event, id, request: AgentMissionSteeringRequest) => {
      requireAuthorized(operations, event.sender.id, "steer-mission");
      return operations.steerMission(String(id || ""), request);
    }
  );
  ipcMain.handle(
    "agent:capabilities:update",
    (event, id, request: AgentCapabilityActionRequest) => {
      requireAuthorized(operations, event.sender.id, "update-capabilities");
      return operations.updateCapabilities(String(id || ""), request);
    }
  );
  ipcMain.handle("agent:stop", (event, id) => {
    requireAuthorized(operations, event.sender.id, "stop");
    return operations.stop(String(id || ""));
  });
  ipcMain.handle("agent:get", (event, id) => {
    requireAuthorized(operations, event.sender.id, "get");
    return operations.get(String(id || ""));
  });
  ipcMain.handle("agent:list", (event) => {
    requireAuthorized(operations, event.sender.id, "list");
    return operations.list();
  });
  ipcMain.handle("agent-memory:list", (event) => {
    requireAuthorized(operations, event.sender.id, "list-memory");
    return operations.listMemory();
  });
  ipcMain.handle(
    "agent-memory:save",
    (event, entry: AgentRunMemoryEntry) => {
      requireAuthorized(operations, event.sender.id, "save-memory");
      return operations.saveMemory(entry);
    }
  );
  ipcMain.handle("agent-memory:delete", (event, id) => {
    requireAuthorized(operations, event.sender.id, "delete-memory");
    return {
      ok: true,
      memory: operations.deleteMemory(String(id || ""))
    };
  });
}
