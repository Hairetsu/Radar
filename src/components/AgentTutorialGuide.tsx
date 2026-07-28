import { BookOpenCheck, CircleHelp } from "lucide-react";
import type { AgentRun } from "../types";
import { cn } from "../lib";
import { dispositionTone } from "./agentTutorialPresentation";
import { EmptyState, StatusBadge } from "./radar/primitives";
import { TutorialLessonList } from "./TutorialLessonList";
import { TutorialReadinessRows } from "./TutorialReadinessRows";

export function AgentTutorialGuide({ run }: { run: AgentRun | null }) {
  const lessons = run?.timeline.flatMap((entry) => (entry.tutorial ? [entry.tutorial] : [])) || [];
  const lesson = lessons.at(-1);

  return (
    <section
      className="relative overflow-hidden border border-signal/35 bg-[linear-gradient(118deg,color-mix(in_srgb,var(--color-signal)_8%,transparent),transparent_46%),color-mix(in_srgb,var(--color-surface)_84%,transparent)] md:col-span-2"
      data-testid="agentTutorialGuide"
      data-component="agentTutorialGuide"
    >
      <div className="pointer-events-none absolute -right-12 -top-14 h-36 w-36 rotate-12 border border-signal/10" />
      <div className="relative flex flex-wrap items-center justify-between gap-2 border-b border-signal/20 px-4 py-3">
        <div className="flex items-center gap-2">
          <BookOpenCheck size={15} strokeWidth={1.7} className="text-signal" />
          <span className="rd-eyebrow text-signal">Guided Field Lesson</span>
        </div>
        <div className="flex flex-wrap gap-1">
          <StatusBadge tone="good">paced</StatusBadge>
          <StatusBadge>{lessons.length} checkpoint{lessons.length === 1 ? "" : "s"}</StatusBadge>
        </div>
      </div>

      {!lesson && (
        <EmptyState className="min-h-[150px]">
          <CircleHelp size={22} strokeWidth={1.4} />
          The first lesson appears when the scoped run begins.
        </EmptyState>
      )}

      {lesson && (
        <div className="relative grid gap-4 p-4 lg:grid-cols-[minmax(0,0.82fr)_minmax(320px,1.18fr)]">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge tone="move">{lesson.stage}</StatusBadge>
              <StatusBadge tone={dispositionTone(lesson.disposition)}>{lesson.disposition.replaceAll("-", " ")}</StatusBadge>
            </div>
            <h3 className="mt-3 font-display text-title uppercase tracking-data text-bone">{lesson.title}</h3>
            <p className="mt-2 text-lead leading-6 text-copy">{lesson.clue}</p>
            <div className="mt-3 border border-rule bg-ink/30 p-3">
              <span className="rd-eyebrow text-muted">Why this matters</span>
              <p className="mt-1.5 text-body leading-5 text-copy">{lesson.whyItMatters}</p>
            </div>
            <div className="mt-3 border-l-2 border-signal bg-signal/[0.06] p-3">
              <span className="rd-eyebrow text-signal">Next safe step</span>
              <p className="mt-1.5 text-body leading-5 text-bone">{lesson.safeNextStep}</p>
            </div>
          </div>

          <div className="grid min-w-0 gap-3 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
            <TutorialLessonList title="Look for" items={lesson.lookFor} icon="look" />
            <TutorialLessonList title="Stronger evidence" items={lesson.strongerEvidence} icon="stronger" />
            <TutorialLessonList title="Could disprove it" items={lesson.falsifiers} icon="falsify" />
            <div className={cn("border border-rule bg-ink/28 p-3 sm:col-span-3 lg:col-span-1 xl:col-span-3", lesson.disposition === "cve-review" && "border-rust/35")}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="rd-eyebrow text-muted">Triage lane</span>
                {lesson.evidenceRefs.length > 0 && <StatusBadge>{lesson.evidenceRefs.length} evidence ref{lesson.evidenceRefs.length === 1 ? "" : "s"}</StatusBadge>}
              </div>
              <p className="mt-2 text-meta leading-5 text-copy">{lesson.dispositionRationale}</p>
              <TutorialReadinessRows guidance={lesson} />
              {lesson.evidenceRefs.length > 0 && (
                <p className="mt-2 font-mono text-micro leading-4 text-muted">{lesson.evidenceRefs.join(" · ")}</p>
              )}
              <p className="mt-2 border-t border-rule/70 pt-2 font-mono text-micro leading-4 text-muted">
                CVE review is a handoff candidate, never an assignment. Confirm authorization, preserve minimal evidence, and coordinate privately with the vendor or appropriate CNA.
              </p>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
