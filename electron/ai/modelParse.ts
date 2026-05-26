import type { AiModelOption } from "../../shared/ai-types.js";
import { sanitizeModelId, stripAnsi } from "../../shared/ai-models.js";

function pushModel(models: AiModelOption[], seen: Set<string>, id: string, label?: string) {
  const nextId = sanitizeModelId(id);
  if (!nextId || seen.has(nextId)) {
    return;
  }
  seen.add(nextId);
  models.push({ id: nextId, label: sanitizeModelId(label || nextId) || nextId });
}

function parseCommaSeparatedModels(text: string, models: AiModelOption[], seen: Set<string>) {
  const sanitized = stripAnsi(text).trim();
  const availableMatch = sanitized.match(/available models:\s*(.+)$/i);
  if (availableMatch) {
    for (const part of availableMatch[1].split(",")) {
      pushModel(models, seen, part);
    }
    return models.length > 0;
  }

  if (sanitized.includes("[") || sanitized.includes("{") || !sanitized.includes(",")) {
    return false;
  }

  for (const part of sanitized.split(",")) {
    pushModel(models, seen, part);
  }

  return models.length > 0;
}

export function parseAvailableModels(text: string): AiModelOption[] {
  const models: AiModelOption[] = [];
  const seen = new Set<string>();
  parseCommaSeparatedModels(String(text || ""), models, seen);
  return models;
}

export function parseModelLines(text: string): AiModelOption[] {
  const seen = new Set<string>();
  const models: AiModelOption[] = [];
  const trimmed = stripAnsi(String(text || "")).replace(/\r/g, "");
  if (!trimmed) {
    return models;
  }

  if (parseCommaSeparatedModels(trimmed, models, seen)) {
    return models;
  }

  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (typeof item === "string") {
            pushModel(models, seen, item);
            continue;
          }
          if (item && typeof item === "object" && !Array.isArray(item)) {
            const record = item as Record<string, unknown>;
            const id = typeof record.id === "string" ? record.id : typeof record.model === "string" ? record.model : "";
            const label =
              typeof record.label === "string"
                ? record.label
                : typeof record.name === "string"
                  ? record.name
                  : id;
            pushModel(models, seen, id, label);
          }
        }
        return models;
      }
    } catch {
      // fall through to line parsing
    }
  }

  for (const line of trimmed.split(/\n/)) {
    const nextLine = stripAnsi(line).trim();
    if (!nextLine || nextLine.startsWith("#")) {
      continue;
    }

    if (parseCommaSeparatedModels(nextLine, models, seen)) {
      continue;
    }

    const cleaned = nextLine.replace(/^[-*•]\s*/, "");
    const id = cleaned.split(/\s+/)[0]?.trim() || "";
    pushModel(models, seen, id);
  }

  return models;
}
