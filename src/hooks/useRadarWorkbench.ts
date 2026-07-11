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
import {
  buildAdvancedTestingSummary,
  workflowDraftFromApiImport,
  workflowDraftFromAuthMatrixRow,
  workflowDraftFromGraphQlOperation,
  workflowDraftFromHeaderSignal,
  workflowDraftFromParameter,
  workflowDraftFromSecret
} from "../../shared/advancedTesting.js";
import { AGENT_RUN_PROFILES, agentBudgetLabels, getAgentRunProfile } from "../../shared/agentProfiles.js";
import { normalizeAgentRunMemory } from "../../shared/agentMemory.js";
import { annotationContext } from "../../shared/evidenceTags.js";
import { diffReplayHistory, type ReplayDiffSummary } from "../../shared/replayDiff.js";
import {
  appendReplayHistory,
  createReplayTab,
  defaultReplayTabState,
  normalizeReplayTabState
} from "../../shared/replayTabs.js";
import { createCollectionItem, normalizeReplayCollections } from "../../shared/replayCollections.js";
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
  evidenceRefFromAutomateResult,
  evidenceRefFromCapture,
  evidenceRefFromWebSocket,
  FINDING_TEMPLATES,
  findingFromTemplate,
  buildRetestMatrix,
  mergeFindings as mergeFindingRecords,
  normalizeFinding,
  suggestFindingMerges
} from "../../shared/findings.js";
import {
  filterCapturesByQuery,
  filterWebSocketEventsByQuery,
  TRAFFIC_QUERY_EXAMPLES
} from "../../shared/trafficQuery.js";
import {
  WORKFLOW_STEP_TEMPLATES,
  validateWorkflowDraft,
  workflowToGraph
} from "../../shared/workflows.js";
import type {
  BrowserState,
  BurstResult,
  CapturedRequest,
  EvidenceAnnotation,
  Finding,
  FindingEvidenceRef,
  FindingReport,
  FindingReportOptions,
  FindingTemplateId,
  InstalledPlugin,
  InterceptQueueItem,
  InterceptResponseDraft,
  InterceptRule,
  InterceptState,
  AgentRunMemoryEntry,
  AgentMissionSteeringAction,
  AgentMissionSteeringRequest,
  AgentCapabilityAction,
  AgentCapabilityActionRequest,
  AgentRunProfileId,
  AgentRunRecoveryAction,
  AgentRun,
  AppMode,
  LocalContext,
  LocalProfile,
  LocalSessionSummary,
  MatchReplaceRule,
  ProxyProfile,
  ProxyProfileId,
  ProxyState,
  ProjectNote,
  ReplayCollection,
  ReplayDraft,
  ReplayEnvironment,
  ReplayHistoryEntry,
  ReplayResult,
  ReplayTabState,
  SavedFilter,
  SavedView,
  SavedViewTarget,
  SslEvent,
  WebSocketEvent,
  WebSocketReplayDraft,
  WebSocketReplayResult,
  AutomateLimits,
  AutomatePayloadSet,
  AutomateResult,
  AutomateSession,
  WorkflowDefinition,
  WorkflowDryRun,
  WorkflowRevision,
  WorkflowRun,
  PluginApiRequest,
  PluginApiResult,
  PluginAuditEntry,
  PluginDeveloperValidation,
  PluginInstallPreview,
  PluginPanelRender,
  PluginPermission,
  PluginInstallStatus,
  GlobalSearchResponse,
  GlobalSearchResult,
  ProjectBundleExportPreview,
  ProjectBundleImportPreview,
  ProjectBundleRedactionProfile,
  HandoffPackagePreview,
  IdentityActivationRecord,
  IdentityProfile,
  IdentityProfileDraft
} from "../types";
import { useAsyncAction } from "./useAsyncAction";
import { useAiConnection } from "./useAiConnection";
import { useTheme } from "./useTheme";

export type WorkView =
  | "traffic"
  | "websocket"
  | "intercept"
  | "repeater"
  | "automate"
  | "findings"
  | "workflows"
  | "plugins"
  | "advanced"
  | "scope"
  | "ssl"
  | "sitemap";

export const WORK_VIEWS: WorkView[] = [
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
  findings: { num: "06", label: "Findings", eyebrow: "Evidence // Report builder", title: "Findings" },
  workflows: { num: "07", label: "Workflows", eyebrow: "Checks // Repeatable runs", title: "Workflows" },
  plugins: { num: "08", label: "Plugins", eyebrow: "SDK // Local extensions", title: "Plugins" },
  advanced: { num: "09", label: "Advanced", eyebrow: "API // Auth and data signals", title: "Advanced Testing" },
  sitemap: { num: "10", label: "Sitemap", eyebrow: "Map // Endpoint inventory", title: "Sitemap" },
  scope: { num: "11", label: "Scope", eyebrow: "Targets // Engagement boundary", title: "Scope" },
  ssl: { num: "12", label: "SSL", eyebrow: "Crypto // Proxy interception", title: "Proxy" }
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
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
  const [globalSearchQuery, setGlobalSearchQuery] = useState("");
  const [globalSearchResult, setGlobalSearchResult] = useState<GlobalSearchResponse | null>(null);
  const [globalSearchPending, setGlobalSearchPending] = useState(false);
  const [globalSearchError, setGlobalSearchError] = useState("");
  const [savedFilters, setSavedFilters] = useState<SavedFilter[]>([]);
  const [projectArtifactsOpen, setProjectArtifactsOpen] = useState(false);
  const [projectNotes, setProjectNotes] = useState<ProjectNote[]>([]);
  const [selectedProjectNoteId, setSelectedProjectNoteId] = useState("");
  const [projectNoteTitle, setProjectNoteTitle] = useState("");
  const [projectNoteBody, setProjectNoteBody] = useState("");
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  const [savedViewName, setSavedViewName] = useState("");
  const [savedViewDescription, setSavedViewDescription] = useState("");
  const [bundleRedaction, setBundleRedaction] = useState<ProjectBundleRedactionProfile>("redacted-evidence");
  const [bundleIncludeReplayCollections, setBundleIncludeReplayCollections] = useState(true);
  const [bundleIncludePlugins, setBundleIncludePlugins] = useState(false);
  const [bundleExportPreview, setBundleExportPreview] = useState<ProjectBundleExportPreview | null>(null);
  const [bundleImportPath, setBundleImportPath] = useState("");
  const [bundleImportPreview, setBundleImportPreview] = useState<ProjectBundleImportPreview | null>(null);
  const [bundleActionPending, setBundleActionPending] = useState(false);
  const [handoffTitle, setHandoffTitle] = useState("");
  const [handoffIncludeDraftFindings, setHandoffIncludeDraftFindings] = useState(false);
  const [handoffIncludeProjectNotes, setHandoffIncludeProjectNotes] = useState(true);
  const [handoffIncludeWorkflows, setHandoffIncludeWorkflows] = useState(true);
  const [handoffPreview, setHandoffPreview] = useState<HandoffPackagePreview | null>(null);
  const [evidenceAnnotations, setEvidenceAnnotations] = useState<EvidenceAnnotation[]>([]);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [selectedFindingId, setSelectedFindingId] = useState("");
  const [findingReport, setFindingReport] = useState<FindingReport | null>(null);
  const [workflows, setWorkflows] = useState<WorkflowDefinition[]>([]);
  const [workflowRuns, setWorkflowRuns] = useState<WorkflowRun[]>([]);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState("");
  const [selectedWorkflowRunId, setSelectedWorkflowRunId] = useState("");
  const [workflowDryRun, setWorkflowDryRun] = useState<WorkflowDryRun>(() => validateWorkflowDraft(""));
  const [workflowRevisions, setWorkflowRevisions] = useState<WorkflowRevision[]>([]);
  const [plugins, setPlugins] = useState<InstalledPlugin[]>([]);
  const [identityProfiles, setIdentityProfiles] = useState<IdentityProfile[]>([]);
  const [identityActivations, setIdentityActivations] = useState<IdentityActivationRecord[]>([]);
  const [identityBusy, setIdentityBusy] = useState(false);
  const [pluginInstallPath, setPluginInstallPath] = useState("");
  const [pluginInstallPreview, setPluginInstallPreview] = useState<PluginInstallPreview | null>(null);
  const [pluginAudit, setPluginAudit] = useState<PluginAuditEntry[]>([]);
  const [pluginApiRequestText, setPluginApiRequestText] = useState("");
  const [pluginApiResult, setPluginApiResult] = useState<PluginApiResult | null>(null);
  const [pluginPanelRender, setPluginPanelRender] = useState<PluginPanelRender | null>(null);
  const [pluginDeveloperValidation, setPluginDeveloperValidation] = useState<PluginDeveloperValidation | null>(null);
  const [advancedImportText, setAdvancedImportText] = useState("");
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
  const [agentProfileId, setAgentProfileId] = useState<AgentRunProfileId>("passive-map");
  const [agentRuns, setAgentRuns] = useState<AgentRun[]>([]);
  const [selectedAgentRunId, setSelectedAgentRunId] = useState("");
  const [agentRunMemory, setAgentRunMemory] = useState<AgentRunMemoryEntry[]>([]);
  const [agentRunMemorySearch, setAgentRunMemorySearch] = useState("");
  const [aiPreparedWorkflowDraft, setAiPreparedWorkflowDraft] = useState<WorkflowDefinition | null>(null);
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

  const selectedFinding = useMemo(
    () => findings.find((finding) => finding.id === selectedFindingId) || findings[0] || null,
    [findings, selectedFindingId]
  );

  const findingMergeSuggestions = useMemo(() => suggestFindingMerges(findings), [findings]);

  const findingRetestMatrix = useMemo(() => buildRetestMatrix(findings), [findings]);

  const selectedWorkflow = useMemo(
    () => workflows.find((workflow) => workflow.id === selectedWorkflowId) || workflows[0] || null,
    [selectedWorkflowId, workflows]
  );

  const selectedWorkflowGraph = useMemo(() => workflowToGraph(selectedWorkflow), [selectedWorkflow]);

  const selectedWorkflowRun = useMemo(
    () => workflowRuns.find((run) => run.id === selectedWorkflowRunId) || workflowRuns[0] || null,
    [selectedWorkflowRunId, workflowRuns]
  );

  const approvedPlugins = useMemo(() => plugins.filter((plugin) => plugin.status === "approved"), [plugins]);

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

  const saveFinding = useCallback(async (finding: Finding) => {
    if (!window.radar?.saveFinding) {
      setNotice("Run in Electron to save findings.");
      return null;
    }
    try {
      const saved = await window.radar.saveFinding(finding);
      setFindings((items) => [saved, ...items.filter((item) => item.id !== saved.id)]);
      setSelectedFindingId(saved.id);
      setNotice("Finding saved");
      return saved;
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Finding save failed");
      return null;
    }
  }, []);

  const deleteFinding = useCallback(
    async (findingId = selectedFinding?.id || "") => {
      if (!findingId || !window.radar?.deleteFinding) {
        return;
      }
      await window.radar.deleteFinding(findingId);
      setFindings((items) => items.filter((finding) => finding.id !== findingId));
      setSelectedFindingId((current) => (current === findingId ? "" : current));
      setNotice("Finding deleted");
    },
    [selectedFinding]
  );

  const saveFindingPatch = useCallback(
    async (patch: Partial<Finding>) => {
      if (!selectedFinding) {
        return null;
      }
      const status = patch.status || selectedFinding.status;
      const now = new Date().toISOString();
      const normalized = normalizeFinding({
        ...selectedFinding,
        ...patch,
        reviewedAt: status === "reviewed" && !selectedFinding.reviewedAt ? now : patch.reviewedAt || selectedFinding.reviewedAt,
        updatedAt: now
      });
      if (!normalized) {
        setNotice("Finding needs a title and evidence before saving.");
        return null;
      }
      return saveFinding(normalized);
    },
    [saveFinding, selectedFinding]
  );

  const createFindingWithEvidence = useCallback(
    async (templateId: FindingTemplateId, evidence: FindingEvidenceRef[], overrides: Partial<Finding> = {}) => {
      const base = findingFromTemplate(templateId, evidence);
      const normalized = normalizeFinding({
        ...base,
        ...overrides,
        evidence,
        updatedAt: new Date().toISOString()
      });
      if (!normalized) {
        setNotice("Select evidence before creating a finding.");
        return null;
      }
      const saved = await saveFinding(normalized);
      if (saved) {
        setActiveView("findings");
      }
      return saved;
    },
    [saveFinding]
  );

  const createFindingFromCapture = useCallback(
    (capture: CapturedRequest | null, templateId: FindingTemplateId = "headers") => {
      if (!capture) {
        setNotice("Select a capture before creating a finding.");
        return Promise.resolve(null);
      }
      return createFindingWithEvidence(templateId, [evidenceRefFromCapture(capture)], {
        affectedAssets: [originFromUrl(capture.url) || capture.url],
        reproductionSteps: `${capture.method} ${capture.url}`,
        notes: capture.status ? `Observed HTTP ${capture.status} ${capture.statusText}` : ""
      });
    },
    [createFindingWithEvidence]
  );

  const createFindingFromWebSocket = useCallback(
    (event: WebSocketEvent | null, templateId: FindingTemplateId = "information-disclosure") => {
      if (!event) {
        setNotice("Select a WebSocket frame before creating a finding.");
        return Promise.resolve(null);
      }
      return createFindingWithEvidence(templateId, [evidenceRefFromWebSocket(event)], {
        affectedAssets: [originFromUrl(event.url) || event.url],
        reproductionSteps: `${event.direction} ${event.url}`,
        notes: event.error || event.payloadData.slice(0, 240)
      });
    },
    [createFindingWithEvidence]
  );

  const promoteAutomateResultToFinding = useCallback(async () => {
    if (!activeAutomateSession || !selectedAutomateResult || !window.radar?.promoteAutomateResultToFinding) {
      return null;
    }
    try {
      const finding = await window.radar.promoteAutomateResultToFinding({
        sessionId: activeAutomateSession.id,
        resultId: selectedAutomateResult.id
      });
      setFindings((items) => [finding, ...items.filter((item) => item.id !== finding.id)]);
      setSelectedFindingId(finding.id);
      setActiveView("findings");
      setNotice("Promoted Automate result to draft finding");
      return finding;
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Finding promotion failed");
      return null;
    }
  }, [activeAutomateSession, selectedAutomateResult]);

  const attachEvidenceToFinding = useCallback(
    async (refs: FindingEvidenceRef[]) => {
      if (!selectedFinding || refs.length === 0) {
        return null;
      }
      const existing = new Map(selectedFinding.evidence.map((ref) => [`${ref.kind}:${ref.id}`, ref]));
      refs.forEach((ref) => existing.set(`${ref.kind}:${ref.id}`, ref));
      return saveFindingPatch({ evidence: Array.from(existing.values()) });
    },
    [saveFindingPatch, selectedFinding]
  );

  const attachSelectedCaptureToFinding = useCallback(
    (capture: CapturedRequest | null) => {
      if (!capture) {
        setNotice("Select a capture before attaching retest evidence.");
        return Promise.resolve(null);
      }
      return attachEvidenceToFinding([evidenceRefFromCapture(capture)]);
    },
    [attachEvidenceToFinding]
  );

  const attachSelectedAutomateResultToFinding = useCallback(() => {
    if (!activeAutomateSession || !selectedAutomateResult) {
      setNotice("Select an Automate result before attaching evidence.");
      return Promise.resolve(null);
    }
    return attachEvidenceToFinding([evidenceRefFromAutomateResult(activeAutomateSession, selectedAutomateResult)]);
  }, [activeAutomateSession, attachEvidenceToFinding, selectedAutomateResult]);

  const mergeFindingPair = useCallback(
    async (primaryId: string, duplicateId: string) => {
      const primary = findings.find((finding) => finding.id === primaryId);
      const duplicate = findings.find((finding) => finding.id === duplicateId);
      if (!primary || !duplicate || primary.id === duplicate.id) {
        setNotice("Select two finding records before merging.");
        return null;
      }
      if (!window.radar?.saveFinding || !window.radar?.deleteFinding) {
        setNotice("Run in Electron to merge findings.");
        return null;
      }
      const merged = mergeFindingRecords(primary, duplicate);
      const saved = await window.radar.saveFinding(merged);
      await window.radar.deleteFinding(duplicate.id);
      setFindings((items) => [saved, ...items.filter((finding) => finding.id !== saved.id && finding.id !== duplicate.id)]);
      setSelectedFindingId(saved.id);
      setNotice(`Merged duplicate finding into ${saved.title}`);
      return saved;
    },
    [findings]
  );

  const buildFindingReportPreview = useCallback(async (options: Partial<FindingReportOptions>) => {
    if (!window.radar?.buildFindingReport) {
      setNotice("Run in Electron to build reports.");
      return null;
    }
    const report = await window.radar.buildFindingReport(options);
    setFindingReport(report);
    setNotice(`Report preview ready: ${report.findingCount} findings`);
    return report;
  }, []);

  const saveWorkflow = useCallback(async (workflow: WorkflowDefinition) => {
    if (!window.radar?.saveWorkflow) {
      setNotice("Run in Electron to save workflows.");
      return null;
    }
    try {
      const saved = await window.radar.saveWorkflow(workflow);
      setWorkflows((items) => [saved, ...items.filter((item) => item.id !== saved.id)]);
      setSelectedWorkflowId(saved.id);
      const revisions = await (window.radar.getWorkflowRevisions?.(saved.id) ?? Promise.resolve([]));
      setWorkflowRevisions(revisions);
      setNotice("Workflow saved");
      return saved;
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Workflow save failed");
      return null;
    }
  }, []);

  const validateWorkflowEditor = useCallback(async (definition: string | WorkflowDefinition, inputs: Record<string, string> = {}) => {
    try {
      const dryRun =
        (await (window.radar?.validateWorkflow?.({ definition, inputs }) ?? Promise.resolve(validateWorkflowDraft(definition, inputs))));
      setWorkflowDryRun(dryRun);
      setNotice(dryRun.ok ? `Workflow dry run: ${dryRun.runnableStepIds.length} runnable steps` : "Workflow dry run found errors");
      return dryRun;
    } catch (error) {
      const dryRun = validateWorkflowDraft(definition, inputs);
      setWorkflowDryRun(dryRun);
      setNotice(error instanceof Error ? error.message : "Workflow dry run failed");
      return dryRun;
    }
  }, []);

  const refreshWorkflowRevisions = useCallback(async (workflowId = selectedWorkflow?.id || "") => {
    if (!workflowId || !window.radar?.getWorkflowRevisions) {
      setWorkflowRevisions([]);
      return [];
    }
    const revisions = await window.radar.getWorkflowRevisions(workflowId);
    setWorkflowRevisions(revisions);
    return revisions;
  }, [selectedWorkflow]);

  useEffect(() => {
    setWorkflowDryRun(selectedWorkflow ? validateWorkflowDraft(selectedWorkflow) : validateWorkflowDraft(""));
    void refreshWorkflowRevisions(selectedWorkflow?.id || "");
  }, [refreshWorkflowRevisions, selectedWorkflow]);

  const deleteWorkflow = useCallback(
    async (workflowId = selectedWorkflow?.id || "") => {
      if (!workflowId || !window.radar?.deleteWorkflow) {
        return null;
      }
      const result = await window.radar.deleteWorkflow(workflowId);
      setWorkflows(result.workflows);
      setSelectedWorkflowId((current) => (current === workflowId ? result.workflows[0]?.id || "" : current));
      setNotice(result.ok ? "Workflow deleted" : "Built-in workflows cannot be deleted");
      return result;
    },
    [selectedWorkflow]
  );

  const runWorkflow = useCallback(
    async (workflowId = selectedWorkflow?.id || "", inputs: Record<string, string> = {}) => {
      if (!workflowId || !window.radar?.runWorkflow) {
        setNotice("Run in Electron to execute workflows.");
        return null;
      }
      const run = await window.radar.runWorkflow({ workflowId, inputs, source: "manual" });
      setWorkflowRuns((items) => [run, ...items.filter((item) => item.id !== run.id)]);
      setSelectedWorkflowRunId(run.id);
      setActiveView("workflows");
      setNotice(run.status === "completed" ? `Workflow complete: ${run.results.length} results` : run.error || "Workflow failed");
      return run;
    },
    [selectedWorkflow]
  );

  const promoteWorkflowResultToFinding = useCallback(async (runId: string, resultId: string) => {
    if (!window.radar?.promoteWorkflowResultToFinding) {
      setNotice("Run in Electron to promote workflow results.");
      return null;
    }
    try {
      const finding = await window.radar.promoteWorkflowResultToFinding({ runId, resultId });
      setFindings((items) => [finding, ...items.filter((item) => item.id !== finding.id)]);
      setSelectedFindingId(finding.id);
      setActiveView("findings");
      setNotice("Workflow result promoted to draft finding");
      return finding;
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Workflow finding promotion failed");
      return null;
    }
  }, []);

  const previewPluginInstall = useCallback(async () => {
    if (!pluginInstallPath.trim() || !window.radar?.previewPluginInstall) {
      setNotice("Enter a local plugin folder before previewing.");
      return null;
    }
    try {
      const preview = await window.radar.previewPluginInstall(pluginInstallPath.trim());
      setPluginInstallPreview(preview);
      setNotice(`Plugin preview ready: ${preview.manifest.name}`);
      return preview;
    } catch (error) {
      setPluginInstallPreview(null);
      setNotice(error instanceof Error ? error.message : "Plugin preview failed");
      return null;
    }
  }, [pluginInstallPath]);

  const installPlugin = useCallback(async () => {
    if (!pluginInstallPath.trim() || !window.radar?.installPlugin) {
      setNotice("Enter a local plugin folder before installing.");
      return null;
    }
    try {
      const plugin = await window.radar.installPlugin(pluginInstallPath.trim());
      const nextPlugins = await (window.radar.getPlugins?.() ?? Promise.resolve([plugin]));
      setPlugins(nextPlugins);
      setPluginInstallPreview(null);
      setNotice(`Plugin installed pending approval: ${plugin.manifest.name}`);
      return plugin;
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Plugin install failed");
      return null;
    }
  }, [pluginInstallPath]);

  const approvePlugin = useCallback(async (pluginId: string, permissions: PluginPermission[]) => {
    if (!pluginId || !window.radar?.approvePlugin) {
      setNotice("Run in Electron to approve plugins.");
      return null;
    }
    try {
      const plugin = await window.radar.approvePlugin({ id: pluginId, permissions });
      setPlugins((items) => [plugin, ...items.filter((item) => item.id !== plugin.id)]);
      setNotice(`Plugin approved: ${plugin.manifest.name}`);
      return plugin;
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Plugin approval failed");
      return null;
    }
  }, []);

  const setPluginStatus = useCallback(async (pluginId: string, status: PluginInstallStatus) => {
    if (!pluginId || !window.radar?.setPluginStatus) {
      setNotice("Run in Electron to update plugin status.");
      return null;
    }
    try {
      const plugin = await window.radar.setPluginStatus({ id: pluginId, status });
      setPlugins((items) => [plugin, ...items.filter((item) => item.id !== plugin.id)]);
      setNotice(`Plugin ${status}: ${plugin.manifest.name}`);
      return plugin;
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Plugin status update failed");
      return null;
    }
  }, []);

  const removePlugin = useCallback(async (pluginId: string) => {
    if (!pluginId || !window.radar?.removePlugin) {
      setNotice("Run in Electron to remove plugins.");
      return null;
    }
    try {
      const result = await window.radar.removePlugin(pluginId);
      setPlugins(result.plugins);
      setNotice(result.ok ? "Plugin removed" : "Plugin remove failed");
      return result;
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Plugin remove failed");
      return null;
    }
  }, []);

  const refreshPluginAudit = useCallback(async () => {
    if (!window.radar?.getPluginAudit) {
      setPluginAudit([]);
      return [];
    }
    const audit = await window.radar.getPluginAudit();
    setPluginAudit(audit);
    return audit;
  }, []);

  const runPluginApiRequest = useCallback(async () => {
    if (!window.radar?.runPluginApiAction) {
      setNotice("Run in Electron to execute plugin API actions.");
      return null;
    }
    try {
      const request = JSON.parse(pluginApiRequestText || "{}") as PluginApiRequest;
      const result = await window.radar.runPluginApiAction(request);
      setPluginApiResult(result);
      await refreshPluginAudit();
      setNotice(result.ok ? `Plugin action complete: ${result.action}` : result.error || "Plugin action failed");
      return result;
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Plugin API request must be valid JSON.");
      return null;
    }
  }, [pluginApiRequestText, refreshPluginAudit]);

  const renderPluginPanel = useCallback(
    async (pluginId: string, panelId: string) => {
      if (!pluginId || !panelId || !window.radar?.renderPluginPanel) {
        setNotice("Run in Electron to render plugin panels.");
        return null;
      }
      const render = await window.radar.renderPluginPanel({ pluginId, panelId });
      setPluginPanelRender(render);
      await refreshPluginAudit();
      setNotice(render.ok ? `Panel ready: ${render.title}` : render.error || "Plugin panel render failed");
      return render;
    },
    [refreshPluginAudit]
  );

  const validatePluginDeveloperSource = useCallback(async () => {
    if (!pluginInstallPath.trim() || !window.radar?.validatePlugin) {
      setNotice("Enter a local plugin folder before validation.");
      return null;
    }
    const validation = await window.radar.validatePlugin(pluginInstallPath.trim());
    setPluginDeveloperValidation(validation);
    await refreshPluginAudit();
    setNotice(validation.ok ? "Plugin developer validation passed" : "Plugin developer validation failed");
    return validation;
  }, [pluginInstallPath, refreshPluginAudit]);

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
          nextAgentRunMemory,
          nextSavedFilters,
          nextProjectNotes,
          nextSavedViews,
          nextEvidenceAnnotations,
          nextFindings,
          nextWorkflows,
          nextWorkflowRuns,
          nextPlugins,
          nextPluginAudit,
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
          window.radar.getAgentRunMemory?.() ?? [],
          window.radar.getSavedFilters?.() ?? [],
          window.radar.getProjectNotes?.() ?? [],
          window.radar.getSavedViews?.() ?? [],
          window.radar.getEvidenceAnnotations?.() ?? [],
          window.radar.getFindings?.() ?? [],
          window.radar.getWorkflows?.() ?? [],
          window.radar.getWorkflowRuns?.() ?? [],
          window.radar.getPlugins?.() ?? [],
          window.radar.getPluginAudit?.() ?? [],
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
        setAgentRunMemory(nextAgentRunMemory);
        setSavedFilters(nextSavedFilters);
        setProjectNotes(nextProjectNotes);
        setSelectedProjectNoteId(nextProjectNotes[0]?.id || "");
        setProjectNoteTitle(nextProjectNotes[0]?.title || "");
        setProjectNoteBody(nextProjectNotes[0]?.body || "");
        setSavedViews(nextSavedViews);
        setSavedViewName("");
        setSavedViewDescription("");
        setBundleExportPreview(null);
        setBundleImportPath("");
        setBundleImportPreview(null);
        setHandoffTitle("");
        setHandoffPreview(null);
        setEvidenceAnnotations(nextEvidenceAnnotations);
        setFindings(nextFindings);
        setSelectedFindingId(nextFindings[0]?.id || "");
        setFindingReport(null);
        setWorkflows(nextWorkflows);
        setSelectedWorkflowId(nextWorkflows[0]?.id || "");
        setAiPreparedWorkflowDraft(null);
        setWorkflowRuns(nextWorkflowRuns);
        setSelectedWorkflowRunId(nextWorkflowRuns[0]?.id || "");
        setWorkflowDryRun(nextWorkflows[0] ? validateWorkflowDraft(nextWorkflows[0]) : validateWorkflowDraft(""));
        setWorkflowRevisions([]);
        setPlugins(nextPlugins);
        setPluginInstallPreview(null);
        setPluginAudit(nextPluginAudit);
        setPluginApiResult(null);
        setPluginPanelRender(null);
        setPluginDeveloperValidation(null);
        setPluginApiRequestText(
          nextPlugins[0]
            ? JSON.stringify({ pluginId: nextPlugins[0].id, action: "captures:list", input: { query: "" } }, null, 2)
            : ""
        );
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
      setNotice("Run in Electron to create a project.");
      return;
    }
    const context = await window.radar.createLocalProfile(profileName);
    await applyLocalContext(context, `Project opened: ${context.profile.name}`);
  }, [applyLocalContext, profileName]);

  const saveLocalProfile = useCallback(async () => {
    if (!window.radar || !localContext) {
      setNotice("Run in Electron to save a project.");
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
    setNotice(`Project saved: ${profile.name}`);
  }, [localContext, profileName, refreshLocalLists]);

  const loadLocalProfile = useCallback(
    async (profileId: string) => {
      if (!window.radar) {
        setNotice("Run in Electron to load a project.");
        return;
      }
      const context = await window.radar.loadLocalProfile(profileId);
      await applyLocalContext(context, `Project loaded: ${context.profile.name}`);
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

  const seedDemoProject = useCallback(async () => {
    if (!window.radar?.seedDemoProject) {
      setNotice("Run in Electron to load demo data.");
      return;
    }
    const context = await window.radar.seedDemoProject();
    await applyLocalContext(context, `Demo project loaded: ${context.session.name}`);
  }, [applyLocalContext]);

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

  const activeAgentRun = useMemo(
    () => agentRuns.find((run) => run.id === selectedAgentRunId) || agentRuns[0] || null,
    [agentRuns, selectedAgentRunId]
  );
  const executingAgentRun = useMemo(() => agentRuns.find((run) => isActiveAgentRun(run)) || null, [agentRuns]);
  useEffect(() => {
    if (agentRuns.length === 0) {
      setSelectedAgentRunId("");
      return;
    }
    if (!agentRuns.some((run) => run.id === selectedAgentRunId)) {
      setSelectedAgentRunId(agentRuns[0]?.id || "");
    }
  }, [agentRuns, selectedAgentRunId]);
  const selectedAgentRunProfile = useMemo(() => getAgentRunProfile(agentProfileId), [agentProfileId]);
  const activeAgentBudgetLabels = useMemo(
    () => agentBudgetLabels(activeAgentRun?.policy || selectedAgentRunProfile.policy),
    [activeAgentRun?.policy, selectedAgentRunProfile.policy]
  );
  const filteredAgentRunMemory = useMemo(() => {
    const query = agentRunMemorySearch.trim().toLowerCase();
    if (!query) {
      return agentRunMemory;
    }
    return agentRunMemory.filter((entry) =>
      [entry.title, entry.notes, entry.kind, entry.status, entry.evidenceRefs.join(" ")]
        .join(" ")
        .toLowerCase()
        .includes(query)
    );
  }, [agentRunMemory, agentRunMemorySearch]);

  const setAppMode = useCallback(
    (mode: AppMode) => {
      setAppModeState(mode);
      window.localStorage.setItem("radar.appMode", mode);
      if (mode === "manual-first" && executingAgentRun) {
        void window.radar?.stopAgentRun(executingAgentRun.id).then((run) => {
          if (run) {
            setAgentRuns((items) => [run, ...items.filter((item) => item.id !== run.id)]);
          }
        });
      }
    },
    [executingAgentRun]
  );

  const startAgentRun = useCallback(async () => {
    if (!window.radar) {
      setNotice("Run in Electron to start an agent run.");
      return;
    }
    if (executingAgentRun) {
      setSelectedAgentRunId(executingAgentRun.id);
      setNotice("An AI-First run is already active. Pause or stop it before starting another run.");
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
        const draftTargets = targetText
          .split("\n")
          .map((item) => item.trim())
          .filter(Boolean);
        const proposedTargets = [...new Set([...latestTargets, ...draftTargets, scopeOrigin])];
        setTargetText(proposedTargets.join("\n"));
        setActiveView("scope");
        setNotice(
          `Scope consent required: review ${scopeOrigin} in the Scope editor and Commit it before starting AI-First. Then start the run again.`
        );
        return;
      }
    }

    const run = await window.radar.startAgentRun({
      goal,
      startUrl,
      profileId: agentProfileId
    });
    setAddress(startUrl);
    setAgentRuns((items) => [run, ...items.filter((item) => item.id !== run.id)]);
    setSelectedAgentRunId(run.id);
    setAgentGoal("");
    setNotice(scopeOrigin ? `AI-First run started on ${scopeOrigin}` : "AI-First run started");
  }, [address, agentGoal, agentProfileId, executingAgentRun, targetText]);

  const stopAgentRun = useCallback(async () => {
    if (!window.radar || !activeAgentRun) {
      return;
    }
    const run = await window.radar.stopAgentRun(activeAgentRun.id);
    if (run) {
      setAgentRuns((items) => [run, ...items.filter((item) => item.id !== run.id)]);
    }
  }, [activeAgentRun]);

  const pauseAgentRun = useCallback(async () => {
    if (!window.radar || !activeAgentRun) {
      return;
    }
    try {
      const run = await window.radar.pauseAgentRun(activeAgentRun.id);
      if (run) {
        setAgentRuns((items) => [run, ...items.filter((item) => item.id !== run.id)]);
        setNotice("AI-First run paused with budgets and checkpoint preserved.");
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Agent run could not be paused.");
    }
  }, [activeAgentRun]);

  const resumeAgentRun = useCallback(async () => {
    if (!window.radar || !activeAgentRun) {
      return;
    }
    try {
      const run = await window.radar.resumeAgentRun(activeAgentRun.id);
      if (run) {
        setAgentRuns((items) => [run, ...items.filter((item) => item.id !== run.id)]);
        setNotice("AI-First run queued from its durable checkpoint.");
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Agent run could not be resumed.");
    }
  }, [activeAgentRun]);

  const recoverAgentRun = useCallback(
    async (entryId: string, action: AgentRunRecoveryAction) => {
      const run = activeAgentRun;
      const entry = run?.timeline.find((item) => item.id === entryId);
      if (!window.radar || !run || !entry) {
        return;
      }
      if (action === "stop-run") {
        await stopAgentRun();
        return;
      }
      try {
        const recovered = await window.radar.recoverAgentRun(run.id, { action, entryId });
        if (recovered) {
          setAgentRuns((items) => [recovered, ...items.filter((item) => item.id !== recovered.id)]);
        }
        if (action === "draft-finding") {
          const tool = entry.toolCall?.tool || entry.toolResult?.tool || "failed step";
          setAgentGoal(`Create an evidence-backed draft finding from ${tool}.\n\nOriginal goal: ${run.goal}`);
          setNotice("Draft-finding prompt prepared from the selected failed step.");
          return;
        }
        setNotice(
          action === "skip-and-continue"
            ? "Failed step skipped; the run is continuing from its checkpoint."
            : "Recovery queued with preserved budgets and fresh visible state."
        );
      } catch (error) {
        setNotice(error instanceof Error ? error.message : "Agent recovery could not be started.");
      }
    },
    [activeAgentRun, stopAgentRun]
  );

  const steerAgentMission = useCallback(
    async (action: AgentMissionSteeringAction) => {
      const run = activeAgentRun;
      if (!window.radar || !run?.mission) {
        setNotice("Select a saved AI-First run with a Mission Graph before steering it.");
        return;
      }
      if (run.status !== "paused" && run.status !== "failed") {
        setNotice("Pause the run and wait for the active step to settle before steering its Mission Graph.");
        return;
      }
      const request = { ...action, expectedRevision: run.mission.revision } as AgentMissionSteeringRequest;
      try {
        const steered = await window.radar.steerAgentMission(run.id, request);
        if (steered) {
          setAgentRuns((items) => [steered, ...items.filter((item) => item.id !== steered.id)]);
          setSelectedAgentRunId(steered.id);
          setNotice(`Mission Graph updated to revision ${steered.mission?.revision ?? run.mission.revision}.`);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Mission steering could not be applied.";
        if (message.includes("revision")) {
          const refreshed = await window.radar.listAgentRuns();
          setAgentRuns(refreshed);
        }
        setNotice(message);
      }
    },
    [activeAgentRun]
  );

  const updateAgentCapabilities = useCallback(
    async (action: AgentCapabilityAction) => {
      const run = activeAgentRun;
      if (!window.radar || !run) {
        setNotice("Select a saved AI-First run before changing capability leases.");
        return;
      }
      if (run.status !== "paused" && run.status !== "failed") {
        setNotice("Pause the run and wait for the active step to settle before changing capability leases.");
        return;
      }
      const expectedRevision = run.capabilities?.revision || 0;
      const request = { ...action, expectedRevision } as AgentCapabilityActionRequest;
      try {
        const updated = await window.radar.updateAgentCapabilities(run.id, request);
        if (updated) {
          setAgentRuns((items) => [updated, ...items.filter((item) => item.id !== updated.id)]);
          setSelectedAgentRunId(updated.id);
          setNotice(`Capability ledger updated to revision ${updated.capabilities?.revision ?? expectedRevision}.`);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Capability lease action failed.";
        if (message.includes("revision")) {
          setAgentRuns(await window.radar.listAgentRuns());
        }
        setNotice(message);
      }
    },
    [activeAgentRun]
  );

  const saveAgentRunMemory = useCallback(async (entry: AgentRunMemoryEntry) => {
    if (!window.radar?.saveAgentRunMemory) {
      setNotice("Run in Electron to save run memory.");
      return null;
    }
    const saved = await window.radar.saveAgentRunMemory(entry);
    setAgentRunMemory((items) => [saved, ...items.filter((item) => item.id !== saved.id)]);
    setNotice(`Run memory saved: ${saved.title}`);
    return saved;
  }, []);

  const confirmAgentRunMemoryFromTimeline = useCallback(
    async (entryId: string) => {
      const memory = activeAgentRun?.timeline.find((entry) => entry.id === entryId)?.toolResult;
      if (!memory?.ok || memory.tool !== "proposeRunMemory") {
        return null;
      }
      return saveAgentRunMemory({ ...memory.data.memory, status: "confirmed", updatedAt: new Date().toISOString() });
    },
    [activeAgentRun, saveAgentRunMemory]
  );

  const dismissAgentRunMemoryFromTimeline = useCallback(
    async (entryId: string) => {
      const memory = activeAgentRun?.timeline.find((entry) => entry.id === entryId)?.toolResult;
      if (!memory?.ok || memory.tool !== "proposeRunMemory") {
        return null;
      }
      return saveAgentRunMemory({
        ...memory.data.memory,
        status: "dismissed",
        dismissedReason: memory.data.memory.dismissedReason || "Dismissed by operator from AI-First console.",
        updatedAt: new Date().toISOString()
      });
    },
    [activeAgentRun, saveAgentRunMemory]
  );

  const createAgentRunMemory = useCallback(
    async (input: { title: string; notes: string; kind?: AgentRunMemoryEntry["kind"]; evidenceRefs?: string[] }) => {
      const now = new Date().toISOString();
      const memory = normalizeAgentRunMemory(
        {
          id: `memory_${now.replace(/[^0-9]/g, "")}`,
          createdAt: now,
          updatedAt: now,
          kind: input.kind || "hypothesis",
          status: "confirmed",
          title: input.title,
          notes: input.notes,
          evidenceRefs: input.evidenceRefs || []
        },
        `memory_${now.replace(/[^0-9]/g, "")}`,
        now
      );
      return memory ? saveAgentRunMemory(memory) : null;
    },
    [saveAgentRunMemory]
  );

  const deleteAgentRunMemory = useCallback(async (entryId: string) => {
    if (!window.radar?.deleteAgentRunMemory) {
      setNotice("Run in Electron to delete run memory.");
      return null;
    }
    const result = await window.radar.deleteAgentRunMemory(entryId);
    setAgentRunMemory(result.memory);
    setNotice("Run memory deleted");
    return result;
  }, []);

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

      if (entry.toolResult?.tool === "prepareWorkflowDraft" && entry.toolResult.ok) {
        setAiPreparedWorkflowDraft(entry.toolResult.data.workflow);
        setSelectedWorkflowId(entry.toolResult.data.workflow.id);
        setActiveView("workflows");
        setNotice(entry.toolResult.data.note);
      }

      if (entry.toolResult?.tool === "proposeRunMemory" && entry.toolResult.ok) {
        setNotice(`AI proposed run memory: ${entry.toolResult.data.memory.title}`);
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

  const advancedSummary = useMemo(
    () => buildAdvancedTestingSummary(scopedTrafficCaptures, scopedWebSocketEvents, advancedImportText, targets[0] || ""),
    [advancedImportText, scopedTrafficCaptures, scopedWebSocketEvents, targets]
  );

  const saveAdvancedImportAsCollection = useCallback(async () => {
    if (!advancedSummary.apiImport.ok || advancedSummary.apiImport.replayTemplates.length === 0) {
      setNotice("Paste a supported OpenAPI or Postman document before saving a collection.");
      return null;
    }
    const now = new Date().toISOString();
    const collectionName = advancedSummary.apiImport.drafts[0]?.collectionName || "Advanced import";
    const collection: ReplayCollection = {
      id: `collection-advanced-${now.replace(/[^0-9]/g, "")}`,
      name: collectionName,
      items: advancedSummary.apiImport.drafts.map((draft, index) => ({
        ...createCollectionItem(draft.path || `Imported request ${index + 1}`, advancedSummary.apiImport.replayTemplates[index], now),
        id: `item-advanced-${now.replace(/[^0-9]/g, "")}-${index + 1}`,
        tags: ["advanced-import", draft.sourceType, ...draft.tags].slice(0, 12)
      })),
      createdAt: now,
      updatedAt: now
    };
    const next = normalizeReplayCollections([collection, ...replayCollections], now);
    await saveReplayCollectionsState(next);
    setActiveView("repeater");
    setNotice(`Saved ${collection.items.length} imported templates to ${collection.name}`);
    return collection;
  }, [advancedSummary.apiImport, replayCollections, saveReplayCollectionsState]);

  const loadAdvancedImportDraftToRepeater = useCallback(
    (draftId?: string) => {
      const draft =
        advancedSummary.apiImport.drafts.find((item) => item.id === draftId) ||
        advancedSummary.apiImport.drafts[0] ||
        null;
      if (!draft) {
        setNotice("Paste a supported API import before loading a template.");
        return;
      }
      const replayDraft = { method: draft.method, url: draft.url, headers: draft.headers, body: draft.body };
      setDraft(replayDraft);
      setHeadersText(formatHeaders(replayDraft.headers));
      setLastResponse(null);
      setLastBurst(null);
      setActiveView("repeater");
      setNotice(`Loaded imported ${draft.method} ${draft.path} in Repeater`);
    },
    [advancedSummary.apiImport.drafts, setDraft]
  );

  const prepareAdvancedWorkflowDraft = useCallback(
    (
      kind: "api-import" | "graphql" | "auth-row" | "parameter" | "header-signal" | "secret",
      id?: string
    ) => {
      let workflow: WorkflowDefinition | null = null;
      if (kind === "api-import") {
        workflow = workflowDraftFromApiImport(advancedSummary.apiImport);
      } else if (kind === "graphql") {
        const operation =
          advancedSummary.graphql.operations.find((item) => item.id === id) || advancedSummary.graphql.operations[0];
        workflow = operation ? workflowDraftFromGraphQlOperation(operation) : null;
      } else if (kind === "auth-row") {
        const row = advancedSummary.authMatrix.find((item) => item.id === id) || advancedSummary.authMatrix[0];
        workflow = row ? workflowDraftFromAuthMatrixRow(row) : null;
      } else if (kind === "parameter") {
        const parameter = advancedSummary.parameters.find((item) => item.id === id) || advancedSummary.parameters[0];
        workflow = parameter ? workflowDraftFromParameter(parameter) : null;
      } else if (kind === "header-signal") {
        const signal = advancedSummary.headerSignals.find((item) => item.id === id) || advancedSummary.headerSignals[0];
        workflow = signal ? workflowDraftFromHeaderSignal(signal) : null;
      } else {
        const secret = advancedSummary.secrets.find((item) => item.id === id) || advancedSummary.secrets[0];
        workflow = secret ? workflowDraftFromSecret(secret) : null;
      }
      if (!workflow) {
        setNotice("No Advanced signal is available for a workflow draft.");
        return null;
      }
      setAiPreparedWorkflowDraft(workflow);
      setSelectedWorkflowId(workflow.id);
      setActiveView("workflows");
      setNotice(`Prepared workflow draft: ${workflow.name}`);
      return workflow;
    },
    [advancedSummary]
  );

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

  const selectedProjectNote = useMemo(
    () => projectNotes.find((note) => note.id === selectedProjectNoteId) || null,
    [projectNotes, selectedProjectNoteId]
  );

  const selectProjectNote = useCallback(
    (noteId: string) => {
      const note = projectNotes.find((item) => item.id === noteId) || null;
      setSelectedProjectNoteId(note?.id || "");
      setProjectNoteTitle(note?.title || "");
      setProjectNoteBody(note?.body || "");
    },
    [projectNotes]
  );

  const startProjectNote = useCallback(() => {
    setSelectedProjectNoteId("");
    setProjectNoteTitle("");
    setProjectNoteBody("");
  }, []);

  const saveProjectNote = useCallback(async () => {
    if (!window.radar?.saveProjectNote) {
      setNotice("Run in Electron to save project notes.");
      return null;
    }
    const title = projectNoteTitle.trim();
    const body = projectNoteBody.trim();
    if (!title && !body) {
      setNotice("Add a title or body before saving a project note.");
      return null;
    }
    const now = new Date().toISOString();
    const existing = projectNotes.find((note) => note.id === selectedProjectNoteId);
    const saved = await window.radar.saveProjectNote({
      id: existing?.id || `note-${Date.now()}`,
      title,
      body,
      createdAt: existing?.createdAt || now,
      updatedAt: now
    });
    setProjectNotes((items) => [saved, ...items.filter((note) => note.id !== saved.id)]);
    setSelectedProjectNoteId(saved.id);
    setProjectNoteTitle(saved.title);
    setProjectNoteBody(saved.body);
    setNotice(`Project note saved: ${saved.title}`);
    return saved;
  }, [projectNoteBody, projectNoteTitle, projectNotes, selectedProjectNoteId]);

  const deleteProjectNote = useCallback(
    async (noteId = selectedProjectNoteId) => {
      if (!noteId || !window.radar?.deleteProjectNote) {
        return;
      }
      const result = await window.radar.deleteProjectNote(noteId);
      setProjectNotes(result.notes);
      const next = result.notes[0] || null;
      setSelectedProjectNoteId(next?.id || "");
      setProjectNoteTitle(next?.title || "");
      setProjectNoteBody(next?.body || "");
      setNotice(result.ok ? "Project note deleted" : "Project note delete failed");
    },
    [selectedProjectNoteId]
  );

  const currentSavedViewState = useCallback(() => {
    const entries: Array<[string, string | undefined]> = [
      ["trafficQuery", trafficSearch],
      ["webSocketQuery", webSocketSearch],
      ["trafficMethodFilter", trafficMethodFilter === "all" ? "" : trafficMethodFilter],
      ["trafficTypeFilter", trafficTypeFilter === "all" ? "" : trafficTypeFilter],
      ["selectedCaptureId", selectedId],
      ["selectedFindingId", selectedFindingId],
      ["selectedWorkflowId", selectedWorkflowId],
      ["selectedWorkflowRunId", selectedWorkflowRunId],
      ["replayTabId", replayTabState.activeTabId],
      ["sitemapNodeId", selectedSitemapNodeId],
      ["diffBaselineSessionId", diffBaselineSessionId],
      ["automateSessionId", activeAutomateSessionId]
    ];
    return Object.fromEntries(entries.filter(([, value]) => Boolean(value))) as Record<string, string>;
  }, [
    activeAutomateSessionId,
    diffBaselineSessionId,
    replayTabState.activeTabId,
    selectedFindingId,
    selectedId,
    selectedSitemapNodeId,
    selectedWorkflowId,
    selectedWorkflowRunId,
    trafficMethodFilter,
    trafficSearch,
    trafficTypeFilter,
    webSocketSearch
  ]);

  const saveCurrentView = useCallback(async () => {
    if (!window.radar?.saveSavedView) {
      setNotice("Run in Electron to save project views.");
      return null;
    }
    const now = new Date().toISOString();
    const name = savedViewName.trim() || `${viewMeta[activeView].title} ${now.slice(0, 16).replace("T", " ")}`;
    const saved = await window.radar.saveSavedView({
      id: `view-${Date.now()}`,
      name,
      view: activeView as SavedViewTarget,
      description: savedViewDescription.trim(),
      state: currentSavedViewState(),
      createdAt: now,
      updatedAt: now
    });
    setSavedViews((items) => [saved, ...items.filter((view) => view.id !== saved.id)]);
    setSavedViewName("");
    setSavedViewDescription("");
    setNotice(`Saved view: ${saved.name}`);
    return saved;
  }, [activeView, currentSavedViewState, savedViewDescription, savedViewName]);

  const applySavedView = useCallback(
    (view: SavedView) => {
      const state = view.state;
      setActiveView(view.view);
      if (state.trafficQuery !== undefined) {
        setTrafficSearch(state.trafficQuery);
      }
      if (state.webSocketQuery !== undefined) {
        setWebSocketSearch(state.webSocketQuery);
      }
      setTrafficMethodFilter(state.trafficMethodFilter || "all");
      setTrafficTypeFilter(state.trafficTypeFilter || "all");
      if (state.selectedCaptureId) {
        setSelectedId(state.selectedCaptureId);
        setSelectedIds([state.selectedCaptureId]);
        selectionAnchorRef.current = state.selectedCaptureId;
      }
      if (state.selectedFindingId) {
        setSelectedFindingId(state.selectedFindingId);
      }
      if (state.selectedWorkflowId) {
        setSelectedWorkflowId(state.selectedWorkflowId);
      }
      if (state.selectedWorkflowRunId) {
        setSelectedWorkflowRunId(state.selectedWorkflowRunId);
      }
      if (state.sitemapNodeId) {
        setSelectedSitemapNodeId(state.sitemapNodeId);
      }
      if (state.diffBaselineSessionId) {
        setDiffBaselineSessionId(state.diffBaselineSessionId);
      }
      if (state.automateSessionId) {
        setActiveAutomateSessionId(state.automateSessionId);
      }
      if (state.replayTabId && replayTabState.tabs.some((tab) => tab.id === state.replayTabId)) {
        void selectReplayTab(state.replayTabId);
      }
      setProjectArtifactsOpen(false);
      setNotice(`Opened saved view: ${view.name}`);
    },
    [replayTabState.tabs, selectReplayTab]
  );

  const deleteSavedView = useCallback(async (viewId: string) => {
    if (!viewId || !window.radar?.deleteSavedView) {
      return;
    }
    const result = await window.radar.deleteSavedView(viewId);
    setSavedViews(result.views);
    setNotice(result.ok ? "Saved view deleted" : "Saved view delete failed");
  }, []);

  const projectBundleOptions = useMemo(
    () => ({
      redaction: bundleRedaction,
      includeReplayCollections: bundleIncludeReplayCollections,
      includePlugins: bundleIncludePlugins
    }),
    [bundleIncludePlugins, bundleIncludeReplayCollections, bundleRedaction]
  );

  const previewProjectBundleExport = useCallback(async () => {
    if (!window.radar?.previewProjectBundleExport) {
      setNotice("Run in Electron to preview project bundles.");
      return null;
    }
    setBundleActionPending(true);
    try {
      const preview = await window.radar.previewProjectBundleExport(projectBundleOptions);
      setBundleExportPreview(preview);
      setNotice(preview.ok ? "Project bundle export preview ready" : preview.error || "Project bundle preview failed");
      return preview;
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Project bundle preview failed");
      return null;
    } finally {
      setBundleActionPending(false);
    }
  }, [projectBundleOptions]);

  const writeProjectBundle = useCallback(async () => {
    if (!window.radar?.writeProjectBundle) {
      setNotice("Run in Electron to export project bundles.");
      return null;
    }
    setBundleActionPending(true);
    try {
      const result = await window.radar.writeProjectBundle(projectBundleOptions);
      setBundleExportPreview(result.preview);
      setNotice(result.ok ? `Project bundle exported${result.path ? `: ${result.path}` : ""}` : result.error || "Project bundle export failed");
      return result;
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Project bundle export failed");
      return null;
    } finally {
      setBundleActionPending(false);
    }
  }, [projectBundleOptions]);

  const previewProjectBundleImport = useCallback(async () => {
    if (!window.radar?.previewProjectBundleImport) {
      setNotice("Run in Electron to preview project bundle imports.");
      return null;
    }
    setBundleActionPending(true);
    try {
      const preview = await window.radar.previewProjectBundleImport({ sourcePath: bundleImportPath.trim() || undefined });
      setBundleImportPreview(preview);
      setNotice(preview.ok ? "Project bundle import preview ready" : preview.error || "Project bundle import preview failed");
      return preview;
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Project bundle import preview failed");
      return null;
    } finally {
      setBundleActionPending(false);
    }
  }, [bundleImportPath]);

  const applyProjectBundleImport = useCallback(async () => {
    if (!window.radar?.applyProjectBundleImport) {
      setNotice("Run in Electron to import project bundles.");
      return null;
    }
    setBundleActionPending(true);
    try {
      const result = await window.radar.applyProjectBundleImport({ sourcePath: bundleImportPath.trim() || undefined });
      setNotice(result.message);
      if (result.ok && window.radar.getLocalContext) {
        const context = await window.radar.getLocalContext();
        await applyLocalContext(context);
      }
      return result;
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Project bundle import failed");
      return null;
    } finally {
      setBundleActionPending(false);
    }
  }, [applyLocalContext, bundleImportPath]);

  const handoffOptions = useMemo(
    () => ({
      title: handoffTitle,
      redaction: bundleRedaction,
      includeDraftFindings: handoffIncludeDraftFindings,
      includeProjectNotes: handoffIncludeProjectNotes,
      includeReplayCollections: bundleIncludeReplayCollections,
      includeWorkflows: handoffIncludeWorkflows
    }),
    [
      bundleIncludeReplayCollections,
      bundleRedaction,
      handoffIncludeDraftFindings,
      handoffIncludeProjectNotes,
      handoffIncludeWorkflows,
      handoffTitle
    ]
  );

  const previewHandoffPackage = useCallback(async () => {
    if (!window.radar?.previewHandoffPackage) {
      setNotice("Run in Electron to preview handoff packages.");
      return null;
    }
    setBundleActionPending(true);
    try {
      const preview = await window.radar.previewHandoffPackage(handoffOptions);
      setHandoffPreview(preview);
      setNotice(preview.ok ? "Handoff package preview ready" : preview.error || "Handoff preview failed");
      return preview;
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Handoff preview failed");
      return null;
    } finally {
      setBundleActionPending(false);
    }
  }, [handoffOptions]);

  const writeHandoffPackage = useCallback(async () => {
    if (!window.radar?.writeHandoffPackage) {
      setNotice("Run in Electron to export handoff packages.");
      return null;
    }
    setBundleActionPending(true);
    try {
      const result = await window.radar.writeHandoffPackage(handoffOptions);
      setHandoffPreview(result.preview);
      setNotice(result.ok ? `Handoff package exported${result.path ? `: ${result.path}` : ""}` : result.error || "Handoff export failed");
      return result;
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Handoff export failed");
      return null;
    } finally {
      setBundleActionPending(false);
    }
  }, [handoffOptions]);

  const runGlobalSearch = useCallback(async (query = globalSearchQuery) => {
    const nextQuery = query.trim();
    setGlobalSearchQuery(query);
    if (!window.radar?.searchGlobal) {
      setGlobalSearchError("Run in Electron to search the local project.");
      setGlobalSearchResult(null);
      return null;
    }
    setGlobalSearchPending(true);
    try {
      const result = await window.radar.searchGlobal({ query: nextQuery, limit: 40 });
      setGlobalSearchResult(result);
      setGlobalSearchError(result.ok ? "" : result.error || "Global search failed.");
      return result;
    } catch (error) {
      setGlobalSearchResult(null);
      setGlobalSearchError(error instanceof Error ? error.message : "Global search failed.");
      return null;
    } finally {
      setGlobalSearchPending(false);
    }
  }, [globalSearchQuery]);

  const openGlobalSearch = useCallback(() => {
    setGlobalSearchOpen(true);
    if (globalSearchQuery.trim() || !globalSearchResult) {
      void runGlobalSearch(globalSearchQuery);
    }
  }, [globalSearchQuery, globalSearchResult, runGlobalSearch]);

  const openGlobalSearchResult = useCallback(
    (result: GlobalSearchResult) => {
      const target = result.target;
      setGlobalSearchOpen(false);

      if (result.kind === "saved-view") {
        const view = savedViews.find((item) => item.id === result.refId);
        if (view) {
          applySavedView(view);
          return;
        }
      }

      if (target.view === "notes") {
        setProjectArtifactsOpen(true);
        if (target.id) {
          selectProjectNote(target.id);
        }
        setNotice(`Opened ${result.kind}: ${result.title}`);
        return;
      }

      if (target.query) {
        if (target.view === "websocket") {
          setWebSocketSearch(target.query);
        } else {
          setTrafficSearch(target.query);
        }
      }

      if (target.view === "traffic") {
        setActiveView("traffic");
        if (target.id) {
          setSelectedId(target.id);
          setSelectedIds([target.id]);
          selectionAnchorRef.current = target.id;
        }
      } else if (target.view === "websocket") {
        setActiveView("websocket");
      } else if (target.view === "repeater") {
        setActiveView("repeater");
        if (target.id && replayTabState.tabs.some((tab) => tab.id === target.id)) {
          void selectReplayTab(target.id);
        }
      } else if (target.view === "findings") {
        setActiveView("findings");
        if (target.id) {
          setSelectedFindingId(target.id);
        }
      } else if (target.view === "workflows") {
        setActiveView("workflows");
        if (target.id) {
          setSelectedWorkflowId(target.id);
        }
        if (target.secondaryId) {
          setSelectedWorkflowRunId(target.secondaryId);
        }
      } else if (target.view === "plugins") {
        setActiveView("plugins");
      } else if (target.view === "advanced") {
        setActiveView("advanced");
      } else if (target.view === "sitemap") {
        setActiveView("sitemap");
      } else if (target.view === "scope") {
        setActiveView("scope");
      } else if (target.view === "intercept") {
        setActiveView("intercept");
      } else if (target.view === "automate") {
        setActiveView("automate");
      } else if (target.view === "ssl") {
        setActiveView("ssl");
      }

      setNotice(`Opened ${result.kind}: ${result.title}`);
    },
    [applySavedView, replayTabState.tabs, savedViews, selectProjectNote, selectReplayTab]
  );

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

  const refreshIdentityLab = useCallback(async () => {
    if (!window.radar?.listIdentityProfiles || !localContext) return;
    const [nextProfiles, nextActivations] = await Promise.all([
      window.radar.listIdentityProfiles(),
      window.radar.listIdentityActivations?.() ?? []
    ]);
    setIdentityProfiles(nextProfiles);
    setIdentityActivations(nextActivations);
  }, [localContext]);

  useEffect(() => {
    void refreshIdentityLab();
  }, [refreshIdentityLab]);

  const createIdentityLabProfile = useCallback(
    async (draft: IdentityProfileDraft) => {
      if (!window.radar?.createIdentityProfile) return;
      setIdentityBusy(true);
      try {
        const profile = await window.radar.createIdentityProfile(draft);
        setIdentityProfiles((items) => [profile, ...items.filter((item) => item.id !== profile.id)]);
        setNotice(`Identity created: ${profile.label}`);
      } finally {
        setIdentityBusy(false);
      }
    },
    []
  );

  const updateIdentityLabProfile = useCallback(async (profile: IdentityProfile) => {
    if (!window.radar?.updateIdentityProfile) return;
    setIdentityBusy(true);
    try {
      const next = await window.radar.updateIdentityProfile({
        id: profile.id,
        draft: {
          label: profile.label,
          kind: profile.kind,
          roleLabel: profile.roleLabel,
          tenantLabel: profile.tenantLabel,
          origin: profile.origin,
          notes: profile.notes,
          refreshMode: profile.refreshMode,
          refreshWorkflowId: profile.refreshWorkflowId,
          maxHealthAgeMs: profile.maxHealthAgeMs
        }
      });
      setIdentityProfiles((items) => [next, ...items.filter((item) => item.id !== next.id)]);
      setNotice(`Identity updated: ${next.label}`);
    } finally {
      setIdentityBusy(false);
    }
  }, []);

  const activateIdentityLabProfile = useCallback(async (identityId: string) => {
    if (!window.radar?.activateIdentityProfile) return;
    setIdentityBusy(true);
    try {
      const result = await window.radar.activateIdentityProfile({ identityId });
      setIdentityProfiles((items) => [result.identity, ...items.filter((item) => item.id !== result.identity.id)]);
      await refreshIdentityLab();
      setBrowserState(await window.radar.getBrowserState());
      setCaptures(await window.radar.getCaptures());
      setNotice(`Identity active: ${result.identity.label}`);
    } finally {
      setIdentityBusy(false);
    }
  }, [refreshIdentityLab]);

  const verifyIdentityLabProfile = useCallback(async (identityId: string) => {
    if (!window.radar?.verifyIdentityProfile) return;
    setIdentityBusy(true);
    try {
      const profile = await window.radar.verifyIdentityProfile(identityId);
      setIdentityProfiles((items) => [profile, ...items.filter((item) => item.id !== profile.id)]);
      await refreshIdentityLab();
      setCaptures(await window.radar.getCaptures());
      setNotice(`Identity health: ${profile.label} / ${profile.health}`);
    } finally {
      setIdentityBusy(false);
    }
  }, [refreshIdentityLab]);

  const archiveIdentityLabProfile = useCallback(async (identityId: string) => {
    if (!window.radar?.archiveIdentityProfile) return;
    setIdentityBusy(true);
    try {
      const result = await window.radar.archiveIdentityProfile(identityId);
      setIdentityProfiles(result.identities);
      await refreshIdentityLab();
      setNotice("Identity archived; browser profile data remains on disk.");
    } finally {
      setIdentityBusy(false);
    }
  }, [refreshIdentityLab]);

  const activeIdentityActivation = useMemo(
    () => identityActivations.find((activation) => activation.status === "active"),
    [identityActivations]
  );

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
        nextAgentRunMemory,
        nextFindings,
        nextWorkflows,
        nextWorkflowRuns,
        nextPlugins,
        nextPluginAudit,
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
        window.radar.getAgentRunMemory?.() ?? [],
        window.radar.getFindings?.() ?? [],
        window.radar.getWorkflows?.() ?? [],
        window.radar.getWorkflowRuns?.() ?? [],
        window.radar.getPlugins?.() ?? [],
        window.radar.getPluginAudit?.() ?? [],
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
      setAgentRunMemory(nextAgentRunMemory);
      setFindings(nextFindings);
      setSelectedFindingId(nextFindings[0]?.id || "");
      setWorkflows(nextWorkflows);
      setSelectedWorkflowId(nextWorkflows[0]?.id || "");
      setWorkflowRuns(nextWorkflowRuns);
      setSelectedWorkflowRunId(nextWorkflowRuns[0]?.id || "");
      setWorkflowDryRun(nextWorkflows[0] ? validateWorkflowDraft(nextWorkflows[0]) : validateWorkflowDraft(""));
      setWorkflowRevisions([]);
      setPlugins(nextPlugins);
      setPluginAudit(nextPluginAudit);
      setPluginApiRequestText(
        nextPlugins[0]
          ? JSON.stringify({ pluginId: nextPlugins[0].id, action: "captures:list", input: { query: "" } }, null, 2)
          : ""
      );
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
    let inFlight = false;
    const load = async () => {
      if (!window.radar || cancelled || inFlight) {
        return;
      }
      inFlight = true;
      try {
        const [nextProfiles, nextSessions] = await Promise.all([
          window.radar.listLocalProfiles(),
          window.radar.listLocalSessions(activeProfileId)
        ]);
        if (!cancelled) {
          setProfiles(nextProfiles);
          setSessions(nextSessions);
        }
      } finally {
        inFlight = false;
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
    let inFlight = false;
    const load = async () => {
      if (!window.radar || cancelled || inFlight) {
        return;
      }
      inFlight = true;
      try {
        const [
          nextCaptures,
          nextSslEvents,
          nextWebSocketEvents,
          nextBrowserState,
          nextProxyState,
          nextInterceptState,
          nextAgentRuns,
          nextAgentRunMemory,
          nextFindings,
          nextWorkflowRuns,
          nextAutomateSessions
        ] = await Promise.all([
          window.radar.getCaptures(),
          window.radar.getSslEvents(),
          loadWebSocketEvents(),
          window.radar.getBrowserState(),
          window.radar.getProxyState(),
          loadInterceptState(),
          window.radar.listAgentRuns(),
          window.radar.getAgentRunMemory?.() ?? [],
          window.radar.getFindings?.() ?? [],
          window.radar.getWorkflowRuns?.() ?? [],
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
          setAgentRunMemory(nextAgentRunMemory);
          setFindings(nextFindings);
          setSelectedFindingId((current) => current || nextFindings[0]?.id || "");
          setWorkflowRuns(nextWorkflowRuns);
          setSelectedWorkflowRunId((current) => current || nextWorkflowRuns[0]?.id || "");
          setAutomateSessions(nextAutomateSessions);
          setActiveAutomateSessionId((current) => current || nextAutomateSessions[0]?.id || "");
        }
      } finally {
        inFlight = false;
      }
    };

    load();
    const timer = setInterval(load, 1_500);
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
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "p") {
        event.preventDefault();
        openGlobalSearch();
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
  }, [activeView, openGlobalSearch, trafficMethodFilter, trafficSearch, trafficTypeFilter, webSocketSearch]);

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
    globalSearchOpen,
    setGlobalSearchOpen,
    globalSearchQuery,
    setGlobalSearchQuery,
    globalSearchResult,
    globalSearchPending,
    globalSearchError,
    openGlobalSearch,
    runGlobalSearch,
    openGlobalSearchResult,
    filteredWebSocketEvents,
    trafficSearchRef,
    savedFilters,
    saveSavedFilter,
    deleteSavedFilter,
    applySavedFilter,
    projectArtifactsOpen,
    setProjectArtifactsOpen,
    projectNotes,
    selectedProjectNote,
    selectedProjectNoteId,
    selectProjectNote,
    startProjectNote,
    projectNoteTitle,
    setProjectNoteTitle,
    projectNoteBody,
    setProjectNoteBody,
    saveProjectNote,
    deleteProjectNote,
    savedViews,
    savedViewName,
    setSavedViewName,
    savedViewDescription,
    setSavedViewDescription,
    saveCurrentView,
    applySavedView,
    deleteSavedView,
    bundleRedaction,
    setBundleRedaction,
    bundleIncludeReplayCollections,
    setBundleIncludeReplayCollections,
    bundleIncludePlugins,
    setBundleIncludePlugins,
    bundleExportPreview,
    bundleImportPath,
    setBundleImportPath,
    bundleImportPreview,
    bundleActionPending,
    previewProjectBundleExport,
    writeProjectBundle,
    previewProjectBundleImport,
    applyProjectBundleImport,
    handoffTitle,
    setHandoffTitle,
    handoffIncludeDraftFindings,
    setHandoffIncludeDraftFindings,
    handoffIncludeProjectNotes,
    setHandoffIncludeProjectNotes,
    handoffIncludeWorkflows,
    setHandoffIncludeWorkflows,
    handoffPreview,
    previewHandoffPackage,
    writeHandoffPackage,
    evidenceAnnotations,
    getEvidenceAnnotation,
    saveEvidenceAnnotation,
    findings,
    selectedFindingId,
    setSelectedFindingId,
    selectedFinding,
    findingTemplates: FINDING_TEMPLATES,
    findingReport,
    findingMergeSuggestions,
    findingRetestMatrix,
    saveFinding,
    saveFindingPatch,
    deleteFinding,
    createFindingFromCapture,
    createFindingFromWebSocket,
    promoteAutomateResultToFinding,
    attachSelectedCaptureToFinding,
    attachSelectedAutomateResultToFinding,
    mergeFindingPair,
    buildFindingReportPreview,
    workflows,
    selectedWorkflowId,
    setSelectedWorkflowId,
    selectedWorkflow,
    selectedWorkflowGraph,
    workflowStepTemplates: WORKFLOW_STEP_TEMPLATES,
    workflowDryRun,
    workflowRevisions,
    workflowRuns,
    selectedWorkflowRunId,
    setSelectedWorkflowRunId,
    selectedWorkflowRun,
    saveWorkflow,
    validateWorkflowEditor,
    refreshWorkflowRevisions,
    deleteWorkflow,
    runWorkflow,
    promoteWorkflowResultToFinding,
    plugins,
    approvedPlugins,
    pluginInstallPath,
    setPluginInstallPath,
    pluginInstallPreview,
    previewPluginInstall,
    installPlugin,
    approvePlugin,
    setPluginStatus,
    removePlugin,
    pluginAudit,
    refreshPluginAudit,
    pluginApiRequestText,
    setPluginApiRequestText,
    pluginApiResult,
    runPluginApiRequest,
    pluginPanelRender,
    renderPluginPanel,
    pluginDeveloperValidation,
    validatePluginDeveloperSource,
    identityProfiles,
    identityActivations,
    activeIdentityActivation,
    identityBusy,
    createIdentityLabProfile,
    updateIdentityLabProfile,
    activateIdentityLabProfile,
    verifyIdentityLabProfile,
    archiveIdentityLabProfile,
    advancedImportText,
    setAdvancedImportText,
    advancedSummary,
    saveAdvancedImportAsCollection,
    loadAdvancedImportDraftToRepeater,
    prepareAdvancedWorkflowDraft,
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
    agentProfiles: AGENT_RUN_PROFILES,
    agentProfileId,
    setAgentProfileId,
    selectedAgentRunProfile,
    activeAgentBudgetLabels,
    agentRuns,
    selectedAgentRunId,
    setSelectedAgentRunId,
    activeAgentRun,
    startAgentRun,
    pauseAgentRun,
    resumeAgentRun,
    stopAgentRun,
    recoverAgentRun,
    steerAgentMission,
    updateAgentCapabilities,
    agentRunMemory,
    filteredAgentRunMemory,
    agentRunMemorySearch,
    setAgentRunMemorySearch,
    confirmAgentRunMemoryFromTimeline,
    dismissAgentRunMemoryFromTimeline,
    createAgentRunMemory,
    deleteAgentRunMemory,
    aiPreparedWorkflowDraft,
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
    seedDemoProject,
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
