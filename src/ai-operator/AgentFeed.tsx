import { Activity, AlertTriangle, ArrowUp, Check, Crosshair, FileText, RadioTower, RotateCw, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AgentThoughtstream } from "../components/AgentThoughtstream";
import { AgentTutorialGuide } from "../components/AgentTutorialGuide";
import { Button } from "../components/ui/button";
import { EmptyState, StatusBadge } from "../components/radar/primitives";
import { cn, recoveryActionLabel, timelineEntryText } from "../lib";
import type { AiOperatorController } from "./useAiOperator";

type FeedScrollBehavior = "auto" | "smooth";

function scrollToLatest(element: globalThis.HTMLDivElement | null, behavior: FeedScrollBehavior): void {
  if (!element) return;
  if (typeof element.scrollTo === "function") {
    element.scrollTo({ top: 0, behavior });
    return;
  }
  element.scrollTop = 0;
}

export function AgentFeed({ controller }: { controller: AiOperatorController }) {
  const run = controller.activeRun;
  const transcriptRef = useRef<globalThis.HTMLDivElement>(null);
  const [followingLive, setFollowingLive] = useState(true);
  const timeline = useMemo(() => [...(run?.timeline || [])].reverse(), [run?.timeline]);
  const latestEntryId = timeline[0]?.id || "";
  const isLive = run?.status === "running" || run?.status === "queued";

  const followLatest = useCallback((behavior: FeedScrollBehavior = "smooth") => {
    setFollowingLive(true);
    scrollToLatest(transcriptRef.current, behavior);
  }, []);

  useEffect(() => {
    followLatest("auto");
  }, [followLatest, run?.id]);

  useEffect(() => {
    if (!followingLive || !latestEntryId) return;
    const transcript = transcriptRef.current;
    if (!transcript || transcript.scrollTop <= 1) return;
    scrollToLatest(transcript, "auto");
  }, [followingLive, latestEntryId]);

  const handleTranscriptScroll = useCallback(() => {
    const nextFollowing = (transcriptRef.current?.scrollTop || 0) <= 56;
    setFollowingLive((current) => current === nextFollowing ? current : nextFollowing);
  }, []);

  return (
    <section className="grid min-h-0 min-w-0 overflow-hidden [grid-template-rows:auto_minmax(0,1fr)]" data-testid="aiOperatorFeed" data-radar-focus-inset tabIndex={0}>
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {run ? `Run ${run.status}. ${run.timeline.at(-1) ? timelineEntryText(run.timeline.at(-1)!) : "No timeline entries."}` : "No AI run selected."}
      </p>

      <div className="relative z-10 border-b border-rule bg-ink/82 p-3 shadow-[0_18px_36px_-34px_var(--color-signal)] backdrop-blur-xl min-[1120px]:p-4">
        <AgentThoughtstream run={run} />
      </div>

      <div className="grid min-h-0 min-w-0 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--color-signal)_3%,transparent),transparent_28%)] [grid-template-rows:auto_minmax(0,1fr)]">
        <header className="relative z-10 flex flex-wrap items-center justify-between gap-3 border-b border-rule bg-surface/88 px-3 py-2.5 backdrop-blur-xl min-[1120px]:px-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="relative grid h-7 w-7 shrink-0 place-items-center border border-signal/35 bg-signal/[0.07] text-signal">
              {isLive && <span className="absolute inset-1 animate-[stream-glow_1.6s_ease-in-out_infinite] bg-signal/20" />}
              <Activity size={13} strokeWidth={1.8} className="relative" />
            </span>
            <div className="min-w-0">
              <span className="block rd-eyebrow text-signal">Live Event Stream</span>
              <span className="block font-mono text-micro text-muted">Newest event first · scroll down for history</span>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <StatusBadge>{run?.timeline.length || 0} entries</StatusBadge>
            {followingLive ? (
              <StatusBadge tone={isLive ? "good" : "ghost"}>
                <span className={cn("mr-1 inline-block h-1.5 w-1.5 rounded-full", isLive ? "animate-[pulse_1.3s_ease-in-out_infinite] bg-signal" : "bg-muted")} />
                Following live
              </StatusBadge>
            ) : (
              <Button type="button" variant="solid" size="compact" onClick={() => followLatest()} data-testid="agentFollowLatest">
                <ArrowUp size={11} /> Follow latest
              </Button>
            )}
          </div>
        </header>

        <div
          ref={transcriptRef}
          className="min-h-0 overflow-y-auto overscroll-contain scroll-smooth"
          onScroll={handleTranscriptScroll}
          data-testid="aiOperatorTranscriptScroller"
        >
          <div className="grid min-h-full w-full content-start gap-3 p-3 min-[1120px]:p-4">
            {run?.policy.tutorialMode && <AgentTutorialGuide run={run} />}

            {!run && (
              <div className="min-h-[260px] border border-rule bg-surface/45 p-6">
                <EmptyState className="min-h-[220px]">
                  <RadioTower size={24} strokeWidth={1.4} />
                  Open a saved run or compose a bounded, saved-scope mission below.
                </EmptyState>
              </div>
            )}

            {run && (
              <div className="grid gap-2" data-testid="agentTimeline">
                {timeline.length === 0 && <EmptyState className="min-h-[180px] border border-rule bg-surface/45">No timeline entries have been recorded.</EmptyState>}
                {timeline.map((entry, index) => {
                  const failure = entry.phase === "failure" || entry.phase === "policy-block" || Boolean(entry.toolResult && !entry.toolResult.ok);
                  const memoryProposal = entry.toolResult?.ok && entry.toolResult.tool === "proposeRunMemory"
                    ? entry.toolResult.data.memory
                    : null;
                  const entryText = timelineEntryText(entry);
                  const isLatest = index === 0;
                  return (
                    <div
                      key={entry.id}
                      className={cn(
                        "grid [grid-template-rows:1fr]",
                        isLatest && "animate-[stream-append_560ms_cubic-bezier(0.22,0.72,0.18,1)_both]"
                      )}
                      data-stream-entry-shell={entry.id}
                    >
                      <div className="min-h-0 overflow-hidden">
                        <article
                          className={cn(
                            "group relative border bg-ink/38 p-3 pl-5 shadow-[0_14px_32px_-30px_var(--color-signal)] transition-[border-color,background-color,transform] duration-500 hover:-translate-y-px hover:bg-surface/55",
                            failure
                              ? "border-rust/50"
                              : isLatest
                                ? "border-signal/50 bg-signal/[0.055]"
                                : entry.phase === "tool-call"
                                  ? "border-signal/30"
                                  : entry.phase === "recon"
                                    ? "border-sand/35"
                                    : "border-rule"
                          )}
                          data-testid={`agentTimelineEntry-${entry.id}`}
                          data-entry-id={entry.id}
                          data-stream-latest={isLatest ? "true" : "false"}
                        >
                          <span className={cn("pointer-events-none absolute bottom-0 left-2 top-0 w-px", failure ? "bg-rust" : isLatest ? "bg-signal" : entry.phase === "recon" ? "bg-sand" : "bg-rule")} />
                          <span className={cn("pointer-events-none absolute left-[5px] top-4 h-[7px] w-[7px] rounded-full border", failure ? "border-rust bg-rust" : isLatest ? "animate-[stream-glow_1.6s_ease-in-out_infinite] border-signal bg-signal" : "border-muted bg-ink")} />
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <span className="block rd-eyebrow text-muted">
                                {isLatest && <span className="mr-2 text-signal">Latest</span>}
                                {entry.phase || "status"} / {entry.createdAt.slice(11, 19)}Z
                              </span>
                              <p className="mt-1 font-display text-body uppercase tracking-data text-bone">{entryText}</p>
                            </div>
                            <StatusBadge tone={failure || entry.reconReport?.status === "failed" ? "danger" : entry.toolResult?.ok || entry.reconReport?.status === "completed" ? "good" : isLatest ? "move" : "ghost"}>
                              {entry.toolResult ? (entry.toolResult.ok ? "ok" : "failed") : entry.reconReport?.status || entry.toolCall?.tool || (isLatest && isLive ? "streaming" : "note")}
                            </StatusBadge>
                          </div>
                          {entry.summary && entry.summary !== entryText && <p className="mt-2 text-body leading-5 text-copy">{entry.summary}</p>}
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
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {[...(run?.findings || [])].reverse().map((finding) => (
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
        </div>
      </div>
    </section>
  );
}
