import { History, Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { EmptyState, StatusBadge, StatusDot } from "../components/radar/primitives";
import { cn } from "../lib";
import type { AiOperatorController } from "./useAiOperator";

export function AgentRunRail({ controller, className }: { controller: AiOperatorController; className?: string }) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle
      ? controller.runs.filter((run) => [run.goal, run.status, run.profileId, run.id].join(" ").toLowerCase().includes(needle))
      : controller.runs;
  }, [controller.runs, query]);

  return (
    <aside className={cn("grid min-h-0 grid-rows-[auto_auto_minmax(0,1fr)] border-r border-rule bg-ink/64", className)} data-testid="aiRunRail">
      <div className="border-b border-rule p-3">
        <Button
          type="button"
          variant="solid"
          className="w-full"
          onClick={() => {
            controller.beginNewMission();
          }}
          data-testid="newAiMission"
        >
          <Plus size={13} /> New Mission
        </Button>
      </div>
      <label className="relative border-b border-rule p-3">
        <Search size={12} className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 text-muted" />
        <Input value={query} onChange={(event) => setQuery(event.target.value)} className="pl-7" placeholder="Search run history" aria-label="Search run history" data-testid="aiRunSearch" />
      </label>
      <div className="min-h-0 overflow-y-auto overscroll-contain p-2" data-radar-focus-inset tabIndex={0}>
        <div className="mb-2 flex items-center justify-between px-1 py-1">
          <span className="flex items-center gap-2 rd-eyebrow text-muted"><History size={11} /> Run History</span>
          <StatusBadge>{filtered.length}</StatusBadge>
        </div>
        {filtered.length === 0 && <EmptyState>No saved AI runs match this filter.</EmptyState>}
        {filtered.map((run) => {
          const selected = controller.activeRun?.id === run.id;
          const live = run.status === "queued" || run.status === "running";
          return (
            <button
              key={run.id}
              type="button"
              onClick={() => controller.setSelectedRunId(run.id)}
              className={cn(
                "relative mb-1 grid w-full grid-cols-[auto_minmax(0,1fr)] gap-2 border px-2.5 py-2.5 text-left transition",
                selected ? "border-signal/45 bg-signal/[0.08]" : "border-rule bg-surface/35 hover:border-signal/25 hover:bg-signal/[0.04]"
              )}
              data-testid={`aiRun-${run.id}`}
              data-selected={selected}
            >
              <StatusDot tone={live ? "good" : run.status === "failed" ? "danger" : run.status === "paused" ? "warn" : "ghost"} className="mt-1" />
              <span className="min-w-0">
                <span className="block overflow-hidden text-ellipsis whitespace-nowrap font-display text-body uppercase tracking-data text-bone">{run.goal}</span>
                <span className="mt-1 flex min-w-0 items-center gap-1 font-mono text-micro text-muted">
                  <span>{run.status}</span><span>/</span><span className="overflow-hidden text-ellipsis whitespace-nowrap">{run.profileId}</span>
                </span>
                <span className="mt-1 block font-mono text-nano text-dim">{run.updatedAt.slice(0, 19).replace("T", " ")}Z</span>
              </span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
