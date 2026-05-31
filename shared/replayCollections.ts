import type { ReplayCollection, ReplayCollectionItem, ReplayDraft } from "./domain.js";
import { normalizeDraft } from "./draft.js";

export const MAX_COLLECTIONS = 30;
export const MAX_COLLECTION_NAME = 80;
export const MAX_COLLECTION_ITEMS = 100;
export const MAX_ITEM_NAME = 80;

function cleanText(value: unknown, max: number) {
  return String(value || "").trim().slice(0, max);
}

function cleanTags(input: unknown) {
  if (!Array.isArray(input)) {
    return [];
  }
  return input.map((tag) => cleanText(tag, 40)).filter(Boolean).slice(0, 12);
}

export function normalizeReplayCollectionItem(
  input: Partial<ReplayCollectionItem>,
  fallbackId: string,
  now: string
): ReplayCollectionItem | null {
  const name = cleanText(input.name, MAX_ITEM_NAME);
  if (!name) {
    return null;
  }
  return {
    id: cleanText(input.id, 80) || fallbackId,
    name,
    draft: normalizeDraft(input.draft || {}),
    tags: cleanTags(input.tags),
    createdAt: cleanText(input.createdAt, 80) || now,
    updatedAt: now
  };
}

export function normalizeReplayCollection(input: Partial<ReplayCollection>, fallbackId: string, now: string): ReplayCollection | null {
  const name = cleanText(input.name, MAX_COLLECTION_NAME);
  if (!name) {
    return null;
  }
  const items = Array.isArray(input.items)
    ? input.items
        .slice(0, MAX_COLLECTION_ITEMS)
        .map((item, index) =>
          item && typeof item === "object" && !Array.isArray(item)
            ? normalizeReplayCollectionItem(item as Partial<ReplayCollectionItem>, `${fallbackId}-item-${index + 1}`, now)
            : null
        )
        .filter((item): item is ReplayCollectionItem => Boolean(item))
    : [];

  return {
    id: cleanText(input.id, 80) || fallbackId,
    name,
    items,
    createdAt: cleanText(input.createdAt, 80) || now,
    updatedAt: now
  };
}

export function normalizeReplayCollections(input: unknown, now = new Date().toISOString()) {
  if (!Array.isArray(input)) {
    return [];
  }
  return input
    .slice(0, MAX_COLLECTIONS)
    .map((item, index) =>
      item && typeof item === "object" && !Array.isArray(item)
        ? normalizeReplayCollection(item as Partial<ReplayCollection>, `collection-${index + 1}`, now)
        : null
    )
    .filter((item): item is ReplayCollection => Boolean(item));
}

export function createCollectionItem(name: string, draft: ReplayDraft, now = new Date().toISOString()): ReplayCollectionItem {
  return {
    id: `item-${now.replace(/[:.]/g, "")}`,
    name: cleanText(name, MAX_ITEM_NAME) || "Request",
    draft: normalizeDraft(draft),
    tags: [],
    createdAt: now,
    updatedAt: now
  };
}
