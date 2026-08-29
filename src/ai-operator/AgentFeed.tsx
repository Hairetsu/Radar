import { Activity, ArrowUp, Eye, FileText, RadioTower } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AgentThoughtstream } from "../components/AgentThoughtstream";
import { AgentCompletionReport } from "../components/AgentCompletionReport";
import { AgentTutorialGuide } from "../components/AgentTutorialGuide";
import { Button } from "../components/ui/button";
import { EmptyState, StatusBadge } from "../components/radar/primitives";
import { cn, timelineEntryText } from "../lib";
import type { AgentTimelineEntry } from "../types";
import {
  AgentEvidencePreview,
  AgentOperationCard,
  AgentStreamMarker
} from "./AgentOperationCard";
import {
  defaultExpandedOperationIds,
  projectAgentOperationStream
} from "./agentOperationStream";
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
  const previousLatestRef = useRef("");
  const [followingLive, setFollowingLive] = useState(true);
  const [unseenActivity, setUnseenActivity] = useState(0);
  const [auditDetail, setAuditDetail] = useState(false);
  const [expansionOverrides, setExpansionOverrides] = useState<Record<string, boolean>>({});
  const [previewEntry, setPreviewEntry] = useState<AgentTimelineEntry | null>(null);
  const streamItems = useMemo(() => run ? projectAgentOperationStream(run) : [], [run]);
  const defaultExpanded = useMemo(() => defaultExpandedOperationIds(streamItems), [streamItems]);
  const operationItems = useMemo(
    () => streamItems.filter((item) => item.kind === "operation"),
    [streamItems]
  );
  const operationNumbers = useMemo(() => {
    const values = new Map<string, number>();
    [...operationItems].reverse().forEach((item, index) => values.set(item.id, index + 1));
    return values;
  }, [operationItems]);
  const latestEventId = run?.timeline.at(-1)?.id || "";
  const newestOperationId = operationItems[0]?.id || "";
  const isLive = run?.status === "running" || run?.status === "queued";

  const followLatest = useCallback((behavior: FeedScrollBehavior = "smooth") => {
    setFollowingLive(true);
    setUnseenActivity(0);
    scrollToLatest(transcriptRef.current, behavior);
  }, []);

  useEffect(() => {
    setExpansionOverrides({});
    setPreviewEntry(null);
    setFollowingLive(true);
    setUnseenActivity(0);
    previousLatestRef.current = "";
    scrollToLatest(transcriptRef.current, "auto");
  }, [run?.id]);

  useEffect(() => {
    const previous = previousLatestRef.current;
    previousLatestRef.current = latestEventId;
    if (!latestEventId || !previous || previous === latestEventId) return;
    if (followingLive) {
      scrollToLatest(transcriptRef.current, "auto");
      return;
    }
    setUnseenActivity((count) => count + 1);
  }, [followingLive, latestEventId]);

  const handleTranscriptScroll = useCallback(() => {
    const nextFollowing = (transcriptRef.current?.scrollTop || 0) <= 56;
    setFollowingLive((current) => current === nextFollowing ? current : nextFollowing);
    if (nextFollowing) setUnseenActivity(0);
  }, []);

  const toggleOperation = useCallback((operationId: string) => {
    setExpansionOverrides((current) => {
      const currentlyExpanded = current[operationId] ?? defaultExpanded.has(operationId);
      return { ...current, [operationId]: !currentlyExpanded };
    });
  }, [defaultExpanded]);

  const revealPreview = useCallback(() => {
    if (!run || !previewEntry?.target) return;
    void controller.dispatchWorkspaceIntent(
      { type: "reveal-timeline-target", runId: run.id, entryId: previewEntry.id },
      true
    );
    setPreviewEntry(null);
  }, [controller, previewEntry, run]);

  return (
    <section className="relative grid min-h-0 min-w-0 overflow-hidden [grid-template-rows:auto_minmax(0,1fr)]" data-testid="aiOperatorFeed" data-radar-focus-inset tabIndex={0}>
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {run ? `Run ${run.status}. ${run.timeline.at(-1) ? timelineEntryText(run.timeline.at(-1)!) : "No timeline entries."}` : "No AI run selected."}
      </p>

      <div className="relative z-10 border-b border-rule bg-ink/82 p-3 shadow-[0_18px_36px_-34px_var(--color-signal)] backdrop-blur-xl min-[1120px]:px-4 min-[1120px]:py-3">
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
              <span className="block rd-eyebrow text-signal">Operation Stream</span>
              <span className="block font-mono text-micro text-muted">Newest operation first · decide → act → observe</span>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            <StatusBadge>{operationItems.length} operations</StatusBadge>
            <StatusBadge>{run?.timeline.length || 0} audit events</StatusBadge>
            <Button type="button" variant={auditDetail ? "solid" : "ghost"} size="compact" onClick={() => setAuditDetail((visible) => !visible)} aria-pressed={auditDetail} data-testid="agentAuditDetailToggle"><Eye size={11} /> Audit detail</Button>
            {followingLive ? (
              <StatusBadge tone={isLive ? "good" : "ghost"}>
                <span className={cn("mr-1 inline-block h-1.5 w-1.5 rounded-full", isLive ? "animate-[pulse_1.3s_ease-in-out_infinite] bg-signal" : "bg-muted")} />
                Following live
              </StatusBadge>
            ) : (
              <Button type="button" variant="solid" size="compact" onClick={() => followLatest()} data-testid="agentFollowLatest">
                <ArrowUp size={11} /> {unseenActivity > 0 ? `${unseenActivity} new` : "Follow latest"}
              </Button>
            )}
          </div>
        </header>

        <div ref={transcriptRef} className="min-h-0 overflow-y-auto overscroll-contain scroll-smooth" onScroll={handleTranscriptScroll} data-testid="aiOperatorTranscriptScroller">
          <div className="grid min-h-full w-full content-start gap-3 p-3 min-[1120px]:p-4">
            {run?.policy.tutorialMode && <AgentTutorialGuide run={run} />}

            {run?.status === "completed" && (
              <AgentCompletionReport run={run} onFollowUpFinding={controller.composeFindingFollowUp} />
            )}

            {!run && (
              <div className="min-h-[260px] border border-rule bg-surface/45 p-6">
                <EmptyState className="min-h-[220px]"><RadioTower size={24} strokeWidth={1.4} />Open a saved run or compose a bounded, saved-scope mission below.</EmptyState>
              </div>
            )}

            {run && (
              <div className="grid gap-2" data-testid="agentTimeline">
                {streamItems.length === 0 && <EmptyState className="min-h-[180px] border border-rule bg-surface/45">No timeline entries have been recorded.</EmptyState>}
                {streamItems.map((item) => {
                  if (item.kind === "marker") return <AgentStreamMarker key={item.id} entry={item.entry} />;
                  const expanded = expansionOverrides[item.id] ?? defaultExpanded.has(item.id);
                  return (
                    <div key={item.id} className={cn("grid [grid-template-rows:1fr]", item.id === newestOperationId && "animate-[stream-append_560ms_cubic-bezier(0.22,0.72,0.18,1)_both]")} data-stream-operation-shell={item.id}>
                      <div className="min-h-0 overflow-hidden">
                        <AgentOperationCard
                          operation={item.operation}
                          operationNumber={operationNumbers.get(item.id) || 1}
                          expanded={expanded}
                          auditDetail={auditDetail}
                          isNewest={item.id === newestOperationId}
                          controller={controller}
                          onToggle={() => toggleOperation(item.id)}
                          onPreview={setPreviewEntry}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {run?.status !== "completed" && [...(run?.findings || [])].reverse().map((finding) => (
              <article key={finding.id} className="border border-sand/35 bg-sand/[0.055] p-3" data-testid={`agentFeedFinding-${finding.id}`}>
                <div className="flex flex-wrap items-center justify-between gap-2"><span className="flex items-center gap-2 rd-eyebrow text-sand"><FileText size={12} /> Draft Finding</span><StatusBadge>{finding.confidence}</StatusBadge></div>
                <h3 className="mt-2 font-display text-lead uppercase tracking-data text-bone">{finding.title}</h3>
                <p className="mt-2 text-body leading-5 text-copy">{finding.notes}</p>
                <p className="mt-2 select-text break-all font-mono text-label text-muted">{finding.evidenceRefs.join(" · ")}</p>
              </article>
            ))}
          </div>
        </div>
      </div>

      {previewEntry && run && (
        <>
          <button type="button" className="absolute inset-0 z-20 bg-ink/60 backdrop-blur-[2px]" aria-label="Close evidence preview" onClick={() => setPreviewEntry(null)} />
          <AgentEvidencePreview entry={previewEntry} runId={run.id} onClose={() => setPreviewEntry(null)} onReveal={revealPreview} />
        </>
      )}
    </section>
  );
}
