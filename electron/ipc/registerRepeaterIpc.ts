import type { IpcMain } from "electron";
import type {
  ReplayCollection,
  ReplayEnvironment,
  ReplayTabState,
  WebSocketReplayDraft
} from "../../shared/domain.js";

interface RepeaterIpcOperations {
  getTabs: () => ReplayTabState | null;
  setTabs: (state: ReplayTabState) => ReplayTabState;
  getEnvironments: () => ReplayEnvironment[];
  setEnvironments: (environments: ReplayEnvironment[]) => ReplayEnvironment[];
  getCollections: () => ReplayCollection[];
  setCollections: (collections: ReplayCollection[]) => ReplayCollection[];
  sendWebSocket: (draft: WebSocketReplayDraft) => Promise<unknown>;
  send: (input: unknown) => Promise<unknown>;
  burst: (input: unknown) => Promise<unknown>;
  experiment: (input: unknown) => Promise<unknown>;
}

export function registerRepeaterIpc(
  ipcMain: IpcMain,
  operations: RepeaterIpcOperations
) {
  ipcMain.handle("repeater:tabs:get", () => operations.getTabs());
  ipcMain.handle("repeater:tabs:set", (_event, state: ReplayTabState) =>
    operations.setTabs(state)
  );
  ipcMain.handle("repeater:environments:get", () =>
    operations.getEnvironments()
  );
  ipcMain.handle(
    "repeater:environments:set",
    (_event, environments: ReplayEnvironment[]) =>
      operations.setEnvironments(Array.isArray(environments) ? environments : [])
  );
  ipcMain.handle("repeater:collections:get", () => operations.getCollections());
  ipcMain.handle(
    "repeater:collections:set",
    (_event, collections: ReplayCollection[]) =>
      operations.setCollections(Array.isArray(collections) ? collections : [])
  );
  ipcMain.handle(
    "repeater:websocket:send",
    (_event, input: WebSocketReplayDraft) => operations.sendWebSocket(input)
  );
  ipcMain.handle("repeater:send", (_event, input) => operations.send(input));
  ipcMain.handle("repeater:burst", (_event, input) => operations.burst(input));
  ipcMain.handle("repeater:experiment", (_event, input) => operations.experiment(input));
}
