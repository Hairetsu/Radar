const { buildContextPayload } = require("./context.cjs");
const { systemPrompt } = require("./tasks.cjs");
const { pushAudit, snapshotAudit } = require("./audit.cjs");
const { loadSettings, saveSettings } = require("./settings.cjs");
const { applyConnectPreset, probeSettings } = require("./connect.cjs");
const { complete, normalizeOutput } = require("./providers.cjs");

function resolveCaptures(capturedMap, captureIds) {
  const ids = Array.isArray(captureIds) ? captureIds.filter(Boolean) : [];
  if (ids.length === 0) {
    return [];
  }
  return ids.map((id) => capturedMap.get(id)).filter(Boolean);
}

function previewContext({ capturedMap, allowlist, browserUrl, captureIds, includeRaw }) {
  const captures = resolveCaptures(capturedMap, captureIds);
  if (captures.length === 0) {
    return {
      captureCount: 0,
      charCount: 0,
      previewText: "",
      redacted: !includeRaw,
      blockedReason: "Select at least one capture in Traffic."
    };
  }

  const previewText = buildContextPayload({
    captures,
    targets: allowlist,
    browserUrl,
    includeRaw: Boolean(includeRaw)
  });

  return {
    captureCount: captures.length,
    charCount: previewText.length,
    previewText,
    redacted: !includeRaw
  };
}

async function runAiTask({
  capturedMap,
  allowlist,
  browserUrl,
  userDataPath,
  request
}) {
  const task = request.task;
  const includeRaw = Boolean(request.includeRaw);
  const captures = resolveCaptures(capturedMap, request.captureIds);

  if (!task) {
    throw new Error("AI task is required.");
  }
  if (captures.length === 0) {
    throw new Error("Select at least one capture in Traffic.");
  }

  const settings = loadSettings(userDataPath);
  const contextText = buildContextPayload({
    captures,
    targets: allowlist,
    browserUrl,
    includeRaw
  });

  const userParts = [contextText];
  if (request.userPrompt?.trim()) {
    userParts.push("", "OPERATOR NOTE:", request.userPrompt.trim());
  }

  const userMessage = userParts.join("\n");
  const system = systemPrompt(task);
  const started = Date.now();
  const auditBase = {
    id: `ai-${started}`,
    createdAt: new Date().toISOString(),
    task,
    provider: settings.provider,
    model: settings.model,
    captureIds: captures.map((c) => c.id),
    redacted: !includeRaw,
    promptChars: userMessage.length + system.length
  };

  try {
    const { text, parsed } = await complete({ settings, system, user: userMessage });
    const output = normalizeOutput(task, parsed);
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

async function connectPreset(userDataPath, presetId) {
  const current = loadSettings(userDataPath);
  const applied = applyConnectPreset(presetId, current.apiKey);
  const saved = saveSettings(userDataPath, applied.settings);
  const probe = await probeSettings({ ...saved, presetId });
  return {
    settings: saved,
    meta: applied.meta,
    probe
  };
}

module.exports = {
  loadSettings,
  saveSettings,
  previewContext,
  runAiTask,
  snapshotAudit,
  connectPreset,
  probeSettings
};
