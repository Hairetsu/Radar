import {
  AlertTriangle,
  Check,
  ChevronRight,
  Crosshair,
  Eye,
  RadioTower,
  RotateCw,
  ScanLine,
  X
} from "lucide-react";
import { Button } from "../components/ui/button";
import { StatusBadge } from "../components/radar/primitives";
import { cn, recoveryActionLabel, timelineEntryText } from "../lib";
import type { AgentTimelineEntry } from "../types";
import type { AgentOperationGroup } from "./agentOperationStream";
import type { AiOperatorController } from "./useAiOperator";

function targetLine(entry: AgentTimelineEntry | undefined): string {
  if (!entry?.target) return "Saved-scope evidence surface";
  return [entry.target.view, entry.target.evidenceId, entry.target.browserUrl, entry.target.control]
    .filter(Boolean)
    .join(" / ");
}

function operationStatusLabel(operation: AgentOperationGroup): string {
  if (operation.status === "active") return "in progress";
  return operation.status;
}

function operationTone(operation: AgentOperationGroup): "move" | "danger" | "good" | "warn" | "ghost" {
  if (operation.status === "failed") return "danger";
  if (operation.status === "blocked") return "warn";
  if (operation.status === "completed") return "good";
  if (operation.status === "active") return "move";
  return "ghost";
}

function entryDuration(entry: AgentTimelineEntry | undefined): string {
  if (typeof entry?.durationMs !== "number") return "";
  if (entry.durationMs < 1_000) return `${entry.durationMs}ms`;
  return `${(entry.durationMs / 1_000).toFixed(1)}s`;
}

function AuditDetail({ entries }: { entries: AgentTimelineEntry[] }) {
  return (
    <div className="border-t border-rule bg-ink/38 px-3 py-2" data-testid="agentOperationAuditDetail">
      <div className="mb-1.5 rd-label-sm text-muted">Durable audit records</div>
      <div className="grid gap-1">
        {entries.map((entry) => (
          <div key={entry.id} className="grid min-w-0 grid-cols-[minmax(78px,auto)_minmax(0,1fr)_auto] gap-2 font-mono text-nano leading-4 text-dim">
            <span className="uppercase text-muted">{entry.phase || "record"}</span>
            <span className="min-w-0 select-text break-all">
              {entry.id}
              {entry.actionId ? ` / ${entry.actionId}` : ""}
              {entry.capabilityReceiptId ? ` / ${entry.capabilityReceiptId}` : ""}
            </span>
            <span>{entryDuration(entry)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function AgentOperationCard({
  operation,
  operationNumber,
  expanded,
  auditDetail,
  isNewest,
  controller,
  onToggle,
  onPreview
}: {
  operation: AgentOperationGroup;
  operationNumber: number;
  expanded: boolean;
  auditDetail: boolean;
  isNewest: boolean;
  controller: AiOperatorController;
  onToggle: () => void;
  onPreview: (entry: AgentTimelineEntry) => void;
}) {
  const decision = operation.decision;
  const call = operation.call;
  const result = operation.result;
  const targetEntry = [...operation.entries].reverse().find((entry) => entry.target) || decision || call || result;
  const memoryEntry = [...operation.entries].reverse().find(
    (entry) => entry.toolResult?.ok && entry.toolResult.tool === "proposeRunMemory"
  );
  const memoryProposal = memoryEntry?.toolResult?.ok && memoryEntry.toolResult.tool === "proposeRunMemory"
    ? memoryEntry.toolResult.data.memory
    : null;
  const recoveryEntry = [...operation.entries].reverse().find((entry) => entry.recoveryActions?.length);

  return (
    <article
      className={cn(
        "relative border bg-ink/42 transition-[border-color,background-color,transform] duration-300",
        operation.status === "failed"
          ? "border-rust/55"
          : operation.status === "blocked"
            ? "border-sand/55"
            : isNewest
              ? "border-signal/55 bg-signal/[0.045]"
              : "border-rule hover:border-signal/30"
      )}
      data-testid={`agentOperation-${operation.id}`}
      data-operation-id={operation.id}
      data-operation-status={operation.status}
    >
      <span
        className={cn(
          "pointer-events-none absolute bottom-[-1px] left-[-1px] top-[-1px] w-[3px]",
          operation.status === "failed" ? "bg-rust" : operation.status === "blocked" ? "bg-sand" : isNewest ? "bg-signal" : "bg-rule"
        )}
      />
      <button
        type="button"
        className="grid min-h-12 w-full grid-cols-[78px_minmax(0,1fr)_auto] items-center gap-3 px-3 py-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-signal"
        aria-expanded={expanded}
        onClick={onToggle}
        data-testid={`agentOperationToggle-${operation.id}`}
      >
        <span className="font-mono text-micro text-muted">
          <span className={cn("mr-2", isNewest ? "text-signal" : "text-dim")}>{String(operationNumber).padStart(2, "0")}</span>
          {operation.latest.createdAt.slice(11, 19)}Z
        </span>
        <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap font-display text-body uppercase tracking-data text-bone">
          {operation.title}
        </span>
        <span className="flex items-center gap-1.5">
          <StatusBadge tone={operationTone(operation)}>{operationStatusLabel(operation)}</StatusBadge>
          <ChevronRight size={13} className={cn("text-muted transition-transform", expanded && "rotate-90 text-signal")} />
        </span>
      </button>

      {expanded && (
        <div className="animate-[operation-open_220ms_cubic-bezier(0.22,0.72,0.18,1)_both] border-t border-rule" data-testid={`agentOperationBody-${operation.id}`}>
          {decision && (
            <div className="grid grid-cols-[78px_minmax(0,1fr)_auto] gap-3 px-3 py-3">
              <div className="flex items-start gap-2 rd-eyebrow text-muted"><span className="mt-0.5 h-2 w-2 rounded-full border border-muted bg-ink" /> Decide</div>
              <div className="min-w-0">
                <p className="text-body leading-5 text-copy">{timelineEntryText(decision)}</p>
                {decision.note && decision.note !== timelineEntryText(decision) && <p className="mt-1 text-meta leading-5 text-muted">{decision.note}</p>}
              </div>
              <StatusBadge>{entryDuration(decision) || "brief"}</StatusBadge>
            </div>
          )}

          {call && (
            <div className="grid grid-cols-[78px_minmax(0,1fr)_auto] gap-3 border-t border-rule/70 bg-surface/28 px-3 py-3">
              <div className={cn("flex items-start gap-2 rd-eyebrow", operation.status === "active" ? "text-signal" : "text-muted")}>
                <span className={cn("mt-0.5 h-2 w-2 rounded-full border bg-ink", operation.status === "active" ? "animate-[stream-glow_1.6s_ease-in-out_infinite] border-signal bg-signal" : "border-muted")} /> {operation.tool === "runReplayExperiment" ? "Mutate" : "Act"}
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5"><StatusBadge tone="move">{operation.tool || "planner"}</StatusBadge><span className="font-mono text-micro text-muted">{call.phase === "tool-call" ? "bounded tool dispatch" : "selected action"}</span></div>
                <div className="mt-2 border-l-2 border-signal bg-signal/[0.045] px-2.5 py-2 font-mono text-label leading-4 text-muted">
                  {targetLine(targetEntry)}
                </div>
              </div>
              <StatusBadge tone={operation.status === "active" ? "move" : "ghost"}>{operation.status === "active" ? "running" : "sent"}</StatusBadge>
            </div>
          )}

          <div className="grid grid-cols-[78px_minmax(0,1fr)_auto] gap-3 border-t border-rule/70 px-3 py-3">
            <div className={cn("flex items-start gap-2 rd-eyebrow", operation.status === "failed" ? "text-rust" : operation.status === "completed" ? "text-jade" : "text-muted")}>
              <span className="mt-0.5 h-2 w-2 rounded-full border border-current bg-ink" /> {operation.tool === "runReplayExperiment" ? "Compare" : "Observe"}
            </div>
            <div className="min-w-0">
              {result ? (
                <>
                  <p className={cn("text-body leading-5", operation.status === "failed" ? "text-rust" : "text-copy")}>{timelineEntryText(result)}</p>
                  {result.note && result.note !== timelineEntryText(result) && <p className="mt-1 text-meta leading-5 text-muted">{result.note}</p>}
                  {result.toolResult && !result.toolResult.ok && <p className="mt-2 flex items-start gap-2 border-l border-rust/60 pl-2 text-meta leading-5 text-rust"><AlertTriangle size={13} className="mt-0.5 shrink-0" />{result.toolResult.error}</p>}
                </>
              ) : (
                <><p className="text-body leading-5 text-copy">Waiting for the bounded tool result</p><p className="mt-1 text-meta leading-5 text-muted">Planning remains blocked until the result is persisted.</p></>
              )}
            </div>
            <div className="flex flex-col items-end gap-1.5">
              {targetEntry?.target && <Button type="button" variant="ghost" size="compact" onClick={() => onPreview(targetEntry)} data-testid={`previewOperationTarget-${operation.id}`}><Eye size={11} /> Preview</Button>}
              {entryDuration(result) && <StatusBadge>{entryDuration(result)}</StatusBadge>}
            </div>
          </div>

          {memoryProposal && memoryEntry && (
            <div className="border-t border-signal/25 bg-signal/[0.05] p-3">
              <span className="flex items-center gap-2 rd-eyebrow text-signal"><RadioTower size={11} /> Memory proposal</span>
              <h3 className="mt-1 font-display text-body uppercase tracking-data text-bone">{memoryProposal.title}</h3>
              <p className="mt-1 text-meta leading-5 text-muted">{memoryProposal.notes}</p>
              <div className="mt-2 flex gap-2">
                <Button type="button" variant="outline" size="compact" onClick={() => void controller.confirmTimelineMemory(memoryEntry.id, "confirmed")} data-testid={`agentMemoryConfirm-${memoryEntry.id}`}><Check size={11} /> Confirm</Button>
                <Button type="button" variant="ghost" size="compact" onClick={() => void controller.confirmTimelineMemory(memoryEntry.id, "dismissed")} data-testid={`agentMemoryDismiss-${memoryEntry.id}`}><X size={11} /> Dismiss</Button>
              </div>
            </div>
          )}

          {recoveryEntry?.recoveryActions?.length ? (
            <div className="flex flex-wrap items-center gap-2 border-t border-rust/30 bg-rust/[0.04] p-3">
              <span className="mr-1 flex items-center gap-2 rd-eyebrow text-rust"><ScanLine size={11} /> Operator action required</span>
              {recoveryEntry.recoveryActions.map((action) => (
                <Button key={action} type="button" variant={action === "stop-run" ? "outline" : "ghost"} size="compact" disabled={controller.pending} onClick={() => void controller.recoverRun(recoveryEntry.id, action)} data-testid={`agentRecovery-${action}`}>
                  <RotateCw size={11} /> {recoveryActionLabel(action)}
                </Button>
              ))}
            </div>
          ) : null}

          {auditDetail && <AuditDetail entries={operation.entries} />}
        </div>
      )}
    </article>
  );
}

export function AgentStreamMarker({ entry }: { entry: AgentTimelineEntry }) {
  const failure = entry.phase === "failure" || entry.phase === "policy-block";
  return (
    <div className="grid grid-cols-[78px_minmax(0,1fr)_auto] items-center gap-3 border-l border-rule px-3 py-2" data-entry-id={entry.id} data-testid={`agentTimelineEntry-${entry.id}`}>
      <span className="font-mono text-micro text-dim">{entry.createdAt.slice(11, 19)}Z</span>
      <p className={cn("min-w-0 text-meta leading-5", failure ? "text-rust" : "text-muted")}>{timelineEntryText(entry)}</p>
      <StatusBadge tone={failure ? "danger" : "ghost"}>{entry.phase || "status"}</StatusBadge>
    </div>
  );
}

export function AgentEvidencePreview({
  entry,
  runId,
  onClose,
  onReveal
}: {
  entry: AgentTimelineEntry;
  runId: string;
  onClose: () => void;
  onReveal: () => void;
}) {
  const target = entry.target;
  return (
    <aside className="absolute bottom-0 right-0 top-0 z-30 grid w-[min(420px,92vw)] grid-rows-[auto_minmax(0,1fr)_auto] border-l border-signal/55 bg-surface shadow-bureau animate-[panel-enter-right_220ms_cubic-bezier(0.2,0.74,0.19,1)_forwards]" role="dialog" aria-modal="false" aria-label="Sanitized evidence preview" data-testid="agentEvidencePreview">
      <div className="flex items-start justify-between gap-3 border-b border-rule bg-ink/70 p-4">
        <div><span className="rd-eyebrow text-signal">Sanitized preview</span><h2 className="mt-1 font-display text-lead uppercase tracking-data text-bone">{target?.evidenceId || target?.control || entry.toolResult?.tool || "Visible target"}</h2></div>
        <Button type="button" variant="ghost" size="compact" onClick={onClose} data-testid="closeAgentEvidencePreview"><X size={12} /> Close</Button>
      </div>
      <div className="min-h-0 overflow-y-auto overscroll-contain p-4">
        <p className="text-body leading-6 text-copy">{timelineEntryText(entry)}</p>
        {entry.note && entry.note !== timelineEntryText(entry) && <p className="mt-2 text-meta leading-5 text-muted">{entry.note}</p>}
        <dl className="mt-4 border border-rule bg-ink/38">
          {[
            ["Run", runId],
            ["View", target?.view],
            ["Evidence", target?.evidenceId],
            ["Browser URL", target?.browserUrl],
            ["Control", target?.control],
            ["Tool", entry.toolCall?.tool || entry.toolResult?.tool],
            ["Identity", entry.identityId],
            ["Recorded", entry.createdAt]
          ].filter((item): item is [string, string] => Boolean(item[1])).map(([label, value]) => (
            <div key={label} className="grid grid-cols-[92px_minmax(0,1fr)] gap-3 border-b border-rule px-3 py-2.5 last:border-b-0">
              <dt className="rd-label-sm text-muted">{label}</dt><dd className="select-text break-all font-mono text-label leading-4 text-copy">{value}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-3 border-l-2 border-signal bg-signal/[0.045] px-3 py-2 text-meta leading-5 text-muted">
          This companion preview exposes only persisted timeline metadata. Request bodies, raw headers, cookies, and storage values stay in the authorized workspace surfaces.
        </div>
      </div>
      <div className="flex justify-end gap-2 border-t border-rule bg-ink/70 p-3">
        <Button type="button" variant="outline" onClick={onReveal} data-testid="revealPreviewInWorkspace"><Crosshair size={12} /> Reveal in Workspace</Button>
      </div>
    </aside>
  );
}
