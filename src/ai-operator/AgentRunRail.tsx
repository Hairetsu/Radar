import {
  CheckCircle2,
  Circle,
  CircleAlert,
  History,
  LoaderCircle,
  PanelLeftClose,
  PanelLeftOpen,
  PauseCircle,
  Plus,
  Search,
  Square
} from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { EmptyState, StatusBadge } from "../components/radar/primitives";
import { cn } from "../lib";
import type { AgentRun } from "../../shared/agent-types.js";
import type { AiOperatorController } from "./useAiOperator";

function runStatusMeta(status: AgentRun["status"]) {
  if (status === "running") return { Icon: LoaderCircle, label: "Active", tone: "good" as const, animate: true };
  if (status === "queued") return { Icon: LoaderCircle, label: "Queued", tone: "move" as const, animate: true };
  if (status === "paused") return { Icon: PauseCircle, label: "Paused", tone: "warn" as const, animate: false };
  if (status === "failed") return { Icon: CircleAlert, label: "Needs review", tone: "danger" as const, animate: false };
  if (status === "completed") return { Icon: CheckCircle2, label: "Complete", tone: "good" as const, animate: false };
  return { Icon: Square, label: "Stopped", tone: "ghost" as const, animate: false };
}

function updatedLabel(value: string) {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(parsed);
}

export function AgentRunRail({
  controller,
  collapsed,
  onToggle,
  onNavigate,
  className
}: {
  controller: AiOperatorController;
  collapsed: boolean;
  onToggle: () => void;
  onNavigate?: () => void;
  className?: string;
}) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle
      ? controller.runs.filter((run) => [run.goal, run.status, run.profileId, run.id].join(" ").toLowerCase().includes(needle))
      : controller.runs;
  }, [controller.runs, query]);

  const beginTask = () => {
    controller.beginNewMission();
    onNavigate?.();
  };
  const selectTask = (runId: string) => {
    controller.setSelectedRunId(runId);
    onNavigate?.();
  };

  if (collapsed) {
    return (
      <aside className={cn("grid h-full min-h-0 w-[58px] self-stretch grid-rows-[auto_auto_minmax(0,1fr)_auto] overflow-hidden border-r border-rule bg-[linear-gradient(180deg,color-mix(in_srgb,var(--color-signal)_4%,var(--color-ink)),var(--color-ink)_42%)]", className)} data-testid="aiRunRail" data-collapsed="true" aria-label="Collapsed task history">
        <button type="button" className="grid h-12 place-items-center border-b border-rule text-muted transition hover:bg-signal/5 hover:text-signal" onClick={onToggle} title="Expand task history" aria-label="Expand task history" data-testid="expandAiRunRail"><PanelLeftOpen size={16} /></button>
        <button type="button" className="group relative grid h-14 place-items-center border-b border-rule text-signal transition hover:bg-signal/10" onClick={beginTask} title="New task" aria-label="New task" data-testid="newAiMission"><Plus size={17} /><span className="absolute bottom-1 font-mono text-[7px] font-bold uppercase tracking-[0.16em] text-signal/70">New</span></button>
        <nav className="min-h-0 overflow-y-auto overflow-x-hidden px-2 py-2" aria-label="Task history">
          {controller.runs.map((run) => {
            const selected = controller.activeRun?.id === run.id;
            const meta = runStatusMeta(run.status);
            const Icon = meta.Icon;
            return (
              <button
                key={run.id}
                type="button"
                onClick={() => selectTask(run.id)}
                className={cn("relative mb-1 grid h-10 w-10 place-items-center border border-transparent transition before:absolute before:bottom-1 before:left-0 before:top-1 before:w-[2px]", selected ? "bg-signal/10 text-signal before:bg-signal" : "text-muted before:bg-transparent hover:bg-surface/60 hover:text-bone")}
                title={`${meta.label}: ${run.goal}`}
                aria-label={`Open ${meta.label.toLowerCase()} task: ${run.goal}`}
                aria-current={selected ? "page" : undefined}
                data-testid={`aiRun-${run.id}`}
                data-selected={selected}
              >
                <Icon size={14} className={meta.animate ? "animate-spin" : ""} />
                {run.status === "failed" && <span className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-rust" />}
              </button>
            );
          })}
        </nav>
        <div className="grid place-items-center border-t border-rule py-2" title={`${controller.runs.length} saved tasks`}><span className="grid h-7 min-w-7 place-items-center bg-surface/45 px-1 font-mono text-micro text-muted">{controller.runs.length}</span></div>
      </aside>
    );
  }

  return (
    <aside className={cn("grid h-full min-h-0 w-[320px] self-stretch grid-rows-[auto_auto_auto_minmax(0,1fr)] overflow-hidden border-r border-rule bg-ink/92", className)} data-testid="aiRunRail" data-collapsed="false" aria-label="Task history">
      <header className="flex h-12 items-center justify-between border-b border-rule bg-surface/35 px-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid h-7 w-7 place-items-center border border-signal/30 bg-signal/[0.07] text-signal"><History size={13} /></span>
          <div className="min-w-0"><span className="block rd-eyebrow text-signal">Task History</span><span className="block font-mono text-nano text-muted">Saved in this session</span></div>
        </div>
        <button type="button" className="grid h-8 w-8 place-items-center border border-transparent text-muted transition hover:border-rule hover:bg-signal/5 hover:text-signal" onClick={onToggle} title="Collapse task history" aria-label="Collapse task history" data-testid="collapseAiRunRail"><PanelLeftClose size={15} /></button>
      </header>
      <div className="border-b border-rule p-3">
        <Button type="button" variant="solid" className="w-full" onClick={beginTask} data-testid="newAiMission"><Plus size={13} /> New Task</Button>
      </div>
      <label className="relative border-b border-rule p-3">
        <Search size={12} className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 text-muted" />
        <Input value={query} onChange={(event) => setQuery(event.target.value)} className="pl-7" placeholder="Search task history" aria-label="Search task history" data-testid="aiRunSearch" />
      </label>
      <div className="min-h-0 overflow-y-auto overscroll-contain p-2" data-radar-focus-inset tabIndex={0}>
        <div className="mb-2 flex items-center justify-between px-1 py-1"><span className="rd-eyebrow text-muted">Recent tasks</span><StatusBadge>{filtered.length}</StatusBadge></div>
        {filtered.length === 0 && <EmptyState>No saved tasks match this filter.</EmptyState>}
        {filtered.map((run) => {
          const selected = controller.activeRun?.id === run.id;
          const meta = runStatusMeta(run.status);
          const Icon = meta.Icon;
          return (
            <button
              key={run.id}
              type="button"
              onClick={() => selectTask(run.id)}
              className={cn("group relative mb-1.5 grid w-full grid-cols-[32px_minmax(0,1fr)] gap-2 overflow-hidden border px-2.5 py-2.5 text-left transition before:absolute before:bottom-0 before:left-0 before:top-0 before:w-[3px] before:transition", selected ? "border-signal/50 bg-signal/[0.09] before:bg-signal" : "border-rule bg-surface/35 before:bg-transparent hover:border-signal/25 hover:bg-signal/[0.04]")}
              aria-current={selected ? "page" : undefined}
              data-testid={`aiRun-${run.id}`}
              data-selected={selected}
            >
              <span className={cn("mt-0.5 grid h-7 w-7 place-items-center border", selected ? "border-signal/40 bg-signal/10 text-signal" : "border-rule bg-ink/60 text-muted")}><Icon size={13} className={meta.animate ? "animate-spin" : ""} /></span>
              <span className="min-w-0">
                <span className="flex min-w-0 items-start justify-between gap-2">
                  <span className="block min-w-0 overflow-hidden text-ellipsis whitespace-nowrap font-display text-body uppercase tracking-data text-bone">{run.goal}</span>
                  {selected && <span className="shrink-0 font-mono text-[8px] font-bold uppercase tracking-[0.15em] text-signal">Current</span>}
                </span>
                <span className="mt-1 flex min-w-0 items-center gap-1.5"><StatusBadge tone={meta.tone}>{meta.label}</StatusBadge><span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap font-mono text-micro text-muted">{run.profileId}</span></span>
                <span className="mt-1.5 block font-mono text-nano text-dim">Updated {updatedLabel(run.updatedAt)}</span>
              </span>
            </button>
          );
        })}
        {controller.runs.length === 0 && (
          <div className="mt-3 grid place-items-center gap-2 border border-dashed border-rule bg-surface/25 px-4 py-8 text-center"><Circle size={18} className="text-dim" /><p className="text-meta leading-5 text-muted">No saved tasks yet. Start with a bounded goal above.</p></div>
        )}
      </div>
    </aside>
  );
}
