import type { IpcMain } from "electron";
import type {
  WorkflowDefinition,
  WorkflowRun,
  WorkflowRevision
} from "../../shared/domain.js";

interface WorkflowIpcOperations {
  list: () => WorkflowDefinition[];
  save: (workflow: unknown) => unknown;
  delete: (id: unknown) => unknown;
  validate: (payload: unknown) => unknown;
  revisions: (id: unknown) => WorkflowRevision[];
  runs: () => WorkflowRun[];
  run: (payload: unknown) => Promise<unknown>;
  promoteResult: (payload: unknown) => unknown;
}

export function registerWorkflowIpc(
  ipcMain: IpcMain,
  operations: WorkflowIpcOperations
) {
  ipcMain.handle("workflows:list", () => operations.list());
  ipcMain.handle("workflows:save", (_event, workflow) =>
    operations.save(workflow)
  );
  ipcMain.handle("workflows:delete", (_event, id) => operations.delete(id));
  ipcMain.handle("workflows:validate", (_event, payload) =>
    operations.validate(payload)
  );
  ipcMain.handle("workflows:revisions", (_event, id) =>
    operations.revisions(id)
  );
  ipcMain.handle("workflows:runs", () => operations.runs());
  ipcMain.handle("workflows:run", (_event, payload) =>
    operations.run(payload)
  );
  ipcMain.handle("workflows:result:finding", (_event, payload) =>
    operations.promoteResult(payload)
  );
}
