import {
  PanelRightClose,
  PanelRightOpen,
  Pause,
  Play,
  Square
} from "lucide-react";
import { StatusBadge, StatusDot } from "../radar/primitives";
import { Button } from "../ui/button";
import type { AgentRun, AgentTimelineEntry } from "../../types";
import { cn, timelineEntryText } from "../../lib";

export type AgentMissionDockProps = {
  className?: string;
  activeAgentRun: AgentRun | null;
  activeAgentRunning: boolean;
  activeAgentPausable: boolean;
  activeAgentResumable: boolean;
  activeAgentStoppable: boolean;
  latestAgentTimelineEntry: AgentTimelineEntry | null;
  aiDrawerOpen: boolean;
  onToggleAiDrawer: () => void;
  onPauseAgentRun: () => void;
  onResumeAgentRun: () => void;
  onStopAgentRun: () => void;
};

export function AgentMissionDock({
  className,
  activeAgentRun,
  activeAgentRunning,
  activeAgentPausable,
  activeAgentResumable,
  activeAgentStoppable,
  latestAgentTimelineEntry,
  aiDrawerOpen,
  onToggleAiDrawer,
  onPauseAgentRun,
  onResumeAgentRun,
  onStopAgentRun
}: AgentMissionDockProps) {
  return (
    <div
      className={cn(
        "flex min-w-0 items-center gap-3 border-b border-rule/70 bg-ink/70 px-3 py-2 backdrop-blur-xl",
        className
      )}
      data-testid="agentMissionDock"
      data-component="agentMissionDock"
    >
      <StatusDot
        tone={activeAgentRunning ? "good" : activeAgentRun?.status === "failed" ? "danger" : activeAgentRun?.status === "paused" ? "warn" : "ghost"}
        className={activeAgentRunning ? "animate-[pulse_1.4s_ease-in-out_infinite]" : undefined}
      />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="shrink-0 font-mono text-nano font-semibold uppercase tracking-eyebrow text-signal">
            AI Mission
          </span>
          <strong className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap font-display text-lead uppercase tracking-data text-bone">
            {activeAgentRun?.goal || "Configure a bounded run"}
          </strong>
        </div>
        <p className="mt-0.5 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap font-mono text-micro text-muted">
          {latestAgentTimelineEntry ? timelineEntryText(latestAgentTimelineEntry) : "Evidence remains visible while AI operations stay in the side drawer."}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5 max-[760px]:hidden">
        <StatusBadge>{activeAgentRun?.status || "idle"}</StatusBadge>
        {activeAgentRun && <StatusBadge>{activeAgentRun.timeline.length} steps</StatusBadge>}
      </div>
      {activeAgentPausable && (
        <Button type="button" variant="ghost" size="compact" onClick={onPauseAgentRun} data-testid="dockPauseAgentRun">
          <Pause size={12} strokeWidth={1.8} />
          Pause
        </Button>
      )}
      {activeAgentResumable && (
        <Button type="button" variant="ghost" size="compact" onClick={onResumeAgentRun} data-testid="dockResumeAgentRun">
          <Play size={12} strokeWidth={1.8} />
          {activeAgentRun?.policy.tutorialMode ? "Continue" : "Resume"}
        </Button>
      )}
      {activeAgentStoppable && (
        <Button type="button" variant="ghost" size="compact" onClick={onStopAgentRun} data-testid="dockStopAgentRun">
          <Square size={12} strokeWidth={1.8} />
          Stop
        </Button>
      )}
      <Button
        type="button"
        variant={aiDrawerOpen ? "ghost" : "outline"}
        size="compact"
        onClick={onToggleAiDrawer}
        data-testid="toggleAiDrawer"
        data-component="toggleAiDrawer"
      >
        {aiDrawerOpen ? <PanelRightClose size={13} strokeWidth={1.7} /> : <PanelRightOpen size={13} strokeWidth={1.7} />}
        {aiDrawerOpen ? "Close" : "Operations"}
      </Button>
    </div>
  );
}
