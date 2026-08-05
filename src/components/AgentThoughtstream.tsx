import { BrainCircuit, Crosshair, FlaskConical, Route, ScanLine } from "lucide-react";
import type { AgentRun } from "../types";
import { cn } from "../lib";
import {
  activityLabel,
  agentThoughtstreamStep,
  lastIndexMatching,
  resultText,
  targetText
} from "./agentThoughtstreamPresentation";
import { EmptyState, StatusBadge } from "./radar/primitives";


export function AgentThoughtstream({ run }: { run: AgentRun | null }) {
  if (!run) {
    return (
      <section
        className="min-h-[180px] border border-rule bg-surface/55 md:col-span-2"
        data-testid="agentThoughtstream"
        data-component="agentThoughtstream"
      >
        <div className="flex items-center gap-2 border-b border-rule px-4 py-3">
          <BrainCircuit size={15} strokeWidth={1.7} className="text-signal" />
          <span className="rd-eyebrow text-muted">Agent Thoughtstream</span>
        </div>
        <EmptyState className="min-h-[130px]">Start an AI-First run to see its live decision briefs.</EmptyState>
      </section>
    );
  }

  const entries = run.timeline;
  const decisionIndex = lastIndexMatching(
    entries,
    (entry) => Boolean(
      entry.toolCall &&
        (entry.phase === "decision" || (entry.phase === "policy-block" && !entry.toolResult))
    )
  );
  const rationaleIndex =
    decisionIndex >= 0 ? decisionIndex : lastIndexMatching(entries, (entry) => entry.phase === "decision");
  const callIndex = lastIndexMatching(entries, (entry) => entry.phase === "tool-call");
  const resultIndex = lastIndexMatching(
    entries,
    (entry) => entry.phase === "tool-result" || entry.phase === "failure" || entry.phase === "policy-block"
  );
  const latestIndex = entries.length - 1;
  const latestEntry = entries[latestIndex];
  const step = agentThoughtstreamStep(entries);
  const decision = step.rationaleEntry || (
    step.tool === "planner" && rationaleIndex >= 0 ? entries[rationaleIndex] : undefined
  );
  const call = callIndex >= 0 ? entries[callIndex] : undefined;
  const result = resultIndex >= 0 ? entries[resultIndex] : undefined;
  const waitingForResult = Math.max(decisionIndex, callIndex) > resultIndex;
  const rationale =
    decision?.summary ||
    decision?.note ||
    (step.tool !== "planner" ? `Radar selected ${step.tool} as the next bounded step.` : undefined) ||
    (run.status === "running" || run.status === "queued"
      ? "Evaluating the mission graph, current evidence, and remaining policy budget."
      : run.mission?.stopReason || "No planner rationale has been recorded yet.");
  const activeExperiments = run.mission?.experiments.filter((experiment) => experiment.status === "running") || [];
  const testingHypothesis = run.mission?.hypotheses.find((hypothesis) => hypothesis.status === "testing");
  const state = activityLabel(run, decisionIndex, callIndex, resultIndex);
  const isActive = run.status === "running" || run.status === "queued";

  return (
    <section
      className="relative overflow-hidden border border-signal/40 bg-[linear-gradient(112deg,color-mix(in_srgb,var(--color-signal)_10%,transparent),transparent_38%),color-mix(in_srgb,var(--color-surface)_88%,transparent)] shadow-[0_18px_45px_-35px_color-mix(in_srgb,var(--color-signal)_72%,transparent)] md:col-span-2"
      data-testid="agentThoughtstream"
      data-component="agentThoughtstream"
      data-active={isActive ? "true" : "false"}
    >
      <div className="pointer-events-none absolute inset-0 opacity-35 [background-image:linear-gradient(90deg,transparent_0,transparent_49%,color-mix(in_srgb,var(--color-signal)_12%,transparent)_50%,transparent_51%,transparent_100%)] [background-size:34px_100%]" />
      {isActive && (
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px w-1/2 animate-[agent-scan_2.8s_linear_infinite] bg-gradient-to-r from-transparent via-signal to-transparent" />
      )}
      <div className="relative flex flex-wrap items-center justify-between gap-3 border-b border-signal/25 px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="relative grid h-8 w-8 place-items-center border border-signal/35 bg-signal/10 text-signal">
            {isActive && <span className="absolute inset-1 animate-[ping_1.8s_ease-out_infinite] border border-signal/35" />}
            <BrainCircuit size={16} strokeWidth={1.65} />
          </span>
          <div>
            <span className="block rd-eyebrow text-signal">Agent Thoughtstream</span>
            <span className="mt-0.5 block text-meta text-muted">Auditable decision brief · not hidden chain-of-thought</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {isActive && (
            <span className="inline-flex items-center gap-1.5 border border-signal/35 bg-signal/[0.08] px-2 py-1 font-mono text-micro uppercase tracking-[0.16em] text-signal" data-testid="agentThoughtstreamLive">
              <span className="h-1.5 w-1.5 rounded-full bg-signal animate-[stream-glow_1.5s_ease-in-out_infinite]" />
              Streaming
            </span>
          )}
          <StatusBadge tone={run.status === "failed" ? "danger" : isActive ? "good" : "ghost"}>{state}</StatusBadge>
          <StatusBadge>step {String(entries.length).padStart(2, "0")}</StatusBadge>
          <StatusBadge>{run.mission ? `mission r${run.mission.revision}` : run.profileId}</StatusBadge>
        </div>
      </div>

      <div
        className="relative grid gap-px bg-rule/70 transition-colors duration-300 min-[700px]:grid-cols-[minmax(0,0.92fr)_minmax(0,1.25fr)_minmax(0,0.9fr)]"
      >
        <div className="min-w-0 bg-ink/75 p-4">
          <div className="flex items-center gap-2 rd-eyebrow text-muted">
            <Crosshair size={12} strokeWidth={1.8} className="text-signal" />
            Current focus
          </div>
          <p className="mt-2 font-display text-lead uppercase tracking-data text-bone">
            {activeExperiments.at(-1)?.title || run.mission?.objectives.find((objective) => objective.status === "active")?.title || run.goal}
          </p>
          {testingHypothesis && <p className="mt-2 line-clamp-3 text-meta leading-5 text-muted">{testingHypothesis.statement}</p>}
          {activeExperiments.length > 1 && (
            <div className="mt-3 flex flex-wrap gap-1">
              {activeExperiments.slice(-3).map((experiment) => (
                <StatusBadge key={experiment.id}>{experiment.title}</StatusBadge>
              ))}
              {activeExperiments.length > 3 && <StatusBadge>+{activeExperiments.length - 3}</StatusBadge>}
            </div>
          )}
        </div>

        <div className="min-w-0 bg-surface/90 p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 rd-eyebrow text-muted">
              <ScanLine size={12} strokeWidth={1.8} className="text-signal" />
              Why this step
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <StatusBadge tone="move">{step.tool}</StatusBadge>
              <StatusBadge
                tone={step.status === "failed" ? "danger" : step.status === "completed" ? "good" : "ghost"}
              >
                <span data-testid="agentThoughtstreamStepStatus" aria-live="polite" aria-atomic="true">
                  {step.status}
                </span>
              </StatusBadge>
            </div>
          </div>
          <p className="mt-2 text-body leading-6 text-copy" data-testid="agentThoughtstreamRationale">
            {rationale}
          </p>
          <div className="mt-3 border-l-2 border-signal bg-signal/[0.055] px-3 py-2">
            <span className="rd-label-sm text-signal">Visible target</span>
            <p className="mt-1 break-all font-mono text-label leading-4 text-bone">{targetText(step.targetEntry || decision || call || latestEntry)}</p>
          </div>
        </div>

        <div className="min-w-0 bg-ink/75 p-4">
          <div className="flex items-center gap-2 rd-eyebrow text-muted">
            <Route size={12} strokeWidth={1.8} className="text-signal" />
            Result / next transition
          </div>
          <p className={cn("mt-2 text-body leading-5", result?.toolResult && !result.toolResult.ok ? "text-rust" : "text-copy")}>
            {resultText(result, waitingForResult, run)}
          </p>
          <div className="mt-3 flex items-center gap-2 border-t border-rule/70 pt-3 rd-label text-muted">
            <FlaskConical size={11} strokeWidth={1.8} />
            {run.policy.tutorialMode
              ? run.status === "paused"
                ? "Waiting for Continue Lesson"
                : "Next lesson is being prepared"
              : isActive
                ? "Autonomous loop remains active"
                : `Run ${run.status}`}
          </div>
        </div>
      </div>
      {isActive && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px overflow-hidden">
          <span className="block h-full w-1/3 animate-[agent-flow_1.7s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-signal to-transparent" />
        </div>
      )}
    </section>
  );
}
