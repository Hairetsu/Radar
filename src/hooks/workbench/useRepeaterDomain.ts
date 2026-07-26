import { useCallback, useMemo, useState } from "react";
import { DEFAULT_URL as defaultUrl, formatHeaders, parseHeaders } from "../../lib";
import {
  appendReplayHistory,
  createReplayTab,
  defaultReplayTabState,
  normalizeReplayTabState
} from "../../../shared/replayTabs.js";
import { createCollectionItem } from "../../../shared/replayCollections.js";
import { createReplayEnvironment } from "../../../shared/replayVariables.js";
import { diffReplayHistory, type ReplayDiffSummary } from "../../../shared/replayDiff.js";
import { normalizeBurstLimits } from "../../../shared/burst.js";
import { useAsyncAction } from "../useAsyncAction";
import type {
  ReplayCollection,
  ReplayDraft,
  ReplayEnvironment,
  ReplayHistoryEntry,
  ReplayResult,
  ReplayTabState,
  BurstResult
} from "../../types";
import type { NavigationPort, NoticePort } from "./ports";

const emptyDraft: ReplayDraft = {
  method: "GET",
  url: defaultUrl,
  headers: {
    Accept: "application/json, text/plain, */*"
  },
  body: ""
};

export type RepeaterPort = NavigationPort & NoticePort;
export type RepeaterDomain = ReturnType<typeof useRepeaterDomain>;

export function useRepeaterDomain(ports: RepeaterPort) {
  const [replayTabState, setReplayTabState] = useState<ReplayTabState>(() => defaultReplayTabState());
  const [replayEnvironments, setReplayEnvironments] = useState<ReplayEnvironment[]>([]);
  const [replayCollections, setReplayCollections] = useState<ReplayCollection[]>([]);
  const [diffLeftHistoryId, setDiffLeftHistoryId] = useState("");
  const [diffRightHistoryId, setDiffRightHistoryId] = useState("");
  const [headersText, setHeadersText] = useState(formatHeaders(emptyDraft.headers));
  const [lastResponse, setLastResponse] = useState<ReplayResult | null>(null);
  const [lastBurst, setLastBurst] = useState<BurstResult | null>(null);
  const [count, setCount] = useState(5);
  const [concurrency, setConcurrency] = useState(1);
  const [delayMs, setDelayMs] = useState(250);

  const activeReplayTab = useMemo(
    () => replayTabState.tabs.find((tab) => tab.id === replayTabState.activeTabId) || replayTabState.tabs[0],
    [replayTabState]
  );
  const draft = activeReplayTab?.draft ?? emptyDraft;

  const persistReplayTabState = useCallback(async (next: ReplayTabState) => {
    const normalized = normalizeReplayTabState(next);
    setReplayTabState(normalized);
    await window.radar?.setReplayTabState(normalized);
    return normalized;
  }, []);

  const setDraft = useCallback(
    (nextDraft: ReplayDraft) => {
      void persistReplayTabState({
        ...replayTabState,
        tabs: replayTabState.tabs.map((tab) =>
          tab.id === replayTabState.activeTabId
            ? { ...tab, draft: nextDraft, updatedAt: new Date().toISOString() }
            : tab
        )
      });
    },
    [persistReplayTabState, replayTabState]
  );

  const sendReplayAction = useCallback(async () => {
    if (!window.radar) {
      ports.setNotice("Run in Electron to replay.");
      return;
    }
    try {
      ports.setNotice("");
      const request = { ...draft, headers: parseHeaders(headersText) };
      const response = await window.radar.sendReplay({
        draft: request,
        environmentId: activeReplayTab?.environmentId || ""
      });
      setLastResponse(response);
      setLastBurst(null);
      if (activeReplayTab) {
        const nextTab = appendReplayHistory(activeReplayTab, request, response);
        await persistReplayTabState({
          ...replayTabState,
          tabs: replayTabState.tabs.map((tab) => (tab.id === nextTab.id ? nextTab : tab))
        });
      }
    } catch (error) {
      ports.setNotice(error instanceof Error ? error.message : "Replay failed");
    }
  }, [activeReplayTab, draft, headersText, persistReplayTabState, ports, replayTabState]);

  const runBurstAction = useCallback(async () => {
    if (!window.radar) {
      ports.setNotice("Run in Electron to replay.");
      return;
    }
    try {
      ports.setNotice("");
      const request = { ...draft, headers: parseHeaders(headersText) };
      const limits = normalizeBurstLimits({ count, concurrency, delayMs });
      setCount(limits.count);
      setConcurrency(limits.concurrency);
      setDelayMs(limits.delayMs);
      const response = await window.radar.runBurst({
        request,
        ...limits,
        environmentId: activeReplayTab?.environmentId || ""
      });
      setLastBurst(response);
      setLastResponse(response.results[response.results.length - 1] || null);
    } catch (error) {
      ports.setNotice(error instanceof Error ? error.message : "Burst failed");
    }
  }, [concurrency, count, delayMs, draft, headersText, activeReplayTab?.environmentId, ports]);

  const sendReplayMutation = useAsyncAction(sendReplayAction);
  const runBurstMutation = useAsyncAction(runBurstAction);

  const selectReplayTab = useCallback(
    async (tabId: string) => {
      const next = normalizeReplayTabState({ ...replayTabState, activeTabId: tabId });
      const tab = next.tabs.find((item) => item.id === tabId);
      setHeadersText(formatHeaders(tab?.draft.headers || emptyDraft.headers));
      setLastResponse(tab?.history[0]?.result || null);
      setLastBurst(null);
      setDiffLeftHistoryId("");
      setDiffRightHistoryId("");
      await persistReplayTabState(next);
    },
    [persistReplayTabState, replayTabState]
  );

  const createReplayTabAction = useCallback(
    async (name?: string) => {
      const tab = createReplayTab(name || `Request ${replayTabState.tabs.length + 1}`);
      const next = normalizeReplayTabState({
        tabs: [...replayTabState.tabs, tab],
        activeTabId: tab.id
      });
      setHeadersText(formatHeaders(tab.draft.headers));
      setLastResponse(null);
      setLastBurst(null);
      await persistReplayTabState(next);
    },
    [persistReplayTabState, replayTabState.tabs]
  );

  const renameReplayTab = useCallback(
    async (tabId: string, name: string) => {
      await persistReplayTabState({
        ...replayTabState,
        tabs: replayTabState.tabs.map((tab) =>
          tab.id === tabId ? { ...tab, name: name.trim() || tab.name, updatedAt: new Date().toISOString() } : tab
        )
      });
    },
    [persistReplayTabState, replayTabState]
  );

  const closeReplayTab = useCallback(
    async (tabId: string) => {
      if (replayTabState.tabs.length <= 1) {
        return;
      }
      const tabs = replayTabState.tabs.filter((tab) => tab.id !== tabId);
      const activeTabId = replayTabState.activeTabId === tabId ? tabs[0].id : replayTabState.activeTabId;
      const next = normalizeReplayTabState({ tabs, activeTabId });
      const tab = next.tabs.find((item) => item.id === activeTabId);
      setHeadersText(formatHeaders(tab?.draft.headers || emptyDraft.headers));
      setLastResponse(tab?.history[0]?.result || null);
      await persistReplayTabState(next);
    },
    [persistReplayTabState, replayTabState]
  );

  const toggleReplayTabPin = useCallback(
    async (tabId: string) => {
      await persistReplayTabState({
        ...replayTabState,
        tabs: replayTabState.tabs.map((tab) =>
          tab.id === tabId ? { ...tab, pinned: !tab.pinned, updatedAt: new Date().toISOString() } : tab
        )
      });
    },
    [persistReplayTabState, replayTabState]
  );

  const setReplayTabEnvironment = useCallback(
    async (environmentId: string) => {
      await persistReplayTabState({
        ...replayTabState,
        tabs: replayTabState.tabs.map((tab) =>
          tab.id === replayTabState.activeTabId ? { ...tab, environmentId, updatedAt: new Date().toISOString() } : tab
        )
      });
    },
    [persistReplayTabState, replayTabState]
  );

  const loadReplayHistoryEntry = useCallback(
    (entry: ReplayHistoryEntry) => {
      setDraft(entry.draft);
      setHeadersText(formatHeaders(entry.draft.headers));
      setLastResponse(entry.result);
      setLastBurst(null);
      ports.setNotice("Loaded replay history entry");
    },
    [ports, setDraft]
  );

  const replayDiff = useMemo<ReplayDiffSummary | null>(() => {
    if (!activeReplayTab || !diffLeftHistoryId || !diffRightHistoryId) {
      return null;
    }
    const left = activeReplayTab.history.find((entry) => entry.id === diffLeftHistoryId);
    const right = activeReplayTab.history.find((entry) => entry.id === diffRightHistoryId);
    if (!left || !right) {
      return null;
    }
    return diffReplayHistory(left, right);
  }, [activeReplayTab, diffLeftHistoryId, diffRightHistoryId]);

  const saveReplayEnvironments = useCallback(
    async (next: ReplayEnvironment[]) => {
      const saved = (await window.radar?.setReplayEnvironments(next)) || next;
      setReplayEnvironments(saved);
      ports.setNotice("Environments saved");
    },
    [ports]
  );

  const saveReplayCollectionsState = useCallback(
    async (next: ReplayCollection[]) => {
      const saved = (await window.radar?.setReplayCollections(next)) || next;
      setReplayCollections(saved);
      ports.setNotice("Collections saved");
    },
    [ports]
  );

  const saveDraftToCollection = useCallback(
    async (collectionId: string, itemName: string) => {
      const item = createCollectionItem(itemName, { ...draft, headers: parseHeaders(headersText) });
      const next = replayCollections.map((collection) =>
        collection.id === collectionId
          ? { ...collection, items: [item, ...collection.items], updatedAt: new Date().toISOString() }
          : collection
      );
      await saveReplayCollectionsState(next);
    },
    [draft, headersText, replayCollections, saveReplayCollectionsState]
  );

  const loadCollectionItem = useCallback(
    (itemDraft: ReplayDraft) => {
      setDraft(itemDraft);
      setHeadersText(formatHeaders(itemDraft.headers));
      setLastResponse(null);
      setLastBurst(null);
      ports.setActiveView("repeater");
      ports.setNotice("Loaded collection item");
    },
    [ports, setDraft]
  );

  const createReplayEnvironmentAction = useCallback(
    async (name: string) => {
      const environment = createReplayEnvironment(name);
      await saveReplayEnvironments([environment, ...replayEnvironments]);
      return environment;
    },
    [replayEnvironments, saveReplayEnvironments]
  );

  const replayPending = sendReplayMutation.isPending || runBurstMutation.isPending;

  return {
    draft,
    setDraft,
    replayTabState,
    setReplayTabState,
    activeReplayTab,
    selectReplayTab,
    createReplayTab: createReplayTabAction,
    renameReplayTab,
    closeReplayTab,
    toggleReplayTabPin,
    setReplayTabEnvironment,
    loadReplayHistoryEntry,
    diffLeftHistoryId,
    setDiffLeftHistoryId,
    diffRightHistoryId,
    setDiffRightHistoryId,
    replayDiff,
    replayEnvironments,
    setReplayEnvironments,
    saveReplayEnvironments,
    createReplayEnvironment: createReplayEnvironmentAction,
    replayCollections,
    setReplayCollections,
    saveReplayCollections: saveReplayCollectionsState,
    saveDraftToCollection,
    loadCollectionItem,
    headersText,
    setHeadersText,
    lastResponse,
    setLastResponse,
    lastBurst,
    setLastBurst,
    count,
    setCount,
    concurrency,
    setConcurrency,
    delayMs,
    setDelayMs,
    sendReplay: sendReplayMutation.run,
    runBurst: runBurstMutation.run,
    sendReplayPending: sendReplayMutation.isPending,
    runBurstPending: runBurstMutation.isPending,
    replayPending
  };
}
