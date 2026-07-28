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

export function registerAgentIpc(
  ipcMain: IpcMain,
  operations: AgentIpcOperations
) {
  ipcMain.handle("agent:start", (_event, payload: AgentRunRequest) =>
    operations.start(payload || {})
  );
  ipcMain.handle("agent:pause", (_event, id) =>
    operations.pause(String(id || ""))
  );
  ipcMain.handle("agent:resume", (_event, id) =>
    operations.resume(String(id || ""))
  );
  ipcMain.handle(
    "agent:recover",
    (_event, id, request: AgentRunRecoveryRequest) =>
      operations.recover(
        String(id || ""),
        request || { action: "stop-run" }
      )
  );
  ipcMain.handle(
    "agent:mission:steer",
    (_event, id, request: AgentMissionSteeringRequest) =>
      operations.steerMission(String(id || ""), request)
  );
  ipcMain.handle(
    "agent:capabilities:update",
    (_event, id, request: AgentCapabilityActionRequest) =>
      operations.updateCapabilities(String(id || ""), request)
  );
  ipcMain.handle("agent:stop", (_event, id) =>
    operations.stop(String(id || ""))
  );
  ipcMain.handle("agent:get", (_event, id) =>
    operations.get(String(id || ""))
  );
  ipcMain.handle("agent:list", () => operations.list());
  ipcMain.handle("agent-memory:list", () => operations.listMemory());
  ipcMain.handle(
    "agent-memory:save",
    (_event, entry: AgentRunMemoryEntry) => operations.saveMemory(entry)
  );
  ipcMain.handle("agent-memory:delete", (_event, id) => ({
    ok: true,
    memory: operations.deleteMemory(String(id || ""))
  }));
}
