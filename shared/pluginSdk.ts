import type {
  CapturedRequest,
  Finding,
  PluginApiAction,
  PluginApiRequest,
  PluginApiResult,
  ReplayDraft,
  ReplayResult,
  WebSocketEvent,
  WorkflowDefinition,
  WorkflowRun
} from "./domain.js";

export type RadarPluginSdkClient = {
  request: (request: PluginApiRequest) => Promise<PluginApiResult>;
};

function requestFor(pluginId: string, action: PluginApiAction, input: Record<string, unknown> = {}): PluginApiRequest {
  return { pluginId, action, input };
}

async function runTyped<T>(client: RadarPluginSdkClient, request: PluginApiRequest): Promise<T> {
  const result = await client.request(request);
  if (!result.ok) {
    throw new Error(result.error || `Plugin API action failed: ${request.action}`);
  }
  return result.data as T;
}

export function createRadarPluginSdk(pluginId: string, client: RadarPluginSdkClient) {
  const id = String(pluginId || "").trim();
  if (!id) {
    throw new Error("Plugin id is required.");
  }
  return {
    listCaptures: (query = "") =>
      runTyped<CapturedRequest[]>(client, requestFor(id, "captures:list", { query })),
    listFrames: (query = "") =>
      runTyped<WebSocketEvent[]>(client, requestFor(id, "frames:list", { query })),
    prepareReplay: (draft: ReplayDraft) =>
      runTyped<ReplayDraft>(client, requestFor(id, "replay:prepare", { draft })),
    sendReplay: (draft: ReplayDraft) =>
      runTyped<ReplayResult>(client, requestFor(id, "replay:send", { draft })),
    createFinding: (finding: Finding) =>
      runTyped<Finding>(client, requestFor(id, "findings:create", { finding })),
    listWorkflows: () =>
      runTyped<WorkflowDefinition[]>(client, requestFor(id, "workflows:list")),
    saveWorkflow: (workflow: WorkflowDefinition) =>
      runTyped<WorkflowDefinition>(client, requestFor(id, "workflows:save", { workflow })),
    runWorkflow: (workflowId: string, inputs: Record<string, string> = {}) =>
      runTyped<WorkflowRun>(client, requestFor(id, "workflows:run", { workflowId, inputs }))
  };
}
