import { BrainCircuit, Crosshair, Route, ScanLine } from "lucide-react";
import type { AgentRun } from "../types";
import { cn } from "../lib";
import {
  activityLabel,
  agentThoughtstreamStep,
  isAgentThoughtstreamRationaleEntry,
  lastIndexMatching,
  resultText,
  targetText
} from "./agentThoughtstreamPresentation";
import { EmptyState, StatusBadge } from "./radar/primitives";

export function AgentThoughtstream({ run }: { run: AgentRun | null }) {
  if (!run) {
    return (
      <section className="min-h-[116px] border border-rule bg-surface/55" data-testid="agentThoughtstream" data-component="agentThoughtstream">
        <div className="flex items-center gap-2 border-b border-rule px-3 py-2"><BrainCircuit size={14} strokeWidth={1.7} className="text-signal" /><span className="rd-eyebrow text-muted">Mission Pulse</span></div>
        <EmptyState className="min-h-[76px]">Start an AI-First run to see its live decision briefs.</EmptyState>
      </section>
    );
  }

  const entries = run.timeline;
  const decisionIndex = lastIndexMatching(entries, isAgentThoughtstreamRationaleEntry);
  const rationaleIndex = decisionIndex >= 0 ? decisionIndex : lastIndexMatching(entries, (entry) => entry.phase === "decision");
  const callIndex = lastIndexMatching(entries, (entry) => entry.phase === "tool-call");
  const resultIndex = lastIndexMatching(entries, (entry) => Boolean(entry.toolResult || entry.phase === "tool-result" || entry.phase === "failure" || entry.phase === "policy-block"));
  const latestEntry = entries.at(-1);
  const step = agentThoughtstreamStep(entries);
  const decision = step.rationaleEntry || (step.tool === "planner" && rationaleIndex >= 0 ? entries[rationaleIndex] : undefined);
  const call = callIndex >= 0 ? entries[callIndex] : undefined;
  const result = resultIndex >= 0 ? entries[resultIndex] : undefined;
  const waitingForResult = Math.max(decisionIndex, callIndex) > resultIndex;
  const rationale = decision?.summary || decision?.note || (step.tool !== "planner" ? `Radar selected ${step.tool} as the next bounded step.` : undefined) || ((run.status === "running" || run.status === "queued") ? "Evaluating the mission graph, current evidence, and remaining policy budget." : run.mission?.stopReason || "No planner rationale has been recorded yet.");
  const activeExperiments = run.mission?.experiments.filter((experiment) => experiment.status === "running") || [];
  const testingHypothesis = run.mission?.hypotheses.find((hypothesis) => hypothesis.status === "testing");
  const focus = activeExperiments.at(-1)?.title || run.mission?.objectives.find((objective) => objective.status === "active")?.title || run.goal;
  const state = activityLabel(run, decisionIndex, callIndex, resultIndex);
  const isActive = run.status === "running" || run.status === "queued";
  const remainingSteps = Math.max(0, run.policy.maxSteps - entries.filter((entry) => entry.phase === "tool-call").length);

  return (
    <section
      className="relative grid min-h-[116px] overflow-hidden border border-signal/40 bg-[linear-gradient(112deg,color-mix(in_srgb,var(--color-signal)_9%,transparent),transparent_38%),color-mix(in_srgb,var(--color-surface)_88%,transparent)] shadow-[0_18px_45px_-35px_color-mix(in_srgb,var(--color-signal)_72%,transparent)] min-[760px]:grid-cols-[160px_minmax(0,1.35fr)_minmax(240px,0.9fr)]"
      data-testid="agentThoughtstream"
      data-component="agentThoughtstream"
      data-active={isActive ? "true" : "false"}
    >
      <div className="relative min-w-0 border-b border-signal/25 bg-ink/68 p-3 min-[760px]:border-b-0 min-[760px]:border-r">
        {isActive && <div className="pointer-events-none absolute inset-x-0 top-0 h-px w-1/2 animate-[agent-scan_2.8s_linear_infinite] bg-gradient-to-r from-transparent via-signal to-transparent" />}
        <div className="flex items-center gap-2 rd-eyebrow text-signal"><BrainCircuit size={13} strokeWidth={1.7} /> Mission Pulse</div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {isActive && <span className="inline-flex items-center gap-1.5 border border-signal/35 bg-signal/[0.08] px-2 py-1 font-mono text-micro uppercase tracking-[0.14em] text-signal" data-testid="agentThoughtstreamLive"><span className="h-1.5 w-1.5 rounded-full bg-signal animate-[stream-glow_1.5s_ease-in-out_infinite]" />Streaming</span>}
          <StatusBadge tone={run.status === "failed" ? "danger" : isActive ? "good" : "ghost"}>{state}</StatusBadge>
        </div>
        <p className="mt-2 line-clamp-2 font-display text-body uppercase tracking-data text-bone">{focus}</p>
        <p className="mt-1 font-mono text-nano text-muted">{remainingSteps} steps remain · mission r{run.mission?.revision || 0}</p>
      </div>

      <div className="min-w-0 border-b border-signal/25 bg-surface/82 p-3 min-[760px]:border-b-0 min-[760px]:border-r">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 rd-eyebrow text-muted"><ScanLine size={12} strokeWidth={1.8} className="text-signal" /> Current decision</div>
          <div className="flex items-center gap-1.5"><StatusBadge tone="move">{step.tool}</StatusBadge><StatusBadge tone={step.status === "failed" ? "danger" : step.status === "completed" ? "good" : "ghost"}><span data-testid="agentThoughtstreamStepStatus" aria-live="polite" aria-atomic="true">{step.status}</span></StatusBadge></div>
        </div>
        <p className="mt-2 text-body leading-5 text-copy" data-testid="agentThoughtstreamRationale">{rationale}</p>
        {testingHypothesis && <p className="mt-1 line-clamp-1 text-meta text-muted">Hypothesis: {testingHypothesis.statement}</p>}
      </div>

      <div className="min-w-0 bg-ink/68 p-3">
        <div className="flex items-center gap-2 rd-eyebrow text-muted"><Crosshair size={12} strokeWidth={1.8} className="text-signal" /> Visible target</div>
        <p className="mt-2 truncate font-mono text-label leading-4 text-bone" title={targetText(step.targetEntry || decision || call || latestEntry)}>{targetText(step.targetEntry || decision || call || latestEntry)}</p>
        <div className="mt-2 border-t border-rule/70 pt-2">
          <div className="flex items-center gap-2 rd-label-sm text-muted"><Route size={11} /> Result / transition</div>
          <p className={cn("mt-1 line-clamp-2 text-meta leading-5", result?.toolResult && !result.toolResult.ok ? "text-rust" : "text-copy")}>{resultText(result, waitingForResult, run)}</p>
          <p className="mt-1 font-mono text-nano text-muted">{run.policy.tutorialMode ? run.status === "paused" ? "Waiting for Continue Lesson" : "Next lesson is being prepared" : isActive ? "Autonomous loop remains active" : `Run ${run.status}`}</p>
        </div>
      </div>
    </section>
  );
}
