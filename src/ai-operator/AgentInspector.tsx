import { Database, FileText, GitBranch, KeyRound, Plus, ScanLine, Trash2 } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { AgentCapabilityLedger } from "../components/AgentCapabilityLedger";
import { AgentCompletionReport } from "../components/AgentCompletionReport";
import { AgentMissionGraph } from "../components/AgentMissionGraph";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { EmptyState, StatusBadge } from "../components/radar/primitives";
import { cn } from "../lib";
import type { AiOperatorController } from "./useAiOperator";

type InspectorTab = "mission" | "authority" | "assessment" | "findings" | "memory";

const tabs: Array<{ id: InspectorTab; label: string; icon: typeof GitBranch }> = [
  { id: "mission", label: "Graph", icon: GitBranch },
  { id: "authority", label: "Leases", icon: KeyRound },
  { id: "assessment", label: "Assess", icon: ScanLine },
  { id: "findings", label: "Report", icon: FileText },
  { id: "memory", label: "Memory", icon: Database }
];

export function AgentInspector({ controller, className }: { controller: AiOperatorController; className?: string }) {
  const [tab, setTab] = useState<InspectorTab>("mission");
  const pendingLeaseId = controller.activeRun?.capabilities?.leases.find((lease) => lease.status === "draft")?.id || "";
  useEffect(() => {
    if (pendingLeaseId) {
      setTab("authority");
    }
  }, [pendingLeaseId]);
  const submitMemory = (event: FormEvent) => {
    event.preventDefault();
    void controller.createMemory();
  };

  return (
    <aside className={cn("grid min-h-0 grid-rows-[auto_minmax(0,1fr)] border-l border-rule bg-surface/45", className)} data-testid="aiMissionInspector">
      <div className="grid grid-cols-5 border-b border-rule bg-ink/55">
        {tabs.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              className={cn("grid min-h-12 place-items-center gap-0.5 border-r border-rule px-1 font-mono text-micro uppercase tracking-normal text-muted transition last:border-r-0 hover:bg-signal/5 hover:text-bone", tab === item.id && "bg-signal/10 text-signal")}
              onClick={() => setTab(item.id)}
              aria-pressed={tab === item.id}
              data-testid={`aiInspector-${item.id}`}
            >
              <Icon size={12} /> {item.label}
            </button>
          );
        })}
      </div>
      <div className="min-h-0 overflow-y-auto overscroll-contain p-2" data-radar-focus-inset tabIndex={0}>
        {tab === "mission" && <AgentMissionGraph run={controller.activeRun} onSteer={controller.steerMission} />}
        {tab === "authority" && <AgentCapabilityLedger run={controller.activeRun} onUpdate={controller.updateCapabilities} />}
        {tab === "assessment" && (
          <section className="border border-rule bg-ink/28" data-testid="aiInspectorAssessment">
            <div className="flex items-center justify-between border-b border-rule px-3 py-2">
              <span className="rd-eyebrow text-muted">Assessment</span>
              <StatusBadge>{controller.activeRun?.assessment?.status || "idle"}</StatusBadge>
            </div>
            <div className="grid gap-3 p-3">
              {!controller.activeRun?.assessment && <EmptyState>No armed assessment contract on this run.</EmptyState>}
              {controller.activeRun?.assessment && (
                <>
                  <p className="font-mono text-micro text-copy">
                    {controller.activeRun.assessment.contract.authorityLevel} · {controller.activeRun.assessment.contract.families.join(" · ")}
                  </p>
                  <p className="font-mono text-micro text-muted">
                    Consumed {controller.activeRun.assessment.ledger.consumed} / reserved {controller.activeRun.assessment.ledger.reserved} · remaining {Math.max(0, controller.activeRun.assessment.contract.maxProbeRequests - controller.activeRun.assessment.ledger.consumed)}
                  </p>
                  {controller.activeRun.assessment.stopReason && (
                    <p className="font-mono text-micro text-warn">{controller.activeRun.assessment.stopReason}</p>
                  )}
                  {!controller.activeRun.assessment.queue.length && <EmptyState>No experiments queued.</EmptyState>}
                  {controller.activeRun.assessment.queue.map((item) => (
                    <article key={item.id} className="border border-rule bg-surface/45 p-3" data-testid={`assessmentQueue-${item.id}`}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className="font-display text-body uppercase tracking-data text-bone">{item.family}</h3>
                        <StatusBadge>{item.status}</StatusBadge>
                      </div>
                      <p className="mt-2 text-meta leading-5 text-muted">{item.hypothesis}</p>
                      <p className="mt-2 font-mono text-micro text-muted">
                        {item.classification || "unclassified"} · {item.requestCost} requests · {item.captureId}
                      </p>
                      {item.skipReason && <p className="mt-1 font-mono text-micro text-muted">{item.skipReason}</p>}
                    </article>
                  ))}
                </>
              )}
            </div>
          </section>
        )}
        {tab === "findings" && (
          controller.activeRun?.status === "completed" ? (
            <AgentCompletionReport run={controller.activeRun} />
          ) : <section className="border border-rule bg-ink/28" data-testid="aiInspectorFindings">
            <div className="flex items-center justify-between border-b border-rule px-3 py-2">
              <span className="rd-eyebrow text-muted">Draft Findings</span>
              <StatusBadge>{controller.activeRun?.findings.length || 0}</StatusBadge>
            </div>
            <div className="p-2">
              {!controller.activeRun?.findings.length && <EmptyState>No draft findings in this run.</EmptyState>}
              {controller.activeRun?.findings.map((finding) => (
                <article key={finding.id} className="mb-2 border border-rule bg-surface/45 p-3">
                  <div className="flex items-center justify-between gap-2"><h3 className="font-display text-body uppercase tracking-data text-bone">{finding.title}</h3><StatusBadge>{finding.confidence}</StatusBadge></div>
                  <p className="mt-2 text-meta leading-5 text-muted">{finding.notes}</p>
                  <p className="mt-2 select-text break-all font-mono text-micro text-muted">{finding.evidenceRefs.join(" · ")}</p>
                </article>
              ))}
            </div>
          </section>
        )}
        {tab === "memory" && (
          <section className="border border-rule bg-ink/28" data-testid="aiInspectorMemory">
            <div className="flex items-center justify-between border-b border-rule px-3 py-2"><span className="rd-eyebrow text-muted">Local Run Memory</span><StatusBadge>{controller.memory.length}</StatusBadge></div>
            <form className="grid gap-2 border-b border-rule p-3" onSubmit={submitMemory}>
              <Input value={controller.memoryTitle} onChange={(event) => controller.setMemoryTitle(event.target.value)} placeholder="Hypothesis or retest title" data-testid="agentMemoryTitle" />
              <Textarea value={controller.memoryNotes} onChange={(event) => controller.setMemoryNotes(event.target.value)} placeholder="What was tested, dismissed, or needs retest?" className="min-h-[74px]" data-testid="agentMemoryNotes" />
              <Button type="submit" variant="outline" size="compact" data-testid="agentMemoryCreate"><Plus size={11} /> Remember</Button>
            </form>
            <div className="grid gap-2 p-3">
              <Input value={controller.memorySearch} onChange={(event) => controller.setMemorySearch(event.target.value)} placeholder="Search local run memory" data-testid="agentMemorySearch" />
              {controller.filteredMemory.length === 0 && <EmptyState>No local run memory yet.</EmptyState>}
              {controller.filteredMemory.map((entry) => (
                <article key={entry.id} className="border border-rule bg-surface/45 p-3" data-testid={`agentMemory-${entry.id}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-display text-body uppercase tracking-data text-bone">{entry.title}</h3><div className="flex gap-1"><StatusBadge>{entry.kind}</StatusBadge><StatusBadge>{entry.status}</StatusBadge></div></div>
                  <p className="mt-2 text-meta leading-5 text-muted">{entry.notes}</p>
                  {entry.evidenceRefs.length > 0 && <p className="mt-2 select-text break-all font-mono text-micro text-muted">{entry.evidenceRefs.join(" · ")}</p>}
                  <Button type="button" variant="ghost" size="compact" className="mt-2" onClick={() => void controller.deleteMemory(entry.id)} data-testid={`agentMemoryDelete-${entry.id}`}><Trash2 size={11} /> Delete</Button>
                </article>
              ))}
            </div>
          </section>
        )}
      </div>
    </aside>
  );
}
