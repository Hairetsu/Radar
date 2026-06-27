import type {
  CapturedRequest,
  Finding,
  InstalledPlugin,
  PluginAuditEntry,
  PluginApiAction,
  PluginApiRequest,
  PluginApiResult,
  PluginPermission,
  ReplayDraft,
  ReplayResult,
  WebSocketEvent,
  WorkflowDefinition,
  WorkflowRun
} from "../shared/domain.js";
import { isAllowedTarget } from "../shared/allowlist.js";
import { normalizeDraft } from "../shared/draft.js";
import { normalizeFinding } from "../shared/findings.js";
import { hasPluginPermission } from "../shared/plugins.js";
import { filterCapturesByQuery, filterWebSocketEventsByQuery } from "../shared/trafficQuery.js";
import { normalizeWorkflowDefinition } from "../shared/workflows.js";

export type PluginApiDependencies = {
  getPlugin: (pluginId: string) => InstalledPlugin | null;
  allowlist: () => string[];
  listCaptures: () => CapturedRequest[];
  listWebSocketEvents: () => WebSocketEvent[];
  saveFinding: (finding: Finding) => Finding;
  listWorkflows: () => WorkflowDefinition[];
  saveWorkflow: (workflow: WorkflowDefinition) => WorkflowDefinition;
  runWorkflow: (payload: { workflowId: string; inputs?: Record<string, string>; source: "manual" }) => Promise<WorkflowRun>;
  sendReplay: (draft: ReplayDraft) => Promise<ReplayResult>;
  recordAudit?: (entry: PluginAuditEntry) => void;
};

const actionPermissions: Record<PluginApiAction, PluginPermission> = {
  "captures:list": "captures:read",
  "frames:list": "frames:read",
  "replay:prepare": "replay:prepare",
  "replay:send": "replay:send",
  "findings:create": "findings:write",
  "workflows:list": "workflows:read",
  "workflows:save": "workflows:write",
  "workflows:run": "workflows:run"
};

function objectValue(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function actionResult(action: PluginApiAction, data: unknown): PluginApiResult {
  return { ok: true, action, data };
}

function actionError(action: PluginApiAction, error: string): PluginApiResult {
  return { ok: false, action, data: null, error };
}

function isPluginApiAction(value: unknown): value is PluginApiAction {
  return Object.prototype.hasOwnProperty.call(actionPermissions, String(value));
}

function normalizeApiRequest(input: unknown): PluginApiRequest | null {
  const value = objectValue(input);
  const pluginId = String(value.pluginId || "").trim();
  const action = String(value.action || "");
  if (!pluginId || !isPluginApiAction(action)) {
    return null;
  }
  return {
    pluginId,
    action,
    input: objectValue(value.input)
  };
}

function scopedCaptures(captures: CapturedRequest[], allowlist: string[]) {
  return captures.filter((capture) => capture.allowed && isAllowedTarget(capture.url, allowlist));
}

function scopedFrames(events: WebSocketEvent[], allowlist: string[]) {
  return events.filter((event) => event.allowed && isAllowedTarget(event.url, allowlist));
}

function filteredCaptures(captures: CapturedRequest[], query: unknown) {
  const text = String(query || "").trim();
  if (!text) {
    return captures;
  }
  return filterCapturesByQuery(captures, text).captures;
}

function filteredFrames(events: WebSocketEvent[], query: unknown) {
  const text = String(query || "").trim();
  if (!text) {
    return events;
  }
  return filterWebSocketEventsByQuery(events, text).events;
}

function normalizeWorkflowInputs(value: unknown) {
  const input = objectValue(value);
  return Object.fromEntries(Object.entries(input).map(([key, entry]) => [key, String(entry || "")]));
}

function createAuditId() {
  return `plugin_audit_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function summarize(value: unknown) {
  if (typeof value === "string") {
    return value.slice(0, 500);
  }
  try {
    return JSON.stringify(value).slice(0, 500);
  } catch {
    return "";
  }
}

export async function runPluginApiAction(input: unknown, deps: PluginApiDependencies): Promise<PluginApiResult> {
  const request = normalizeApiRequest(input);
  if (!request) {
    return actionError("captures:list", "Plugin API request was invalid.");
  }
  const started = Date.now();
  const finish = (result: PluginApiResult, plugin?: InstalledPlugin | null) => {
    deps.recordAudit?.({
      id: createAuditId(),
      pluginId: request.pluginId,
      pluginName: plugin?.manifest.name || request.pluginId,
      action: request.action,
      permission: actionPermissions[request.action],
      ok: result.ok,
      message: result.ok ? "Plugin API action completed." : result.error || "Plugin API action failed.",
      inputSummary: summarize(request.input),
      outputSummary: summarize(result.ok ? result.data : result.error),
      durationMs: Date.now() - started,
      createdAt: new Date().toISOString()
    });
    return result;
  };
  const plugin = deps.getPlugin(request.pluginId);
  if (!plugin) {
    return finish(actionError(request.action, "Plugin was not installed."));
  }
  if (!hasPluginPermission(plugin, actionPermissions[request.action])) {
    return finish(actionError(request.action, `Plugin is not approved for ${actionPermissions[request.action]}.`), plugin);
  }

  try {
    if (request.action === "captures:list") {
      return finish(
        actionResult(
          request.action,
          filteredCaptures(scopedCaptures(deps.listCaptures(), deps.allowlist()), request.input.query)
        ),
        plugin
      );
    }
    if (request.action === "frames:list") {
      return finish(
        actionResult(
          request.action,
          filteredFrames(scopedFrames(deps.listWebSocketEvents(), deps.allowlist()), request.input.query)
        ),
        plugin
      );
    }
    if (request.action === "replay:prepare") {
      const draft = normalizeDraft(request.input.draft as ReplayDraft);
      if (!isAllowedTarget(draft.url, deps.allowlist())) {
        throw new Error("Replay draft URL is outside the current scope allowlist.");
      }
      return finish(actionResult(request.action, draft), plugin);
    }
    if (request.action === "replay:send") {
      const draft = normalizeDraft(request.input.draft as ReplayDraft);
      if (!isAllowedTarget(draft.url, deps.allowlist())) {
        throw new Error("Replay URL is outside the current scope allowlist.");
      }
      return finish(actionResult(request.action, await deps.sendReplay(draft)), plugin);
    }
    if (request.action === "findings:create") {
      const finding = normalizeFinding(request.input.finding);
      if (!finding) {
        throw new Error("Plugin finding needs a title and at least one evidence reference.");
      }
      return finish(actionResult(request.action, deps.saveFinding({ ...finding, status: "draft", source: "manual" })), plugin);
    }
    if (request.action === "workflows:list") {
      return finish(actionResult(request.action, deps.listWorkflows()), plugin);
    }
    if (request.action === "workflows:save") {
      const workflow = normalizeWorkflowDefinition(request.input.workflow);
      if (!workflow || workflow.builtIn) {
        throw new Error("Plugin workflow definition was invalid.");
      }
      return finish(actionResult(request.action, deps.saveWorkflow({ ...workflow, builtIn: false })), plugin);
    }
    const workflowId = String(request.input.workflowId || "").trim();
    if (!workflowId) {
      throw new Error("Plugin workflow run needs a workflow id.");
    }
    return finish(
      actionResult(
        request.action,
        await deps.runWorkflow({ workflowId, inputs: normalizeWorkflowInputs(request.input.inputs), source: "manual" })
      ),
      plugin
    );
  } catch (error) {
    return finish(actionError(request.action, error instanceof Error ? error.message : "Plugin API action failed."), plugin);
  }
}
