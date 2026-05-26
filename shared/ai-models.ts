import type { AiModelOption } from "./ai-types.js";

const ESC = String.fromCharCode(27);
const BEL = String.fromCharCode(7);
const ANSI_ESCAPE = new RegExp(
  `${ESC}(?:\\[[0-9;?]*[ -/]*[@-~]|\\][^${BEL}]*(?:${BEL}|${ESC}\\\\))`,
  "g"
);
const ORPHANED_ANSI = /\[[0-9;?]+[ -/]*[@-~]/g;

export function stripAnsi(value: string) {
  return String(value || "").replace(ANSI_ESCAPE, "").replace(ORPHANED_ANSI, "");
}

export function sanitizeModelId(value: string) {
  return stripAnsi(value).replace(/\s+/g, " ").trim();
}

export function sanitizeModelOption(model: AiModelOption): AiModelOption {
  const id = sanitizeModelId(model.id);
  const label = sanitizeModelId(model.label) || id;
  return { id, label };
}

export function pickValidModel(requested: string, models: AiModelOption[]) {
  const normalized = sanitizeModelId(requested);
  const cleaned = models.map(sanitizeModelOption);
  if (cleaned.length === 0) {
    return normalized || "auto";
  }
  if (normalized && cleaned.some((model) => model.id === normalized)) {
    return normalized;
  }
  const auto = cleaned.find((model) => model.id === "auto");
  return auto?.id || cleaned[0].id;
}
