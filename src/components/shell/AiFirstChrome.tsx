import { getAgentBudgetExhaustion } from "../../../shared/agentProfiles.js";
import type { AppMode } from "../../types";
import { AgentMissionDock } from "./AgentMissionDock";
import {
  AiOperationsDrawer,
  useAiOperationsDrawerLocalState,
  type AiOperationsDrawerLocalState,
  type AiOperationsDrawerProps
} from "./AiOperationsDrawer";

export type AiFirstChromeProps = {
  appMode: AppMode;
  agentRuns: AiOperationsDrawerProps["agentRuns"];
  activeAgentRun: AiOperationsDrawerProps["activeAgentRun"];
  pauseAgentRun: AiOperationsDrawerProps["pauseAgentRun"];
  resumeAgentRun: AiOperationsDrawerProps["resumeAgentRun"];
  stopAgentRun: AiOperationsDrawerProps["stopAgentRun"];
  drawerProps: Omit<
    AiOperationsDrawerProps,
    | "onClose"
    | "drawerWidth"
    | "onDrawerWidthChange"
    | "agentMemoryTitle"
    | "onAgentMemoryTitleChange"
    | "agentMemoryNotes"
    | "onAgentMemoryNotesChange"
    | "activeAgentRunning"
    | "activeAgentPausable"
    | "activeAgentResumable"
    | "activeAgentStoppable"
    | "activeAgentContinuable"
  >;
  /**
   * Owned by App so the workspace can reserve the docked drawer's width.
   */
  drawer: AiOperationsDrawerLocalState;
};

export function AiFirstChrome({
  appMode,
  agentRuns,
  activeAgentRun,
  pauseAgentRun,
  resumeAgentRun,
  stopAgentRun,
  drawerProps,
  drawer: local
}: AiFirstChromeProps) {
  const setAiDrawerOpen = (open: boolean) => {
    local.setAiDrawerOpen(open);
  };

  const activeAgentRunning = agentRuns.some((run) => run.status === "queued" || run.status === "running");
  const activeAgentPausable = activeAgentRun?.status === "queued" || activeAgentRun?.status === "running";
  const activeAgentBudgetExhaustion = getAgentBudgetExhaustion(activeAgentRun);
  const activeAgentResumable =
    (activeAgentRun?.status === "paused" || activeAgentRun?.status === "failed") && !activeAgentBudgetExhaustion;
  const activeAgentContinuable = Boolean(
    activeAgentBudgetExhaustion &&
      (activeAgentRun?.status === "paused" || activeAgentRun?.status === "failed") &&
      !activeAgentRunning
  );
  const activeAgentStoppable = Boolean(
    activeAgentRun && activeAgentRun.status !== "completed" && activeAgentRun.status !== "stopped"
  );
  const latestAgentTimelineEntry = activeAgentRun?.timeline[activeAgentRun.timeline.length - 1] || null;

  if (appMode !== "ai-first") {
    return null;
  }

  return (
    <>
      <AgentMissionDock
        className="radar-ai-inset"
        activeAgentRun={activeAgentRun}
        activeAgentRunning={activeAgentRunning}
        activeAgentPausable={activeAgentPausable}
        activeAgentResumable={activeAgentResumable}
        activeAgentStoppable={activeAgentStoppable}
        latestAgentTimelineEntry={latestAgentTimelineEntry}
        aiDrawerOpen={local.aiDrawerOpen}
        onToggleAiDrawer={() => setAiDrawerOpen(!local.aiDrawerOpen)}
        onPauseAgentRun={pauseAgentRun}
        onResumeAgentRun={resumeAgentRun}
        onStopAgentRun={stopAgentRun}
      />
      {local.aiDrawerOpen && (
        <AiOperationsDrawer
          {...drawerProps}
          onClose={() => setAiDrawerOpen(false)}
          drawerWidth={local.aiDrawerWidth}
          onDrawerWidthChange={local.setAiDrawerWidth}
          agentMemoryTitle={local.agentMemoryTitle}
          onAgentMemoryTitleChange={local.setAgentMemoryTitle}
          agentMemoryNotes={local.agentMemoryNotes}
          onAgentMemoryNotesChange={local.setAgentMemoryNotes}
          activeAgentRunning={activeAgentRunning}
          activeAgentPausable={activeAgentPausable}
          activeAgentResumable={activeAgentResumable}
          activeAgentStoppable={activeAgentStoppable}
          activeAgentContinuable={activeAgentContinuable}
        />
      )}
    </>
  );
}

export { useAiOperationsDrawerLocalState };
