import type { CapturedRequest, WebSocketEvent } from "../../shared/domain.js";
import type { AiConnectPresetId, AiRunRequest, AiRunResult } from "../../shared/ai-types.js";
import { pushAudit, snapshotAudit } from "./audit.js";
import { buildContextPayload } from "./context.js";
import { applyConnectPreset, PRESETS, probeSettings } from "./connect.js";
import { complete, normalizeOutput } from "./providers.js";
import { findSkill, loadSkills, upsertSkill, deleteSkill } from "./skills.js";
import { loadSettings, saveSettings } from "./settings.js";
import { customSkillPrompt, systemPrompt } from "./tasks.js";
import { appendViewContext, contextBlockedReason } from "./viewContext.js";

function resolveCaptures(capturedMap: Map<string, CapturedRequest>, captureIds: string[]) {
  const ids = Array.isArray(captureIds) ? captureIds.filter(Boolean) : [];
  if (ids.length === 0) {
    return [];
  }
  return ids.map((id) => capturedMap.get(id)).filter((entry): entry is CapturedRequest => Boolean(entry));
}

function resolveWebSocketEvents(webSocketEventMap: Map<string, WebSocketEvent>, eventIds: string[]) {
  const ids = Array.isArray(eventIds) ? eventIds.filter(Boolean) : [];
  if (ids.length === 0) {
    return [];
  }
  return ids.map((id) => webSocketEventMap.get(id)).filter((entry): entry is WebSocketEvent => Boolean(entry));
}

function buildUserMessage({
  captures,
  webSocketEvents,
  allowlist,
  browserUrl,
  includeRaw,
  viewContext,
  userPrompt
}: {
  captures: CapturedRequest[];
  webSocketEvents: WebSocketEvent[];
  allowlist: string[];
  browserUrl: string;
  includeRaw: boolean;
  viewContext?: AiRunRequest["viewContext"];
  userPrompt?: string;
}) {
  const captureText =
    captures.length > 0 || webSocketEvents.length > 0
      ? buildContextPayload({
          captures,
          webSocketEvents,
          targets: allowlist,
          browserUrl,
          includeRaw: Boolean(includeRaw)
        })
      : [
          "RADAR AI CONTEXT",
          `allowlist: ${allowlist.join(", ") || "(none)"}`,
          `browser_url: ${browserUrl || "(none)"}`,
          `redacted: ${includeRaw ? "no" : "yes"}`,
          "",
          "No packets selected."
        ].join("\n");

  const userParts = [appendViewContext(captureText, viewContext)];
  if (userPrompt?.trim()) {
    userParts.push("", "OPERATOR NOTE:", userPrompt.trim());
  }
  return userParts.join("\n");
}

export function previewContext({
  capturedMap,
  webSocketEventMap = new Map(),
  allowlist,
  browserUrl,
  request
}: {
  capturedMap: Map<string, CapturedRequest>;
  webSocketEventMap?: Map<string, WebSocketEvent>;
  allowlist: string[];
  browserUrl: string;
  request: Partial<AiRunRequest>;
}) {
  const captures = resolveCaptures(capturedMap, request.captureIds || []);
  const webSocketEvents = resolveWebSocketEvents(webSocketEventMap, request.webSocketEventIds || []);
  const viewContext = request.viewContext || (request.view ? { view: request.view } : undefined);
  const blockedReason = contextBlockedReason({ view: request.view, captures, webSocketEvents, viewContext });

  if (blockedReason) {
    return {
      captureCount: captures.length,
      webSocketEventCount: webSocketEvents.length,
      charCount: 0,
      previewText: "",
      redacted: !request.includeRaw,
      blockedReason
    };
  }

  const previewText = buildUserMessage({
    captures,
    webSocketEvents,
    allowlist,
    browserUrl,
    includeRaw: Boolean(request.includeRaw),
    viewContext,
    userPrompt: request.userPrompt
  });

  return {
    captureCount: captures.length,
    webSocketEventCount: webSocketEvents.length,
    charCount: previewText.length,
    previewText,
    redacted: !request.includeRaw
  };
}

export async function runAiTask({
  capturedMap,
  webSocketEventMap = new Map(),
  allowlist,
  browserUrl,
  userDataPath,
  request
}: {
  capturedMap: Map<string, CapturedRequest>;
  webSocketEventMap?: Map<string, WebSocketEvent>;
  allowlist: string[];
  browserUrl: string;
  userDataPath: string;
  request: Partial<AiRunRequest>;
}): Promise<AiRunResult> {
  const task = request.task;
  const includeRaw = Boolean(request.includeRaw);
  const captures = resolveCaptures(capturedMap, request.captureIds || []);
  const webSocketEvents = resolveWebSocketEvents(webSocketEventMap, request.webSocketEventIds || []);
  const viewContext = request.viewContext || (request.view ? { view: request.view } : undefined);

  if (!task) {
    throw new Error("AI task is required.");
  }

  const blockedReason = contextBlockedReason({ view: request.view, captures, webSocketEvents, viewContext });
  if (blockedReason) {
    throw new Error(blockedReason);
  }

  let skillId: string | undefined;
  let system = "";
  if (task === "custom") {
    if (!request.skillId) {
      throw new Error("Custom skill id is required.");
    }
    const skill = findSkill(userDataPath, request.skillId);
    if (!skill) {
      throw new Error("Custom skill not found.");
    }
    skillId = skill.id;
    system = customSkillPrompt(skill);
  } else {
    system = systemPrompt(task);
  }

  const settings = loadSettings(userDataPath);
  const userMessage = buildUserMessage({
    captures,
    webSocketEvents,
    allowlist,
    browserUrl,
    includeRaw,
    viewContext,
    userPrompt: request.userPrompt
  });

  const started = Date.now();
  const auditBase = {
    id: `ai-${started}`,
    createdAt: new Date().toISOString(),
    task,
    skillId,
    provider: settings.provider,
    model: settings.model,
    captureIds: captures.map((capture) => capture.id),
    webSocketEventIds: webSocketEvents.map((event) => event.id),
    redacted: !includeRaw,
    promptChars: userMessage.length + system.length
  };

  try {
    const { text, parsed } = await complete({ settings, system, user: userMessage });
    const output =
      task === "custom"
        ? normalizeOutput("custom", parsed, { skillId: skillId || "", label: findSkill(userDataPath, skillId || "")?.label || "Custom skill" })
        : normalizeOutput(task, parsed);
    const entry = pushAudit({
      ...auditBase,
      resultChars: text.length,
      ok: true
    });

    return {
      ok: true,
      auditId: entry.id,
      rawText: text,
      output
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI request failed";
    const entry = pushAudit({
      ...auditBase,
      resultChars: 0,
      ok: false,
      error: message
    });
    return {
      ok: false,
      auditId: entry.id,
      error: message
    };
  }
}

export async function connectPreset({
  userDataPath,
  presetId
}: {
  userDataPath: string;
  presetId: AiConnectPresetId;
}) {
  const preset = PRESETS[presetId];
  if (!preset) {
    throw new Error(`Unknown connect preset: ${presetId}`);
  }
  const current = loadSettings(userDataPath, preset.provider);
  const applied = applyConnectPreset({
    presetId,
    savedApiKey: current.apiKey,
    savedProvider: current.provider
  });
  const saved = saveSettings(userDataPath, applied.settings);
  const probe = await probeSettings({ ...saved, presetId });
  return {
    settings: saved,
    meta: applied.meta,
    probe
  };
}

export { loadSettings, saveSettings, snapshotAudit, probeSettings, loadSkills, upsertSkill, deleteSkill };
export { fetchAiModels, getAiModels, refreshAiModels, reconcileSettingsModel } from "./models.js";
export { loginCursorCli, readCursorAuthInfo } from "./cursorCli.js";
export { loginGrokCli, readGrokAuthInfo } from "./grokCli.js";
