import { Ban, KeyRound, RadioTower, ShieldCheck } from "lucide-react";
import { Button } from "../components/ui/button";
import { StatusBadge } from "../components/radar/primitives";
import type { AiOperatorController } from "./useAiOperator";

function durationLabel(durationMs: number): string {
  if (durationMs < 60_000) return `${Math.max(1, Math.round(durationMs / 1_000))} sec`;
  return `${Math.max(1, Math.round(durationMs / 60_000))} min`;
}

export function AgentCapabilityPrompt({ controller }: { controller: AiOperatorController }) {
  const run = controller.activeRun;
  const lease = [...(run?.capabilities?.leases || [])].reverse().find((candidate) => candidate.status === "draft") || null;

  if (!run || !lease) return null;

  return (
    <div
      className="fixed inset-0 z-[70] grid place-items-center overflow-y-auto bg-ink/80 px-4 py-8 backdrop-blur-md"
      data-testid="capabilityPermissionBackdrop"
    >
      <section
        className="radar-reveal relative grid max-h-[min(760px,calc(100vh-3rem))] w-full max-w-[700px] overflow-hidden border border-sand/65 bg-[linear-gradient(145deg,color-mix(in_srgb,var(--color-sand)_11%,transparent),transparent_34%),color-mix(in_srgb,var(--color-surface)_96%,var(--color-ink))] opacity-0 shadow-[0_32px_100px_-24px_color-mix(in_srgb,var(--color-ink)_92%,transparent),0_0_65px_-38px_var(--color-sand)] animate-[enter_320ms_cubic-bezier(0.2,0.74,0.19,1)_forwards]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="capability-permission-title"
        aria-describedby="capability-permission-description"
        data-testid="agentCapabilityReview"
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px overflow-hidden">
          <span className="block h-full w-1/3 animate-[agent-flow_1.7s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-sand to-transparent" />
        </div>

        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-sand/30 px-5 py-4 sm:px-6">
          <div className="flex min-w-0 items-start gap-3">
            <span className="relative grid h-10 w-10 shrink-0 place-items-center border border-sand/45 bg-sand/10 text-sand">
              <span className="absolute inset-1 animate-[ping_1.8s_ease-out_infinite] border border-sand/35" />
              <KeyRound size={18} strokeWidth={1.65} />
            </span>
            <div className="min-w-0">
              <span className="rd-eyebrow text-sand">Permission requested</span>
              <h2 id="capability-permission-title" className="mt-1 break-words font-display text-title font-semibold uppercase leading-none tracking-data text-bone">
                {lease.name}
              </h2>
            </div>
          </div>
          <StatusBadge tone="warn">{lease.riskTier} action</StatusBadge>
        </header>

        <div className="min-h-0 overflow-y-auto px-5 py-5 sm:px-6">
          <p id="capability-permission-description" className="max-w-[62ch] text-body leading-6 text-copy">
            The agent is paused before this action. Review the exact authority below, then approve or deny it.
          </p>

          <div className="mt-4 border border-sand/30 bg-ink/45 p-4">
            <span className="rd-eyebrow text-muted">Why the agent needs it</span>
            <p className="mt-2 text-body leading-6 text-bone">{lease.reason}</p>
          </div>

          <div className="mt-3 grid gap-px bg-rule sm:grid-cols-3">
            <div className="bg-surface/95 p-3">
              <span className="rd-label-sm text-muted">Tools</span>
              <p className="mt-1 break-words font-mono text-label text-bone">{lease.tools.join(" · ")}</p>
            </div>
            <div className="bg-surface/95 p-3">
              <span className="rd-label-sm text-muted">Limits</span>
              <p className="mt-1 font-mono text-label text-bone">{lease.maxUses} use · {lease.maxRequests} request · {lease.maxConcurrency} at once · {lease.maxPayloadBytes.toLocaleString()} B payload</p>
            </div>
            <div className="bg-surface/95 p-3">
              <span className="rd-label-sm text-muted">Window</span>
              <p className="mt-1 font-mono text-label text-bone">{durationLabel(lease.durationMs)}</p>
            </div>
          </div>

          <div className="mt-3 border border-rule bg-ink/30">
            <div className="flex items-center gap-2 border-b border-rule px-3 py-2">
              <RadioTower size={12} className="text-signal" />
              <span className="rd-eyebrow text-muted">Exact authority bounds</span>
            </div>
            <div className="grid gap-2 p-3">
              {lease.grants.map((grant, index) => (
                <code key={`${grant.origin}-${grant.method}-${grant.pathPrefix}-${grant.identity}-${index}`} className="select-text break-all border-l-2 border-signal/55 bg-signal/[0.045] px-3 py-2 font-mono text-label leading-5 text-copy">
                  {grant.method} {grant.origin}{grant.pathPrefix} · identity {grant.identity}
                </code>
              ))}
            </div>
          </div>
        </div>

        <footer className="grid gap-3 border-t border-rule bg-ink/55 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-6">
          <p className="font-mono text-micro leading-4 text-muted">
            Approve Once keeps the exact path above. Approve All covers this tool across paths on the same origin, method, and identity, within the current profile, Scope, auth binding, and budgets. Resume remains separate.
          </p>
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="compact"
              disabled={controller.pending}
              autoFocus
              onClick={() => void controller.updateCapabilities({ action: "revoke", leaseId: lease.id, reason: "Denied by operator." })}
              data-testid="capabilityPermissionDeny"
            >
              <Ban size={12} /> Deny
            </Button>
            <Button
              type="button"
              variant="solid"
              size="compact"
              disabled={controller.pending}
              onClick={() => void controller.updateCapabilities({ action: "grant", leaseId: lease.id, approval: "once" })}
              data-testid="capabilityPermissionGrant"
            >
              <ShieldCheck size={12} /> Approve Once
            </Button>
            {lease.tools.length === 1 && lease.grants.length === 1 && (
              <Button
                type="button"
                variant="zap"
                size="compact"
                disabled={controller.pending}
                onClick={() => void controller.updateCapabilities({ action: "grant", leaseId: lease.id, approval: "all-matching" })}
                title="Approve matching calls for this tool on the same origin, method, and identity within the run's caps"
                data-testid="capabilityPermissionGrantAll"
              >
                <ShieldCheck size={12} /> Approve All
              </Button>
            )}
          </div>
        </footer>
      </section>
    </div>
  );
}
