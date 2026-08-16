import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  Crosshair,
  FileSearch,
  Route,
  ShieldAlert,
  Wrench
} from "lucide-react";
import { completionReportForRun } from "../../shared/agentReport.js";
import type { AgentFinding, AgentRun } from "../types";
import { EmptyState, StatusBadge } from "./radar/primitives";

function EvidenceRefs({ refs }: { refs: string[] }) {
  if (refs.length === 0) return null;
  return (
    <p className="mt-2 select-text break-all border-l border-steel/35 pl-2 font-mono text-micro leading-4 text-steel">
      {refs.join(" · ")}
    </p>
  );
}

function ReportList({ entries }: { entries: string[] }) {
  return (
    <ul className="grid gap-2 text-meta leading-5 text-copy">
      {entries.map((entry, index) => (
        <li key={`${index}-${entry}`} className="grid grid-cols-[18px_minmax(0,1fr)] gap-2">
          <span className="mt-[8px] block h-px bg-signal/70" />
          <span>{entry}</span>
        </li>
      ))}
    </ul>
  );
}

function FindingDetail({ finding, index }: { finding: AgentFinding; index: number }) {
  return (
    <article className="relative overflow-hidden border border-sand/35 bg-sand/[0.045] p-4" data-testid={`agentCompletionFinding-${finding.id}`}>
      <span className="absolute right-2 top-1 font-display text-[42px] font-black leading-none text-sand/[0.07]">{String(index + 1).padStart(2, "0")}</span>
      <div className="relative flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="rd-eyebrow text-sand">Draft security finding</span>
          <h4 className="mt-1 font-display text-lead uppercase tracking-data text-bone">{finding.title}</h4>
        </div>
        <StatusBadge tone={finding.confidence === "high" ? "danger" : "warn"}>{finding.confidence} confidence</StatusBadge>
      </div>
      <p className="relative mt-3 whitespace-pre-wrap text-body leading-6 text-copy">{finding.notes || "No additional finding notes were supplied."}</p>
      <dl className="relative mt-4 grid gap-px border border-rule bg-rule min-[720px]:grid-cols-2">
        <div className="bg-ink/90 p-3">
          <dt className="rd-eyebrow text-muted">Affected assets</dt>
          <dd className="mt-1 select-text break-words font-mono text-label leading-5 text-bone">{finding.affectedAssets.join(" · ")}</dd>
        </div>
        <div className="bg-ink/90 p-3">
          <dt className="rd-eyebrow text-muted">Severity rationale</dt>
          <dd className="mt-1 text-meta leading-5 text-copy">{finding.severityRationale}</dd>
        </div>
        <div className="bg-ink/90 p-3">
          <dt className="rd-eyebrow text-muted">Reproduction</dt>
          <dd className="mt-1 whitespace-pre-wrap text-meta leading-5 text-copy">{finding.reproductionNotes}</dd>
        </div>
        <div className="bg-ink/90 p-3">
          <dt className="rd-eyebrow text-muted">Recommended remediation</dt>
          <dd className="mt-1 whitespace-pre-wrap text-meta leading-5 text-copy">{finding.remediation}</dd>
        </div>
      </dl>
      {finding.uncertainties.length > 0 && (
        <div className="relative mt-3 border-l-2 border-sand/55 bg-sand/[0.045] px-3 py-2">
          <span className="rd-eyebrow text-sand">Uncertainty / validation needed</span>
          <ReportList entries={finding.uncertainties} />
        </div>
      )}
      <EvidenceRefs refs={finding.evidenceRefs} />
    </article>
  );
}

export function AgentCompletionReport({ run }: { run: AgentRun }) {
  const report = completionReportForRun(run);
  if (!report) return null;
  const outcomeLabel = report.outcome === "draft-findings"
    ? `${report.findingCount} draft finding${report.findingCount === 1 ? "" : "s"}`
    : report.outcome === "observations-only"
      ? "observations only"
      : "no evidence-backed findings";

  return (
    <section className="relative overflow-hidden border border-signal/35 bg-[linear-gradient(145deg,color-mix(in_srgb,var(--color-signal)_7%,var(--color-ink)),var(--color-ink)_58%)] shadow-[0_22px_60px_-44px_var(--color-signal)]" data-testid="agentCompletionReport">
      <div className="pointer-events-none absolute inset-0 opacity-25 [background-image:linear-gradient(color-mix(in_srgb,var(--color-signal)_10%,transparent)_1px,transparent_1px),linear-gradient(90deg,color-mix(in_srgb,var(--color-signal)_8%,transparent)_1px,transparent_1px)] [background-size:28px_28px]" />
      <header className="relative flex flex-wrap items-start justify-between gap-4 border-b border-signal/25 px-4 py-4 min-[1120px]:px-5">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center border border-signal/40 bg-signal/10 text-signal shadow-[inset_0_0_22px_color-mix(in_srgb,var(--color-signal)_12%,transparent)]">
            <ClipboardCheck size={19} strokeWidth={1.7} />
          </span>
          <div className="min-w-0">
            <span className="rd-eyebrow text-signal">Assessment resolved</span>
            <h2 className="mt-1 font-display text-title uppercase tracking-data text-bone">Completion Report</h2>
            <p className="mt-1 font-mono text-micro text-muted">Durable write-up · {report.operationCount} operations · {report.evidenceRefs.length} evidence references</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <StatusBadge tone={report.findingCount > 0 ? "warn" : "good"}>{outcomeLabel}</StatusBadge>
          {report.rejectedFindingCount > 0 && <StatusBadge tone="danger">{report.rejectedFindingCount} rejected by quality gate</StatusBadge>}
        </div>
      </header>

      <div className="relative grid gap-px bg-rule min-[900px]:grid-cols-[minmax(0,1.35fr)_minmax(260px,0.65fr)]">
        <section className="bg-ink/92 p-4 min-[1120px]:p-5" data-testid="agentCompletionExecutiveSummary">
          <div className="flex items-center gap-2 rd-eyebrow text-signal"><CheckCircle2 size={12} /> Executive summary</div>
          <p className="mt-3 whitespace-pre-wrap font-display text-[18px] leading-7 tracking-[0.01em] text-bone">{report.executiveSummary}</p>
        </section>
        <section className="bg-surface/80 p-4 min-[1120px]:p-5">
          <div className="flex items-center gap-2 rd-eyebrow text-steel"><Crosshair size={12} /> Scope assessed</div>
          <p className="mt-3 whitespace-pre-wrap text-meta leading-5 text-copy">{report.scopeSummary}</p>
        </section>
      </div>

      <div className="relative grid gap-4 p-4 min-[1120px]:p-5">
        <section className="border border-rule bg-surface/55 p-4">
          <div className="flex items-center gap-2 rd-eyebrow text-muted"><Route size={12} /> Methodology</div>
          <div className="mt-3"><ReportList entries={report.methodology} /></div>
        </section>

        <section data-testid="agentCompletionObservations">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 rd-eyebrow text-steel"><FileSearch size={12} /> Evidence-backed observations</div>
            <StatusBadge tone="move">{report.observations.length}</StatusBadge>
          </div>
          {report.observations.length === 0 ? (
            <EmptyState className="border border-rule bg-surface/45">No separate evidence-backed observations were retained.</EmptyState>
          ) : (
            <div className="grid gap-2 min-[860px]:grid-cols-2">
              {report.observations.map((observation, index) => (
                <article key={`${observation.title}-${index}`} className="border border-steel/25 bg-steel/[0.035] p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <h3 className="font-display text-body uppercase tracking-data text-bone">{observation.title}</h3>
                    <div className="flex gap-1"><StatusBadge tone={observation.status === "contradicted" ? "danger" : observation.status === "verified" ? "good" : "move"}>{observation.status}</StatusBadge><StatusBadge>{observation.confidence}</StatusBadge></div>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-meta leading-5 text-copy">{observation.detail}</p>
                  <EvidenceRefs refs={observation.evidenceRefs} />
                </article>
              ))}
            </div>
          )}
        </section>

        <section data-testid="agentCompletionFindings">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 rd-eyebrow text-sand"><ShieldAlert size={12} /> Detailed draft findings</div>
            <StatusBadge tone={run.findings.length > 0 ? "warn" : "ghost"}>{run.findings.length}</StatusBadge>
          </div>
          {run.findings.length === 0 ? (
            <div className="border border-rule bg-surface/55 p-4">
              <p className="font-display text-body uppercase tracking-data text-bone">No draft vulnerability passed the evidence quality gate</p>
              <p className="mt-2 text-meta leading-5 text-muted">This is a bounded-assessment result, not proof that the target has no vulnerabilities. Review the observations and limitations below.</p>
            </div>
          ) : (
            <div className="grid gap-3">{run.findings.map((finding, index) => <FindingDetail key={finding.id} finding={finding} index={index} />)}</div>
          )}
        </section>

        <div className="grid gap-3 min-[860px]:grid-cols-2">
          <section className="border border-sand/25 bg-sand/[0.035] p-4" data-testid="agentCompletionLimitations">
            <div className="flex items-center gap-2 rd-eyebrow text-sand"><AlertTriangle size={12} /> Limitations & gaps</div>
            <div className="mt-3"><ReportList entries={report.limitations} /></div>
          </section>
          <section className="border border-jade/25 bg-jade/[0.035] p-4" data-testid="agentCompletionRecommendations">
            <div className="flex items-center gap-2 rd-eyebrow text-jade"><Wrench size={12} /> Recommended next actions</div>
            <div className="mt-3"><ReportList entries={report.recommendations} /></div>
          </section>
        </div>
      </div>
    </section>
  );
}
