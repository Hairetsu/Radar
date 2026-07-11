import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Ban, KeyRound, Plus, RadioTower, ShieldCheck, TimerReset } from "lucide-react";
import { getAgentRunProfile } from "../../shared/agentProfiles.js";
import type {
  AgentCapabilityAction,
  AgentCapabilityLeaseRequest,
  AgentRiskTier,
  AgentRun,
  AgentToolName
} from "../types";
import { EmptyState, StatusBadge } from "./radar/primitives";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Select } from "./ui/select";

type LeaseTemplateId =
  | "navigate"
  | "browser-input"
  | "browser-click"
  | "browser-submit"
  | "auth-save"
  | "auth-load"
  | "replay"
  | "workflow";

const LEASE_TEMPLATES: Array<{
  id: LeaseTemplateId;
  label: string;
  tier: AgentRiskTier;
  tools: AgentToolName[];
  method: string;
  maxPayloadBytes: number;
}> = [
  { id: "navigate", label: "R1 Navigate", tier: "navigate", tools: ["openBrowser", "navigateBrowser"], method: "GET", maxPayloadBytes: 0 },
  { id: "browser-input", label: "R1 Fill Input", tier: "reversible", tools: ["fillInput"], method: "GET", maxPayloadBytes: 64 * 1024 },
  { id: "browser-click", label: "R2 Click", tier: "active", tools: ["clickElement"], method: "GET", maxPayloadBytes: 0 },
  { id: "browser-submit", label: "R2 Submit", tier: "active", tools: ["submitForm"], method: "POST", maxPayloadBytes: 64 * 1024 },
  { id: "auth-save", label: "R1 Save Auth", tier: "reversible", tools: ["saveAuthState"], method: "GET", maxPayloadBytes: 0 },
  { id: "auth-load", label: "R1 Load Auth", tier: "reversible", tools: ["loadAuthState"], method: "GET", maxPayloadBytes: 0 },
  { id: "replay", label: "R2 Replay", tier: "active", tools: ["sendReplay"], method: "GET", maxPayloadBytes: 256 * 1024 },
  { id: "workflow", label: "R2 Workflow", tier: "active", tools: ["runWorkflow"], method: "GET", maxPayloadBytes: 256 * 1024 }
];

const TIER_LABEL: Record<AgentRiskTier, string> = {
  navigate: "R1 NAVIGATE",
  reversible: "R1 LOCAL / REVERSIBLE",
  active: "R2 ACTIVE TRANSMIT",
  destructive: "BLOCKED"
};

function expiresLabel(value?: string) {
  return value ? `${value.slice(11, 19)}Z` : "not granted";
}

export function AgentCapabilityLedger({
  run,
  onUpdate
}: {
  run: AgentRun | null;
  onUpdate: (action: AgentCapabilityAction) => void | Promise<void>;
}) {
  const state = run?.capabilities || null;
  const canEdit = Boolean(run && (run.status === "paused" || run.status === "failed"));
  const profile = getAgentRunProfile(run?.profileId);
  const templates = useMemo(
    () => LEASE_TEMPLATES.filter((template) => template.tools.every((tool) => profile.allowedTools.includes(tool))),
    [profile]
  );
  const [templateId, setTemplateId] = useState<LeaseTemplateId>("navigate");
  const [origin, setOrigin] = useState("");
  const [method, setMethod] = useState("GET");
  const [pathPrefix, setPathPrefix] = useState("/");
  const [identity, setIdentity] = useState("current");
  const [durationMinutes, setDurationMinutes] = useState(2);
  const [maxUses, setMaxUses] = useState(1);
  const [maxRequests, setMaxRequests] = useState(1);
  const [reason, setReason] = useState("Authorize one exact, reviewable mission experiment.");

  const selectedTemplate =
    templates.find((template) => template.id === templateId) || templates[0] || LEASE_TEMPLATES[0];

  useEffect(() => {
    setOrigin(run?.checkpoint?.targetOrigin || "");
    setTemplateId(templates[0]?.id || "navigate");
    setMethod(templates[0]?.method || "GET");
    setPathPrefix("/");
    setIdentity(run?.checkpoint?.activeIdentity || "current");
  }, [run?.id, run?.checkpoint?.activeIdentity, run?.checkpoint?.targetOrigin, templates]);

  useEffect(() => {
    setMethod(selectedTemplate.method);
  }, [selectedTemplate.method]);

  const submitLease = (event: FormEvent) => {
    event.preventDefault();
    if (!canEdit || !origin.trim() || !reason.trim()) return;
    const lease: AgentCapabilityLeaseRequest = {
      name: `${selectedTemplate.label} / ${method.toUpperCase()} ${pathPrefix || "/"}`,
      riskTier: selectedTemplate.tier,
      tools: selectedTemplate.tools,
      grants: [
        {
          origin: origin.trim(),
          method: method.toUpperCase(),
          pathPrefix: pathPrefix.trim() || "/",
          identity: identity.trim() || "current"
        }
      ],
      durationMs: durationMinutes * 60_000,
      maxUses,
      maxRequests,
      maxConcurrency: 1,
      maxPayloadBytes: selectedTemplate.maxPayloadBytes,
      reason: reason.trim()
    };
    void onUpdate({ action: "propose", lease });
  };

  const activeCount = state?.leases.filter((lease) => lease.status === "granted").length || 0;
  const reviewCount = state?.leases.filter((lease) => lease.status === "draft").length || 0;

  return (
    <section className="border border-rule bg-surface/55 md:col-span-2" aria-labelledby="capability-ledger-heading" data-testid="agentCapabilityLedger">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rule px-3 py-2">
        <div className="flex items-center gap-2">
          <KeyRound size={13} className="text-sand" strokeWidth={1.8} />
          <h2 id="capability-ledger-heading" className="font-mono text-[9px] uppercase tracking-[0.24em] text-bone">
            Capability Leases
          </h2>
          {state && <StatusBadge>r{state.revision}</StatusBadge>}
        </div>
        <div className="flex flex-wrap gap-1" aria-live="polite">
          <StatusBadge>{activeCount} active</StatusBadge>
          <StatusBadge>{reviewCount} review</StatusBadge>
          <StatusBadge>{state?.receipts.length || 0} receipts</StatusBadge>
        </div>
      </div>

      {!run ? (
        <div className="p-4"><EmptyState>Select an AI-First run to inspect its authority ledger.</EmptyState></div>
      ) : (
        <div className="grid lg:grid-cols-[minmax(300px,0.75fr)_minmax(0,1.25fr)]">
          <form className="grid content-start gap-2 border-b border-rule p-3 lg:border-b-0 lg:border-r" onSubmit={submitLease}>
            <div className="grid grid-cols-2 gap-2">
              <label className="grid gap-1">
                <span className="font-mono text-[8px] uppercase tracking-[0.18em] text-muted">Authority class</span>
                <Select variant="compact" value={selectedTemplate.id} disabled={!canEdit || templates.length === 0} onChange={(event) => setTemplateId(event.target.value as LeaseTemplateId)} data-testid="capabilityTemplateSelect">
                  {templates.map((template) => <option key={template.id} value={template.id}>{template.label}</option>)}
                </Select>
              </label>
              <label className="grid gap-1">
                <span className="font-mono text-[8px] uppercase tracking-[0.18em] text-muted">HTTP method</span>
                <Select variant="compact" value={method} disabled={!canEdit} onChange={(event) => setMethod(event.target.value)} data-testid="capabilityMethodSelect">
                  {["GET", "HEAD", "OPTIONS", "POST", "PUT", "PATCH"].map((item) => <option key={item} value={item}>{item}</option>)}
                </Select>
              </label>
            </div>
            <Input variant="compact" value={origin} disabled={!canEdit} onChange={(event) => setOrigin(event.target.value)} placeholder="Exact origin: https://api.target.test" aria-label="Capability origin" data-testid="capabilityOriginInput" />
            <div className="grid grid-cols-2 gap-2">
              <Input variant="compact" value={pathPrefix} disabled={!canEdit} onChange={(event) => setPathPrefix(event.target.value)} placeholder="Path prefix" aria-label="Capability path prefix" data-testid="capabilityPathInput" />
              <Input variant="compact" value={identity} disabled={!canEdit} onChange={(event) => setIdentity(event.target.value)} placeholder="Saved identity" aria-label="Capability identity" data-testid="capabilityIdentityInput" />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <label className="grid gap-1">
                <span className="font-mono text-[8px] uppercase tracking-[0.16em] text-muted">Minutes</span>
                <Input variant="compact" type="number" min={1} max={Math.max(1, Math.floor(profile.capabilityCeiling.maxDurationMs / 60_000))} value={durationMinutes} disabled={!canEdit} onChange={(event) => setDurationMinutes(Number(event.target.value) || 1)} data-testid="capabilityDurationInput" />
              </label>
              <label className="grid gap-1">
                <span className="font-mono text-[8px] uppercase tracking-[0.16em] text-muted">Actions</span>
                <Input variant="compact" type="number" min={1} max={profile.capabilityCeiling.maxUses} value={maxUses} disabled={!canEdit} onChange={(event) => setMaxUses(Number(event.target.value) || 1)} data-testid="capabilityUsesInput" />
              </label>
              <label className="grid gap-1">
                <span className="font-mono text-[8px] uppercase tracking-[0.16em] text-muted">Requests</span>
                <Input variant="compact" type="number" min={1} max={profile.capabilityCeiling.maxRequests} value={maxRequests} disabled={!canEdit} onChange={(event) => setMaxRequests(Number(event.target.value) || 1)} data-testid="capabilityRequestsInput" />
              </label>
            </div>
            <Input variant="compact" value={reason} disabled={!canEdit} onChange={(event) => setReason(event.target.value)} placeholder="Why this exact authority is needed" aria-label="Capability reason" data-testid="capabilityReasonInput" />
            <Button type="submit" variant="outline" size="compact" disabled={!canEdit || !origin.trim() || !reason.trim() || templates.length === 0} data-testid="capabilityPropose">
              <Plus size={11} /> Propose For Review
            </Button>
            <p className="font-mono text-[9px] leading-4 text-muted">
              {canEdit ? "DRAFT ONLY · Grant is a separate operator action and never resumes the run" : "PAUSE TO CHANGE AUTHORITY"}
            </p>
          </form>

          <div className="grid min-w-0 gap-3 p-3">
            <div className="max-h-[220px] overflow-auto">
              {!state?.leases.length && <EmptyState>No capability leases proposed for this run.</EmptyState>}
              {state?.leases.map((lease) => (
                <article key={lease.id} className="mb-2 border border-rule bg-ink/30 p-3" data-testid={`capabilityLease-${lease.id}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="font-mono text-[8px] uppercase tracking-[0.2em] text-sand">{TIER_LABEL[lease.riskTier]}</span>
                      <h3 className="mt-1 font-display text-[12px] uppercase tracking-[0.05em] text-bone">{lease.name}</h3>
                    </div>
                    <div className="flex gap-1"><StatusBadge>{lease.status}</StatusBadge><StatusBadge>{lease.id.slice(-8)}</StatusBadge></div>
                  </div>
                  <p className="mt-2 text-[11px] leading-5 text-muted">{lease.reason}</p>
                  <div className="mt-2 grid gap-1 font-mono text-[9px] text-copy">
                    {lease.grants.map((grant, index) => (
                      <span key={`${grant.origin}-${grant.method}-${grant.pathPrefix}-${grant.identity}-${index}`} className="select-text break-all">
                        {grant.method} {grant.origin}{grant.pathPrefix} · identity {grant.identity}
                      </span>
                    ))}
                    <span>{lease.tools.join(" · ")}</span>
                    <span>{Math.max(0, lease.maxUses - lease.usedUses)} actions remain · {Math.max(0, lease.maxRequests - lease.usedRequests)} requests remain · expires {expiresLabel(lease.expiresAt)}</span>
                    {lease.revocationReason && <span className="text-rust">{lease.revocationReason}</span>}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {lease.status === "draft" && (
                      <Button type="button" variant="solid" size="compact" disabled={!canEdit} onClick={() => void onUpdate({ action: "grant", leaseId: lease.id })} data-testid={`capabilityGrant-${lease.id}`}>
                        <ShieldCheck size={11} /> Grant Exact Bounds
                      </Button>
                    )}
                    {(lease.status === "draft" || lease.status === "granted") && (
                      <Button type="button" variant="ghost" size="compact" disabled={!canEdit} onClick={() => void onUpdate({ action: "revoke", leaseId: lease.id, reason: lease.status === "draft" ? "Denied by operator." : "Revoked by operator." })} data-testid={`capabilityRevoke-${lease.id}`}>
                        <Ban size={11} /> {lease.status === "draft" ? "Deny" : "Revoke"}
                      </Button>
                    )}
                  </div>
                </article>
              ))}
            </div>

            <div className="border-t border-rule pt-2">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="flex items-center gap-1 font-mono text-[8.5px] uppercase tracking-[0.2em] text-muted"><RadioTower size={11} /> Action Receipts</span>
                <span className="flex items-center gap-1 font-mono text-[8px] text-muted"><TimerReset size={10} /> UTC</span>
              </div>
              <div className="max-h-[150px] overflow-auto" role="table" aria-label="Capability action receipts" data-testid="capabilityReceipts">
                {state?.receipts.slice(-16).reverse().map((receipt) => (
                  <div key={receipt.id} role="row" className="grid grid-cols-[62px_84px_84px_minmax(0,1fr)] gap-2 border-b border-rule py-1.5 font-mono text-[8.5px] text-copy">
                    <span role="cell">{receipt.createdAt.slice(11, 19)}Z</span>
                    <span role="cell">{receipt.tool}</span>
                    <span role="cell">{receipt.decision} / {receipt.status}</span>
                    <span role="cell" className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{receipt.method} {receipt.origin}{receipt.path} · {receipt.reason}</span>
                  </div>
                ))}
                {!state?.receipts.length && <EmptyState>No capability decisions recorded.</EmptyState>}
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
