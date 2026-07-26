import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_URL as defaultUrl,
  firstUrlFromText,
  formatHeaders,
  isAllowedTarget,
  normalizeUrl,
  originFromUrl,
  parseHeaders
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
import { defaultReplayTabState, normalizeReplayTabState } from "../../shared/replayTabs.js";
import { createCollectionItem, normalizeReplayCollections } from "../../shared/replayCollections.js";
import { TRAFFIC_QUERY_EXAMPLES } from "../../shared/trafficQuery.js";
import { WORKFLOW_STEP_TEMPLATES, validateWorkflowDraft } from "../../shared/workflows.js";
import type {
  AgentCapabilityAction,
  AgentCapabilityActionRequest,
  AgentMissionSteeringAction,
  AgentMissionSteeringRequest,
  AgentRun,
  AgentRunMemoryEntry,
  AgentRunProfileId,
  AgentRunRecoveryAction,
  AppMode,
  BrowserState,
  CapturedRequest,
  EvidenceAnnotation,
  GlobalSearchResponse,
  GlobalSearchResult,
  HandoffPackagePreview,
  IdentityActivationRecord,
  IdentityProfile,
  IdentityProfileDraft,
  InterceptState,
  LocalContext,
  LocalProfile,
  LocalSessionSummary,
  ProjectBundleExportPreview,
  ProjectBundleImportPreview,
  ProjectBundleRedactionProfile,
  ProjectNote,
  ReplayCollection,
  ReplayDraft,
  SavedFilter,
  SavedView,
  SavedViewTarget,
  WorkflowDefinition
} from "../types";
import { useAiConnection } from "./useAiConnection";
import { useTheme } from "./useTheme";
import { useWorkbenchShell, useScopeDomain, usePluginsDomain, useInterceptDomain, useSslProxyDomain, useWebSocketDomain, useFindingsDomain, useWorkflowsDomain, useAutomateDomain, useTrafficDomain, useRepeaterDomain } from "./workbench";
export type { WorkView } from "./workbench/viewMeta";
export { WORK_VIEWS, viewMeta } from "./workbench/viewMeta";
import { viewMeta } from "./workbench/viewMeta";
export { TRAFFIC_SORT_FIELDS } from "./workbench/useTrafficDomain";
export type { TrafficSortField, TrafficSortDirection } from "./workbench/useTrafficDomain";

const defaultBrowserState: BrowserState = {
  open: false,
  url: "",
  title: "",
  loading: false,
  engine: "none"
};

const defaultInterceptState: InterceptState = {
  config: {
    requestEnabled: false,
    responseEnabled: false
  },
  queue: []
};

function defaultSessionName(createdAt = new Date()) {
  return `Session ${createdAt.toISOString().slice(0, 16).replace("T", " ")}`;
}

function isActiveAgentRun(run: AgentRun | null | undefined) {
  return run?.status === "queued" || run?.status === "running";
}

const workbenchEmptyDraft: ReplayDraft = {
  method: "GET",
  url: defaultUrl,
  headers: {
    Accept: "application/json, text/plain, */*"
  },
  body: ""
};

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

export type RadarWorkbench = ReturnType<typeof useRadarWorkbench>;

export function useRadarWorkbench() {
  const shellDomain = useWorkbenchShell();
  const scopeDomain = useScopeDomain({ setNotice: shellDomain.setNotice });
  const pluginsDomain = usePluginsDomain({ setNotice: shellDomain.setNotice });
  const interceptDomain = useInterceptDomain({ setNotice: shellDomain.setNotice });
  const sslProxyDomain = useSslProxyDomain({ setNotice: shellDomain.setNotice });

  const {
    activeView,
    setActiveView,
    setNotice,
    appMode,
    setAppMode: setShellAppMode,
    setAiPaletteOpen
  } = shellDomain;

  const { targets, setTargets, targetText, setTargetText } = scopeDomain;

  const {
    setPlugins,
    setPluginInstallPreview,
    setPluginAudit,
    setPluginApiRequestText,
    setPluginApiResult,
    setPluginPanelRender,
    setPluginDeveloperValidation
  } = pluginsDomain;

  const {
    setInterceptState,
    setInterceptSelectedId,
    setInterceptDraft,
    setInterceptHeadersText,
    setInterceptResponseStatus,
    setInterceptResponseStatusText,
    setInterceptRules,
    setInterceptRulesText,
    setMatchReplaceRules,
    setMatchReplaceRulesText,
    hydrateInterceptDraft,
    interceptDraftItemRef
  } = interceptDomain;

  const { setProxyState, setSslEvents, setProxyProfiles } = sslProxyDomain;

  const findingsDomain = useFindingsDomain({
    setNotice: shellDomain.setNotice,
    setActiveView: shellDomain.setActiveView
  });

  const {
    evidenceAnnotations,
    setFindings,
    setSelectedFindingId,
    promoteAutomateResultToFinding: promoteAutomateResultToFindingAction,
    attachSelectedAutomateResultToFinding: attachSelectedAutomateResultToFindingAction
  } = findingsDomain;

  const webSocketDomain = useWebSocketDomain({
    setNotice: shellDomain.setNotice,
    setActiveView: shellDomain.setActiveView,
    targets,
    evidenceAnnotations
  });

  const {
    setWebSocketEvents,
    webSocketSearch,
    setWebSocketSearch,
    setWebSocketReplayDraft,
    setWebSocketReplayResult,
    scopedWebSocketEvents
  } = webSocketDomain;

  const trafficDomain = useTrafficDomain({
    setNotice: shellDomain.setNotice,
    setActiveView: shellDomain.setActiveView,
    targets,
    evidenceAnnotations
  });

  const {
    setTrafficMethodFilter,
    setTrafficTypeFilter,
    setTrafficSearch,
    trafficSearchRef,
    setCaptures,
    setSelectedId,
    setSelectedIds,
    selectionAnchorRef
  } = trafficDomain;

  const repeaterDomain = useRepeaterDomain({
    setNotice: shellDomain.setNotice,
    setActiveView: shellDomain.setActiveView
  });

  const {
    draft,
    setDraft,
    headersText,
    setHeadersText,
    replayTabState,
    setReplayTabState,
    setReplayEnvironments,
    setReplayCollections,
    setLastResponse,
    setLastBurst,
    setDiffLeftHistoryId,
    setDiffRightHistoryId,
    selectReplayTab
  } = repeaterDomain;

  const [address, setAddress] = useState(defaultUrl);
  const [browserState, setBrowserState] = useState<BrowserState>(defaultBrowserState);
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
  const [identityProfiles, setIdentityProfiles] = useState<IdentityProfile[]>([]);
  const [identityActivations, setIdentityActivations] = useState<IdentityActivationRecord[]>([]);
  const [identityBusy, setIdentityBusy] = useState(false);
  const [advancedImportText, setAdvancedImportText] = useState("");
  const [selectedSitemapNodeId, setSelectedSitemapNodeId] = useState("");
  const [diffBaselineSessionId, setDiffBaselineSessionId] = useState("");
  const [sessionDiff, setSessionDiff] = useState<SessionDiffResult | null>(null);
  const [sessionDiffPending, setSessionDiffPending] = useState(false);
  const [localContext, setLocalContext] = useState<LocalContext | null>(null);
  const [profiles, setProfiles] = useState<LocalProfile[]>([]);
  const [sessions, setSessions] = useState<LocalSessionSummary[]>([]);
  const [profileName, setProfileName] = useState("");
  const [sessionName, setSessionName] = useState("");
  const [profileSessionOpen, setProfileSessionOpen] = useState(false);
  const [newSessionOpen, setNewSessionOpen] = useState(false);
  const [newSessionName, setNewSessionName] = useState("");

  const workflowsDomain = useWorkflowsDomain({
    setNotice: shellDomain.setNotice,
    setActiveView: shellDomain.setActiveView,
    setFindings,
    setSelectedFindingId
  });

  const {
    setWorkflows,
    setSelectedWorkflowId,
    setWorkflowRuns,
    setSelectedWorkflowRunId,
    setWorkflowDryRun,
    setWorkflowRevisions,
    setAiPreparedWorkflowDraft
  } = workflowsDomain;

  const [activeDetail, setActiveDetail] = useState<"request" | "response">("request");

  const automateBaseDraft = useMemo(() => {
    try {
      return { ...draft, headers: parseHeaders(headersText) };
    } catch {
      return draft;
    }
  }, [draft, headersText]);

  const automateDomain = useAutomateDomain({
    setNotice: shellDomain.setNotice,
    setActiveView: shellDomain.setActiveView,
    setDraft,
    setHeadersText,
    setLastResponse: repeaterDomain.setLastResponse,
    setLastBurst: repeaterDomain.setLastBurst,
    setReplayTabState: repeaterDomain.setReplayTabState,
    automateBaseDraft,
    activeReplayTabEnvironmentId: repeaterDomain.activeReplayTab?.environmentId
  });

  const {
    setAutomateSessions,
    setActiveAutomateSessionId,
    setAutomatePayloadText,
    setAutomateRulesText,
    setAutomateSessionName,
    setAutomateResultFilter,
    activeAutomateSession,
    selectedAutomateResult
  } = automateDomain;

  const promoteAutomateResultToFinding = useCallback(
    () => promoteAutomateResultToFindingAction(activeAutomateSession, selectedAutomateResult),
    [activeAutomateSession, promoteAutomateResultToFindingAction, selectedAutomateResult]
  );

  const attachSelectedAutomateResultToFinding = useCallback(
    () => attachSelectedAutomateResultToFindingAction(activeAutomateSession, selectedAutomateResult),
    [activeAutomateSession, attachSelectedAutomateResultToFindingAction, selectedAutomateResult]
  );

  const [agentGoal, setAgentGoal] = useState("");
  const [agentProfileId, setAgentProfileId] = useState<AgentRunProfileId>("browser-assessment");
  const [agentTutorialMode, setAgentTutorialMode] = useState(false);
  const [agentRuns, setAgentRuns] = useState<AgentRun[]>([]);
  const [selectedAgentRunId, setSelectedAgentRunId] = useState("");
  const [agentRunMemory, setAgentRunMemory] = useState<AgentRunMemoryEntry[]>([]);
  const [agentRunMemorySearch, setAgentRunMemorySearch] = useState("");
  const agentUiCursorRef = useRef<{ runId: string; entryId: string } | null>(null);
  const ai = useAiConnection();
  const appearance = useTheme();

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
        findingsDomain.setEvidenceAnnotations(nextEvidenceAnnotations);
        findingsDomain.setFindings(nextFindings);
        findingsDomain.setSelectedFindingId(nextFindings[0]?.id || "");
        findingsDomain.setFindingReport(null);
        workflowsDomain.setWorkflows(nextWorkflows);
        workflowsDomain.setSelectedWorkflowId(nextWorkflows[0]?.id || "");
        workflowsDomain.setAiPreparedWorkflowDraft(null);
        workflowsDomain.setWorkflowRuns(nextWorkflowRuns);
        workflowsDomain.setSelectedWorkflowRunId(nextWorkflowRuns[0]?.id || "");
        workflowsDomain.setWorkflowDryRun(nextWorkflows[0] ? validateWorkflowDraft(nextWorkflows[0]) : validateWorkflowDraft(""));
        workflowsDomain.setWorkflowRevisions([]);
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
        automateDomain.setAutomatePayloadSets(nextAutomatePayloadSets);
        automateDomain.setAutomateSessions(nextAutomateSessions);
        automateDomain.setActiveAutomateSessionId(nextAutomateSessions[0]?.id || "");
        const activeTab = normalizedTabs.tabs.find((tab) => tab.id === normalizedTabs.activeTabId) || normalizedTabs.tabs[0];
        setHeadersText(formatHeaders(activeTab?.draft.headers || workbenchEmptyDraft.headers));
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
      setAddress(state.url || next);
      setNotice(`${state.channel} launched through Radar proxy · Playwright ${state.automation || "connecting"}`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Chrome launch failed");
    }
  }, [address]);

  const navigateBrowser = useCallback(async (event?: FormEvent) => {
    event?.preventDefault();
    const next = normalizeUrl(address);
    setAddress(next);
    if (!window.radar) {
      setNotice("Run in Electron to control Chrome.");
      return;
    }
    try {
      const state = browserState.open
        ? await window.radar.navigateBrowser(next)
        : await window.radar.openBrowser(next);
      setBrowserState(state);
      setAddress(state.url || next);
      setNotice(`${state.open ? "Browser at" : "Browser could not reach"} ${state.url || next}`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Browser navigation failed");
    }
  }, [address, browserState.open]);

  const browserBack = useCallback(async () => {
    if (!window.radar) return;
    try {
      const state = await window.radar.browserBack();
      setBrowserState(state);
      setAddress(state.url || address);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Browser back failed");
    }
  }, [address]);

  const browserForward = useCallback(async () => {
    if (!window.radar) return;
    try {
      const state = await window.radar.browserForward();
      setBrowserState(state);
      setAddress(state.url || address);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Browser forward failed");
    }
  }, [address]);

  const browserReload = useCallback(async () => {
    if (!window.radar) return;
    try {
      const state = await window.radar.browserReload();
      setBrowserState(state);
      setAddress(state.url || address);
      setNotice(`Reloaded ${state.url || address}`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Browser reload failed");
    }
  }, [address]);

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
    repeaterDomain.setLastResponse(null);
    repeaterDomain.setLastBurst(null);
    setActiveView("repeater");
    setNotice("Loaded in repeater");
  }, [repeaterDomain, setActiveView, setDraft, setHeadersText, setNotice]);

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
      setShellAppMode(mode);
      if (mode === "manual-first" && executingAgentRun) {
        void window.radar?.stopAgentRun(executingAgentRun.id).then((run) => {
          if (run) {
            setAgentRuns((items) => [run, ...items.filter((item) => item.id !== run.id)]);
          }
        });
      }
    },
    [executingAgentRun, setShellAppMode]
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
      profileId: agentProfileId,
      ...(agentTutorialMode ? { tutorialMode: true } : {})
    });
    setAddress(startUrl);
    setAgentRuns((items) => [run, ...items.filter((item) => item.id !== run.id)]);
    setSelectedAgentRunId(run.id);
    setAgentGoal("");
    setNotice(
      agentTutorialMode
        ? "Tutorial Mode started. Review each evidence lesson, then continue at your pace."
        : scopeOrigin
          ? `AI-First run started on ${scopeOrigin}`
          : "AI-First run started"
    );
  }, [address, agentGoal, agentProfileId, agentTutorialMode, executingAgentRun, targetText]);

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

  const continueAgentRun = useCallback(async () => {
    if (!window.radar || !activeAgentRun) {
      return;
    }
    if (executingAgentRun) {
      setSelectedAgentRunId(executingAgentRun.id);
      setNotice("An AI-First run is already active. Pause or stop it before starting a continuation.");
      return;
    }
    const startUrl = activeAgentRun.checkpoint?.startUrl || firstUrlFromText(activeAgentRun.goal) || normalizeUrl(address);
    const scopeOrigin = startUrl ? originFromUrl(startUrl) : "";
    if (startUrl && scopeOrigin) {
      const latestTargets = await window.radar.getTargets();
      if (!isAllowedTarget(startUrl, latestTargets)) {
        const draftTargets = targetText
          .split("\n")
          .map((item) => item.trim())
          .filter(Boolean);
        setTargetText([...new Set([...latestTargets, ...draftTargets, scopeOrigin])].join("\n"));
        setActiveView("scope");
        setNotice(
          `Scope consent required: review ${scopeOrigin} in the Scope editor and Commit it before starting a continuation.`
        );
        return;
      }
    }
    try {
      const sourceRun = activeAgentRun;
      const run = await window.radar.startAgentRun({
        goal: sourceRun.goal,
        startUrl,
        profileId: sourceRun.profileId,
        continuationOf: sourceRun.id,
        ...(sourceRun.policy.tutorialMode ? { tutorialMode: true } : {})
      });
      setAddress(startUrl);
      setAgentRuns((items) => [run, ...items.filter((item) => item.id !== run.id)]);
      setSelectedAgentRunId(run.id);
      setNotice(`Continuation ${run.id.slice(0, 8)} started with a fresh bounded budget. ${sourceRun.id.slice(0, 8)} remains preserved.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "A continuation run could not be started.");
    }
  }, [activeAgentRun, address, executingAgentRun, targetText]);

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
      const request: AgentMissionSteeringRequest = { ...action, expectedRevision: run.mission.revision };
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
      const request: AgentCapabilityActionRequest = { ...action, expectedRevision };
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
      const appliesVisibleToolCall = entry.phase === "tool-call" || entry.phase === undefined;
      if (appliesVisibleToolCall && entry.toolCall?.tool === "showView") {
        setActiveView(entry.toolCall.input.view);
      }

      if (appliesVisibleToolCall && entry.toolCall?.tool === "sendReplay") {
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

  const sitemap = useMemo(() => buildSitemap(trafficDomain.scopedTrafficCaptures), [trafficDomain.scopedTrafficCaptures]);

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
    return endpointInventoryForNode(selectedSitemapNode, trafficDomain.scopedTrafficCaptures);
  }, [selectedSitemapNode, trafficDomain.scopedTrafficCaptures]);

  const advancedSummary = useMemo(
    () => buildAdvancedTestingSummary(trafficDomain.scopedTrafficCaptures, scopedWebSocketEvents, advancedImportText, targets[0] || ""),
    [advancedImportText, trafficDomain.scopedTrafficCaptures, scopedWebSocketEvents, targets]
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
    const next = normalizeReplayCollections([collection, ...repeaterDomain.replayCollections], now);
    await repeaterDomain.saveReplayCollections(next);
    setActiveView("repeater");
    setNotice(`Saved ${collection.items.length} imported templates to ${collection.name}`);
    return collection;
  }, [advancedSummary.apiImport, repeaterDomain]);

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
    findingsDomain.setEvidenceAnnotations((items) => {
      const key = `${saved.kind}:${saved.evidenceId}`;
      const next = items.filter((item) => `${item.kind}:${item.evidenceId}` !== key);
      return [saved, ...next];
    });
    setNotice("Annotation saved");
  }, [findingsDomain, setNotice]);

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
      ["trafficQuery", trafficDomain.trafficSearch],
      ["webSocketQuery", webSocketSearch],
      ["trafficMethodFilter", trafficDomain.trafficMethodFilter === "all" ? "" : trafficDomain.trafficMethodFilter],
      ["trafficTypeFilter", trafficDomain.trafficTypeFilter === "all" ? "" : trafficDomain.trafficTypeFilter],
      ["selectedCaptureId", trafficDomain.selectedId],
      ["selectedFindingId", findingsDomain.selectedFindingId],
      ["selectedWorkflowId", workflowsDomain.selectedWorkflowId],
      ["selectedWorkflowRunId", workflowsDomain.selectedWorkflowRunId],
      ["replayTabId", repeaterDomain.replayTabState.activeTabId],
      ["sitemapNodeId", selectedSitemapNodeId],
      ["diffBaselineSessionId", diffBaselineSessionId],
      ["automateSessionId", automateDomain.activeAutomateSessionId]
    ];
    return Object.fromEntries(entries.filter(([, value]) => Boolean(value))) as Record<string, string>;
  }, [
    automateDomain.activeAutomateSessionId,
    diffBaselineSessionId,
    findingsDomain.selectedFindingId,
    repeaterDomain.replayTabState.activeTabId,
    trafficDomain.selectedId,
    selectedSitemapNodeId,
    trafficDomain.trafficMethodFilter,
    trafficDomain.trafficSearch,
    trafficDomain.trafficTypeFilter,
    workflowsDomain.selectedWorkflowId,
    workflowsDomain.selectedWorkflowRunId,
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
      if (state.replayTabId && repeaterDomain.replayTabState.tabs.some((tab) => tab.id === state.replayTabId)) {
        void repeaterDomain.selectReplayTab(state.replayTabId);
      }
      setProjectArtifactsOpen(false);
      setNotice(`Opened saved view: ${view.name}`);
    },
    [repeaterDomain]
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
        nextSavedFilters,
        nextProjectNotes,
        nextSavedViews,
        nextEvidenceAnnotations,
        nextReplayTabState,
        nextReplayEnvironments,
        nextReplayCollections,
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
        window.radar.getSavedFilters?.() ?? [],
        window.radar.getProjectNotes?.() ?? [],
        window.radar.getSavedViews?.() ?? [],
        window.radar.getEvidenceAnnotations?.() ?? [],
        window.radar.getReplayTabState?.() ?? defaultReplayTabState(),
        window.radar.getReplayEnvironments?.() ?? [],
        window.radar.getReplayCollections?.() ?? [],
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
      setSavedFilters(nextSavedFilters);
      setProjectNotes(nextProjectNotes);
      setSelectedProjectNoteId(nextProjectNotes[0]?.id || "");
      setProjectNoteTitle(nextProjectNotes[0]?.title || "");
      setProjectNoteBody(nextProjectNotes[0]?.body || "");
      setSavedViews(nextSavedViews);
      findingsDomain.setEvidenceAnnotations(nextEvidenceAnnotations);
      const normalizedTabs = normalizeReplayTabState(nextReplayTabState);
      setReplayTabState(normalizedTabs);
      setReplayEnvironments(nextReplayEnvironments);
      setReplayCollections(nextReplayCollections);
      const activeTab = normalizedTabs.tabs.find((tab) => tab.id === normalizedTabs.activeTabId) || normalizedTabs.tabs[0];
      setHeadersText(formatHeaders(activeTab?.draft.headers || workbenchEmptyDraft.headers));
      setPluginApiRequestText(
        nextPlugins[0]
          ? JSON.stringify({ pluginId: nextPlugins[0].id, action: "captures:list", input: { query: "" } }, null, 2)
          : ""
      );
      automateDomain.setAutomatePayloadSets(nextAutomatePayloadSets);
      automateDomain.setAutomateSessions(nextAutomateSessions);
      automateDomain.setActiveAutomateSessionId(nextAutomateSessions[0]?.id || "");
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
        if (globalSearchOpen) {
          setGlobalSearchOpen(false);
          return;
        }
        if (trafficDomain.trafficSearch.trim() || webSocketSearch.trim() || trafficDomain.trafficMethodFilter !== "all" || trafficDomain.trafficTypeFilter !== "all") {
          trafficDomain.setTrafficSearch("");
          setWebSocketSearch("");
          trafficDomain.setTrafficMethodFilter("all");
          trafficDomain.setTrafficTypeFilter("all");
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeView, globalSearchOpen, openGlobalSearch, trafficDomain, webSocketSearch]);

  return {
    address,
    setAddress,
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
    // Traffic domain - provided by trafficDomain spread below
    // selectedId,
    // setSelectedId,
    // selectedIds,
    // selectTrafficCapture,
    // Scope domain - provided by scopeDomain spread below
    // targets,
    // targetText,
    // setTargetText,
    // scopedTrafficCaptures,
    // trafficMethodFilter,
    // setTrafficMethodFilter,
    // trafficTypeFilter,
    // setTrafficTypeFilter,
    // trafficSearch,
    // setTrafficSearch,
    // trafficQueryError,
    // trafficSearchRef,
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
    // Findings domain - provided by findingsDomain spread below
    // evidenceAnnotations,
    getEvidenceAnnotation,
    saveEvidenceAnnotation,
    // findings,
    // selectedFindingId,
    // setSelectedFindingId,
    // selectedFinding,
    // findingMergeSuggestions,
    // findingRetestMatrix,
    // saveFinding,
    // saveFindingPatch,
    // deleteFinding,
    // createFindingFromCapture,
    // createFindingFromWebSocket,
    // promoteAutomateResultToFinding,
    // attachSelectedCaptureToFinding,
    // attachSelectedAutomateResultToFinding,
    // mergeFindingPair,
    // buildFindingReportPreview,
    // Workflows domain - provided by workflowsDomain spread below
    // workflows,
    // selectedWorkflowId,
    // setSelectedWorkflowId,
    // selectedWorkflow,
    // selectedWorkflowGraph,
    workflowStepTemplates: WORKFLOW_STEP_TEMPLATES,
    // workflowDryRun,
    // workflowRevisions,
    // workflowRuns,
    // selectedWorkflowRunId,
    // setSelectedWorkflowRunId,
    // selectedWorkflowRun,
    // saveWorkflow,
    // validateWorkflowEditor,
    // refreshWorkflowRevisions,
    // deleteWorkflow,
    // runWorkflow,
    // promoteWorkflowResultToFinding,
    // Plugins domain - provided by pluginsDomain spread below
    // plugins,
    // approvedPlugins,
    // pluginInstallPath,
    // setPluginInstallPath,
    // pluginInstallPreview,
    // previewPluginInstall,
    // installPlugin,
    // approvePlugin,
    // setPluginStatus,
    // removePlugin,
    // pluginAudit,
    // refreshPluginAudit,
    // pluginApiRequestText,
    // setPluginApiRequestText,
    // pluginApiResult,
    // runPluginApiRequest,
    // pluginPanelRender,
    // renderPluginPanel,
    // pluginDeveloperValidation,
    // validatePluginDeveloperSource,
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
    // Traffic domain - provided by trafficDomain spread below
    // trafficSortField,
    // setTrafficSortField,
    // trafficSortDirection,
    // setTrafficSortDirection,
    // trafficMethods,
    // trafficTypes,
    // Repeater domain - provided by repeaterDomain spread below
    // draft,
    // setDraft,
    // replayTabState,
    // activeReplayTab,
    // selectReplayTab,
    // createReplayTab,
    // renameReplayTab,
    // closeReplayTab,
    // toggleReplayTabPin,
    // setReplayTabEnvironment,
    // loadReplayHistoryEntry,
    // diffLeftHistoryId,
    // setDiffLeftHistoryId,
    // diffRightHistoryId,
    // setDiffRightHistoryId,
    // replayDiff,
    // replayEnvironments,
    // saveReplayEnvironments,
    // createReplayEnvironment,
    // replayCollections,
    // saveReplayCollections,
    // saveDraftToCollection,
    // loadCollectionItem,
    // headersText,
    // setHeadersText,
    // lastResponse,
    // lastBurst,
    // count,
    // setCount,
    // concurrency,
    // setConcurrency,
    // delayMs,
    // setDelayMs,
    // sendReplay,
    // runBurst,
    // sendReplayPending,
    // runBurstPending,
    // replayPending,
    // Automate domain - provided by automateDomain spread below
    // automateMarkerName,
    // setAutomateMarkerName,
    // automateHeaderName,
    // setAutomateHeaderName,
    // automatePayloadText,
    // setAutomatePayloadText,
    // automatePayloadSets,
    // selectedAutomatePayloadSetId,
    // selectedAutomatePayloadSet,
    // selectAutomatePayloadSet,
    // automatePayloadSetName,
    // setAutomatePayloadSetName,
    // automateWordlistPath,
    // setAutomateWordlistPath,
    // saveAutomatePayloadSet,
    // saveAutomateWordlistReference,
    // automateSessionName,
    // setAutomateSessionName,
    // automateLimits,
    // updateAutomateLimits,
    // automateRulesText,
    // setAutomateRulesText,
    // automateRules,
    // automateSessions,
    // activeAutomateSessionId,
    // setActiveAutomateSessionId,
    // activeAutomateSession,
    // selectedAutomateResultId,
    // setSelectedAutomateResultId,
    // selectedAutomateResult,
    // automateResultFilter,
    // setAutomateResultFilter,
    // automateResultSort,
    // setAutomateResultSort,
    // filteredAutomateResults,
    // startAutomateSession,
    // pauseAutomateSession,
    // resumeAutomateSession,
    // stopAutomateSession,
    // retryAutomateSession,
    // promoteAutomateResultToRepeater,
    // refreshAutomateSessions,
    // automateMarkerPreview,
    // automatePositions,
    // automatePayloads,
    // automatePreviewDraft,
    // insertAutomateMarker,
    // loadAutomatePreviewIntoRepeater,
    // Shell domain - provided by shellDomain spread below
    // activeView,
    // setActiveView,
    activeDetail,
    setActiveDetail,
    // Shell domain - provided by shellDomain spread below
    // notice,
    // setNotice,
    // clock,
    // appMode,
    // setAppMode,
    agentGoal,
    setAgentGoal,
    agentProfiles: AGENT_RUN_PROFILES,
    agentProfileId,
    setAgentProfileId,
    agentTutorialMode,
    setAgentTutorialMode,
    selectedAgentRunProfile,
    activeAgentBudgetLabels,
    agentRuns,
    selectedAgentRunId,
    setSelectedAgentRunId,
    activeAgentRun,
    startAgentRun,
    pauseAgentRun,
    resumeAgentRun,
    continueAgentRun,
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
    // Workflows domain - provided by workflowsDomain spread below
    // aiPreparedWorkflowDraft,
    // Shell domain - provided by shellDomain spread below
    // aiPaletteOpen,
    // setAiPaletteOpen,
    ai,
    appearance,
    // Traffic domain - provided by trafficDomain spread below
    // selected,
    // trafficCaptures,
    // Shell domain - provided by shellDomain spread below
    // meta,
    // utc,
    openBrowser,
    navigateBrowser,
    browserBack,
    browserForward,
    browserReload,
    // Scope domain - provided by scopeDomain spread below
    // saveTargets,
    // addTarget,
    applyAiDraft,
    prepareAiNavigate,
    cloneToRepeater,
    // Repeater domain - provided by repeaterDomain spread below
    // sendReplay: sendReplayMutation.run,
    // runBurst: runBurstMutation.run,
    // sendReplayPending: sendReplayMutation.isPending,
    // runBurstPending: runBurstMutation.isPending,
    // replayPending,
    // Traffic domain - provided by trafficDomain spread below
    // clearCaptures,
    // WebSocket domain - provided by webSocketDomain spread below
    // clearWebSocketEvents,
    // Traffic domain - provided by trafficDomain spread below
    // deleteCapture,
    createLocalProfile,
    saveLocalProfile,
    loadLocalProfile,
    createLocalSession,
    openNewSessionDialog,
    confirmNewSession,
    saveLocalSession,
    loadLocalSession,
    seedDemoProject,
    // Domain hooks - these override monolith state with composed domain implementations
    ...shellDomain,
    ...scopeDomain,
    ...pluginsDomain,
    ...interceptDomain,
    ...sslProxyDomain,
    ...webSocketDomain,
    ...trafficDomain,
    ...repeaterDomain,
    ...findingsDomain,
    promoteAutomateResultToFinding,
    attachSelectedAutomateResultToFinding,
    ...workflowsDomain,
    ...automateDomain,
    setAppMode
  };
}
