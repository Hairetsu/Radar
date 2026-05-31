import type { SavedFilter, SavedFilterSurface } from "./domain.js";

const MAX_FILTERS = 40;
const MAX_NAME = 80;
const MAX_QUERY = 400;

function cleanText(value: unknown, max: number) {
  return String(value || "").trim().slice(0, max);
}

function surface(value: unknown): SavedFilterSurface {
  return value === "traffic" || value === "websocket" || value === "both" ? value : "both";
}

export function normalizeSavedFilter(input: Partial<SavedFilter>, fallbackId: string, now: string): SavedFilter | null {
  const name = cleanText(input.name, MAX_NAME);
  const query = cleanText(input.query, MAX_QUERY);
  if (!name || !query) {
    return null;
  }
  return {
    id: cleanText(input.id, 80) || fallbackId,
    name,
    query,
    surface: surface(input.surface),
    createdAt: cleanText(input.createdAt, 80) || now,
    updatedAt: now
  };
}

export function normalizeSavedFilters(input: unknown, now = new Date().toISOString()) {
  if (!Array.isArray(input)) {
    return [];
  }
  return input
    .slice(0, MAX_FILTERS)
    .map((item, index) =>
      item && typeof item === "object" && !Array.isArray(item)
        ? normalizeSavedFilter(item as Partial<SavedFilter>, `filter-${index + 1}`, now)
        : null
    )
    .filter((item): item is SavedFilter => Boolean(item));
}
