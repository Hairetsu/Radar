import type { IpcMain } from "electron";
import type { AgentRun } from "../../shared/agent-types.js";
import {
  WINDOW_CHANNELS,
  normalizeAiOperatorSection,
  normalizeAppMode,
  normalizeWorkspaceControlIntent
} from "../../shared/windowCoordination.js";
import type { WindowCoordinator } from "../windows/windowCoordinator.js";

interface WindowIpcOperations {
  coordinator: () => WindowCoordinator;
  executingRun: () => AgentRun | null;
  pauseRun: (id: string) => Promise<AgentRun | null> | AgentRun | null;
}

function requireRole(operations: WindowIpcOperations, webContentsId: number, allowed: Array<"workspace" | "ai-operator">) {
  const role = operations.coordinator().roleForWebContents(webContentsId);
  if (!role || !allowed.includes(role)) {
    throw new Error("This Radar window is not authorized for that operation.");
  }
  return role;
}

export function registerWindowIpc(ipcMain: IpcMain, operations: WindowIpcOperations) {
  ipcMain.handle(WINDOW_CHANNELS.openAiOperator, (event, section) => {
    requireRole(operations, event.sender.id, ["workspace", "ai-operator"]);
    return operations.coordinator().showAiOperator(normalizeAiOperatorSection(section));
  });
  ipcMain.handle(WINDOW_CHANNELS.getAiOperatorState, (event) => {
    requireRole(operations, event.sender.id, ["workspace", "ai-operator"]);
    return operations.coordinator().state();
  });
  ipcMain.handle(WINDOW_CHANNELS.getAppMode, (event) => {
    requireRole(operations, event.sender.id, ["workspace", "ai-operator"]);
    return operations.coordinator().appMode();
  });
  ipcMain.handle(WINDOW_CHANNELS.setAppMode, async (event, value) => {
    requireRole(operations, event.sender.id, ["workspace", "ai-operator"]);
    const mode = normalizeAppMode(value);
    if (mode === "manual-first") {
      const executing = operations.executingRun();
      if (executing) {
        const paused = await operations.pauseRun(executing.id);
        if (!paused || paused.status !== "paused") {
          throw new Error("Radar could not checkpoint the active run; AI-First remains active.");
        }
      }
    }
    return operations.coordinator().setAppMode(mode);
  });
  ipcMain.handle(WINDOW_CHANNELS.publishWorkspaceContext, (event, context) => {
    requireRole(operations, event.sender.id, ["workspace"]);
    const result = operations.coordinator().publishWorkspaceContext(context);
    if (!result) {
      throw new Error("Workspace context was invalid.");
    }
    return result;
  });
  ipcMain.handle(WINDOW_CHANNELS.getWorkspaceContext, (event) => {
    requireRole(operations, event.sender.id, ["ai-operator"]);
    return operations.coordinator().workspaceContext();
  });
  ipcMain.handle(WINDOW_CHANNELS.dispatchWorkspaceIntent, (event, value) => {
    requireRole(operations, event.sender.id, ["ai-operator"]);
    const intent = normalizeWorkspaceControlIntent(value);
    if (!intent) {
      return { ok: false, error: "Workspace control intent was invalid." };
    }
    return operations.coordinator().forwardWorkspaceIntent(intent)
      ? { ok: true }
      : { ok: false, error: "The Radar workspace is unavailable." };
  });
  ipcMain.handle(WINDOW_CHANNELS.focusWorkspace, (event) => {
    requireRole(operations, event.sender.id, ["ai-operator"]);
    return operations.coordinator().focusWorkspace()
      ? { ok: true }
      : { ok: false, error: "The Radar workspace is unavailable." };
  });
}
