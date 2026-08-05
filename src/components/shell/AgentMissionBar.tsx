import { ExternalLink, KeyRound, Pause, Play, Square, UserRound } from "lucide-react";
import type { AgentRun, AppMode } from "../../types";
import { timelineEntryText } from "../../lib";
import { Button } from "../ui/button";
import { StatusBadge, StatusDot } from "../radar/primitives";

function attentionCount(run: AgentRun | null) {
  if (!run) return 0;
  return run.timeline.filter((entry) =>
    entry.phase === "failure" || entry.phase === "policy-block" || Boolean(entry.recoveryActions?.length)
  ).length + run.findings.length;
}

export function AgentMissionBar({
  mode,
  run,
  operatorVisible,
  onPause,
  onResume,
  onStop,
  onReturnToManual,
  onOpenOperator
}: {
  mode: AppMode;
  run: AgentRun | null;
  operatorVisible: boolean;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onReturnToManual: () => void;
  onOpenOperator: () => void;
}) {
  const latest = run?.timeline.at(-1) || null;
  const running = run?.status === "queued" || run?.status === "running";
  const pausable = running;
  const capabilityReviewRequired = Boolean(
    run?.capabilities?.leases.some((lease) => lease.status === "draft")
  );
  const resumable = (run?.status === "paused" || run?.status === "failed") && !capabilityReviewRequired;
  const stoppable = Boolean(run && run.status !== "completed" && run.status !== "stopped");
  const attention = attentionCount(run);

  return (
    <div className="flex min-w-0 items-center gap-3 border-b border-rule/70 bg-ink/76 px-3 py-2 backdrop-blur-xl" data-testid="agentMissionBar" data-component="agentMissionBar">
      <StatusDot tone={running ? "good" : run?.status === "failed" ? "danger" : run?.status === "paused" ? "warn" : "ghost"} className={running ? "animate-[pulse_1.4s_ease-in-out_infinite]" : undefined} />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="shrink-0 rd-eyebrow text-signal">AI Mission</span>
          <strong className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap font-display text-lead uppercase tracking-data text-bone">{run?.goal || (operatorVisible ? "AI Operator connected" : "AI-First ready")}</strong>
        </div>
        <p className="mt-0.5 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap font-mono text-micro text-muted">{latest ? timelineEntryText(latest) : "The evidence workspace remains the visible execution surface."}</p>
      </div>
      <div className="hidden shrink-0 items-center gap-1 min-[820px]:flex">
        <StatusBadge tone={mode === "ai-first" ? "move" : "ghost"}>{mode}</StatusBadge>
        <StatusBadge>{run?.status || "idle"}</StatusBadge>
        {attention > 0 && <StatusBadge tone="warn">{attention} attention</StatusBadge>}
      </div>
      {pausable && <Button type="button" variant="ghost" size="compact" onClick={onPause} data-testid="missionPauseAgentRun"><Pause size={12} /> Pause</Button>}
      {capabilityReviewRequired && <Button type="button" variant="outline" size="compact" onClick={onOpenOperator} data-testid="missionReviewCapability"><KeyRound size={12} /> Review Lease</Button>}
      {resumable && <Button type="button" variant="ghost" size="compact" onClick={onResume} data-testid="missionResumeAgentRun"><Play size={12} /> Resume</Button>}
      {stoppable && <Button type="button" variant="ghost" size="compact" onClick={onStop} data-testid="missionStopAgentRun"><Square size={12} /> Stop</Button>}
      {mode === "ai-first" && <Button type="button" variant="ghost" size="compact" onClick={onReturnToManual} data-testid="missionReturnToManual"><UserRound size={12} /><span className="max-[720px]:hidden">Manual</span></Button>}
      <Button type="button" variant={operatorVisible ? "ghost" : "outline"} size="compact" onClick={onOpenOperator} data-testid="openAiOperator"><ExternalLink size={12} /><span className="max-[720px]:hidden">AI Operator</span></Button>
    </div>
  );
}
