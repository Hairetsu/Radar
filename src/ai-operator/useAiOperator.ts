import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isAllowedTarget } from "../../shared/allowlist.js";
import { normalizeAgentRunMemory } from "../../shared/agentMemory.js";
import {
  AGENT_RUN_PROFILES,
  agentBudgetLabels,
  getAgentBudgetExhaustion,
  getAgentRunProfile
} from "../../shared/agentProfiles.js";
import { firstUrlFromText, normalizeUrl, originFromUrl } from "../../shared/url.js";
import type {
  AgentCapabilityAction,
  AgentCapabilityActionRequest,
  AgentMissionSteeringAction,
  AgentMissionSteeringRequest,
  AgentRun,
  AgentRunMemoryEntry,
  AgentRunProfileId,
  AgentRunRecoveryAction,
  AppMode
} from "../../shared/agent-types.js";
import type { AiSettings, AiConnectPresetId, AiModelOption } from "../../shared/ai-types.js";
import { pickValidModel } from "../../shared/ai-models.js";
import type { LocalContext } from "../../shared/domain.js";
import type {
  AiConnectionSummary,
  AiOperatorSection,
  WorkspaceContextSnapshot,
  WorkspaceControlIntent
} from "../../shared/windowCoordination.js";
import { DEFAULT_AI_SETTINGS } from "../ai/types";
import { decideAgentRunStart } from "./startDecision";

function operatorApi() {
  if (!window.radarOperator) {
    throw new Error("The AI Operator API is unavailable in this renderer.");
  }
  return window.radarOperator;
}

function executingRun(runs: AgentRun[]) {
  return runs.find((run) => run.status === "queued" || run.status === "running") || null;
}

function sortRuns(runs: AgentRun[]) {
  return [...runs].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

function connectionSummary(settings: AiSettings, connected: boolean, checking: boolean, message: string): AiConnectionSummary {
  return {
    connected,
    checking,
    provider: settings.provider,
    model: settings.model,
    message,
    revision: 0
  };
}

export function useAiOperator() {
  const [localContext, setLocalContext] = useState<LocalContext | null>(null);
  const [workspaceContext, setWorkspaceContext] = useState<WorkspaceContextSnapshot | null>(null);
  const [mode, setMode] = useState<AppMode>("manual-first");
  const [section, setSection] = useState<AiOperatorSection>("runs");
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [selectedRunId, setSelectedRunId] = useState("");
  const [composingNewMission, setComposingNewMission] = useState(false);
  const [goal, setGoalState] = useState("");
  const [profileId, setProfileId] = useState<AgentRunProfileId>("browser-assessment");
  const [tutorialMode, setTutorialMode] = useState(false);
  const [notice, setNotice] = useState("AI Operator ready. No run starts until you submit a saved-scope goal.");
  const [pending, setPending] = useState(false);
  const [memory, setMemory] = useState<AgentRunMemoryEntry[]>([]);
  const [memorySearch, setMemorySearch] = useState("");
  const [memoryTitle, setMemoryTitle] = useState("");
  const [memoryNotes, setMemoryNotes] = useState("");
  const [settings, setSettings] = useState<AiSettings>(DEFAULT_AI_SETTINGS);
  const [models, setModels] = useState<AiModelOption[]>([]);
  const [connection, setConnection] = useState(() => connectionSummary(DEFAULT_AI_SETTINGS, false, false, "Not connected"));
  const [connectionError, setConnectionError] = useState("");
  const [connectionPending, setConnectionPending] = useState(false);
  const selectedRunIdRef = useRef(selectedRunId);
  selectedRunIdRef.current = selectedRunId;
  const composingNewMissionRef = useRef(composingNewMission);
  composingNewMissionRef.current = composingNewMission;

  const selectSection = useCallback((nextSection: AiOperatorSection) => {
    setSection(nextSection);
    void operatorApi().openAiOperator(nextSection).catch(() => {
      setNotice("AI Operator section state could not be synchronized.");
    });
  }, []);

  const refreshRuns = useCallback(async () => {
    const next = sortRuns(await operatorApi().listAgentRuns());
    setRuns(next);
    const selected = selectedRunIdRef.current;
    if (!composingNewMissionRef.current && (!selected || !next.some((run) => run.id === selected))) {
      setSelectedRunId(executingRun(next)?.id || next[0]?.id || "");
    }
    return next;
  }, []);

  const refreshMemory = useCallback(async () => {
    const next = await operatorApi().getAgentRunMemory();
    setMemory(next);
    return next;
  }, []);

  const loadConnection = useCallback(async () => {
    const api = operatorApi();
    const nextSettings = await api.getAiSettings();
    setSettings(nextSettings);
    const cached = await api.getAiModels(nextSettings.provider);
    setModels(cached);
    return nextSettings;
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const api = operatorApi();
        const [context, workspace, appMode, windowState] = await Promise.all([
          api.getLocalContext(),
          api.getWorkspaceContext(),
          api.getAppMode(),
          api.getAiOperatorWindowState()
        ]);
        if (cancelled) return;
        setLocalContext(context);
        setWorkspaceContext(workspace);
        setMode(appMode);
        setSection(windowState.section);
        const [loadedRuns, , loadedSettings] = await Promise.all([refreshRuns(), refreshMemory(), loadConnection()]);
        const probe = await api.probeAiConnection(loadedSettings);
        if (!cancelled) {
          setConnection(connectionSummary(loadedSettings, probe.ok, false, probe.message));
          setConnectionError(probe.ok ? "" : probe.message);
          const loadedRun = executingRun(loadedRuns) || loadedRuns[0];
          setNotice(loadedRun
            ? `Loaded ${loadedRun.status} run ${loadedRun.id.slice(0, 8)}. Durable feed and controls restored.`
            : "AI Operator ready. No run starts until you submit a saved-scope goal.");
        }
      } catch (error) {
        if (!cancelled) {
          setNotice(error instanceof Error ? error.message : "AI Operator could not load local state.");
        }
      }
    };
    void load();
    const api = window.radarOperator;
    const unsubscribers = api
      ? [
          api.onWorkspaceContextChanged(setWorkspaceContext),
          api.onAppModeChanged((event) => setMode(event.mode)),
          api.onAiOperatorWindowState((state) => setSection(state.section)),
          api.onAgentChanged(() => void refreshRuns()),
          api.onAiConnectionChanged(setConnection)
        ]
      : [];
    const timer = setInterval(() => {
      void refreshRuns();
    }, 4_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [loadConnection, refreshMemory, refreshRuns]);

  const workspaceIdentity = `${workspaceContext?.project?.id || ""}:${workspaceContext?.session?.id || ""}`;
  useEffect(() => {
    if (!workspaceIdentity || workspaceIdentity === ":") {
      return;
    }
    let cancelled = false;
    setSelectedRunId("");
    setComposingNewMission(false);
    void operatorApi().getLocalContext().then((context) => {
      if (!cancelled) setLocalContext(context);
    }).catch(() => undefined);
    void Promise.all([refreshRuns(), refreshMemory()]);
    return () => {
      cancelled = true;
    };
  }, [refreshMemory, refreshRuns, workspaceIdentity]);

  useEffect(() => {
    const sessionId = workspaceContext?.session?.id || localContext?.session.id || "unbound";
    try {
      setGoalState(window.localStorage.getItem(`radar.ai-operator.draft.${sessionId}`) || "");
    } catch {
      setGoalState("");
    }
  }, [localContext?.session.id, workspaceContext?.session?.id]);

  const setGoal = useCallback((value: string) => {
    setGoalState(value);
    const sessionId = workspaceContext?.session?.id || localContext?.session.id || "unbound";
    try {
      window.localStorage.setItem(`radar.ai-operator.draft.${sessionId}`, value.slice(0, 8_000));
    } catch {
      // Draft persistence is best effort and contains no raw evidence.
    }
  }, [localContext?.session.id, workspaceContext?.session?.id]);

  const replaceRun = useCallback((run: AgentRun | null) => {
    if (!run) return;
    setRuns((current) => sortRuns([run, ...current.filter((item) => item.id !== run.id)]));
    setSelectedRunId(run.id);
    setComposingNewMission(false);
  }, []);

  const runningRun = useMemo(() => executingRun(runs), [runs]);
  const activeRun = useMemo(
    () => composingNewMission
      ? runningRun
      : runs.find((run) => run.id === selectedRunId) || runningRun || runs[0] || null,
    [composingNewMission, runningRun, runs, selectedRunId]
  );
  const selectRun = useCallback((runId: string) => {
    setComposingNewMission(false);
    setSelectedRunId(runId);
  }, []);
  const beginNewMission = useCallback(() => {
    if (runningRun) {
      selectRun(runningRun.id);
      setNotice("An AI-First run is already active. Pause or stop it before composing another mission.");
      return;
    }
    setComposingNewMission(true);
    setSelectedRunId("");
    setGoal("");
    setNotice("New bounded mission ready. Nothing runs until Start Run is submitted.");
  }, [runningRun, selectRun, setGoal]);
  const selectedProfile = useMemo(() => getAgentRunProfile(profileId), [profileId]);
  const budgetLabels = useMemo(
    () => agentBudgetLabels(activeRun?.policy || selectedProfile.policy),
    [activeRun?.policy, selectedProfile.policy]
  );
  const budgetExhaustion = getAgentBudgetExhaustion(activeRun);
  const canPause = activeRun?.status === "queued" || activeRun?.status === "running";
  const capabilityReviewRequired = Boolean(
    activeRun?.capabilities?.leases.some((lease) => lease.status === "draft")
  );
  const canResume = Boolean(
    (activeRun?.status === "paused" || activeRun?.status === "failed") &&
    !budgetExhaustion &&
    !capabilityReviewRequired
  );
  const canContinue = Boolean(
    budgetExhaustion && (activeRun?.status === "paused" || activeRun?.status === "failed") && !runningRun
  );
  const canStop = Boolean(activeRun && activeRun.status !== "completed" && activeRun.status !== "stopped");

  const dispatchWorkspaceIntent = useCallback(async (intent: WorkspaceControlIntent, focus = false) => {
    const api = operatorApi();
    const result = await api.dispatchWorkspaceIntent(intent);
    if (!result.ok) {
      setNotice(result.error || "The workspace could not apply that action.");
      return false;
    }
    if (focus) {
      await api.focusWorkspace();
    }
    return true;
  }, []);

  const startRun = useCallback(async () => {
    if (runningRun) {
      selectRun(runningRun.id);
      setNotice("An AI-First run is already active. Pause or stop it before starting another run.");
      return;
    }
    setPending(true);
    try {
      const api = operatorApi();
      const targets = await api.getTargets();
      const decision = decideAgentRunStart({
        goal,
        browserUrl: workspaceContext?.browser.url || "",
        targets,
        workspaceAvailable: Boolean(workspaceContext)
      });
      if (decision.type === "reject") {
        setNotice(decision.reason);
        return;
      }
      if (decision.type === "propose-scope") {
        await dispatchWorkspaceIntent({
          type: "propose-scope-origin",
          origin: decision.origin,
          reason: `AI Operator goal requested ${decision.origin}.`
        }, true);
        setNotice(`Scope consent required for ${decision.origin}. Review and Commit it in the workspace, then start again.`);
        return;
      }
      const run = await api.startAgentRun({
        goal: decision.goal,
        startUrl: decision.startUrl,
        profileId,
        ...(tutorialMode ? { tutorialMode: true } : {})
      });
      replaceRun(run);
      setGoal("");
      setNotice(tutorialMode ? "Tutorial run started in the visible workspace." : "AI-First run started in the visible workspace.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "AI-First run could not start.");
    } finally {
      setPending(false);
    }
  }, [dispatchWorkspaceIntent, goal, profileId, replaceRun, runningRun, selectRun, setGoal, tutorialMode, workspaceContext]);

  const pauseRun = useCallback(async () => {
    if (!activeRun) return;
    setPending(true);
    try {
      replaceRun(await operatorApi().pauseAgentRun(activeRun.id));
      setNotice("Run paused with its durable checkpoint and cumulative budgets preserved.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Run could not be paused.");
    } finally {
      setPending(false);
    }
  }, [activeRun, replaceRun]);

  const resumeRun = useCallback(async () => {
    if (!activeRun) return;
    if (capabilityReviewRequired) {
      setNotice("Review and approve the pending authority in Leases before resuming.");
      return;
    }
    setPending(true);
    try {
      replaceRun(await operatorApi().resumeAgentRun(activeRun.id));
      setNotice(activeRun.policy.tutorialMode ? "The next lesson is queued." : "Run queued from its durable checkpoint.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Run could not be resumed.");
    } finally {
      setPending(false);
    }
  }, [activeRun, capabilityReviewRequired, replaceRun]);

  const continueRun = useCallback(async () => {
    if (!activeRun || runningRun) return;
    setPending(true);
    try {
      const startUrl = activeRun.checkpoint?.startUrl || firstUrlFromText(activeRun.goal) || normalizeUrl(workspaceContext?.browser.url || "");
      const origin = originFromUrl(startUrl);
      const targets = await operatorApi().getTargets();
      if (origin && !isAllowedTarget(startUrl, targets)) {
        await dispatchWorkspaceIntent({ type: "propose-scope-origin", origin, reason: "Continuation requires saved Scope." }, true);
        setNotice(`Scope consent required for ${origin} before continuing.`);
        return;
      }
      const run = await operatorApi().startAgentRun({
        goal: activeRun.goal,
        startUrl,
        profileId: activeRun.profileId,
        continuationOf: activeRun.id,
        ...(activeRun.policy.tutorialMode ? { tutorialMode: true } : {})
      });
      replaceRun(run);
      setNotice(`Continuation ${run.id.slice(0, 8)} started with a fresh bounded budget.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Continuation could not start.");
    } finally {
      setPending(false);
    }
  }, [activeRun, dispatchWorkspaceIntent, replaceRun, runningRun, workspaceContext?.browser.url]);

  const stopRun = useCallback(async () => {
    if (!activeRun) return;
    setPending(true);
    try {
      replaceRun(await operatorApi().stopAgentRun(activeRun.id));
      setNotice("Run stopped. Its transcript and evidence references remain local.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Run could not be stopped.");
    } finally {
      setPending(false);
    }
  }, [activeRun, replaceRun]);

  const returnToManual = useCallback(async () => {
    setPending(true);
    try {
      const next = await operatorApi().setAppMode("manual-first");
      setMode(next);
      await refreshRuns();
      setNotice("Manual-First restored. Active AI work is checkpointed before control returns.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "AI-First remains active because the run could not checkpoint.");
    } finally {
      setPending(false);
    }
  }, [refreshRuns]);

  const recoverRun = useCallback(async (entryId: string, action: AgentRunRecoveryAction) => {
    if (!activeRun) return;
    if (action === "stop-run") {
      await stopRun();
      return;
    }
    setPending(true);
    try {
      const recovered = await operatorApi().recoverAgentRun(activeRun.id, { action, entryId });
      replaceRun(recovered);
      if (
        action === "retry-tool" &&
        recovered &&
        recovered.status !== "queued" &&
        recovered.status !== "running"
      ) {
        setNotice(
          recovered.timeline.at(-1)?.summary ||
            "Automatic retry remains paused. Choose one of the safe recovery actions shown in the feed."
        );
        return;
      }
      setNotice(action === "draft-finding"
        ? "Reviewable low-confidence finding drafted from the failed step."
        : action === "skip-and-continue"
          ? "Failed step skipped; the run is continuing."
          : "Recovery queued from the saved checkpoint.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Recovery could not be applied.");
    } finally {
      setPending(false);
    }
  }, [activeRun, replaceRun, stopRun]);

  const steerMission = useCallback(async (action: AgentMissionSteeringAction) => {
    if (!activeRun?.mission) {
      setNotice("Select a run with a Mission Graph before steering it.");
      return;
    }
    const request: AgentMissionSteeringRequest = { ...action, expectedRevision: activeRun.mission.revision };
    try {
      replaceRun(await operatorApi().steerAgentMission(activeRun.id, request));
      setNotice("Mission Graph updated.");
    } catch (error) {
      if (error instanceof Error && error.message.includes("revision")) await refreshRuns();
      setNotice(error instanceof Error ? error.message : "Mission steering could not be applied.");
    }
  }, [activeRun, refreshRuns, replaceRun]);

  const updateCapabilities = useCallback(async (action: AgentCapabilityAction) => {
    if (!activeRun) return;
    const request: AgentCapabilityActionRequest = {
      ...action,
      expectedRevision: activeRun.capabilities?.revision || 0
    };
    setPending(true);
    try {
      const updated = await operatorApi().updateAgentCapabilities(activeRun.id, request);
      replaceRun(updated);
      setNotice(
        action.action === "grant" && action.resumeAfterApproval
          ? updated?.status === "queued" || updated?.status === "running"
            ? "Capability approved. The run is resuming from its durable checkpoint."
            : updated?.timeline.at(-1)?.note || "Capability approved, but the run remains paused."
          : "Capability ledger updated."
      );
    } catch (error) {
      if (error instanceof Error && error.message.includes("revision")) await refreshRuns();
      setNotice(error instanceof Error ? error.message : "Capability lease action failed.");
    } finally {
      setPending(false);
    }
  }, [activeRun, refreshRuns, replaceRun]);

  const saveMemory = useCallback(async (entry: AgentRunMemoryEntry) => {
    const saved = await operatorApi().saveAgentRunMemory(entry);
    setMemory((items) => [saved, ...items.filter((item) => item.id !== saved.id)]);
    setNotice(`Run memory saved: ${saved.title}`);
    return saved;
  }, []);

  const confirmTimelineMemory = useCallback(async (entryId: string, status: "confirmed" | "dismissed") => {
    const result = activeRun?.timeline.find((entry) => entry.id === entryId)?.toolResult;
    if (!result?.ok || result.tool !== "proposeRunMemory") return;
    await saveMemory({
      ...result.data.memory,
      status,
      ...(status === "dismissed" ? { dismissedReason: result.data.memory.dismissedReason || "Dismissed by operator." } : {}),
      updatedAt: new Date().toISOString()
    });
  }, [activeRun, saveMemory]);

  const createMemory = useCallback(async () => {
    if (!memoryTitle.trim() || !memoryNotes.trim()) {
      setNotice("Run memory needs a title and notes.");
      return;
    }
    const now = new Date().toISOString();
    const fallbackId = `memory_${now.replace(/[^0-9]/g, "")}`;
    const entry = normalizeAgentRunMemory({
      id: fallbackId,
      createdAt: now,
      updatedAt: now,
      kind: "hypothesis",
      status: "confirmed",
      title: memoryTitle,
      notes: memoryNotes,
      evidenceRefs: workspaceContext?.selection ? [`${workspaceContext.selection.kind}:${workspaceContext.selection.id}`] : []
    }, fallbackId, now);
    if (!entry) return;
    await saveMemory(entry);
    setMemoryTitle("");
    setMemoryNotes("");
  }, [memoryNotes, memoryTitle, saveMemory, workspaceContext?.selection]);

  const deleteMemory = useCallback(async (id: string) => {
    const result = await operatorApi().deleteAgentRunMemory(id);
    setMemory(result.memory);
    setNotice("Run memory deleted.");
  }, []);

  const filteredMemory = useMemo(() => {
    const query = memorySearch.trim().toLowerCase();
    return query
      ? memory.filter((entry) => [entry.title, entry.notes, entry.kind, entry.status, entry.evidenceRefs.join(" ")].join(" ").toLowerCase().includes(query))
      : memory;
  }, [memory, memorySearch]);

  const probeConnection = useCallback(async (nextSettings = settings) => {
    setConnectionPending(true);
    setConnectionError("");
    setConnection(connectionSummary(nextSettings, false, true, "Checking connection"));
    try {
      const probe = await operatorApi().probeAiConnection(nextSettings);
      setConnection(connectionSummary(nextSettings, probe.ok, false, probe.message));
      if (!probe.ok) setConnectionError(probe.message);
      return probe;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Connection check failed.";
      setConnection(connectionSummary(nextSettings, false, false, message));
      setConnectionError(message);
      return null;
    } finally {
      setConnectionPending(false);
    }
  }, [settings]);

  const editSettings = useCallback((nextSettings: AiSettings) => {
    setSettings(nextSettings);
    setConnection(connectionSummary(nextSettings, false, false, "Save & Test to verify"));
    setConnectionError("");
  }, []);

  const saveSettings = useCallback(async () => {
    setConnectionPending(true);
    try {
      const saved = await operatorApi().setAiSettings(settings);
      setSettings(saved);
      const probe = await probeConnection(saved);
      if (probe?.ok) {
        const nextModels = await operatorApi().refreshAiModels(saved);
        setModels(nextModels);
        const nextSettings = { ...saved, model: pickValidModel(saved.model, nextModels) };
        setSettings(nextSettings);
        setConnection((current) => ({ ...current, model: nextSettings.model }));
      }
    } catch (error) {
      setConnectionError(error instanceof Error ? error.message : "AI settings could not be saved.");
    } finally {
      setConnectionPending(false);
    }
  }, [probeConnection, settings]);

  const connectPreset = useCallback(async (presetId: AiConnectPresetId) => {
    setConnectionPending(true);
    try {
      const result = await operatorApi().connectAi(presetId);
      setSettings(result.settings);
      setConnection(connectionSummary(result.settings, result.probe.ok, false, result.probe.message));
      setConnectionError(result.probe.ok ? "" : result.probe.message);
      if (result.probe.ok) {
        const nextModels = await operatorApi().refreshAiModels(result.settings);
        const nextSettings = { ...result.settings, model: pickValidModel(result.settings.model, nextModels) };
        setModels(nextModels);
        setSettings(nextSettings);
        setConnection((current) => ({ ...current, model: nextSettings.model }));
      } else {
        setModels([]);
      }
    } catch (error) {
      setConnectionError(error instanceof Error ? error.message : "AI connection failed.");
    } finally {
      setConnectionPending(false);
    }
  }, []);

  const loginCursor = useCallback(async () => {
    setConnectionPending(true);
    try {
      const probe = await operatorApi().loginCursor();
      setConnection(connectionSummary(settings, probe.ok, false, probe.message));
      setConnectionError(probe.ok ? "" : probe.message);
    } catch (error) {
      setConnectionError(error instanceof Error ? error.message : "Cursor sign-in failed.");
    } finally {
      setConnectionPending(false);
    }
  }, [settings]);

  return {
    localContext,
    workspaceContext,
    mode,
    section,
    setSection: selectSection,
    runs,
    activeRun,
    runningRun,
    selectedRunId,
    setSelectedRunId: selectRun,
    beginNewMission,
    goal,
    setGoal,
    profileId,
    setProfileId,
    profiles: AGENT_RUN_PROFILES,
    selectedProfile,
    tutorialMode,
    setTutorialMode,
    budgetLabels,
    budgetExhaustion,
    capabilityReviewRequired,
    canPause,
    canResume,
    canContinue,
    canStop,
    pending,
    notice,
    setNotice,
    startRun,
    pauseRun,
    resumeRun,
    continueRun,
    stopRun,
    returnToManual,
    recoverRun,
    steerMission,
    updateCapabilities,
    dispatchWorkspaceIntent,
    memory,
    filteredMemory,
    memorySearch,
    setMemorySearch,
    memoryTitle,
    setMemoryTitle,
    memoryNotes,
    setMemoryNotes,
    confirmTimelineMemory,
    createMemory,
    deleteMemory,
    settings,
    setSettings: editSettings,
    models,
    connection,
    connectionError,
    connectionPending,
    probeConnection,
    saveSettings,
    connectPreset,
    loginCursor
  };
}

export type AiOperatorController = ReturnType<typeof useAiOperator>;
