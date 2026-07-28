import type { IpcMain } from "electron";
import type {
  EvidenceAnnotation,
  Finding
} from "../../shared/domain.js";

interface FindingsIpcOperations {
  listAnnotations: () => EvidenceAnnotation[];
  saveAnnotation: (annotation: EvidenceAnnotation) => EvidenceAnnotation;
  saveAnnotations: (annotations: EvidenceAnnotation[]) => EvidenceAnnotation[];
  listFindings: () => Finding[];
  saveFinding: (finding: unknown) => unknown;
  deleteFinding: (id: string) => boolean;
  buildReport: (options: unknown) => unknown;
}

export function registerFindingsIpc(
  ipcMain: IpcMain,
  operations: FindingsIpcOperations
) {
  ipcMain.handle("evidence:annotations:get", () => operations.listAnnotations());
  ipcMain.handle(
    "evidence:annotations:save",
    (_event, annotation: EvidenceAnnotation) =>
      operations.saveAnnotation(annotation)
  );
  ipcMain.handle(
    "evidence:annotations:save-many",
    (_event, annotations: EvidenceAnnotation[]) =>
      operations.saveAnnotations(Array.isArray(annotations) ? annotations : [])
  );
  ipcMain.handle("findings:list", () => operations.listFindings());
  ipcMain.handle("findings:save", (_event, finding) =>
    operations.saveFinding(finding)
  );
  ipcMain.handle("findings:delete", (_event, id) => ({
    ok: operations.deleteFinding(String(id || "").trim())
  }));
  ipcMain.handle("findings:report", (_event, options) =>
    operations.buildReport(options)
  );
}
