import type { ReplayDraft, ReplayHistoryEntry, ReplayResult, ReplayTab, ReplayTabState } from "./domain.js";
import { normalizeDraft } from "./draft.js";

export const MAX_REPLAY_TABS = 20;
export const MAX_TAB_NAME = 60;
export const MAX_HISTORY_PER_TAB = 50;

const emptyDraft = (): ReplayDraft => ({
  method: "GET",
  url: "",
  headers: {},
  body: ""
});

function cleanText(value: unknown, max: number) {
  return String(value || "").trim().slice(0, max);
}

function normalizeHistoryEntry(input: Partial<ReplayHistoryEntry>, fallbackId: string, now: string): ReplayHistoryEntry | null {
  const result = input.result;
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    return null;
  }
  const draft = normalizeDraft(input.draft || {});
  return {
    id: cleanText(input.id, 80) || fallbackId,
    sentAt: cleanText(input.sentAt, 80) || now,
    draft,
    result: {
      ok: Boolean((result as ReplayResult).ok),
      status: Number((result as ReplayResult).status) || 0,
      statusText: cleanText((result as ReplayResult).statusText, 120),
      durationMs: Number((result as ReplayResult).durationMs) || 0,
      headers:
        (result as ReplayResult).headers && typeof (result as ReplayResult).headers === "object"
          ? Object.fromEntries(
              Object.entries((result as ReplayResult).headers).map(([key, value]) => [cleanText(key, 120), cleanText(value, 4000)])
            )
          : {},
      body: String((result as ReplayResult).body || "").slice(0, 500_000),
      bytes: Number((result as ReplayResult).bytes) || 0
    }
  };
}

export function normalizeReplayTab(input: Partial<ReplayTab>, fallbackId: string, now: string): ReplayTab | null {
  const name = cleanText(input.name, MAX_TAB_NAME);
  if (!name) {
    return null;
  }
  const history = Array.isArray(input.history)
    ? input.history
        .slice(0, MAX_HISTORY_PER_TAB)
        .map((entry, index) =>
          entry && typeof entry === "object" && !Array.isArray(entry)
            ? normalizeHistoryEntry(entry as Partial<ReplayHistoryEntry>, `${fallbackId}-history-${index + 1}`, now)
            : null
        )
        .filter((entry): entry is ReplayHistoryEntry => Boolean(entry))
    : [];

  return {
    id: cleanText(input.id, 80) || fallbackId,
    name,
    pinned: Boolean(input.pinned),
    draft: normalizeDraft(input.draft || {}),
    history,
    environmentId: cleanText(input.environmentId, 80),
    createdAt: cleanText(input.createdAt, 80) || now,
    updatedAt: now
  };
}

export function createReplayTab(name: string, draft: ReplayDraft = emptyDraft(), now = new Date().toISOString()): ReplayTab {
  const id = `tab-${now.replace(/[:.]/g, "")}`;
  return {
    id,
    name: cleanText(name, MAX_TAB_NAME) || "Request",
    pinned: false,
    draft: normalizeDraft(draft),
    history: [],
    environmentId: "",
    createdAt: now,
    updatedAt: now
  };
}

export function defaultReplayTabState(now = new Date().toISOString()): ReplayTabState {
  const tab = createReplayTab("Request 1", emptyDraft(), now);
  return { tabs: [tab], activeTabId: tab.id };
}

export function normalizeReplayTabState(input: unknown, now = new Date().toISOString()): ReplayTabState {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return defaultReplayTabState(now);
  }
  const record = input as Partial<ReplayTabState>;
  const tabs = Array.isArray(record.tabs)
    ? record.tabs
        .slice(0, MAX_REPLAY_TABS)
        .map((tab, index) =>
          tab && typeof tab === "object" && !Array.isArray(tab)
            ? normalizeReplayTab(tab as Partial<ReplayTab>, `tab-${index + 1}`, now)
            : null
        )
        .filter((tab): tab is ReplayTab => Boolean(tab))
    : [];

  if (tabs.length === 0) {
    return defaultReplayTabState(now);
  }

  const sorted = [...tabs].sort((left, right) => {
    if (left.pinned !== right.pinned) {
      return left.pinned ? -1 : 1;
    }
    return left.updatedAt < right.updatedAt ? 1 : -1;
  });

  const activeTabId = sorted.some((tab) => tab.id === record.activeTabId) ? String(record.activeTabId) : sorted[0].id;
  return { tabs: sorted, activeTabId };
}

export function appendReplayHistory(tab: ReplayTab, draft: ReplayDraft, result: ReplayResult, now = new Date().toISOString()): ReplayTab {
  const entry = normalizeHistoryEntry(
    {
      id: `history-${now.replace(/[:.]/g, "")}`,
      sentAt: now,
      draft,
      result
    },
    `history-${tab.history.length + 1}`,
    now
  );
  if (!entry) {
    return tab;
  }
  const history = [entry, ...tab.history].slice(0, MAX_HISTORY_PER_TAB);
  return { ...tab, history, updatedAt: now };
}

export function updateActiveTabDraft(state: ReplayTabState, draft: ReplayDraft, now = new Date().toISOString()): ReplayTabState {
  return {
    ...state,
    tabs: state.tabs.map((tab) => (tab.id === state.activeTabId ? { ...tab, draft: normalizeDraft(draft), updatedAt: now } : tab))
  };
}
