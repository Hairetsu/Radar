import { useState, useCallback, useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { formatHeaders } from "../../lib";
import {
  defaultReplayTabState,
  normalizeReplayTabState
} from "../../../shared/replayTabs.js";
import { validateWorkflowDraft } from "../../../shared/workflows.js";
import type { SessionDiffResult } from "../../../shared/sessionDiff.js";
import type {
  AgentRun,
  AgentRunMemoryEntry,
  AutomatePayloadSet,
  AutomateSession,
  BrowserState,
  BurstResult,
  CapturedRequest,
  EvidenceAnnotation,
  Finding,
  FindingReport,
  HandoffPackagePreview,
  InstalledPlugin,
  InterceptRule,
  InterceptState,
  LocalContext,
  LocalProfile,
  LocalSessionSummary,
  MatchReplaceRule,
  PluginApiResult,
  PluginAuditEntry,
  PluginDeveloperValidation,
  PluginInstallPreview,
  PluginPanelRender,
  ProjectBundleExportPreview,
  ProjectBundleImportPreview,
  ProjectNote,
  ProxyProfile,
  ProxyState,
  ReplayCollection,
  ReplayDraft,
  ReplayEnvironment,
  ReplayResult,
  ReplayTabState,
  SavedFilter,
  SavedView,
  SslEvent,
  WebSocketEvent,
  WebSocketReplayDraft,
  WebSocketReplayResult,
  WorkflowDefinition,
  WorkflowDryRun,
  WorkflowRevision,
  WorkflowRun
} from "../../types";

type StateSetter<T> = Dispatch<SetStateAction<T>>;

export interface SessionOrchestratorPorts {
  setNotice: (message: string) => void;
  setTargets: (targets: string[]) => void;
  setTargetText: (text: string) => void;
  setSelectedId: (id: string) => void;
  setSelectedIds: (ids: string[]) => void;
  selectionAnchorRef: MutableRefObject<string>;
  setLastResponse: (response: ReplayResult | null) => void;
  setLastBurst: (burst: BurstResult | null) => void;
  setCaptures: (captures: CapturedRequest[]) => void;
  setSslEvents: (events: SslEvent[]) => void;
  setWebSocketEvents: (events: WebSocketEvent[]) => void;
  setBrowserState: (state: BrowserState) => void;
  setProxyProfiles: (profiles: ProxyProfile[]) => void;
  setProxyState: StateSetter<ProxyState>;
  setInterceptState: StateSetter<InterceptState>;
  setInterceptRules: (rules: InterceptRule[]) => void;
  setInterceptRulesText: (text: string) => void;
  setMatchReplaceRules: (rules: MatchReplaceRule[]) => void;
  setMatchReplaceRulesText: (text: string) => void;
  setAgentRuns: (runs: AgentRun[]) => void;
  setAgentRunMemory: (memory: AgentRunMemoryEntry[]) => void;
  setSavedFilters: (filters: SavedFilter[]) => void;
  setProjectNotes: (notes: ProjectNote[]) => void;
  setSelectedProjectNoteId: (id: string) => void;
  setProjectNoteTitle: (title: string) => void;
  setProjectNoteBody: (body: string) => void;
  setSavedViews: (views: SavedView[]) => void;
  setSavedViewName: (name: string) => void;
  setSavedViewDescription: (description: string) => void;
  setBundleExportPreview: (preview: ProjectBundleExportPreview | null) => void;
  setBundleImportPath: (path: string) => void;
  setBundleImportPreview: (preview: ProjectBundleImportPreview | null) => void;
  setHandoffTitle: (title: string) => void;
  setHandoffPreview: (preview: HandoffPackagePreview | null) => void;
  setEvidenceAnnotations: (annotations: EvidenceAnnotation[]) => void;
  setFindings: (findings: Finding[]) => void;
  setSelectedFindingId: StateSetter<string>;
  setFindingReport: (report: FindingReport | null) => void;
  setWorkflows: (workflows: WorkflowDefinition[]) => void;
  setSelectedWorkflowId: (id: string) => void;
  setAiPreparedWorkflowDraft: (draft: WorkflowDefinition | null) => void;
  setWorkflowRuns: (runs: WorkflowRun[]) => void;
  setSelectedWorkflowRunId: StateSetter<string>;
  setWorkflowDryRun: (dryRun: WorkflowDryRun) => void;
  setWorkflowRevisions: (revisions: WorkflowRevision[]) => void;
  setPlugins: (plugins: InstalledPlugin[]) => void;
  setPluginInstallPreview: (preview: PluginInstallPreview | null) => void;
  setPluginAudit: (audit: PluginAuditEntry[]) => void;
  setPluginApiResult: (result: PluginApiResult | null) => void;
  setPluginPanelRender: (render: PluginPanelRender | null) => void;
  setPluginDeveloperValidation: (validation: PluginDeveloperValidation | null) => void;
  setPluginApiRequestText: (text: string) => void;
  setReplayTabState: (state: ReplayTabState) => void;
  setReplayEnvironments: (environments: ReplayEnvironment[]) => void;
  setReplayCollections: (collections: ReplayCollection[]) => void;
  setAutomatePayloadSets: (sets: AutomatePayloadSet[]) => void;
  setAutomateSessions: (sessions: AutomateSession[]) => void;
  setActiveAutomateSessionId: StateSetter<string>;
  setHeadersText: (text: string) => void;
  setDraft: (draft: ReplayDraft) => void;
  setDiffLeftHistoryId: (id: string) => void;
  setDiffRightHistoryId: (id: string) => void;
  setWebSocketReplayDraft: (draft: WebSocketReplayDraft | null) => void;
  setWebSocketReplayResult: (result: WebSocketReplayResult | null) => void;
  setSessionDiff: (diff: SessionDiffResult | null) => void;
  setDiffBaselineSessionId: (id: string) => void;
  setSelectedSitemapNodeId: (id: string) => void;
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
    return {
      config: {
        requestEnabled: false,
        responseEnabled: false
      },
      queue: []
    };
  }
  try {
    return await window.radar.getInterceptState();
  } catch {
    return {
      config: {
        requestEnabled: false,
        responseEnabled: false
      },
      queue: []
    };
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

function defaultSessionName(createdAt = new Date()) {
  return `Session ${createdAt.toISOString().slice(0, 16).replace("T", " ")}`;
}

const emptyDraft = { method: "GET", url: "", headers: [], body: "" };

export function useSessionOrchestrator(ports: SessionOrchestratorPorts) {
  const [localContext, setLocalContext] = useState<LocalContext | null>(null);
  const [profiles, setProfiles] = useState<LocalProfile[]>([]);
  const [sessions, setSessions] = useState<LocalSessionSummary[]>([]);
  const [profileName, setProfileName] = useState("");
  const [sessionName, setSessionName] = useState("");
  const [profileSessionOpen, setProfileSessionOpen] = useState(false);
  const [newSessionOpen, setNewSessionOpen] = useState(false);
  const [newSessionName, setNewSessionName] = useState("");

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
      ports.setSelectedId("");
      ports.setSelectedIds([]);
      ports.selectionAnchorRef.current = "";
      ports.setLastResponse(null);
      ports.setLastBurst(null);

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
        ports.setTargets(nextTargets);
        ports.setTargetText(nextTargets.join("\n"));
        ports.setCaptures(nextCaptures);
        ports.setSslEvents(nextSslEvents);
        ports.setWebSocketEvents(nextWebSocketEvents);
        ports.setBrowserState(nextBrowserState);
        ports.setProxyProfiles(nextProxyProfiles);
        ports.setInterceptState(nextInterceptState);
        ports.setInterceptRules(nextInterceptRules);
        ports.setInterceptRulesText(JSON.stringify(nextInterceptRules, null, 2));
        ports.setMatchReplaceRules(nextMatchReplaceRules);
        ports.setMatchReplaceRulesText(JSON.stringify(nextMatchReplaceRules, null, 2));
        ports.setAgentRuns(nextAgentRuns);
        ports.setAgentRunMemory(nextAgentRunMemory);
        ports.setSavedFilters(nextSavedFilters);
        ports.setProjectNotes(nextProjectNotes);
        ports.setSelectedProjectNoteId(nextProjectNotes[0]?.id || "");
        ports.setProjectNoteTitle(nextProjectNotes[0]?.title || "");
        ports.setProjectNoteBody(nextProjectNotes[0]?.body || "");
        ports.setSavedViews(nextSavedViews);
        ports.setSavedViewName("");
        ports.setSavedViewDescription("");
        ports.setBundleExportPreview(null);
        ports.setBundleImportPath("");
        ports.setBundleImportPreview(null);
        ports.setHandoffTitle("");
        ports.setHandoffPreview(null);
        ports.setEvidenceAnnotations(nextEvidenceAnnotations);
        ports.setFindings(nextFindings);
        ports.setSelectedFindingId(nextFindings[0]?.id || "");
        ports.setFindingReport(null);
        ports.setWorkflows(nextWorkflows);
        ports.setSelectedWorkflowId(nextWorkflows[0]?.id || "");
        ports.setAiPreparedWorkflowDraft(null);
        ports.setWorkflowRuns(nextWorkflowRuns);
        ports.setSelectedWorkflowRunId(nextWorkflowRuns[0]?.id || "");
        ports.setWorkflowDryRun(nextWorkflows[0] ? validateWorkflowDraft(nextWorkflows[0]) : validateWorkflowDraft(""));
        ports.setWorkflowRevisions([]);
        ports.setPlugins(nextPlugins);
        ports.setPluginInstallPreview(null);
        ports.setPluginAudit(nextPluginAudit);
        ports.setPluginApiResult(null);
        ports.setPluginPanelRender(null);
        ports.setPluginDeveloperValidation(null);
        ports.setPluginApiRequestText(
          nextPlugins[0]
            ? JSON.stringify({ pluginId: nextPlugins[0].id, action: "captures:list", input: { query: "" } }, null, 2)
            : ""
        );
        const normalizedTabs = normalizeReplayTabState(nextReplayTabState);
        ports.setReplayTabState(normalizedTabs);
        ports.setReplayEnvironments(nextReplayEnvironments);
        ports.setReplayCollections(nextReplayCollections);
        ports.setAutomatePayloadSets(nextAutomatePayloadSets);
        ports.setAutomateSessions(nextAutomateSessions);
        ports.setActiveAutomateSessionId(nextAutomateSessions[0]?.id || "");
        const activeTab = normalizedTabs.tabs.find((tab) => tab.id === normalizedTabs.activeTabId) || normalizedTabs.tabs[0];
        ports.setHeadersText(formatHeaders(activeTab?.draft.headers || emptyDraft.headers));
        ports.setDiffLeftHistoryId("");
        ports.setDiffRightHistoryId("");
        ports.setWebSocketReplayDraft(null);
        ports.setWebSocketReplayResult(null);
        ports.setSessionDiff(null);
        ports.setDiffBaselineSessionId("");
        ports.setSelectedSitemapNodeId("");
        await refreshLocalLists(context);
      }

      if (noticeText) {
        ports.setNotice(noticeText);
      }
    },
    [refreshLocalLists, ports]
  );

  const openNewSessionDialog = useCallback(() => {
    setNewSessionName(defaultSessionName());
    setNewSessionOpen(true);
  }, []);

  const createLocalProfile = useCallback(async () => {
    if (!window.radar) {
      ports.setNotice("Run in Electron to create a project.");
      return;
    }
    const context = await window.radar.createLocalProfile(profileName);
    await applyLocalContext(context, `Project opened: ${context.profile.name}`);
  }, [applyLocalContext, profileName, ports]);

  const saveLocalProfile = useCallback(async () => {
    if (!window.radar || !localContext) {
      ports.setNotice("Run in Electron to save a project.");
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
    ports.setNotice(`Project saved: ${profile.name}`);
  }, [localContext, profileName, refreshLocalLists, ports]);

  const loadLocalProfile = useCallback(
    async (profileId: string) => {
      if (!window.radar) {
        ports.setNotice("Run in Electron to load a project.");
        return;
      }
      const context = await window.radar.loadLocalProfile(profileId);
      await applyLocalContext(context, `Project loaded: ${context.profile.name}`);
    },
    [applyLocalContext, ports]
  );

  const createLocalSession = useCallback(async (name?: string) => {
    if (!window.radar) {
      ports.setNotice("Run in Electron to create a session.");
      return;
    }
    const context = await window.radar.createLocalSession(name);
    await applyLocalContext(context, `Session opened: ${context.session.name}`);
  }, [applyLocalContext, ports]);

  const confirmNewSession = useCallback(async () => {
    await createLocalSession(newSessionName);
    setNewSessionOpen(false);
  }, [createLocalSession, newSessionName]);

  const saveLocalSession = useCallback(async () => {
    if (!window.radar || !localContext) {
      ports.setNotice("Run in Electron to save a session.");
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
    ports.setNotice(`Session saved: ${session.name}`);
  }, [localContext, refreshLocalLists, sessionName, ports]);

  const loadLocalSession = useCallback(
    async (sessionId: string) => {
      if (!window.radar) {
        ports.setNotice("Run in Electron to load a session.");
        return;
      }
      const context = await window.radar.loadLocalSession(sessionId);
      await applyLocalContext(context, `Session loaded: ${context.session.name}`);
    },
    [applyLocalContext, ports]
  );

  const seedDemoProject = useCallback(async () => {
    if (!window.radar?.seedDemoProject) {
      ports.setNotice("Run in Electron to load demo data.");
      return;
    }
    const context = await window.radar.seedDemoProject();
    await applyLocalContext(context, `Demo project loaded: ${context.session.name}`);
  }, [applyLocalContext, ports]);

  const activeProfileId = localContext?.profile.id || "";

  // Startup load effect
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
      ports.setTargets(items);
      ports.setTargetText(items.join("\n"));
      setProfiles(nextProfiles);
      setSessions(nextSessions);
      ports.setWebSocketEvents(nextWebSocketEvents);
      ports.setProxyProfiles(nextProxyProfiles);
      ports.setInterceptState(nextInterceptState);
      ports.setInterceptRules(nextInterceptRules);
      ports.setInterceptRulesText(JSON.stringify(nextInterceptRules, null, 2));
      ports.setMatchReplaceRules(nextMatchReplaceRules);
      ports.setMatchReplaceRulesText(JSON.stringify(nextMatchReplaceRules, null, 2));
      ports.setAgentRuns(nextAgentRuns);
      ports.setAgentRunMemory(nextAgentRunMemory);
      ports.setFindings(nextFindings);
      ports.setSelectedFindingId(nextFindings[0]?.id || "");
      ports.setWorkflows(nextWorkflows);
      ports.setSelectedWorkflowId(nextWorkflows[0]?.id || "");
      ports.setWorkflowRuns(nextWorkflowRuns);
      ports.setSelectedWorkflowRunId(nextWorkflowRuns[0]?.id || "");
      ports.setWorkflowDryRun(nextWorkflows[0] ? validateWorkflowDraft(nextWorkflows[0]) : validateWorkflowDraft(""));
      ports.setWorkflowRevisions([]);
      ports.setPlugins(nextPlugins);
      ports.setPluginAudit(nextPluginAudit);
      ports.setSavedFilters(nextSavedFilters);
      ports.setProjectNotes(nextProjectNotes);
      ports.setSelectedProjectNoteId(nextProjectNotes[0]?.id || "");
      ports.setProjectNoteTitle(nextProjectNotes[0]?.title || "");
      ports.setProjectNoteBody(nextProjectNotes[0]?.body || "");
      ports.setSavedViews(nextSavedViews);
      ports.setEvidenceAnnotations(nextEvidenceAnnotations);
      const normalizedTabs = normalizeReplayTabState(nextReplayTabState);
      ports.setReplayTabState(normalizedTabs);
      ports.setReplayEnvironments(nextReplayEnvironments);
      ports.setReplayCollections(nextReplayCollections);
      const activeTab = normalizedTabs.tabs.find((tab) => tab.id === normalizedTabs.activeTabId) || normalizedTabs.tabs[0];
      ports.setHeadersText(formatHeaders(activeTab?.draft.headers || emptyDraft.headers));
      ports.setPluginApiRequestText(
        nextPlugins[0]
          ? JSON.stringify({ pluginId: nextPlugins[0].id, action: "captures:list", input: { query: "" } }, null, 2)
          : ""
      );
      ports.setAutomatePayloadSets(nextAutomatePayloadSets);
      ports.setAutomateSessions(nextAutomateSessions);
      ports.setActiveAutomateSessionId(nextAutomateSessions[0]?.id || "");
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [ports]);

  // 4s profile poll
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

  // 1.5s live poll
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
          ports.setCaptures(nextCaptures);
          ports.setSslEvents(nextSslEvents);
          ports.setWebSocketEvents(nextWebSocketEvents);
          ports.setBrowserState(nextBrowserState);
          ports.setProxyState(nextProxyState);
          ports.setInterceptState(nextInterceptState);
          ports.setAgentRuns(nextAgentRuns);
          ports.setAgentRunMemory(nextAgentRunMemory);
          ports.setFindings(nextFindings);
          ports.setSelectedFindingId((current) => current || nextFindings[0]?.id || "");
          ports.setWorkflowRuns(nextWorkflowRuns);
          ports.setSelectedWorkflowRunId((current) => current || nextWorkflowRuns[0]?.id || "");
          ports.setAutomateSessions(nextAutomateSessions);
          ports.setActiveAutomateSessionId((current) => current || nextAutomateSessions[0]?.id || "");
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
  }, [ports]);

  return {
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
    applyLocalContext,
    openNewSessionDialog,
    createLocalProfile,
    saveLocalProfile,
    loadLocalProfile,
    createLocalSession,
    confirmNewSession,
    saveLocalSession,
    loadLocalSession,
    seedDemoProject
  };
}
