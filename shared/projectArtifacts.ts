import type { ProjectNote, SavedView, SavedViewTarget } from "./domain.js";
import { truncateText } from "./text.js";

export const MAX_PROJECT_NOTES = 120;
export const MAX_SAVED_VIEWS = 80;

const MAX_TITLE = 100;
const MAX_NOTE_BODY = 24000;
const MAX_DESCRIPTION = 1000;
const MAX_STATE_ENTRIES = 40;
const MAX_STATE_VALUE = 1000;

const savedViewTargets: SavedViewTarget[] = [
  "traffic",
  "websocket",
  "intercept",
  "repeater",
  "automate",
  "findings",
  "workflows",
  "plugins",
  "advanced",
  "sitemap",
  "scope",
  "ssl"
];

function cleanLine(value: unknown, max = MAX_TITLE) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function cleanBody(value: unknown) {
  return truncateText(String(value || "").trim(), MAX_NOTE_BODY);
}

function cleanId(value: unknown, fallback: string) {
  return cleanLine(value, 100).replace(/[^a-zA-Z0-9_.:-]/g, "-") || fallback;
}

function cleanState(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value)
      .map(([key, entry]) => [cleanLine(key, 80), cleanLine(entry, MAX_STATE_VALUE)])
      .filter(([key, entry]) => key && entry)
      .slice(0, MAX_STATE_ENTRIES)
  );
}

function savedViewTarget(value: unknown): SavedViewTarget {
  return savedViewTargets.includes(value as SavedViewTarget) ? (value as SavedViewTarget) : "traffic";
}

export function normalizeProjectNote(input: unknown, fallbackId: string, now = new Date().toISOString()): ProjectNote | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return null;
  }
  const value = input as Partial<ProjectNote>;
  const title = cleanLine(value.title);
  const body = cleanBody(value.body);
  if (!title && !body) {
    return null;
  }
  return {
    id: cleanId(value.id, fallbackId),
    title: title || "Untitled note",
    body,
    createdAt: cleanLine(value.createdAt, 80) || now,
    updatedAt: now
  };
}

export function normalizeProjectNotes(input: unknown, now = new Date().toISOString()) {
  if (!Array.isArray(input)) {
    return [];
  }
  return input
    .slice(0, MAX_PROJECT_NOTES)
    .map((item, index) => normalizeProjectNote(item, `note-${index + 1}`, now))
    .filter((item): item is ProjectNote => Boolean(item));
}

export function normalizeSavedView(input: unknown, fallbackId: string, now = new Date().toISOString()): SavedView | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return null;
  }
  const value = input as Partial<SavedView>;
  const name = cleanLine(value.name);
  if (!name) {
    return null;
  }
  return {
    id: cleanId(value.id, fallbackId),
    name,
    view: savedViewTarget(value.view),
    description: cleanLine(value.description, MAX_DESCRIPTION),
    state: cleanState(value.state),
    createdAt: cleanLine(value.createdAt, 80) || now,
    updatedAt: now
  };
}

export function normalizeSavedViews(input: unknown, now = new Date().toISOString()) {
  if (!Array.isArray(input)) {
    return [];
  }
  return input
    .slice(0, MAX_SAVED_VIEWS)
    .map((item, index) => normalizeSavedView(item, `view-${index + 1}`, now))
    .filter((item): item is SavedView => Boolean(item));
}
