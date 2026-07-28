import type { IpcMain } from "electron";
import type {
  ProjectNote,
  SavedView
} from "../../shared/domain.js";
import type { GlobalSearchRequest } from "../../shared/globalSearch.js";

interface ProjectIpcOperations {
  search: (request: GlobalSearchRequest) => unknown;
  listNotes: () => ProjectNote[];
  saveNote: (note: ProjectNote) => ProjectNote;
  deleteNote: (id: string) => ProjectNote[];
  listViews: () => SavedView[];
  saveView: (view: SavedView) => SavedView;
  deleteView: (id: string) => SavedView[];
  previewBundleExport: (options: unknown) => unknown;
  writeBundle: (options: unknown) => Promise<unknown>;
  previewBundleImport: (payload: unknown) => Promise<unknown>;
  applyBundleImport: (payload: unknown) => Promise<unknown>;
  previewHandoff: (options: unknown) => unknown;
  writeHandoff: (options: unknown) => Promise<unknown>;
}

export function registerProjectIpc(
  ipcMain: IpcMain,
  operations: ProjectIpcOperations
) {
  ipcMain.handle("search:global", (_event, request: GlobalSearchRequest) =>
    operations.search(request || { query: "" })
  );
  ipcMain.handle("project-notes:list", () => operations.listNotes());
  ipcMain.handle("project-notes:save", (_event, note: ProjectNote) =>
    operations.saveNote(note)
  );
  ipcMain.handle("project-notes:delete", (_event, id) => ({
    ok: true,
    notes: operations.deleteNote(String(id || ""))
  }));
  ipcMain.handle("saved-views:list", () => operations.listViews());
  ipcMain.handle("saved-views:save", (_event, view: SavedView) =>
    operations.saveView(view)
  );
  ipcMain.handle("saved-views:delete", (_event, id) => ({
    ok: true,
    views: operations.deleteView(String(id || ""))
  }));
  ipcMain.handle("project-bundle:export:preview", (_event, options) =>
    operations.previewBundleExport(options)
  );
  ipcMain.handle("project-bundle:export:write", (_event, options) =>
    operations.writeBundle(options)
  );
  ipcMain.handle("project-bundle:import:preview", (_event, payload) =>
    operations.previewBundleImport(payload)
  );
  ipcMain.handle("project-bundle:import:apply", (_event, payload) =>
    operations.applyBundleImport(payload)
  );
  ipcMain.handle("handoff:preview", (_event, options) =>
    operations.previewHandoff(options)
  );
  ipcMain.handle("handoff:write", (_event, options) =>
    operations.writeHandoff(options)
  );
}
