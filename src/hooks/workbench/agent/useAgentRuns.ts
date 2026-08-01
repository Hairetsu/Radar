import { useCallback, useEffect, useMemo, useState, type MutableRefObject } from "react";
import { AGENT_RUN_PROFILES, agentBudgetLabels, getAgentRunProfile } from "../../../../shared/agentProfiles.js";
import { firstUrlFromText, isAllowedTarget, normalizeUrl, originFromUrl } from "../../../lib";
import type { AgentRun, AgentRunProfileId, AgentRunRecoveryAction } from "../../../types";
import type { AgentTimelineProjectionPorts } from "./useAgentTimelineProjection";

type AgentRunPorts = Pick<AgentTimelineProjectionPorts, "setActiveView" | "setNotice"> & {
  address: string;
  setAddress: (address: string) => void;
  targetText: string;
  setTargetText: (text: string) => void;
};

function isActiveAgentRun(run: AgentRun | null | undefined) {
  return run?.status === "queued" || run?.status === "running";
}

export function useAgentRuns<TPorts extends AgentRunPorts>(portsRef: MutableRefObject<TPorts>) {
  const [agentGoal, setAgentGoal] = useState("");
  const [agentProfileId, setAgentProfileId] = useState<AgentRunProfileId>("browser-assessment");
  const [agentTutorialMode, setAgentTutorialMode] = useState(false);
  const [agentRuns, setAgentRuns] = useState<AgentRun[]>([]);
  const [selectedAgentRunId, setSelectedAgentRunId] = useState("");

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
  }, [agentGoal, agentProfileId, agentTutorialMode, executingAgentRun, portsRef]);

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
  }, [activeAgentRun, portsRef]);

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
  }, [activeAgentRun, portsRef]);

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
  }, [activeAgentRun, executingAgentRun, portsRef]);

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
    [activeAgentRun, portsRef, stopAgentRun]
  );

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
    recoverAgentRun
  };
}
