import fs from "node:fs";
import path from "node:path";
import type { AiSettings } from "../../shared/ai-types.js";
import { sanitizeModelId } from "../../shared/ai-models.js";

export const DEFAULT_SETTINGS: AiSettings = {
  provider: "openai",
  model: "gpt-4o-mini",
  apiKey: "",
  baseUrl: "http://127.0.0.1:11434/v1"
};

function settingsPath(userDataPath: string) {
  return path.join(userDataPath, "ai-settings.json");
}

export function loadSettings(userDataPath: string): AiSettings {
  const file = settingsPath(userDataPath);
  try {
    const raw = fs.readFileSync(file, "utf8");
    const parsed = JSON.parse(raw) as Partial<AiSettings>;
    const merged = { ...DEFAULT_SETTINGS, ...parsed };
    return { ...merged, model: sanitizeModelId(merged.model) || DEFAULT_SETTINGS.model };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(userDataPath: string, settings: Partial<AiSettings>): AiSettings {
  const file = settingsPath(userDataPath);
  const next: AiSettings = {
    provider: settings.provider || DEFAULT_SETTINGS.provider,
    model: sanitizeModelId(String(settings.model || DEFAULT_SETTINGS.model)) || DEFAULT_SETTINGS.model,
    apiKey: String(settings.apiKey || ""),
    baseUrl: String(settings.baseUrl || DEFAULT_SETTINGS.baseUrl)
  };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(next, null, 2), "utf8");
  return next;
}
