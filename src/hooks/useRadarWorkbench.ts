import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_URL as defaultUrl,
  firstUrlFromText,
  formatCapturedRequest,
  formatHeaders,
  isAllowedTarget,
  normalizeUrl,
  originFromUrl,
  parseHeaders,
  type RequestExportFormat
} from "../lib";
import { buildSitemap, sitemapQueryForNode, type SitemapNode } from "../../shared/sitemap.js";
import { endpointInventoryForNode } from "../../shared/endpointInventory.js";
import { diffSessionCaptures, type SessionDiffResult } from "../../shared/sessionDiff.js";
import { annotationContext } from "../../shared/evidenceTags.js";
import { diffReplayHistory, type ReplayDiffSummary } from "../../shared/replayDiff.js";
import {
  appendReplayHistory,
  createReplayTab,
  defaultReplayTabState,
  normalizeReplayTabState
} from "../../shared/replayTabs.js";
import { createCollectionItem } from "../../shared/replayCollections.js";
import { createReplayEnvironment } from "../../shared/replayVariables.js";
import { webSocketFrameToDraft } from "../../shared/websocketReplay.js";
import {
  assignmentsForPayload,
  createAutomatePayloadSet,
  createAutomatePayloadMarker,
  findAutomatePayloadPositions,
  insertAutomatePayloadMarker,
  materializeAutomateDraft,
  normalizeAutomateLimits,
  normalizeAutomatePayloads,
  normalizeAutomatePayloadSets,
  normalizeAutomateRules,
  type AutomatePayloadLocation
} from "../../shared/automate.js";
import {
  filterCapturesByQuery,
  filterWebSocketEventsByQuery,
  TRAFFIC_QUERY_EXAMPLES
} from "../../shared/trafficQuery.js";
import type {
  BrowserState,
  BurstResult,
  CapturedRequest,
  EvidenceAnnotation,
  InterceptQueueItem,
  InterceptResponseDraft,
  InterceptRule,
  InterceptState,
  AgentRun,
  AppMode,
  LocalContext,
  LocalProfile,
  LocalSessionSummary,
  MatchReplaceRule,
  ProxyProfile,
  ProxyProfileId,
  ProxyState,
  ReplayCollection,
  ReplayDraft,
  ReplayEnvironment,
  ReplayHistoryEntry,
  ReplayResult,
  ReplayTabState,
  SavedFilter,
  SslEvent,
  WebSocketEvent,
  WebSocketReplayDraft,
  WebSocketReplayResult,
  AutomateLimits,
  AutomatePayloadSet,
  AutomateResult,
  AutomateSession
} from "../types";
import { useAsyncAction } from "./useAsyncAction";
import { useAiConnection } from "./useAiConnection";
import { useTheme } from "./useTheme";

export type WorkView = "traffic" | "websocket" | "intercept" | "repeater" | "automate" | "scope" | "ssl" | "sitemap";

export const WORK_VIEWS: WorkView[] = [
  "traffic",
  "websocket",
  "intercept",
  "repeater",
  "automate",
  "sitemap",
  "scope",
  "ssl"
];

export type TrafficSortField = "time" | "method" | "status" | "host" | "path" | "type" | "duration";

export type TrafficSortDirection = "asc" | "desc";

export const TRAFFIC_SORT_FIELDS: { value: TrafficSortField; label: string }[] = [
  { value: "time", label: "Time" },
  { value: "method", label: "Method" },
  { value: "status", label: "Status" },
  { value: "host", label: "Host" },
  { value: "path", label: "Path" },
  { value: "type", label: "Type" },
  { value: "duration", label: "Duration" }
];

const emptyDraft: ReplayDraft = {
  method: "GET",
  url: defaultUrl,
  headers: {
    Accept: "application/json, text/plain, */*"
  },
  body: ""
};

const defaultBrowserState: BrowserState = {
  open: false,
  url: "",
  title: "",
  loading: false,
  engine: "none"
};

const defaultProxyState: ProxyState = {
  running: false,
  port: 8088,
  proxyUrl: "http://127.0.0.1:8088",
  caCertPath: "",
  caKeyPath: "",
  caFingerprint: ""
};

const defaultAutomateRulesText = JSON.stringify(
  [
    { id: "rule-status-500", name: "Server errors", enabled: true, kind: "match", target: "status", status: 500 },
    { id: "rule-error-copy", name: "Error copy", enabled: true, kind: "match", target: "body", pattern: "error" }
  ],
  null,
  2
);

const defaultAutomateLimits: AutomateLimits = {
  count: 10,
  concurrency: 1,
  delayMs: 100,
  timeoutMs: 10000
};

function parseAutomateRulesText(text: string) {
  try {
    const parsed: unknown = JSON.parse(text || "[]");
    return normalizeAutomateRules(parsed);
  } catch {
    return [];
  }
}

function automatePayloadSetText(payloadSet: AutomatePayloadSet | null) {
  return payloadSet ? payloadSet.payloads.join("\n") : "";
}

function sortAutomateResults(results: AutomateResult[], sort: string) {
  const sorted = [...results];
  if (sort === "status") {
    return sorted.sort((left, right) => right.status - left.status || left.index - right.index);
  }
  if (sort === "length") {
    return sorted.sort((left, right) => right.length - left.length || left.index - right.index);
  }
  if (sort === "latency") {
    return sorted.sort((left, right) => right.latencyMs - left.latencyMs || left.index - right.index);
  }
  if (sort === "matches") {
    return sorted.sort(
      (left, right) =>
        right.matchedRules.length + right.extracts.length - (left.matchedRules.length + left.extracts.length) ||
        left.index - right.index
    );
  }
  return sorted.sort((left, right) => left.index - right.index);
}

const defaultInterceptState: InterceptState = {
  config: {
    requestEnabled: false,
    responseEnabled: false
  },
  queue: []
};

function storedAppMode(): AppMode {
  if (typeof window === "undefined") {
    return "manual-first";
  }
  return window.localStorage.getItem("radar.appMode") === "ai-first" ? "ai-first" : "manual-first";
}

function isActiveAgentRun(run: AgentRun | null | undefined) {
  return run?.status === "queued" || run?.status === "running";
}

export const viewMeta: Record<WorkView, { num: string; label: string; eyebrow: string; title: string }> = {
  traffic: { num: "01", label: "HTTP(S)", eyebrow: "HTTP / HTTPS // Request capture", title: "HTTP / HTTPS Traffic" },
  websocket: { num: "02", label: "WebSocket", eyebrow: "Streams // Frame analysis", title: "WebSocket" },
  intercept: { num: "03", label: "Intercept", eyebrow: "Proxy // Pause and mutate", title: "Intercept" },
  repeater: { num: "04", label: "Repeater", eyebrow: "Replay // Surface probe", title: "Repeater" },
  automate: { num: "05", label: "Automate", eyebrow: "Payloads // Bounded runs", title: "Automate" },
  sitemap: { num: "06", label: "Sitemap", eyebrow: "Map // Endpoint inventory", title: "Sitemap" },
  scope: { num: "07", label: "Scope", eyebrow: "Targets // Engagement boundary", title: "Scope" },
  ssl: { num: "08", label: "SSL", eyebrow: "Crypto // Proxy interception", title: "Proxy" }
};

const methodSortOrder = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];

function defaultSessionName(createdAt = new Date()) {
  return `Session ${createdAt.toISOString().slice(0, 16).replace("T", " ")}`;
}

function compareMethods(left: string, right: string) {
  const leftIndex = methodSortOrder.indexOf(left);
  const rightIndex = methodSortOrder.indexOf(right);
  const normalizedLeft = leftIndex === -1 ? methodSortOrder.length : leftIndex;
  const normalizedRight = rightIndex === -1 ? methodSortOrder.length : rightIndex;
  return normalizedLeft - normalizedRight || left.localeCompare(right);
}

function sortedMethods(methods: string[]) {
  return [...methods].sort(compareMethods);
}

function compareNullableNumber(left: number | null, right: number | null) {
  if (left === null && right === null) {
    return 0;
  }
  if (left === null) {
    return 1;
  }
  if (right === null) {
    return -1;
  }
  return left - right;
}

function compareTrafficCaptures(
  left: CapturedRequest,
  right: CapturedRequest,
  field: TrafficSortField,
  direction: TrafficSortDirection
) {
  let result = 0;
  switch (field) {
    case "time":
      result = left.startedAt.localeCompare(right.startedAt);
      break;
    case "method":
      result = compareMethods(left.method, right.method);
      break;
    case "status":
      result = compareNullableNumber(left.status, right.status);
      break;
    case "host":
      result = left.host.localeCompare(right.host);
      break;
    case "path":
      result = left.path.localeCompare(right.path);
      break;
    case "type":
      result = (left.type || left.source).localeCompare(right.type || right.source);
      break;
    case "duration":
      result = compareNullableNumber(left.durationMs, right.durationMs);
      break;
  }
  if (result === 0) {
    result = left.id.localeCompare(right.id);
  }
  return direction === "asc" ? result : -result;
}

async function loadWebSocketEvents() {
  if (!window.radar?.getWebSocketEvents) {
    return [];
  }
  try {
    return await window.radar.getWebSocketEvents();
  } catch {
    return [];
  }
}

async function loadInterceptState() {
  if (!window.radar?.getInterceptState) {
    return defaultInterceptState;
  }
  try {
    return await window.radar.getInterceptState();
  } catch {
    return defaultInterceptState;
  }
}

function interceptDraftFromItem(item: InterceptQueueItem): ReplayDraft {
  return {
    method: item.method,
    url: item.url,
    headers: item.headers,
    body: item.body
  };
}

function interceptResponseFromItem(item: InterceptQueueItem): InterceptResponseDraft {
  return {
    status: item.status || 200,
    statusText: item.statusText || "",
    headers: item.headers,
    body: item.body
  };
}

async function loadInterceptRules() {
  if (!window.radar?.getInterceptRules) {
    return [];
  }
  try {
    return await window.radar.getInterceptRules();
  } catch {
    return [];
  }
}

async function loadMatchReplaceRules() {
  if (!window.radar?.getMatchReplaceRules) {
    return [];
  }
  try {
    return await window.radar.getMatchReplaceRules();
  } catch {
    return [];
  }
}

async function loadProxyProfiles() {
  if (!window.radar?.getProxyProfiles) {
    return [];
  }
  try {
    return await window.radar.getProxyProfiles();
  } catch {
    return [];
  }
}

export function useRadarWorkbench() {
  const [address, setAddress] = useState(defaultUrl);
  const [captures, setCaptures] = useState<CapturedRequest[]>([]);
  const [sslEvents, setSslEvents] = useState<SslEvent[]>([]);
  const [webSocketEvents, setWebSocketEvents] = useState<WebSocketEvent[]>([]);
  const [localContext, setLocalContext] = useState<LocalContext | null>(null);
  const [profiles, setProfiles] = useState<LocalProfile[]>([]);
  const [sessions, setSessions] = useState<LocalSessionSummary[]>([]);
  const [profileName, setProfileName] = useState("");
  const [sessionName, setSessionName] = useState("");
  const [profileSessionOpen, setProfileSessionOpen] = useState(false);
  const [newSessionOpen, setNewSessionOpen] = useState(false);
  const [newSessionName, setNewSessionName] = useState("");
  const [browserState, setBrowserState] = useState<BrowserState>(defaultBrowserState);
  const [proxyState, setProxyState] = useState<ProxyState>(defaultProxyState);
  const [proxyProfiles, setProxyProfiles] = useState<ProxyProfile[]>([]);
  const [selectedProxyProfileId, setSelectedProxyProfileId] = useState<ProxyProfileId>("radar-browser");
  const [proxyProfileNotes, setProxyProfileNotes] = useState("");
  const [interceptState, setInterceptState] = useState<InterceptState>(defaultInterceptState);
  const [interceptSelectedId, setInterceptSelectedId] = useState("");
  const [interceptDraft, setInterceptDraft] = useState<ReplayDraft>(emptyDraft);
  const [interceptHeadersText, setInterceptHeadersText] = useState(formatHeaders(emptyDraft.headers));
  const [interceptResponseStatus, setInterceptResponseStatus] = useState(200);
  const [interceptResponseStatusText, setInterceptResponseStatusText] = useState("");
  const [interceptRules, setInterceptRules] = useState<InterceptRule[]>([]);
  const [interceptRulesText, setInterceptRulesText] = useState("[]");
  const [matchReplaceRules, setMatchReplaceRules] = useState<MatchReplaceRule[]>([]);
  const [matchReplaceRulesText, setMatchReplaceRulesText] = useState("[]");
  const interceptDraftItemRef = useRef("");
  const [selectedId, setSelectedId] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const selectionAnchorRef = useRef("");
  const [targets, setTargets] = useState<string[]>([]);
  const [targetText, setTargetText] = useState("");
  const [trafficMethodFilter, setTrafficMethodFilter] = useState("all");
  const [trafficTypeFilter, setTrafficTypeFilter] = useState("all");
  const [trafficSearch, setTrafficSearch] = useState("");
  const [trafficQueryError, setTrafficQueryError] = useState("");
  const [webSocketSearch, setWebSocketSearch] = useState("");
  const [webSocketQueryError, setWebSocketQueryError] = useState("");
  const [savedFilters, setSavedFilters] = useState<SavedFilter[]>([]);
  const [evidenceAnnotations, setEvidenceAnnotations] = useState<EvidenceAnnotation[]>([]);
  const [selectedSitemapNodeId, setSelectedSitemapNodeId] = useState("");
  const [diffBaselineSessionId, setDiffBaselineSessionId] = useState("");
  const [sessionDiff, setSessionDiff] = useState<SessionDiffResult | null>(null);
  const [sessionDiffPending, setSessionDiffPending] = useState(false);
  const trafficSearchRef = useRef<HTMLInputElement | null>(null);
  const [trafficSortField, setTrafficSortField] = useState<TrafficSortField>("time");
  const [trafficSortDirection, setTrafficSortDirection] = useState<TrafficSortDirection>("desc");
  const [replayTabState, setReplayTabState] = useState<ReplayTabState>(() => defaultReplayTabState());
  const [replayEnvironments, setReplayEnvironments] = useState<ReplayEnvironment[]>([]);
  const [replayCollections, setReplayCollections] = useState<ReplayCollection[]>([]);
  const [diffLeftHistoryId, setDiffLeftHistoryId] = useState("");
  const [diffRightHistoryId, setDiffRightHistoryId] = useState("");
  const [webSocketReplayDraft, setWebSocketReplayDraft] = useState<WebSocketReplayDraft | null>(null);
  const [webSocketReplayResult, setWebSocketReplayResult] = useState<WebSocketReplayResult | null>(null);
  const [headersText, setHeadersText] = useState(formatHeaders(emptyDraft.headers));
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
  const [activeView, setActiveView] = useState<WorkView>("traffic");
  const [automateMarkerName, setAutomateMarkerName] = useState("probe");
  const [automateHeaderName, setAutomateHeaderName] = useState("X-Radar-Payload");
  const [automatePayloadText, setAutomatePayloadText] = useState("test\nadmin\ntrue");
  const [automatePayloadSets, setAutomatePayloadSets] = useState<AutomatePayloadSet[]>([]);
  const [selectedAutomatePayloadSetId, setSelectedAutomatePayloadSetId] = useState("");
  const [automatePayloadSetName, setAutomatePayloadSetName] = useState("Probe deck");
  const [automateWordlistPath, setAutomateWordlistPath] = useState("");
  const [automateSessionName, setAutomateSessionName] = useState("Payload run");
  const [automateLimits, setAutomateLimits] = useState<AutomateLimits>(defaultAutomateLimits);
  const [automateRulesText, setAutomateRulesText] = useState(defaultAutomateRulesText);
  const [automateSessions, setAutomateSessions] = useState<AutomateSession[]>([]);
  const [activeAutomateSessionId, setActiveAutomateSessionId] = useState("");
  const [selectedAutomateResultId, setSelectedAutomateResultId] = useState("");
  const [automateResultFilter, setAutomateResultFilter] = useState("all");
  const [automateResultSort, setAutomateResultSort] = useState("index");
  const [activeDetail, setActiveDetail] = useState<"request" | "response">("request");
  const [lastResponse, setLastResponse] = useState<ReplayResult | null>(null);
  const [lastBurst, setLastBurst] = useState<BurstResult | null>(null);
  const [count, setCount] = useState(5);
  const [concurrency, setConcurrency] = useState(1);
  const [delayMs, setDelayMs] = useState(250);
  const [notice, setNotice] = useState("");
  const [clock, setClock] = useState(() => new Date());
  const [aiPaletteOpen, setAiPaletteOpen] = useState(false);
  const [appMode, setAppModeState] = useState<AppMode>(storedAppMode);
  const [agentGoal, setAgentGoal] = useState("");
  const [agentRuns, setAgentRuns] = useState<AgentRun[]>([]);
  const agentUiCursorRef = useRef<{ runId: string; entryId: string } | null>(null);
  const ai = useAiConnection();
  const appearance = useTheme();

  const automateBaseDraft = useMemo(() => {
    try {
      return { ...draft, headers: parseHeaders(headersText) };
    } catch {
      return draft;
    }
  }, [draft, headersText]);

  const automateMarkerPreview = useMemo(
    () => createAutomatePayloadMarker(automateMarkerName),
    [automateMarkerName]
  );

  const automatePositions = useMemo(() => findAutomatePayloadPositions(automateBaseDraft), [automateBaseDraft]);

  const automatePayloads = useMemo(() => normalizeAutomatePayloads(automatePayloadText), [automatePayloadText]);

  const automatePreviewDraft = useMemo(() => {
    if (automatePositions.length === 0 || automatePayloads.length === 0) {
      return automateBaseDraft;
    }
    return materializeAutomateDraft(
      automateBaseDraft,
      assignmentsForPayload(automatePositions, automatePayloads[0])
    );
  }, [automateBaseDraft, automatePayloads, automatePositions]);

  const selectedAutomatePayloadSet = useMemo(
    () => automatePayloadSets.find((payloadSet) => payloadSet.id === selectedAutomatePayloadSetId) || null,
    [automatePayloadSets, selectedAutomatePayloadSetId]
  );

  const automateRules = useMemo(() => parseAutomateRulesText(automateRulesText), [automateRulesText]);

  const activeAutomateSession = useMemo(
    () =>
      automateSessions.find((session) => session.id === activeAutomateSessionId) ||
      automateSessions[0] ||
      null,
    [activeAutomateSessionId, automateSessions]
  );

  const filteredAutomateResults = useMemo(() => {
    const results = activeAutomateSession?.results || [];
    const filtered = results.filter((result) => {
      if (automateResultFilter === "failures") {
        return !result.ok || result.status >= 400 || Boolean(result.error);
      }
      if (automateResultFilter === "matches") {
        return result.matchedRules.length > 0 || result.extracts.length > 0;
      }
      if (automateResultFilter === "outliers") {
        const cluster = activeAutomateSession?.clusters.find((item) => item.id === result.clusterId);
        return cluster?.count === 1;
      }
      return true;
    });
    return sortAutomateResults(filtered, automateResultSort);
  }, [activeAutomateSession, automateResultFilter, automateResultSort]);

  const selectedAutomateResult = useMemo(
    () =>
      activeAutomateSession?.results.find((result) => result.id === selectedAutomateResultId) ||
      filteredAutomateResults[0] ||
      null,
    [activeAutomateSession, filteredAutomateResults, selectedAutomateResultId]
  );

  const insertAutomateMarker = useCallback(
    (location: AutomatePayloadLocation) => {
      const next = insertAutomatePayloadMarker(automateBaseDraft, location, automateMarkerName, automateHeaderName);
      setDraft(next);
      setHeadersText(formatHeaders(next.headers));
      setActiveView("automate");
      setNotice(`Marked ${location} payload position`);
    },
    [automateBaseDraft, automateHeaderName, automateMarkerName, setDraft]
  );

  const loadAutomatePreviewIntoRepeater = useCallback(() => {
    if (automatePositions.length === 0 || automatePayloads.length === 0) {
      setNotice("Add a payload marker and payload first.");
      return;
    }
    setDraft(automatePreviewDraft);
    setHeadersText(formatHeaders(automatePreviewDraft.headers));
    setLastResponse(null);
    setLastBurst(null);
    setActiveView("repeater");
    setNotice("Loaded Automate preview in Repeater");
  }, [automatePayloads.length, automatePositions.length, automatePreviewDraft, setDraft]);

  const selectAutomatePayloadSet = useCallback(
    (id: string) => {
      setSelectedAutomatePayloadSetId(id);
      const payloadSet = automatePayloadSets.find((item) => item.id === id) || null;
      if (payloadSet) {
        setAutomatePayloadText(automatePayloadSetText(payloadSet));
        setAutomatePayloadSetName(payloadSet.name);
        setAutomateWordlistPath(payloadSet.wordlistPath || "");
        setNotice(`Loaded payload set ${payloadSet.name}`);
      }
    },
    [automatePayloadSets]
  );

  const saveAutomatePayloadSet = useCallback(async () => {
    const payloadSet = createAutomatePayloadSet({
      name: automatePayloadSetName,
      payloads: automatePayloads,
      source: "inline"
    });
    if (!payloadSet) {
      setNotice("Add at least one payload before saving a set.");
      return;
    }
    const next = normalizeAutomatePayloadSets([
      payloadSet,
      ...automatePayloadSets.filter((item) => item.id !== payloadSet.id && item.name !== payloadSet.name)
    ]);
    const saved = (await window.radar?.setAutomatePayloadSets?.(next)) || next;
    setAutomatePayloadSets(saved);
    setSelectedAutomatePayloadSetId(payloadSet.id);
    setNotice(`Saved payload set ${payloadSet.name}`);
  }, [automatePayloadSetName, automatePayloadSets, automatePayloads]);

  const saveAutomateWordlistReference = useCallback(async () => {
    const payloadSet = createAutomatePayloadSet({
      name: automatePayloadSetName || "Wordlist reference",
      payloads: automatePayloads,
      source: "wordlist",
      wordlistPath: automateWordlistPath
    });
    if (!payloadSet) {
      setNotice("Add a wordlist path or sample payloads before saving.");
      return;
    }
    const next = normalizeAutomatePayloadSets([
      payloadSet,
      ...automatePayloadSets.filter((item) => item.id !== payloadSet.id && item.name !== payloadSet.name)
    ]);
    const saved = (await window.radar?.setAutomatePayloadSets?.(next)) || next;
    setAutomatePayloadSets(saved);
    setSelectedAutomatePayloadSetId(payloadSet.id);
    setNotice(`Saved wordlist reference ${payloadSet.name}`);
  }, [automatePayloadSetName, automatePayloadSets, automatePayloads, automateWordlistPath]);

  const updateAutomateLimits = useCallback((patch: Partial<AutomateLimits>) => {
    setAutomateLimits((current) => normalizeAutomateLimits({ ...current, ...patch }));
  }, []);

  const refreshAutomateSessions = useCallback(async () => {
    if (!window.radar?.listAutomateSessions) {
      return [];
    }
    const sessions = await window.radar.listAutomateSessions();
    setAutomateSessions(sessions);
    return sessions;
  }, []);

  const startAutomateSession = useCallback(async () => {
    if (!window.radar?.startAutomateSession) {
      setNotice("Run in Electron to start Automate sessions.");
      return;
    }
    if (automatePositions.length === 0) {
      setNotice("Add at least one payload marker before starting.");
      return;
    }
    if (automatePayloads.length === 0) {
      setNotice("Add at least one payload before starting.");
      return;
    }
    const session = await window.radar.startAutomateSession({
      name: automateSessionName,
      draft: automateBaseDraft,
      environmentId: activeReplayTab?.environmentId || "",
      payloadSetId: selectedAutomatePayloadSetId || undefined,
      payloads: automatePayloads,
      positions: automatePositions,
      limits: automateLimits,
      rules: automateRules
    });
    setAutomateSessions((items) => [session, ...items.filter((item) => item.id !== session.id)]);
    setActiveAutomateSessionId(session.id);
    setSelectedAutomateResultId("");
    setActiveView("automate");
    setNotice(`Automate started with ${session.payloads.length} payloads`);
  }, [
    activeReplayTab?.environmentId,
    automateBaseDraft,
    automateLimits,
    automatePayloads,
    automatePositions,
    automateRules,
    automateSessionName,
    selectedAutomatePayloadSetId
  ]);

  const pauseAutomateSession = useCallback(async () => {
    if (!activeAutomateSession || !window.radar?.pauseAutomateSession) {
      return;
    }
    const session = await window.radar.pauseAutomateSession(activeAutomateSession.id);
    if (session) {
      setAutomateSessions((items) => [session, ...items.filter((item) => item.id !== session.id)]);
      setNotice("Automate paused");
    }
  }, [activeAutomateSession]);

  const resumeAutomateSession = useCallback(async () => {
    if (!activeAutomateSession || !window.radar?.resumeAutomateSession) {
      return;
    }
    const session = await window.radar.resumeAutomateSession(activeAutomateSession.id);
    if (session) {
      setAutomateSessions((items) => [session, ...items.filter((item) => item.id !== session.id)]);
      setNotice("Automate resumed");
    }
  }, [activeAutomateSession]);

  const stopAutomateSession = useCallback(async () => {
    if (!activeAutomateSession || !window.radar?.stopAutomateSession) {
      return;
    }
    const session = await window.radar.stopAutomateSession(activeAutomateSession.id);
    if (session) {
      setAutomateSessions((items) => [session, ...items.filter((item) => item.id !== session.id)]);
      setNotice("Automate stopped");
    }
  }, [activeAutomateSession]);

  const retryAutomateSession = useCallback(async () => {
    if (!activeAutomateSession || !window.radar?.retryAutomateSession) {
      return;
    }
    const session = await window.radar.retryAutomateSession(activeAutomateSession.id);
    if (session) {
      setAutomateSessions((items) => [session, ...items.filter((item) => item.id !== session.id)]);
      setNotice("Automate retry queued");
    }
  }, [activeAutomateSession]);

  const promoteAutomateResultToRepeater = useCallback(
    async (resultId = selectedAutomateResult?.id || "") => {
      if (!activeAutomateSession || !resultId || !window.radar?.promoteAutomateResultToRepeater) {
        return;
      }
      const state = await window.radar.promoteAutomateResultToRepeater({
        sessionId: activeAutomateSession.id,
        resultId
      });
      setReplayTabState(state);
      const activeTab = state.tabs.find((tab) => tab.id === state.activeTabId) || state.tabs[0];
      setHeadersText(formatHeaders(activeTab?.draft.headers || emptyDraft.headers));
      setActiveView("repeater");
      setNotice("Promoted Automate result to Repeater");
    },
    [activeAutomateSession, selectedAutomateResult]
  );

  const refreshLocalLists = useCallback(async (context: LocalContext) => {
    if (!window.radar) {
      return;
    }
    const [nextProfiles, nextSessions] = await Promise.all([
      window.radar.listLocalProfiles(),
      window.radar.listLocalSessions(context.profile.id)
    ]);
    setProfiles(nextProfiles);
    setSessions(nextSessions);
  }, []);

  const applyLocalContext = useCallback(
    async (context: LocalContext, noticeText?: string) => {
      setLocalContext(context);
      setProfileName(context.profile.name);
      setSessionName(context.session.name);
      setSelectedId("");
      setSelectedIds([]);
      selectionAnchorRef.current = "";
      setLastResponse(null);
      setLastBurst(null);

      if (window.radar) {
        const [
          nextTargets,
          nextCaptures,
          nextSslEvents,
          nextWebSocketEvents,
          nextBrowserState,
          nextProxyProfiles,
          nextInterceptState,
          nextInterceptRules,
          nextMatchReplaceRules,
          nextAgentRuns,
          nextSavedFilters,
          nextEvidenceAnnotations,
          nextReplayTabState,
          nextReplayEnvironments,
          nextReplayCollections,
          nextAutomatePayloadSets,
          nextAutomateSessions
        ] = await Promise.all([
          window.radar.getTargets(),
          window.radar.getCaptures(),
          window.radar.getSslEvents(),
          loadWebSocketEvents(),
          window.radar.getBrowserState(),
          loadProxyProfiles(),
          loadInterceptState(),
          loadInterceptRules(),
          loadMatchReplaceRules(),
          window.radar.listAgentRuns(),
          window.radar.getSavedFilters?.() ?? [],
          window.radar.getEvidenceAnnotations?.() ?? [],
          window.radar.getReplayTabState?.() ?? defaultReplayTabState(),
          window.radar.getReplayEnvironments?.() ?? [],
          window.radar.getReplayCollections?.() ?? [],
          window.radar.getAutomatePayloadSets?.() ?? [],
          window.radar.listAutomateSessions?.() ?? []
        ]);
        setTargets(nextTargets);
        setTargetText(nextTargets.join("\n"));
        setCaptures(nextCaptures);
        setSslEvents(nextSslEvents);
        setWebSocketEvents(nextWebSocketEvents);
        setBrowserState(nextBrowserState);
        setProxyProfiles(nextProxyProfiles);
        setInterceptState(nextInterceptState);
        setInterceptRules(nextInterceptRules);
        setInterceptRulesText(JSON.stringify(nextInterceptRules, null, 2));
        setMatchReplaceRules(nextMatchReplaceRules);
        setMatchReplaceRulesText(JSON.stringify(nextMatchReplaceRules, null, 2));
        setAgentRuns(nextAgentRuns);
        setSavedFilters(nextSavedFilters);
        setEvidenceAnnotations(nextEvidenceAnnotations);
        const normalizedTabs = normalizeReplayTabState(nextReplayTabState);
        setReplayTabState(normalizedTabs);
        setReplayEnvironments(nextReplayEnvironments);
        setReplayCollections(nextReplayCollections);
        setAutomatePayloadSets(nextAutomatePayloadSets);
        setAutomateSessions(nextAutomateSessions);
        setActiveAutomateSessionId(nextAutomateSessions[0]?.id || "");
        const activeTab = normalizedTabs.tabs.find((tab) => tab.id === normalizedTabs.activeTabId) || normalizedTabs.tabs[0];
        setHeadersText(formatHeaders(activeTab?.draft.headers || emptyDraft.headers));
        setDiffLeftHistoryId("");
        setDiffRightHistoryId("");
        setWebSocketReplayDraft(null);
        setWebSocketReplayResult(null);
        setSessionDiff(null);
        setDiffBaselineSessionId("");
        setSelectedSitemapNodeId("");
        await refreshLocalLists(context);
      }

      if (noticeText) {
        setNotice(noticeText);
      }
    },
    [refreshLocalLists]
  );

  const openBrowser = useCallback(async (event?: FormEvent) => {
    event?.preventDefault();
    const next = normalizeUrl(address);
    setAddress(next);
    if (!window.radar) {
      setNotice("Run in Electron to open Chrome.");
      return;
    }
    try {
      const state = await window.radar.openBrowser(next);
      setBrowserState(state);
      setNotice(`${state.channel} launched through Radar proxy`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Chrome launch failed");
    }
  }, [address]);

  const saveTargets = useCallback(async (nextText = targetText) => {
    const next = nextText
      .split("\n")
      .map((item) => item.trim())
      .filter(Boolean);
    const saved = (await window.radar?.setTargets(next)) || next;
    setTargets(saved);
    setTargetText(saved.join("\n"));
    setNotice("Targets saved");
  }, [targetText]);

  const addTarget = useCallback(
    async (value: string) => {
      const origin = originFromUrl(value);
      if (!origin) {
        return;
      }
      if (targets.includes(origin)) {
        setNotice(`${origin} already in scope`);
        return;
      }
      const next = [...targets, origin];
      const saved = (await window.radar?.setTargets(next)) || next;
      setTargets(saved);
      setTargetText(saved.join("\n"));
      setNotice(`Added ${origin}`);
    },
    [targets]
  );

  const applyAiDraft = useCallback((nextDraft: ReplayDraft) => {
    setDraft(nextDraft);
    setHeadersText(formatHeaders(nextDraft.headers));
    setLastResponse(null);
    setLastBurst(null);
    setActiveView("repeater");
  }, [setDraft]);

  const prepareAiNavigate = useCallback((url: string) => {
    setAddress(normalizeUrl(url));
  }, []);

  const cloneToRepeater = useCallback((capture: CapturedRequest | null) => {
    if (!capture) {
      return;
    }
    setDraft({
      method: capture.method,
      url: capture.url,
      headers: capture.requestHeaders,
      body: capture.requestBody || ""
    });
    setHeadersText(formatHeaders(capture.requestHeaders));
    setLastResponse(null);
    setLastBurst(null);
    setActiveView("repeater");
    setNotice("Loaded in repeater");
  }, [setDraft]);

  const sendReplayAction = useCallback(async () => {
    if (!window.radar) {
      setNotice("Run in Electron to replay.");
      return;
    }
    try {
      setNotice("");
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
      setNotice(error instanceof Error ? error.message : "Replay failed");
    }
  }, [activeReplayTab, draft, headersText, persistReplayTabState, replayTabState]);

  const runBurstAction = useCallback(async () => {
    if (!window.radar) {
      setNotice("Run in Electron to replay.");
      return;
    }
    try {
      setNotice("");
      const request = { ...draft, headers: parseHeaders(headersText) };
      const response = await window.radar.runBurst({
        request,
        count,
        concurrency,
        delayMs,
        environmentId: activeReplayTab?.environmentId || ""
      });
      setLastBurst(response);
      setLastResponse(response.results[response.results.length - 1] || null);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Burst failed");
    }
  }, [concurrency, count, delayMs, draft, headersText, activeReplayTab?.environmentId]);

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

  const loadReplayHistoryEntry = useCallback((entry: ReplayHistoryEntry) => {
    setDraft(entry.draft);
    setHeadersText(formatHeaders(entry.draft.headers));
    setLastResponse(entry.result);
    setLastBurst(null);
    setNotice("Loaded replay history entry");
  }, [setDraft]);

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

  const saveReplayEnvironments = useCallback(async (next: ReplayEnvironment[]) => {
    const saved = (await window.radar?.setReplayEnvironments(next)) || next;
    setReplayEnvironments(saved);
    setNotice("Environments saved");
  }, []);

  const saveReplayCollectionsState = useCallback(async (next: ReplayCollection[]) => {
    const saved = (await window.radar?.setReplayCollections(next)) || next;
    setReplayCollections(saved);
    setNotice("Collections saved");
  }, []);

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
      setActiveView("repeater");
      setNotice("Loaded collection item");
    },
    [setDraft]
  );

  const createReplayEnvironmentAction = useCallback(
    async (name: string) => {
      const environment = createReplayEnvironment(name);
      await saveReplayEnvironments([environment, ...replayEnvironments]);
      return environment;
    },
    [replayEnvironments, saveReplayEnvironments]
  );

  const loadWebSocketFrameToRepeater = useCallback((event: WebSocketEvent) => {
    const nextDraft = webSocketFrameToDraft(event);
    if (!nextDraft) {
      setNotice("This frame cannot be replayed.");
      return;
    }
    setWebSocketReplayDraft(nextDraft);
    setWebSocketReplayResult(null);
    setActiveView("repeater");
    setNotice("Loaded WebSocket frame in repeater");
  }, []);

  const sendWebSocketReplayAction = useCallback(async () => {
    if (!window.radar?.sendWebSocketReplay || !webSocketReplayDraft) {
      setNotice("Run in Electron to replay WebSocket frames.");
      return;
    }
    try {
      const result = await window.radar.sendWebSocketReplay(webSocketReplayDraft);
      setWebSocketReplayResult(result);
      setWebSocketEvents(await loadWebSocketEvents());
      setNotice(result.ok ? "WebSocket replay sent" : result.error || "WebSocket replay failed");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "WebSocket replay failed");
    }
  }, [webSocketReplayDraft]);

  const clearCaptures = useCallback(async () => {
    await window.radar?.clearCaptures();
    setCaptures([]);
    setSelectedId("");
    setSelectedIds([]);
    selectionAnchorRef.current = "";
  }, []);

  const clearWebSocketEvents = useCallback(async () => {
    await window.radar?.clearWebSocketEvents?.();
    setWebSocketEvents([]);
  }, []);

  const hydrateInterceptDraft = useCallback((item: InterceptQueueItem) => {
    const nextDraft = interceptDraftFromItem(item);
    const nextResponse = interceptResponseFromItem(item);
    setInterceptSelectedId(item.id);
    setInterceptDraft(nextDraft);
    setInterceptHeadersText(formatHeaders(nextDraft.headers));
    setInterceptResponseStatus(nextResponse.status);
    setInterceptResponseStatusText(nextResponse.statusText);
    interceptDraftItemRef.current = item.id;
  }, []);

  const selectInterceptItem = useCallback(
    (itemId: string) => {
      const item = interceptState.queue.find((entry) => entry.id === itemId);
      if (item) {
        hydrateInterceptDraft(item);
      }
    },
    [hydrateInterceptDraft, interceptState.queue]
  );

  const setRequestInterceptEnabled = useCallback(async (enabled: boolean) => {
    if (!window.radar?.setInterceptConfig) {
      setNotice("Run in Electron to control interception.");
      return;
    }
    const state = await window.radar.setInterceptConfig({ requestEnabled: enabled });
    setInterceptState(state);
    setNotice(enabled ? "Request interception enabled" : "Request interception disabled");
  }, []);

  const setResponseInterceptEnabled = useCallback(async (enabled: boolean) => {
    if (!window.radar?.setInterceptConfig) {
      setNotice("Run in Electron to control interception.");
      return;
    }
    const state = await window.radar.setInterceptConfig({ responseEnabled: enabled });
    setInterceptState(state);
    setNotice(enabled ? "Response interception enabled" : "Response interception disabled");
  }, []);

  const forwardIntercept = useCallback(async () => {
    if (!window.radar?.forwardIntercept || !interceptSelectedId) {
      return;
    }
    try {
      const selectedItem = interceptState.queue.find((item) => item.id === interceptSelectedId);
      const headers = parseHeaders(interceptHeadersText);
      const payload =
        selectedItem?.stage === "response"
          ? {
              id: interceptSelectedId,
              response: {
                status: interceptResponseStatus,
                statusText: interceptResponseStatusText,
                headers,
                body: interceptDraft.body
              }
            }
          : {
              id: interceptSelectedId,
              draft: { ...interceptDraft, headers }
            };
      const state = await window.radar.forwardIntercept(payload);
      setInterceptState(state);
      interceptDraftItemRef.current = "";
      setNotice(`Queued ${selectedItem?.stage || "item"} forwarded`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Forward failed");
    }
  }, [
    interceptDraft,
    interceptHeadersText,
    interceptResponseStatus,
    interceptResponseStatusText,
    interceptSelectedId,
    interceptState.queue
  ]);

  const dropIntercept = useCallback(async () => {
    if (!window.radar?.dropIntercept || !interceptSelectedId) {
      return;
    }
    try {
      const state = await window.radar.dropIntercept(interceptSelectedId);
      setInterceptState(state);
      interceptDraftItemRef.current = "";
      setNotice("Queued item dropped");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Drop failed");
    }
  }, [interceptSelectedId]);

  const resumeAllIntercepts = useCallback(async () => {
    if (!window.radar?.resumeAllIntercepts) {
      return;
    }
    const state = await window.radar.resumeAllIntercepts();
    setInterceptState(state);
    interceptDraftItemRef.current = "";
    setNotice("Queued requests resumed");
  }, []);

  const saveInterceptRules = useCallback(async () => {
    if (!window.radar?.setInterceptRules) {
      setNotice("Run in Electron to save intercept rules.");
      return;
    }
    try {
      const parsed: unknown = JSON.parse(interceptRulesText || "[]");
      if (!Array.isArray(parsed)) {
        throw new Error("Intercept rules must be a JSON array.");
      }
      const saved = await window.radar.setInterceptRules(parsed as InterceptRule[]);
      setInterceptRules(saved);
      setInterceptRulesText(JSON.stringify(saved, null, 2));
      setNotice(`Saved ${saved.length} intercept rule${saved.length === 1 ? "" : "s"}`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Intercept rules were not valid JSON");
    }
  }, [interceptRulesText]);

  const saveMatchReplaceRules = useCallback(async () => {
    if (!window.radar?.setMatchReplaceRules) {
      setNotice("Run in Electron to save match/replace rules.");
      return;
    }
    try {
      const parsed: unknown = JSON.parse(matchReplaceRulesText || "[]");
      if (!Array.isArray(parsed)) {
        throw new Error("Match/replace rules must be a JSON array.");
      }
      const saved = await window.radar.setMatchReplaceRules(parsed as MatchReplaceRule[]);
      setMatchReplaceRules(saved);
      setMatchReplaceRulesText(JSON.stringify(saved, null, 2));
      setNotice(`Saved ${saved.length} rewrite rule${saved.length === 1 ? "" : "s"}`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Match/replace rules were not valid JSON");
    }
  }, [matchReplaceRulesText]);

  const deleteCapture = useCallback(
    async (captureId: string) => {
      if (!captureId) {
        return;
      }
      try {
        await window.radar?.deleteCapture(captureId);
        setCaptures((items) => items.filter((capture) => capture.id !== captureId));
        setSelectedId((current) => (current === captureId ? "" : current));
        setSelectedIds((current) => current.filter((id) => id !== captureId));
        if (selectionAnchorRef.current === captureId) {
          selectionAnchorRef.current = "";
        }
        if (localContext) {
          await refreshLocalLists(localContext);
        }
        setNotice("Capture deleted");
      } catch (error) {
        setNotice(error instanceof Error ? error.message : "Delete failed");
      }
    },
    [localContext, refreshLocalLists]
  );

  const openNewSessionDialog = useCallback(() => {
    setNewSessionName(defaultSessionName());
    setNewSessionOpen(true);
  }, []);

  const createLocalProfile = useCallback(async () => {
    if (!window.radar) {
      setNotice("Run in Electron to create a profile.");
      return;
    }
    const context = await window.radar.createLocalProfile(profileName);
    await applyLocalContext(context, `Profile opened: ${context.profile.name}`);
  }, [applyLocalContext, profileName]);

  const saveLocalProfile = useCallback(async () => {
    if (!window.radar || !localContext) {
      setNotice("Run in Electron to save a profile.");
      return;
    }
    const profile = await window.radar.saveLocalProfile({
      id: localContext.profile.id,
      name: profileName
    });
    const context = { ...localContext, profile };
    setLocalContext(context);
    setProfileName(profile.name);
    await refreshLocalLists(context);
    setNotice(`Profile saved: ${profile.name}`);
  }, [localContext, profileName, refreshLocalLists]);

  const loadLocalProfile = useCallback(
    async (profileId: string) => {
      if (!window.radar) {
        setNotice("Run in Electron to load a profile.");
        return;
      }
      const context = await window.radar.loadLocalProfile(profileId);
      await applyLocalContext(context, `Profile loaded: ${context.profile.name}`);
    },
    [applyLocalContext]
  );

  const createLocalSession = useCallback(async (name?: string) => {
    if (!window.radar) {
      setNotice("Run in Electron to create a session.");
      return;
    }
    const context = await window.radar.createLocalSession(name);
    await applyLocalContext(context, `Session opened: ${context.session.name}`);
  }, [applyLocalContext]);

  const confirmNewSession = useCallback(async () => {
    await createLocalSession(newSessionName);
    setNewSessionOpen(false);
  }, [createLocalSession, newSessionName]);

  const saveLocalSession = useCallback(async () => {
    if (!window.radar || !localContext) {
      setNotice("Run in Electron to save a session.");
      return;
    }
    const session = await window.radar.saveLocalSession({
      id: localContext.session.id,
      name: sessionName
    });
    const context = { ...localContext, session };
    setLocalContext(context);
    setSessionName(session.name);
    await refreshLocalLists(context);
    setNotice(`Session saved: ${session.name}`);
  }, [localContext, refreshLocalLists, sessionName]);

  const loadLocalSession = useCallback(
    async (sessionId: string) => {
      if (!window.radar) {
        setNotice("Run in Electron to load a session.");
        return;
      }
      const context = await window.radar.loadLocalSession(sessionId);
      await applyLocalContext(context, `Session loaded: ${context.session.name}`);
    },
    [applyLocalContext]
  );

  const ensureProxyCa = useCallback(async () => {
    if (!window.radar) {
      setNotice("Run in Electron to create the proxy CA.");
      return;
    }
    const state = await window.radar.ensureProxyCa();
    setProxyState(state);
    setNotice("Proxy CA ready");
  }, []);

  const startProxy = useCallback(async () => {
    if (!window.radar) {
      setNotice("Run in Electron to start the proxy.");
      return;
    }
    const state = await window.radar.startProxy(proxyState.port);
    setProxyState(state);
    setNotice(`Proxy listening on ${state.proxyUrl}`);
  }, [proxyState.port]);

  const stopProxy = useCallback(async () => {
    if (!window.radar) {
      return;
    }
    const state = await window.radar.stopProxy();
    setProxyState(state);
    setNotice("Proxy stopped");
  }, []);

  const selectedProxyProfile = useMemo(
    () => proxyProfiles.find((profile) => profile.id === selectedProxyProfileId) || proxyProfiles[0] || null,
    [proxyProfiles, selectedProxyProfileId]
  );

  useEffect(() => {
    setProxyProfileNotes(selectedProxyProfile?.notes || "");
  }, [selectedProxyProfile]);

  const selectProxyProfile = useCallback((id: ProxyProfileId) => {
    setSelectedProxyProfileId(id);
  }, []);

  const saveProxyProfile = useCallback(async () => {
    if (!window.radar?.saveProxyProfile) {
      setNotice("Run in Electron to save proxy profile notes.");
      return;
    }
    const saved = await window.radar.saveProxyProfile({ id: selectedProxyProfileId, notes: proxyProfileNotes });
    setProxyProfiles(saved);
    setNotice("Proxy profile notes saved");
  }, [proxyProfileNotes, selectedProxyProfileId]);

  const activeAgentRun = agentRuns[0] || null;

  const setAppMode = useCallback(
    (mode: AppMode) => {
      setAppModeState(mode);
      window.localStorage.setItem("radar.appMode", mode);
      if (mode === "manual-first" && isActiveAgentRun(activeAgentRun)) {
        void window.radar?.stopAgentRun(activeAgentRun.id).then((run) => {
          if (run) {
            setAgentRuns((items) => [run, ...items.filter((item) => item.id !== run.id)]);
          }
        });
      }
    },
    [activeAgentRun]
  );

  const startAgentRun = useCallback(async () => {
    if (!window.radar) {
      setNotice("Run in Electron to start an agent run.");
      return;
    }
    const goal = agentGoal.trim();
    if (!goal) {
      setNotice("Describe a goal before starting AI-First.");
      return;
    }
    const goalUrl = firstUrlFromText(goal);
    const startUrl = goalUrl || normalizeUrl(address);
    const scopeOrigin = goalUrl ? originFromUrl(goalUrl) : "";

    if (goalUrl && scopeOrigin) {
      const latestTargets = await window.radar.getTargets();
      if (!isAllowedTarget(goalUrl, latestTargets)) {
        const nextTargets = [...latestTargets, scopeOrigin];
        const saved = (await window.radar.setTargets(nextTargets)) || nextTargets;
        setTargets(saved);
        setTargetText(saved.join("\n"));
      }
    }

    const run = await window.radar.startAgentRun({
      goal,
      startUrl
    });
    setAddress(startUrl);
    setAgentRuns((items) => [run, ...items.filter((item) => item.id !== run.id)]);
    setAgentGoal("");
    setNotice(scopeOrigin ? `AI-First run started on ${scopeOrigin}` : "AI-First run started");
  }, [address, agentGoal]);

  const stopAgentRun = useCallback(async () => {
    if (!window.radar || !activeAgentRun) {
      return;
    }
    const run = await window.radar.stopAgentRun(activeAgentRun.id);
    if (run) {
      setAgentRuns((items) => [run, ...items.filter((item) => item.id !== run.id)]);
    }
  }, [activeAgentRun]);

  useEffect(() => {
    if (appMode !== "ai-first" || !activeAgentRun) {
      agentUiCursorRef.current = null;
      return;
    }

    const cursor = agentUiCursorRef.current;
    const startIndex =
      cursor?.runId === activeAgentRun.id
        ? activeAgentRun.timeline.findIndex((entry) => entry.id === cursor.entryId)
        : -1;
    const nextEntries = activeAgentRun.timeline.slice(startIndex + 1);
    const lastEntry = nextEntries.at(-1);

    if (!lastEntry) {
      return;
    }

    for (const entry of nextEntries) {
      if (entry.toolCall?.tool === "showView") {
        setActiveView(entry.toolCall.input.view);
      }

      if (entry.toolCall?.tool === "sendReplay") {
        setDraft(entry.toolCall.input.draft);
        setHeadersText(formatHeaders(entry.toolCall.input.draft.headers));
        setLastBurst(null);
      }

      if (entry.toolResult?.tool === "sendReplay" && entry.toolResult.ok) {
        setLastResponse(entry.toolResult.data);
      }

      if (entry.toolResult?.tool === "getCaptures" && entry.toolResult.ok) {
        const firstCapture = entry.toolResult.data.captures.find((capture) => capture.allowed) || entry.toolResult.data.captures[0];
        if (firstCapture) {
          setSelectedId(firstCapture.id);
          setSelectedIds([firstCapture.id]);
          selectionAnchorRef.current = firstCapture.id;
        }
      }

      if (entry.toolResult?.tool === "getInterceptQueue" && entry.toolResult.ok) {
        const queue = entry.toolResult.data.queue;
        setActiveView("intercept");
        setInterceptState((current) => ({ ...current, queue }));
        const firstItem = queue[0];
        if (firstItem) {
          hydrateInterceptDraft(firstItem);
        }
      }

      if (entry.toolResult?.tool === "prepareInterceptEdit" && entry.toolResult.ok) {
        const { item, draft: preparedDraft, response, note } = entry.toolResult.data;
        setActiveView("intercept");
        setInterceptState((current) => ({
          ...current,
          queue: current.queue.some((queued) => queued.id === item.id)
            ? current.queue.map((queued) => (queued.id === item.id ? item : queued))
            : [item, ...current.queue]
        }));
        setInterceptSelectedId(item.id);
        interceptDraftItemRef.current = item.id;
        if (response) {
          setInterceptDraft({ method: item.method, url: item.url, headers: response.headers, body: response.body });
          setInterceptHeadersText(formatHeaders(response.headers));
          setInterceptResponseStatus(response.status);
          setInterceptResponseStatusText(response.statusText);
        } else if (preparedDraft) {
          setInterceptDraft(preparedDraft);
          setInterceptHeadersText(formatHeaders(preparedDraft.headers));
          setInterceptResponseStatus(item.status || 200);
          setInterceptResponseStatusText(item.statusText || "");
        }
        setNotice(note);
      }

      if (entry.toolResult?.tool === "prepareTrafficQuery" && entry.toolResult.ok) {
        setTrafficSearch(entry.toolResult.data.query);
        setActiveView("traffic");
        setNotice(entry.toolResult.data.reason);
      }

      if (entry.toolResult?.tool === "getSitemapCoverage" && entry.toolResult.ok) {
        setActiveView("sitemap");
      }

      if (entry.toolResult?.tool === "prepareReplayTab" && entry.toolResult.ok) {
        const { tabId, draft: preparedDraft, note } = entry.toolResult.data;
        void window.radar?.getReplayTabState().then((state) => {
          if (!state) {
            return;
          }
          setReplayTabState(state);
          const tab = state.tabs.find((item) => item.id === tabId);
          setHeadersText(formatHeaders(tab?.draft.headers || preparedDraft.headers));
          setLastResponse(null);
          setLastBurst(null);
        });
        setActiveView("repeater");
        setNotice(note);
      }

      if (entry.toolResult?.tool === "prepareAutomateDraft" && entry.toolResult.ok) {
        const { draft: preparedDraft, payloads, rules, name, note } = entry.toolResult.data;
        setDraft(preparedDraft);
        setHeadersText(formatHeaders(preparedDraft.headers));
        setAutomatePayloadText(payloads.join("\n"));
        setAutomateRulesText(JSON.stringify(rules, null, 2));
        setAutomateSessionName(name);
        setLastResponse(null);
        setLastBurst(null);
        setActiveView("automate");
        setNotice(note);
      }

      if (entry.toolResult?.tool === "analyzeAutomateResults" && entry.toolResult.ok) {
        setActiveAutomateSessionId(entry.toolResult.data.sessionId);
        setAutomateResultFilter(entry.toolResult.data.outlierResultIds.length > 0 ? "outliers" : "matches");
        setActiveView("automate");
        setNotice(
          `Automate analysis: ${entry.toolResult.data.resultCount} results, ${entry.toolResult.data.clusters.length} clusters`
        );
      }

      if (entry.toolResult?.tool === "compareReplayResults" && entry.toolResult.ok) {
        setActiveView("repeater");
        setNotice(
          entry.toolResult.data.identical
            ? "Compared replay results: no differences"
            : `Compared replay results: status ${entry.toolResult.data.statusBefore} → ${entry.toolResult.data.statusAfter}`
        );
      }
    }

    agentUiCursorRef.current = { runId: activeAgentRun.id, entryId: lastEntry.id };
  }, [activeAgentRun, appMode, hydrateInterceptDraft, setDraft]);

  const queryContext = useMemo(() => annotationContext(evidenceAnnotations), [evidenceAnnotations]);

  const scopedTrafficCaptures = useMemo(
    () => captures.filter((capture) => isAllowedTarget(capture.url, targets)),
    [captures, targets]
  );

  const scopedWebSocketEvents = useMemo(
    () => webSocketEvents.filter((event) => isAllowedTarget(event.url, targets)),
    [webSocketEvents, targets]
  );

  const trafficQueryResult = useMemo(
    () => filterCapturesByQuery(scopedTrafficCaptures, trafficSearch, queryContext),
    [scopedTrafficCaptures, trafficSearch, queryContext]
  );

  useEffect(() => {
    setTrafficQueryError(trafficQueryResult.ok ? "" : trafficQueryResult.error);
  }, [trafficQueryResult]);

  const webSocketQueryResult = useMemo(
    () => filterWebSocketEventsByQuery(scopedWebSocketEvents, webSocketSearch, queryContext),
    [scopedWebSocketEvents, webSocketSearch, queryContext]
  );

  useEffect(() => {
    setWebSocketQueryError(webSocketQueryResult.ok ? "" : webSocketQueryResult.error);
  }, [webSocketQueryResult]);

  const sitemap = useMemo(() => buildSitemap(scopedTrafficCaptures), [scopedTrafficCaptures]);

  const selectedSitemapNode = useMemo(() => {
    if (!selectedSitemapNodeId) {
      return null;
    }
    return sitemap.nodes[selectedSitemapNodeId] || null;
  }, [selectedSitemapNodeId, sitemap.nodes]);

  const selectedSitemapInventory = useMemo(() => {
    if (!selectedSitemapNode) {
      return null;
    }
    return endpointInventoryForNode(selectedSitemapNode, scopedTrafficCaptures);
  }, [selectedSitemapNode, scopedTrafficCaptures]);

  const annotationByEvidenceId = useMemo(() => {
    const map = new Map<string, EvidenceAnnotation>();
    for (const annotation of evidenceAnnotations) {
      map.set(`${annotation.kind}:${annotation.evidenceId}`, annotation);
    }
    return map;
  }, [evidenceAnnotations]);

  const getEvidenceAnnotation = useCallback(
    (evidenceId: string, kind: EvidenceAnnotation["kind"]) =>
      annotationByEvidenceId.get(`${kind}:${evidenceId}`) || {
        evidenceId,
        kind,
        tags: [],
        comment: "",
        updatedAt: ""
      },
    [annotationByEvidenceId]
  );

  const saveEvidenceAnnotation = useCallback(async (annotation: EvidenceAnnotation) => {
    if (!window.radar?.saveEvidenceAnnotation) {
      setNotice("Run in Electron to save evidence annotations.");
      return;
    }
    const saved = await window.radar.saveEvidenceAnnotation(annotation);
    setEvidenceAnnotations((items) => {
      const key = `${saved.kind}:${saved.evidenceId}`;
      const next = items.filter((item) => `${item.kind}:${item.evidenceId}` !== key);
      return [saved, ...next];
    });
    setNotice("Annotation saved");
  }, []);

  const saveSavedFilter = useCallback(
    async (name: string, query: string, surface: SavedFilter["surface"] = "both") => {
      if (!window.radar?.setSavedFilters) {
        setNotice("Run in Electron to save filters.");
        return;
      }
      const now = new Date().toISOString();
      const next: SavedFilter[] = [
        {
          id: `filter-${Date.now()}`,
          name: name.trim(),
          query: query.trim(),
          surface,
          createdAt: now,
          updatedAt: now
        },
        ...savedFilters
      ];
      const saved = await window.radar.setSavedFilters(next);
      setSavedFilters(saved);
      setNotice(`Saved filter: ${name.trim()}`);
    },
    [savedFilters]
  );

  const deleteSavedFilter = useCallback(
    async (filterId: string) => {
      if (!window.radar?.setSavedFilters) {
        return;
      }
      const saved = await window.radar.setSavedFilters(savedFilters.filter((filter) => filter.id !== filterId));
      setSavedFilters(saved);
      setNotice("Filter deleted");
    },
    [savedFilters]
  );

  const applySavedFilter = useCallback((filter: SavedFilter) => {
    if (filter.surface === "websocket") {
      setWebSocketSearch(filter.query);
      setActiveView("websocket");
      return;
    }
    setTrafficSearch(filter.query);
    setActiveView("traffic");
  }, []);

  const applySitemapNode = useCallback((node: SitemapNode) => {
    setSelectedSitemapNodeId(node.id);
    setTrafficSearch(sitemapQueryForNode(node));
    setActiveView("traffic");
  }, []);

  const runSessionDiff = useCallback(async () => {
    if (!window.radar?.getSessionCaptures || !diffBaselineSessionId || !localContext) {
      return;
    }
    if (diffBaselineSessionId === localContext.session.id) {
      setNotice("Choose a different baseline session.");
      return;
    }
    setSessionDiffPending(true);
    try {
      const [baseline, comparison] = await Promise.all([
        window.radar.getSessionCaptures(diffBaselineSessionId),
        window.radar.getSessionCaptures(localContext.session.id)
      ]);
      const scopedBaseline = baseline.filter((capture) => isAllowedTarget(capture.url, targets));
      const scopedComparison = comparison.filter((capture) => isAllowedTarget(capture.url, targets));
      setSessionDiff(diffSessionCaptures(scopedBaseline, scopedComparison));
      setNotice("Session diff ready");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Session diff failed");
    } finally {
      setSessionDiffPending(false);
    }
  }, [diffBaselineSessionId, localContext, targets]);

  const bulkDeleteCaptures = useCallback(
    async (captureIds: string[]) => {
      for (const captureId of captureIds) {
        await window.radar?.deleteCapture(captureId);
      }
      setCaptures((items) => items.filter((capture) => !captureIds.includes(capture.id)));
      setSelectedIds((current) => current.filter((id) => !captureIds.includes(id)));
      if (captureIds.includes(selectedId)) {
        setSelectedId("");
      }
      if (localContext) {
        await refreshLocalLists(localContext);
      }
      setNotice(`Deleted ${captureIds.length} capture${captureIds.length === 1 ? "" : "s"}`);
    },
    [localContext, refreshLocalLists, selectedId]
  );

  const bulkExportCaptures = useCallback(
    async (captureIds: string[], format: RequestExportFormat = "raw") => {
      const selected = captures.filter((capture) => captureIds.includes(capture.id));
      if (selected.length === 0) {
        return;
      }
      const text = selected.map((capture) => formatCapturedRequest(capture, format)).join("\n\n");
      try {
        await window.navigator.clipboard.writeText(text);
        setNotice(`Exported ${selected.length} capture${selected.length === 1 ? "" : "s"}`);
      } catch {
        setNotice("Export failed");
      }
    },
    [captures]
  );

  const bulkTagCaptures = useCallback(
    async (captureIds: string[], tag: string) => {
      if (!window.radar?.saveEvidenceAnnotations) {
        setNotice("Run in Electron to bulk tag captures.");
        return;
      }
      const normalizedTag = tag.trim().toLowerCase();
      if (!normalizedTag) {
        return;
      }
      const annotations = captureIds.map((captureId) => {
        const existing = getEvidenceAnnotation(captureId, "capture");
        const tags = existing.tags.includes(normalizedTag) ? existing.tags : [...existing.tags, normalizedTag];
        return { ...existing, tags, updatedAt: new Date().toISOString() };
      });
      const saved = await window.radar.saveEvidenceAnnotations(annotations);
      setEvidenceAnnotations(saved);
      setNotice(`Tagged ${captureIds.length} capture${captureIds.length === 1 ? "" : "s"}`);
    },
    [getEvidenceAnnotation]
  );

  const bulkTagWebSocketEvents = useCallback(
    async (eventIds: string[], tag: string) => {
      if (!window.radar?.saveEvidenceAnnotations) {
        setNotice("Run in Electron to bulk tag frames.");
        return;
      }
      const normalizedTag = tag.trim().toLowerCase();
      if (!normalizedTag) {
        return;
      }
      const annotations = eventIds.map((evidenceId) => {
        const existing = getEvidenceAnnotation(evidenceId, "websocket");
        const tags = existing.tags.includes(normalizedTag) ? existing.tags : [...existing.tags, normalizedTag];
        return { ...existing, tags, updatedAt: new Date().toISOString() };
      });
      const saved = await window.radar.saveEvidenceAnnotations(annotations);
      setEvidenceAnnotations(saved);
      setNotice(`Tagged ${eventIds.length} frame${eventIds.length === 1 ? "" : "s"}`);
    },
    [getEvidenceAnnotation]
  );

  const trafficMethods = useMemo(
    () => sortedMethods(Array.from(new Set(scopedTrafficCaptures.map((capture) => capture.method).filter(Boolean)))),
    [scopedTrafficCaptures]
  );

  const trafficTypes = useMemo(
    () =>
      Array.from(new Set(scopedTrafficCaptures.map((capture) => capture.type).filter(Boolean))).sort((left, right) =>
        left.localeCompare(right)
      ),
    [scopedTrafficCaptures]
  );

  const trafficCaptures = useMemo(() => {
    const base = trafficQueryResult.ok ? trafficQueryResult.captures : [];
    const filtered = base.filter((capture) => {
      const methodMatches = trafficMethodFilter === "all" || capture.method === trafficMethodFilter;
      const typeMatches = trafficTypeFilter === "all" || capture.type === trafficTypeFilter;
      return methodMatches && typeMatches;
    });
    return [...filtered].sort((left, right) =>
      compareTrafficCaptures(left, right, trafficSortField, trafficSortDirection)
    );
  }, [
    trafficQueryResult,
    trafficMethodFilter,
    trafficTypeFilter,
    trafficSortField,
    trafficSortDirection
  ]);

  const filteredWebSocketEvents = useMemo(() => {
    return webSocketQueryResult.ok ? webSocketQueryResult.events : [];
  }, [webSocketQueryResult]);

  const selected = useMemo(
    () => trafficCaptures.find((capture) => capture.id === selectedId) || trafficCaptures[0] || null,
    [trafficCaptures, selectedId]
  );

  const selectTrafficCapture = useCallback(
    (captureId: string, event?: { metaKey?: boolean; ctrlKey?: boolean; shiftKey?: boolean }) => {
      const meta = Boolean(event?.metaKey || event?.ctrlKey);
      const shift = Boolean(event?.shiftKey);

      setSelectedId(captureId);

      setSelectedIds((current) => {
        if (shift && selectionAnchorRef.current) {
          const ids = trafficCaptures.map((capture) => capture.id);
          const start = ids.indexOf(selectionAnchorRef.current);
          const end = ids.indexOf(captureId);
          if (start === -1 || end === -1) {
            if (meta) {
              return current.includes(captureId)
                ? current.filter((id) => id !== captureId)
                : [...current, captureId];
            }
            selectionAnchorRef.current = captureId;
            return [captureId];
          }
          const from = Math.min(start, end);
          const to = Math.max(start, end);
          const range = ids.slice(from, to + 1);
          return meta ? [...new Set([...current, ...range])] : range;
        }
        if (meta) {
          return current.includes(captureId)
            ? current.filter((id) => id !== captureId)
            : [...current, captureId];
        }
        selectionAnchorRef.current = captureId;
        return [captureId];
      });
    },
    [trafficCaptures]
  );

  useEffect(() => {
    setSelectedIds((current) => {
      const visible = new Set(trafficCaptures.map((capture) => capture.id));
      const next = current.filter((id) => visible.has(id));
      return next.length === current.length ? current : next;
    });
  }, [trafficCaptures]);

  const activeProfileId = localContext?.profile.id || "";

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!window.radar) {
        return;
      }
      const context = await window.radar.getLocalContext();
      const [
        items,
        nextProfiles,
        nextSessions,
        nextWebSocketEvents,
        nextProxyProfiles,
        nextInterceptState,
        nextInterceptRules,
        nextMatchReplaceRules,
        nextAgentRuns,
        nextAutomatePayloadSets,
        nextAutomateSessions
      ] = await Promise.all([
        window.radar.getTargets(),
        window.radar.listLocalProfiles(),
        window.radar.listLocalSessions(context.profile.id),
        loadWebSocketEvents(),
        loadProxyProfiles(),
        loadInterceptState(),
        loadInterceptRules(),
        loadMatchReplaceRules(),
        window.radar.listAgentRuns(),
        window.radar.getAutomatePayloadSets?.() ?? [],
        window.radar.listAutomateSessions?.() ?? []
      ]);
      if (cancelled) {
        return;
      }
      setLocalContext(context);
      setProfileName(context.profile.name);
      setSessionName(context.session.name);
      setTargets(items);
      setTargetText(items.join("\n"));
      setProfiles(nextProfiles);
      setSessions(nextSessions);
      setWebSocketEvents(nextWebSocketEvents);
      setProxyProfiles(nextProxyProfiles);
      setInterceptState(nextInterceptState);
      setInterceptRules(nextInterceptRules);
      setInterceptRulesText(JSON.stringify(nextInterceptRules, null, 2));
      setMatchReplaceRules(nextMatchReplaceRules);
      setMatchReplaceRulesText(JSON.stringify(nextMatchReplaceRules, null, 2));
      setAgentRuns(nextAgentRuns);
      setAutomatePayloadSets(nextAutomatePayloadSets);
      setAutomateSessions(nextAutomateSessions);
      setActiveAutomateSessionId(nextAutomateSessions[0]?.id || "");
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!activeProfileId) {
      return;
    }
    let cancelled = false;
    const load = async () => {
      if (!window.radar || cancelled) {
        return;
      }
      const [nextProfiles, nextSessions] = await Promise.all([
        window.radar.listLocalProfiles(),
        window.radar.listLocalSessions(activeProfileId)
      ]);
      if (!cancelled) {
        setProfiles(nextProfiles);
        setSessions(nextSessions);
      }
    };
    load();
    const timer = setInterval(load, 4000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [activeProfileId]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!window.radar || cancelled) {
        return;
      }
      const [
        nextCaptures,
        nextSslEvents,
        nextWebSocketEvents,
        nextBrowserState,
        nextProxyState,
        nextInterceptState,
        nextAgentRuns,
        nextAutomateSessions
      ] = await Promise.all([
        window.radar.getCaptures(),
        window.radar.getSslEvents(),
        loadWebSocketEvents(),
        window.radar.getBrowserState(),
        window.radar.getProxyState(),
        loadInterceptState(),
        window.radar.listAgentRuns(),
        window.radar.listAutomateSessions?.() ?? []
      ]);
      if (!cancelled) {
        setCaptures(nextCaptures);
        setSslEvents(nextSslEvents);
        setWebSocketEvents(nextWebSocketEvents);
        setBrowserState(nextBrowserState);
        setProxyState(nextProxyState);
        setInterceptState(nextInterceptState);
        setAgentRuns(nextAgentRuns);
        setAutomateSessions(nextAutomateSessions);
        setActiveAutomateSessionId((current) => current || nextAutomateSessions[0]?.id || "");
      }
    };

    load();
    const timer = setInterval(load, 900);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const id = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const selectedInterceptItem = useMemo(
    () => interceptState.queue.find((item) => item.id === interceptSelectedId) || interceptState.queue[0] || null,
    [interceptSelectedId, interceptState.queue]
  );

  useEffect(() => {
    if (!selectedInterceptItem) {
      if (interceptDraftItemRef.current) {
        interceptDraftItemRef.current = "";
      }
      return;
    }
    if (interceptDraftItemRef.current !== selectedInterceptItem.id) {
      hydrateInterceptDraft(selectedInterceptItem);
    }
  }, [hydrateInterceptDraft, selectedInterceptItem]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setAiPaletteOpen((open) => !open);
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "f") {
        if (activeView !== "traffic" && activeView !== "websocket" && activeView !== "sitemap") {
          return;
        }
        event.preventDefault();
        trafficSearchRef.current?.focus();
        return;
      }
      if (event.key === "Escape") {
        if (trafficSearch.trim() || webSocketSearch.trim() || trafficMethodFilter !== "all" || trafficTypeFilter !== "all") {
          setTrafficSearch("");
          setWebSocketSearch("");
          setTrafficMethodFilter("all");
          setTrafficTypeFilter("all");
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeView, trafficMethodFilter, trafficSearch, trafficTypeFilter, webSocketSearch]);

  const meta = viewMeta[activeView];
  const utc = clock.toISOString().replace("T", " ").slice(0, 19) + "Z";
  const replayPending = sendReplayMutation.isPending || runBurstMutation.isPending;

  return {
    address,
    setAddress,
    captures,
    sslEvents,
    webSocketEvents,
    localContext,
    profiles,
    sessions,
    profileName,
    setProfileName,
    sessionName,
    setSessionName,
    profileSessionOpen,
    setProfileSessionOpen,
    newSessionOpen,
    setNewSessionOpen,
    newSessionName,
    setNewSessionName,
    browserState,
    proxyState,
    proxyProfiles,
    selectedProxyProfile,
    selectedProxyProfileId,
    proxyProfileNotes,
    setProxyProfileNotes,
    interceptState,
    interceptSelectedId,
    interceptDraft,
    setInterceptDraft,
    interceptHeadersText,
    setInterceptHeadersText,
    interceptResponseStatus,
    setInterceptResponseStatus,
    interceptResponseStatusText,
    setInterceptResponseStatusText,
    interceptRules,
    interceptRulesText,
    setInterceptRulesText,
    matchReplaceRules,
    matchReplaceRulesText,
    setMatchReplaceRulesText,
    selectedInterceptItem,
    selectInterceptItem,
    selectedId,
    setSelectedId,
    selectedIds,
    selectTrafficCapture,
    targets,
    targetText,
    setTargetText,
    scopedTrafficCaptures,
    trafficMethodFilter,
    setTrafficMethodFilter,
    trafficTypeFilter,
    setTrafficTypeFilter,
    trafficSearch,
    setTrafficSearch,
    trafficQueryError,
    webSocketSearch,
    setWebSocketSearch,
    webSocketQueryError,
    filteredWebSocketEvents,
    trafficSearchRef,
    savedFilters,
    saveSavedFilter,
    deleteSavedFilter,
    applySavedFilter,
    evidenceAnnotations,
    getEvidenceAnnotation,
    saveEvidenceAnnotation,
    bulkDeleteCaptures,
    bulkExportCaptures,
    bulkTagCaptures,
    bulkTagWebSocketEvents,
    sitemap,
    selectedSitemapNodeId,
    setSelectedSitemapNodeId,
    selectedSitemapNode,
    selectedSitemapInventory,
    applySitemapNode,
    diffBaselineSessionId,
    setDiffBaselineSessionId,
    sessionDiff,
    sessionDiffPending,
    runSessionDiff,
    trafficQueryExamples: TRAFFIC_QUERY_EXAMPLES,
    trafficSortField,
    setTrafficSortField,
    trafficSortDirection,
    setTrafficSortDirection,
    trafficMethods,
    trafficTypes,
    draft,
    setDraft,
    replayTabState,
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
    saveReplayEnvironments,
    createReplayEnvironment: createReplayEnvironmentAction,
    replayCollections,
    saveReplayCollections: saveReplayCollectionsState,
    saveDraftToCollection,
    loadCollectionItem,
    automateMarkerName,
    setAutomateMarkerName,
    automateHeaderName,
    setAutomateHeaderName,
    automatePayloadText,
    setAutomatePayloadText,
    automatePayloadSets,
    selectedAutomatePayloadSetId,
    selectedAutomatePayloadSet,
    selectAutomatePayloadSet,
    automatePayloadSetName,
    setAutomatePayloadSetName,
    automateWordlistPath,
    setAutomateWordlistPath,
    saveAutomatePayloadSet,
    saveAutomateWordlistReference,
    automateSessionName,
    setAutomateSessionName,
    automateLimits,
    updateAutomateLimits,
    automateRulesText,
    setAutomateRulesText,
    automateRules,
    automateSessions,
    activeAutomateSessionId,
    setActiveAutomateSessionId,
    activeAutomateSession,
    selectedAutomateResultId,
    setSelectedAutomateResultId,
    selectedAutomateResult,
    automateResultFilter,
    setAutomateResultFilter,
    automateResultSort,
    setAutomateResultSort,
    filteredAutomateResults,
    startAutomateSession,
    pauseAutomateSession,
    resumeAutomateSession,
    stopAutomateSession,
    retryAutomateSession,
    promoteAutomateResultToRepeater,
    refreshAutomateSessions,
    automateMarkerPreview,
    automatePositions,
    automatePayloads,
    automatePreviewDraft,
    insertAutomateMarker,
    loadAutomatePreviewIntoRepeater,
    webSocketReplayDraft,
    setWebSocketReplayDraft,
    webSocketReplayResult,
    loadWebSocketFrameToRepeater,
    sendWebSocketReplay: sendWebSocketReplayAction,
    headersText,
    setHeadersText,
    activeView,
    setActiveView,
    activeDetail,
    setActiveDetail,
    lastResponse,
    lastBurst,
    count,
    setCount,
    concurrency,
    setConcurrency,
    delayMs,
    setDelayMs,
    notice,
    setNotice,
    clock,
    appMode,
    setAppMode,
    agentGoal,
    setAgentGoal,
    agentRuns,
    activeAgentRun,
    startAgentRun,
    stopAgentRun,
    aiPaletteOpen,
    setAiPaletteOpen,
    ai,
    appearance,
    selected,
    trafficCaptures,
    meta,
    utc,
    openBrowser,
    saveTargets,
    addTarget,
    applyAiDraft,
    prepareAiNavigate,
    cloneToRepeater,
    sendReplay: sendReplayMutation.run,
    runBurst: runBurstMutation.run,
    sendReplayPending: sendReplayMutation.isPending,
    runBurstPending: runBurstMutation.isPending,
    replayPending,
    clearCaptures,
    clearWebSocketEvents,
    deleteCapture,
    createLocalProfile,
    saveLocalProfile,
    loadLocalProfile,
    createLocalSession,
    openNewSessionDialog,
    confirmNewSession,
    saveLocalSession,
    loadLocalSession,
    ensureProxyCa,
    startProxy,
    stopProxy,
    selectProxyProfile,
    saveProxyProfile,
    setRequestInterceptEnabled,
    setResponseInterceptEnabled,
    forwardIntercept,
    dropIntercept,
    resumeAllIntercepts,
    saveInterceptRules,
    saveMatchReplaceRules
  };
}
