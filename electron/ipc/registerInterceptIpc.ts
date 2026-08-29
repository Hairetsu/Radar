import type { IpcMain } from "electron";
import type {
  InterceptConfig,
  InterceptResponseDraft,
  InterceptState,
  ReplayDraft
} from "../../shared/domain.js";

interface InterceptIpcOperations {
  state: () => InterceptState;
  configure: (config: Partial<InterceptConfig>) => InterceptState;
  forward: (
    id: string,
    draft?: ReplayDraft,
    response?: InterceptResponseDraft
  ) => unknown;
  drop: (id: string) => unknown;
  resumeAll: () => InterceptState;
  getRules: () => unknown;
  setRules: (rules: unknown) => unknown;
  getMatchReplaceRules: () => unknown;
  setMatchReplaceRules: (rules: unknown) => unknown;
  getClientOverrides: () => unknown;
  setClientOverrides: (overrides: unknown) => unknown;
}

export function registerInterceptIpc(
  ipcMain: IpcMain,
  operations: InterceptIpcOperations
) {
  ipcMain.handle("intercept:state", () => operations.state());
  ipcMain.handle("intercept:config", (_event, config) => {
    const payload =
      config && typeof config === "object" && !Array.isArray(config)
        ? (config as Partial<InterceptConfig>)
        : {};
    return operations.configure(payload);
  });
  ipcMain.handle("intercept:forward", (_event, payload) => {
    const id = String(payload?.id || "").trim();
    if (!id) {
      throw new Error("Intercept queue item id is required.");
    }
    const draft =
      payload?.draft &&
      typeof payload.draft === "object" &&
      !Array.isArray(payload.draft)
        ? (payload.draft as ReplayDraft)
        : undefined;
    const response =
      payload?.response &&
      typeof payload.response === "object" &&
      !Array.isArray(payload.response)
        ? (payload.response as InterceptResponseDraft)
        : undefined;
    return operations.forward(id, draft, response);
  });
  ipcMain.handle("intercept:drop", (_event, id) =>
    operations.drop(String(id || "").trim())
  );
  ipcMain.handle("intercept:resume-all", () => operations.resumeAll());
  ipcMain.handle("intercept:rules:get", () => operations.getRules());
  ipcMain.handle("intercept:rules:set", (_event, rules) =>
    operations.setRules(rules)
  );
  ipcMain.handle("match-replace:rules:get", () =>
    operations.getMatchReplaceRules()
  );
  ipcMain.handle("match-replace:rules:set", (_event, rules) =>
    operations.setMatchReplaceRules(rules)
  );
  ipcMain.handle("client-overrides:get", () => operations.getClientOverrides());
  ipcMain.handle("client-overrides:set", (_event, overrides) =>
    operations.setClientOverrides(overrides)
  );
}
