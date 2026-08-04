import { AlertTriangle, Check, Crosshair, FileText, RadioTower, RotateCw, X } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import { AgentThoughtstream } from "../components/AgentThoughtstream";
import { AgentTutorialGuide } from "../components/AgentTutorialGuide";
import { Button } from "../components/ui/button";
import { EmptyState, StatusBadge } from "../components/radar/primitives";
import { cn, recoveryActionLabel, timelineEntryText } from "../lib";
import type { AiOperatorController } from "./useAiOperator";

export function AgentFeed({ controller }: { controller: AiOperatorController }) {
  const run = controller.activeRun;
  const feedRef = useRef<HTMLElement>(null);
  const attentionEntryId = useMemo(() => [...(run?.timeline || [])].reverse().find((entry) =>
    entry.phase === "failure" || entry.phase === "policy-block" || Boolean(entry.recoveryActions?.length)
  )?.id || "", [run?.timeline]);

  useEffect(() => {
    if (!attentionEntryId) return;
    [...(feedRef.current?.querySelectorAll<HTMLElement>("[data-entry-id]") || [])]
      .find((element) => element.dataset.entryId === attentionEntryId)
      ?.focus();
  }, [attentionEntryId]);

  return (
    <section ref={feedRef} className="min-h-0 overflow-y-auto overscroll-contain p-3 min-[1120px]:p-4" data-testid="aiOperatorFeed" data-radar-focus-inset tabIndex={0}>
      <div className="mx-auto grid w-full max-w-[860px] gap-3">
        <p className="sr-only" aria-live="polite" aria-atomic="true">
          {run ? `Run ${run.status}. ${run.timeline.at(-1) ? timelineEntryText(run.timeline.at(-1)!) : "No timeline entries."}` : "No AI run selected."}
        </p>
        <AgentThoughtstream run={run} />
        {run?.policy.tutorialMode && <AgentTutorialGuide run={run} />}

        {!run && (
          <div className="min-h-[320px] border border-rule bg-surface/45 p-6">
            <EmptyState className="min-h-[280px]">
              <RadioTower size={24} strokeWidth={1.4} />
              Open a saved run or compose a bounded, saved-scope mission below.
            </EmptyState>
          </div>
        )}

        {run && (
          <div className="border border-rule bg-surface/45">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rule px-3 py-2">
              <span className="rd-eyebrow text-muted">Durable Operator Feed</span>
              <div className="flex gap-1"><StatusBadge>{run.timeline.length} entries</StatusBadge><StatusBadge>{run.status}</StatusBadge></div>
            </div>
            <div className="p-3" data-testid="agentTimeline">
              {run.timeline.length === 0 && <EmptyState>No timeline entries have been recorded.</EmptyState>}
              {run.timeline.map((entry) => {
                const failure = entry.phase === "failure" || entry.phase === "policy-block" || Boolean(entry.toolResult && !entry.toolResult.ok);
                const memoryProposal = entry.toolResult?.ok && entry.toolResult.tool === "proposeRunMemory"
                  ? entry.toolResult.data.memory
                  : null;
                return (
                  <article
                    key={entry.id}
                    className={cn(
                      "relative mb-2 border bg-ink/32 p-3 before:absolute before:bottom-0 before:left-0 before:top-0 before:w-0.5",
                      failure ? "border-rust/45 before:bg-rust" : entry.phase === "tool-call" ? "border-signal/35 before:bg-signal" : "border-rule before:bg-rule"
                    )}
                    data-testid={`agentTimelineEntry-${entry.id}`}
                    data-entry-id={entry.id}
                    tabIndex={failure || Boolean(entry.recoveryActions?.length) ? -1 : undefined}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <span className="block rd-eyebrow text-muted">{entry.phase || "status"} / {entry.createdAt.slice(11, 19)}Z</span>
                        <p className="mt-1 font-display text-body uppercase tracking-data text-bone">{timelineEntryText(entry)}</p>
                      </div>
                      <StatusBadge tone={failure ? "danger" : entry.toolResult?.ok ? "good" : "ghost"}>
                        {entry.toolResult ? (entry.toolResult.ok ? "ok" : "failed") : entry.toolCall?.tool || "note"}
                      </StatusBadge>
                    </div>
                    {entry.summary && entry.summary !== timelineEntryText(entry) && <p className="mt-2 text-body leading-5 text-copy">{entry.summary}</p>}
                    {entry.note && <p className="mt-2 text-meta leading-5 text-muted">{entry.note}</p>}
                    {entry.target && (
                      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border border-signal/20 bg-signal/[0.045] px-2.5 py-2">
                        <p className="min-w-0 break-all font-mono text-label text-muted">
                          {[entry.target.view, entry.target.evidenceId, entry.target.browserUrl, entry.target.control].filter(Boolean).join(" / ")}
                        </p>
                        <Button
                          type="button"
                          variant="ghost"
                          size="compact"
                          onClick={() => void controller.dispatchWorkspaceIntent({ type: "reveal-timeline-target", runId: run.id, entryId: entry.id }, true)}
                          data-testid={`revealTimelineTarget-${entry.id}`}
                        >
                          <Crosshair size={11} /> Reveal
                        </Button>
                      </div>
                    )}
                    {entry.toolResult && !entry.toolResult.ok && (
                      <p className="mt-2 flex items-start gap-2 border-l border-rust/60 pl-2 text-body leading-5 text-rust">
                        <AlertTriangle size={13} className="mt-0.5 shrink-0" /> {entry.toolResult.error}
                      </p>
                    )}
                    {memoryProposal && (
                      <div className="mt-3 border border-signal/30 bg-signal/[0.06] p-3">
                        <span className="rd-eyebrow text-signal">Memory proposal</span>
                        <h3 className="mt-1 font-display text-body uppercase tracking-data text-bone">{memoryProposal.title}</h3>
                        <p className="mt-1 text-meta leading-5 text-muted">{memoryProposal.notes}</p>
                        <div className="mt-2 flex gap-2">
                          <Button type="button" variant="outline" size="compact" onClick={() => void controller.confirmTimelineMemory(entry.id, "confirmed")} data-testid={`agentMemoryConfirm-${entry.id}`}><Check size={11} /> Confirm</Button>
                          <Button type="button" variant="ghost" size="compact" onClick={() => void controller.confirmTimelineMemory(entry.id, "dismissed")} data-testid={`agentMemoryDismiss-${entry.id}`}><X size={11} /> Dismiss</Button>
                        </div>
                      </div>
                    )}
                    {entry.recoveryActions?.length ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {entry.recoveryActions.map((action) => (
                          <Button key={action} type="button" variant={action === "stop-run" ? "outline" : "ghost"} size="compact" disabled={controller.pending} onClick={() => void controller.recoverRun(entry.id, action)} data-testid={`agentRecovery-${action}`}>
                            <RotateCw size={11} /> {recoveryActionLabel(action)}
                          </Button>
                        ))}
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          </div>
        )}

        {run?.findings.map((finding) => (
          <article key={finding.id} className="border border-sand/35 bg-sand/[0.055] p-3" data-testid={`agentFeedFinding-${finding.id}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="flex items-center gap-2 rd-eyebrow text-sand"><FileText size={12} /> Draft Finding</span>
              <StatusBadge>{finding.confidence}</StatusBadge>
            </div>
            <h3 className="mt-2 font-display text-lead uppercase tracking-data text-bone">{finding.title}</h3>
            <p className="mt-2 text-body leading-5 text-copy">{finding.notes}</p>
            <p className="mt-2 select-text break-all font-mono text-label text-muted">{finding.evidenceRefs.join(" · ")}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
