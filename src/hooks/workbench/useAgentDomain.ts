import { useState, useCallback, useMemo, useEffect, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import {
  firstUrlFromText,
  formatHeaders,
  isAllowedTarget,
  normalizeUrl,
  originFromUrl
} from "../../lib";
import { AGENT_RUN_PROFILES, agentBudgetLabels, getAgentRunProfile } from "../../../shared/agentProfiles.js";
import { normalizeAgentRunMemory } from "../../../shared/agentMemory.js";
import type {
  AgentRun,
  AgentRunProfileId,
  AgentRunMemoryEntry,
  AgentMissionSteeringAction,
  AgentMissionSteeringRequest,
  AgentCapabilityAction,
  AgentCapabilityActionRequest,
  AgentRunRecoveryAction,
  AppMode,
  BurstResult,
  CapturedRequest,
  InterceptQueueItem,
  InterceptState,
  ReplayDraft,
  ReplayResult,
  ReplayTabState,
  WorkflowDefinition
} from "../../types";
import type { WorkView } from "./viewMeta";

export interface AgentDomainPorts {
  address: string;
  setAddress: (address: string) => void;
  setNotice: (message: string) => void;
  setActiveView: (view: WorkView) => void;
  setDraft: (draft: ReplayDraft) => void;
  setHeadersText: (text: string) => void;
  setLastResponse: (response: ReplayResult | null) => void;
  setLastBurst: (burst: BurstResult | null) => void;
  setSelectedId: (id: string) => void;
  setSelectedIds: (ids: string[]) => void;
  selectionAnchorRef: MutableRefObject<string>;
  setInterceptState: Dispatch<SetStateAction<InterceptState>>;
  setInterceptSelectedId: (id: string) => void;
  interceptDraftItemRef: MutableRefObject<string>;
  setInterceptDraft: (draft: ReplayDraft) => void;
  setInterceptHeadersText: (text: string) => void;
  setInterceptResponseStatus: (status: number) => void;
  setInterceptResponseStatusText: (text: string) => void;
  hydrateInterceptDraft: (item: InterceptQueueItem) => void;
  setTrafficSearch: (search: string) => void;
  setReplayTabState: (state: ReplayTabState) => void;
  setAutomatePayloadText: (text: string) => void;
  setAutomateRulesText: (text: string) => void;
  setAutomateSessionName: (name: string) => void;
  setActiveAutomateSessionId: (id: string) => void;
  setAutomateResultFilter: (filter: string) => void;
  setAiPreparedWorkflowDraft: (draft: WorkflowDefinition | null) => void;
  setSelectedWorkflowId: (id: string) => void;
  targetText: string;
  setTargetText: (text: string) => void;
  appMode: AppMode;
}

function isActiveAgentRun(run: AgentRun | null | undefined) {
  return run?.status === "queued" || run?.status === "running";
}

export type AgentDomain = ReturnType<typeof useAgentDomain>;

export function useAgentDomain(ports: AgentDomainPorts) {
  const portsRef = useRef(ports);
  portsRef.current = ports;
  const appMode = ports.appMode;
  const [agentGoal, setAgentGoal] = useState("");
  const [agentProfileId, setAgentProfileId] = useState<AgentRunProfileId>("browser-assessment");
  const [agentTutorialMode, setAgentTutorialMode] = useState(false);
  const [agentRuns, setAgentRuns] = useState<AgentRun[]>([]);
  const [selectedAgentRunId, setSelectedAgentRunId] = useState("");
  const [agentRunMemory, setAgentRunMemory] = useState<AgentRunMemoryEntry[]>([]);
  const [agentRunMemorySearch, setAgentRunMemorySearch] = useState("");
  const agentUiCursorRef = useRef<{ runId: string; entryId: string } | null>(null);

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

  const startAgentRun = useCallback(async () => {
    if (!window.radar) {
      portsRef.current.setNotice("Run in Electron to start an agent run.");
      return;
    }
    if (executingAgentRun) {
      setSelectedAgentRunId(executingAgentRun.id);
      portsRef.current.setNotice("An AI-First run is already active. Pause or stop it before starting another run.");
      return;
    }
    const goal = agentGoal.trim();
    if (!goal) {
      portsRef.current.setNotice("Describe a goal before starting AI-First.");
      return;
    }
    const goalUrl = firstUrlFromText(goal);
    const startUrl = goalUrl || normalizeUrl(portsRef.current.address);
    const scopeOrigin = goalUrl ? originFromUrl(goalUrl) : "";

    if (goalUrl && scopeOrigin) {
      const latestTargets = await window.radar.getTargets();
      if (!isAllowedTarget(goalUrl, latestTargets)) {
        const draftTargets = portsRef.current.targetText
          .split("\n")
          .map((item) => item.trim())
          .filter(Boolean);
        const proposedTargets = [...new Set([...latestTargets, ...draftTargets, scopeOrigin])];
        portsRef.current.setTargetText(proposedTargets.join("\n"));
        portsRef.current.setActiveView("scope");
        portsRef.current.setNotice(
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
    portsRef.current.setAddress(startUrl);
    setAgentRuns((items) => [run, ...items.filter((item) => item.id !== run.id)]);
    setSelectedAgentRunId(run.id);
    setAgentGoal("");
    portsRef.current.setNotice(
      agentTutorialMode
        ? "Tutorial Mode started. Review each evidence lesson, then continue at your pace."
        : scopeOrigin
          ? `AI-First run started on ${scopeOrigin}`
          : "AI-First run started"
    );
  }, [agentGoal, agentProfileId, agentTutorialMode, executingAgentRun]);

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
        portsRef.current.setNotice("AI-First run paused with budgets and checkpoint preserved.");
      }
    } catch (error) {
      portsRef.current.setNotice(error instanceof Error ? error.message : "Agent run could not be paused.");
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
        portsRef.current.setNotice("AI-First run queued from its durable checkpoint.");
      }
    } catch (error) {
      portsRef.current.setNotice(error instanceof Error ? error.message : "Agent run could not be resumed.");
    }
  }, [activeAgentRun]);

  const continueAgentRun = useCallback(async () => {
    if (!window.radar || !activeAgentRun) {
      return;
    }
    if (executingAgentRun) {
      setSelectedAgentRunId(executingAgentRun.id);
      portsRef.current.setNotice("An AI-First run is already active. Pause or stop it before starting a continuation.");
      return;
    }
    const startUrl =
      activeAgentRun.checkpoint?.startUrl ||
      firstUrlFromText(activeAgentRun.goal) ||
      normalizeUrl(portsRef.current.address);
    const scopeOrigin = startUrl ? originFromUrl(startUrl) : "";
    if (startUrl && scopeOrigin) {
      const latestTargets = await window.radar.getTargets();
      if (!isAllowedTarget(startUrl, latestTargets)) {
        const draftTargets = portsRef.current.targetText
          .split("\n")
          .map((item) => item.trim())
          .filter(Boolean);
        portsRef.current.setTargetText([...new Set([...latestTargets, ...draftTargets, scopeOrigin])].join("\n"));
        portsRef.current.setActiveView("scope");
        portsRef.current.setNotice(
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
      portsRef.current.setAddress(startUrl);
      setAgentRuns((items) => [run, ...items.filter((item) => item.id !== run.id)]);
      setSelectedAgentRunId(run.id);
      portsRef.current.setNotice(`Continuation ${run.id.slice(0, 8)} started with a fresh bounded budget. ${sourceRun.id.slice(0, 8)} remains preserved.`);
    } catch (error) {
      portsRef.current.setNotice(error instanceof Error ? error.message : "A continuation run could not be started.");
    }
  }, [activeAgentRun, executingAgentRun]);

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
          portsRef.current.setNotice("Draft-finding prompt prepared from the selected failed step.");
          return;
        }
        portsRef.current.setNotice(
          action === "skip-and-continue"
            ? "Failed step skipped; the run is continuing from its checkpoint."
            : "Recovery queued with preserved budgets and fresh visible state."
        );
      } catch (error) {
        portsRef.current.setNotice(error instanceof Error ? error.message : "Agent recovery could not be started.");
      }
    },
    [activeAgentRun, stopAgentRun]
  );

  const steerAgentMission = useCallback(
    async (action: AgentMissionSteeringAction) => {
      const run = activeAgentRun;
      if (!window.radar || !run?.mission) {
        portsRef.current.setNotice("Select a saved AI-First run with a Mission Graph before steering it.");
        return;
      }
      if (run.status !== "paused" && run.status !== "failed") {
        portsRef.current.setNotice("Pause the run and wait for the active step to settle before steering its Mission Graph.");
        return;
      }
      const request: AgentMissionSteeringRequest = { ...action, expectedRevision: run.mission.revision };
      try {
        const steered = await window.radar.steerAgentMission(run.id, request);
        if (steered) {
          setAgentRuns((items) => [steered, ...items.filter((item) => item.id !== steered.id)]);
          setSelectedAgentRunId(steered.id);
          portsRef.current.setNotice(`Mission Graph updated to revision ${steered.mission?.revision ?? run.mission.revision}.`);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Mission steering could not be applied.";
        if (message.includes("revision")) {
          const refreshed = await window.radar.listAgentRuns();
          setAgentRuns(refreshed);
        }
        portsRef.current.setNotice(message);
      }
    },
    [activeAgentRun]
  );

  const updateAgentCapabilities = useCallback(
    async (action: AgentCapabilityAction) => {
      const run = activeAgentRun;
      if (!window.radar || !run) {
        portsRef.current.setNotice("Select a saved AI-First run before changing capability leases.");
        return;
      }
      if (run.status !== "paused" && run.status !== "failed") {
        portsRef.current.setNotice("Pause the run and wait for the active step to settle before changing capability leases.");
        return;
      }
      const expectedRevision = run.capabilities?.revision || 0;
      const request: AgentCapabilityActionRequest = { ...action, expectedRevision };
      try {
        const updated = await window.radar.updateAgentCapabilities(run.id, request);
        if (updated) {
          setAgentRuns((items) => [updated, ...items.filter((item) => item.id !== updated.id)]);
          setSelectedAgentRunId(updated.id);
          portsRef.current.setNotice(`Capability ledger updated to revision ${updated.capabilities?.revision ?? expectedRevision}.`);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Capability lease action failed.";
        if (message.includes("revision")) {
          setAgentRuns(await window.radar.listAgentRuns());
        }
        portsRef.current.setNotice(message);
      }
    },
    [activeAgentRun]
  );

  const saveAgentRunMemory = useCallback(async (entry: AgentRunMemoryEntry) => {
    if (!window.radar?.saveAgentRunMemory) {
      portsRef.current.setNotice("Run in Electron to save run memory.");
      return null;
    }
    const saved = await window.radar.saveAgentRunMemory(entry);
    setAgentRunMemory((items) => [saved, ...items.filter((item) => item.id !== saved.id)]);
    portsRef.current.setNotice(`Run memory saved: ${saved.title}`);
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
      portsRef.current.setNotice("Run in Electron to delete run memory.");
      return null;
    }
    const result = await window.radar.deleteAgentRunMemory(entryId);
    setAgentRunMemory(result.memory);
    portsRef.current.setNotice("Run memory deleted");
    return result;
  }, []);

  // Agent timeline mirror effect
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
        portsRef.current.setActiveView(entry.toolCall.input.view);
      }

      if (appliesVisibleToolCall && entry.toolCall?.tool === "sendReplay") {
        portsRef.current.setDraft(entry.toolCall.input.draft);
        portsRef.current.setHeadersText(formatHeaders(entry.toolCall.input.draft.headers));
        portsRef.current.setLastBurst(null);
      }

      if (entry.toolResult?.tool === "sendReplay" && entry.toolResult.ok) {
        portsRef.current.setLastResponse(entry.toolResult.data);
      }

      if (entry.toolResult?.tool === "getCaptures" && entry.toolResult.ok) {
        const firstCapture =
          entry.toolResult.data.captures.find((capture: CapturedRequest) => capture.allowed) ||
          entry.toolResult.data.captures[0];
        if (firstCapture) {
          portsRef.current.setSelectedId(firstCapture.id);
          portsRef.current.setSelectedIds([firstCapture.id]);
          portsRef.current.selectionAnchorRef.current = firstCapture.id;
        }
      }

      if (entry.toolResult?.tool === "getInterceptQueue" && entry.toolResult.ok) {
        const queue = entry.toolResult.data.queue;
        portsRef.current.setActiveView("intercept");
        portsRef.current.setInterceptState((current) => ({ ...current, queue }));
        const firstItem = queue[0];
        if (firstItem) {
          portsRef.current.hydrateInterceptDraft(firstItem);
        }
      }

      if (entry.toolResult?.tool === "prepareInterceptEdit" && entry.toolResult.ok) {
        const { item, draft: preparedDraft, response, note } = entry.toolResult.data;
        portsRef.current.setActiveView("intercept");
        portsRef.current.setInterceptState((current) => ({
          ...current,
          queue: current.queue.some((queued) => queued.id === item.id)
            ? current.queue.map((queued) => (queued.id === item.id ? item : queued))
            : [item, ...current.queue]
        }));
        portsRef.current.setInterceptSelectedId(item.id);
        portsRef.current.interceptDraftItemRef.current = item.id;
        if (response) {
          portsRef.current.setInterceptDraft({ method: item.method, url: item.url, headers: response.headers, body: response.body });
          portsRef.current.setInterceptHeadersText(formatHeaders(response.headers));
          portsRef.current.setInterceptResponseStatus(response.status);
          portsRef.current.setInterceptResponseStatusText(response.statusText);
        } else if (preparedDraft) {
          portsRef.current.setInterceptDraft(preparedDraft);
          portsRef.current.setInterceptHeadersText(formatHeaders(preparedDraft.headers));
          portsRef.current.setInterceptResponseStatus(item.status || 200);
          portsRef.current.setInterceptResponseStatusText(item.statusText || "");
        }
        portsRef.current.setNotice(note);
      }

      if (entry.toolResult?.tool === "prepareTrafficQuery" && entry.toolResult.ok) {
        portsRef.current.setTrafficSearch(entry.toolResult.data.query);
        portsRef.current.setActiveView("traffic");
        portsRef.current.setNotice(entry.toolResult.data.reason);
      }

      if (entry.toolResult?.tool === "getSitemapCoverage" && entry.toolResult.ok) {
        portsRef.current.setActiveView("sitemap");
      }

      if (entry.toolResult?.tool === "prepareReplayTab" && entry.toolResult.ok) {
        const { tabId, draft: preparedDraft, note } = entry.toolResult.data;
        void window.radar?.getReplayTabState().then((state) => {
          if (!state) {
            return;
          }
          portsRef.current.setReplayTabState(state);
          const tab = state.tabs.find((item) => item.id === tabId);
          portsRef.current.setHeadersText(formatHeaders(tab?.draft.headers || preparedDraft.headers));
          portsRef.current.setLastResponse(null);
          portsRef.current.setLastBurst(null);
        });
        portsRef.current.setActiveView("repeater");
        portsRef.current.setNotice(note);
      }

      if (entry.toolResult?.tool === "prepareAutomateDraft" && entry.toolResult.ok) {
        const { draft: preparedDraft, payloads, rules, name, note } = entry.toolResult.data;
        portsRef.current.setDraft(preparedDraft);
        portsRef.current.setHeadersText(formatHeaders(preparedDraft.headers));
        portsRef.current.setAutomatePayloadText(payloads.join("\n"));
        portsRef.current.setAutomateRulesText(JSON.stringify(rules, null, 2));
        portsRef.current.setAutomateSessionName(name);
        portsRef.current.setLastResponse(null);
        portsRef.current.setLastBurst(null);
        portsRef.current.setActiveView("automate");
        portsRef.current.setNotice(note);
      }

      if (entry.toolResult?.tool === "prepareWorkflowDraft" && entry.toolResult.ok) {
        portsRef.current.setAiPreparedWorkflowDraft(entry.toolResult.data.workflow);
        portsRef.current.setSelectedWorkflowId(entry.toolResult.data.workflow.id);
        portsRef.current.setActiveView("workflows");
        portsRef.current.setNotice(entry.toolResult.data.note);
      }

      if (entry.toolResult?.tool === "proposeRunMemory" && entry.toolResult.ok) {
        portsRef.current.setNotice(`AI proposed run memory: ${entry.toolResult.data.memory.title}`);
      }

      if (entry.toolResult?.tool === "analyzeAutomateResults" && entry.toolResult.ok) {
        portsRef.current.setActiveAutomateSessionId(entry.toolResult.data.sessionId);
        portsRef.current.setAutomateResultFilter(entry.toolResult.data.outlierResultIds.length > 0 ? "outliers" : "matches");
        portsRef.current.setActiveView("automate");
        portsRef.current.setNotice(
          `Automate analysis: ${entry.toolResult.data.resultCount} results, ${entry.toolResult.data.clusters.length} clusters`
        );
      }

      if (entry.toolResult?.tool === "compareReplayResults" && entry.toolResult.ok) {
        portsRef.current.setActiveView("repeater");
        portsRef.current.setNotice(
          entry.toolResult.data.identical
            ? "Compared replay results: no differences"
            : `Compared replay results: status ${entry.toolResult.data.statusBefore} → ${entry.toolResult.data.statusAfter}`
        );
      }
    }

    agentUiCursorRef.current = { runId: activeAgentRun.id, entryId: lastEntry.id };
  }, [activeAgentRun, appMode]);

  return {
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
    setAgentRuns,
    selectedAgentRunId,
    setSelectedAgentRunId,
    activeAgentRun,
    executingAgentRun,
    startAgentRun,
    pauseAgentRun,
    resumeAgentRun,
    continueAgentRun,
    stopAgentRun,
    recoverAgentRun,
    steerAgentMission,
    updateAgentCapabilities,
    agentRunMemory,
    setAgentRunMemory,
    filteredAgentRunMemory,
    agentRunMemorySearch,
    setAgentRunMemorySearch,
    confirmAgentRunMemoryFromTimeline,
    dismissAgentRunMemoryFromTimeline,
    createAgentRunMemory,
    deleteAgentRunMemory
  };
}
