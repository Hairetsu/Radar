import { useId, useMemo, useState, type FormEvent } from "react";
import {
  Activity,
  AlertTriangle,
  Archive,
  ArrowRight,
  Database,
  Edit3,
  Fingerprint,
  GitCompare,
  Play,
  Plus,
  ShieldCheck,
  X
} from "lucide-react";
import type { IdentityProfile, IdentityProfileDraft } from "../../shared/identityProfiles.js";
import type { CapturedRequest } from "../types";
import { EmptyState, StatusBadge } from "./radar/primitives";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Select } from "./ui/select";
import { Textarea } from "./ui/textarea";

type IdentityLabProps = {
  workspaceId: string;
  identities: IdentityProfile[];
  captures: CapturedRequest[];
  activeIdentityId?: string;
  activeActivationId?: string;
  busy?: boolean;
  onCreate: (draft: IdentityProfileDraft) => void | Promise<void>;
  onUpdate: (profile: IdentityProfile) => void | Promise<void>;
  onActivate: (identityId: string) => void | Promise<void>;
  onVerify: (identityId: string) => void | Promise<void>;
  onArchive: (identityId: string) => void | Promise<void>;
};

type IdentityFormState = {
  label: string;
  kind: IdentityProfile["kind"];
  roleLabel: string;
  tenantLabel: string;
  origin: string;
  notes: string;
};

type MatrixRow = {
  key: string;
  role: string;
  tenant: string;
  resource: string;
  identityLabels: string[];
  captures: CapturedRequest[];
};

type ComparisonField = {
  label: string;
  left: string;
  right: string;
  different: boolean;
};

const EMPTY_FORM: IdentityFormState = {
  label: "",
  kind: "user",
  roleLabel: "",
  tenantLabel: "",
  origin: "",
  notes: ""
};

const HEALTH_TONE: Record<IdentityProfile["health"], "good" | "warn" | "danger" | "move" | "ghost"> = {
  unknown: "ghost",
  checking: "move",
  healthy: "good",
  stale: "warn",
  expired: "danger",
  error: "danger"
};

const ISOLATION_LABEL: Record<IdentityProfile["isolation"], string> = {
  "dedicated-profile": "DEDICATED PROFILE",
  "snapshot-only": "SNAPSHOT ONLY",
  "legacy-shared": "LEGACY SHARED"
};

const COMPARISON_HEADER_NAMES = new Set([
  "accept",
  "accept-language",
  "content-type",
  "if-match",
  "if-none-match",
  "x-http-method-override"
]);

function cleanActionId(value?: string) {
  return String(value || "").trim();
}

function safeTestId(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 96);
}

function requestParts(capture: CapturedRequest) {
  try {
    const parsed = new URL(capture.url);
    return {
      host: parsed.host,
      origin: parsed.origin,
      path: parsed.pathname || "/",
      queryKeys: [...new Set(parsed.searchParams.keys())].sort((left, right) => left.localeCompare(right)),
      queryEntries: [...parsed.searchParams.entries()].sort(([leftKey, leftValue], [rightKey, rightValue]) =>
        leftKey.localeCompare(rightKey) || leftValue.localeCompare(rightValue)
      )
    };
  } catch {
    const rawPath = String(capture.path || "/").split("?", 1)[0] || "/";
    return {
      host: capture.host,
      origin: capture.host,
      path: rawPath,
      queryKeys: [] as string[],
      queryEntries: [] as Array<[string, string]>
    };
  }
}

function normalizedResourcePath(path: string) {
  const segments = path.split("/").map((segment) => {
    const decoded = (() => {
      try {
        return decodeURIComponent(segment);
      } catch {
        return segment;
      }
    })();
    if (/^\d{2,}$/.test(decoded)) return ":id";
    if (/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(decoded)) return ":id";
    if (/^[0-9a-f]{16,}$/i.test(decoded)) return ":id";
    return segment;
  });
  return segments.join("/") || "/";
}

function resourceLabel(capture: CapturedRequest) {
  const target = requestParts(capture);
  return `${capture.method.toUpperCase()} ${target.host}${normalizedResourcePath(target.path)}`;
}

function comparisonSignature(capture: CapturedRequest) {
  const target = requestParts(capture);
  const semanticHeaders = Object.entries(capture.requestHeaders)
    .map(([name, value]) => [name.toLowerCase(), value] as const)
    .filter(([name]) => COMPARISON_HEADER_NAMES.has(name))
    .sort(([left], [right]) => left.localeCompare(right));
  return JSON.stringify([
    capture.method.toUpperCase(),
    target.origin,
    target.path,
    target.queryEntries,
    capture.source,
    semanticHeaders,
    capture.requestBody
  ]);
}

function statusText(status: number | null) {
  return status === null ? "NO STATUS" : `${status} RECORDED`;
}

function statusTone(status: number | null): "good" | "warn" | "danger" | "move" | "ghost" {
  if (status === null) return "ghost";
  if (status === 401 || status === 403) return "warn";
  if (status >= 500) return "danger";
  if (status >= 300 && status < 400) return "move";
  return "ghost";
}

function matrixMeaning(captures: readonly CapturedRequest[]) {
  const statuses = captures.map((capture) => capture.status);
  const hasTwoHundred = statuses.some((status) => status !== null && status >= 200 && status < 300);
  const hasDenial = statuses.some((status) => status === 401 || status === 403);
  if (hasTwoHundred && hasDenial) return "Mixed responses observed; authorization remains unproven.";
  if (hasDenial) return "401/403 denial response observed.";
  if (hasTwoHundred) return "2xx response observed; not authorization proof.";
  return "Response observed; decision remains unclassified.";
}

function responseShape(capture: CapturedRequest) {
  const body = capture.responseBody.trim();
  if (!body) return "empty";
  try {
    const parsed: unknown = JSON.parse(body);
    if (Array.isArray(parsed)) return `JSON array (${parsed.length})`;
    if (parsed && typeof parsed === "object") return `JSON object (${Object.keys(parsed).length} fields)`;
    return `JSON ${typeof parsed}`;
  } catch {
    if (capture.mimeType.includes("html")) return "HTML document";
    if (capture.mimeType.includes("xml")) return "XML document";
    return "text/binary body";
  }
}

function comparisonFields(left: CapturedRequest, right: CapturedRequest): ComparisonField[] {
  const leftLength = left.encodedDataLength ?? left.responseBody.length;
  const rightLength = right.encodedDataLength ?? right.responseBody.length;
  const values: Array<[string, string, string]> = [
    ["HTTP status", left.status === null ? "none" : String(left.status), right.status === null ? "none" : String(right.status)],
    ["Recorded length", String(leftLength), String(rightLength)],
    ["MIME", left.mimeType || "unknown", right.mimeType || "unknown"],
    ["Response shape", responseShape(left), responseShape(right)]
  ];
  return values.map(([label, leftValue, rightValue]) => ({
    label,
    left: leftValue,
    right: rightValue,
    different: leftValue !== rightValue
  }));
}

function captureOptionLabel(capture: CapturedRequest, identities: ReadonlyMap<string, IdentityProfile>) {
  const identity = capture.identityId ? identities.get(capture.identityId) : undefined;
  return `${capture.id} · ${identity?.label || capture.identityId || "unknown"} · ${resourceLabel(capture)} · ${statusText(capture.status)}`;
}

function shortRef(value?: string) {
  const next = String(value || "");
  return next.length > 14 ? `${next.slice(0, 6)}…${next.slice(-6)}` : next;
}

function validOrigin(value: string) {
  try {
    const parsed = new URL(value.trim());
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.origin : "";
  } catch {
    return "";
  }
}

function captureAttribution(capture: CapturedRequest, identities: ReadonlyMap<string, IdentityProfile>) {
  const profile = capture.identityId ? identities.get(capture.identityId) : undefined;
  if (profile && capture.activationId) return `${profile.label} · activation ${shortRef(capture.activationId)}`;
  if (profile) return `${profile.label} · activation missing`;
  if (capture.identityId) return `${capture.identityId} · identity unknown`;
  return "identity unattributed";
}

export function IdentityLab({
  workspaceId,
  identities,
  captures,
  activeIdentityId,
  activeActivationId,
  busy = false,
  onCreate,
  onUpdate,
  onActivate,
  onVerify,
  onArchive
}: IdentityLabProps) {
  const formId = useId();
  const [editingId, setEditingId] = useState("");
  const [form, setForm] = useState<IdentityFormState>(EMPTY_FORM);
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [leftCaptureId, setLeftCaptureId] = useState("");
  const [rightCaptureId, setRightCaptureId] = useState("");

  const workspaceIdentities = useMemo(
    () => identities.filter((identity) => identity.workspaceId === workspaceId),
    [identities, workspaceId]
  );
  const identityById = useMemo(
    () => new Map(workspaceIdentities.map((identity) => [identity.id, identity])),
    [workspaceIdentities]
  );
  const editingProfile = editingId ? identityById.get(editingId) : undefined;
  const locked = busy || submitting;

  const attributedCaptures = useMemo(
    () => captures.filter((capture) => Boolean(capture.activationId && capture.identityId && identityById.has(capture.identityId))),
    [captures, identityById]
  );
  const unattributedCount = captures.length - attributedCaptures.length;

  const matrixRows = useMemo(() => {
    const rows = new Map<string, MatrixRow>();
    for (const capture of attributedCaptures) {
      const identity = identityById.get(capture.identityId || "");
      if (!identity) continue;
      const resource = resourceLabel(capture);
      const key = `${identity.roleLabel}\n${identity.tenantLabel}\n${resource}`;
      const row = rows.get(key) || {
        key,
        role: identity.roleLabel,
        tenant: identity.tenantLabel,
        resource,
        identityLabels: [],
        captures: []
      };
      row.identityLabels.push(identity.label);
      row.captures.push(capture);
      rows.set(key, row);
    }
    return [...rows.values()]
      .map((row) => ({ ...row, identityLabels: [...new Set(row.identityLabels)].sort((a, b) => a.localeCompare(b)) }))
      .sort((left, right) => left.key.localeCompare(right.key));
  }, [attributedCaptures, identityById]);

  const actionGroups = useMemo(() => {
    const groups = new Map<string, CapturedRequest[]>();
    for (const capture of captures) {
      const actionId = cleanActionId(capture.actionId);
      if (!actionId) continue;
      groups.set(actionId, [...(groups.get(actionId) || []), capture]);
    }
    return [...groups.entries()]
      .map(([actionId, requests]) => ({
        actionId,
        requests: [...requests].sort((left, right) => left.startedAt.localeCompare(right.startedAt) || left.id.localeCompare(right.id))
      }))
      .sort((left, right) => {
        const leftTime = left.requests[0]?.startedAt || "";
        const rightTime = right.requests[0]?.startedAt || "";
        return leftTime.localeCompare(rightTime) || left.actionId.localeCompare(right.actionId);
      });
  }, [captures]);
  const unmatchedCaptures = useMemo(
    () => captures.filter((capture) => !cleanActionId(capture.actionId)).sort((left, right) => left.startedAt.localeCompare(right.startedAt)),
    [captures]
  );

  const leftCapture = attributedCaptures.find((capture) => capture.id === leftCaptureId);
  const matchingRightCaptures = leftCapture
    ? attributedCaptures.filter(
        (capture) =>
          capture.id !== leftCapture.id &&
          capture.identityId !== leftCapture.identityId &&
          comparisonSignature(capture) === comparisonSignature(leftCapture)
      )
    : [];
  const rightCapture = matchingRightCaptures.find((capture) => capture.id === rightCaptureId);
  const comparedFields = leftCapture && rightCapture ? comparisonFields(leftCapture, rightCapture) : [];
  const comparisonDiffers = comparedFields.some((field) => field.different);

  const beginEdit = (profile: IdentityProfile) => {
    setEditingId(profile.id);
    setForm({
      label: profile.label,
      kind: profile.kind,
      roleLabel: profile.roleLabel,
      tenantLabel: profile.tenantLabel,
      origin: profile.origin,
      notes: profile.notes
    });
    setFormError("");
  };

  const resetForm = () => {
    setEditingId("");
    setForm(EMPTY_FORM);
    setFormError("");
  };

  const submitIdentity = async (event: FormEvent) => {
    event.preventDefault();
    if (locked) return;
    const origin = validOrigin(form.origin);
    if (!form.label.trim() || !form.roleLabel.trim() || !form.tenantLabel.trim() || !origin) {
      setFormError("Label, role, tenant, and an HTTP(S) origin are required.");
      return;
    }
    const draft: IdentityProfileDraft = {
      label: form.label.trim(),
      kind: form.kind,
      roleLabel: form.roleLabel.trim(),
      tenantLabel: form.tenantLabel.trim(),
      origin,
      notes: form.notes.trim(),
      refreshMode: editingProfile?.refreshMode || "manual",
      ...(editingProfile?.refreshWorkflowId ? { refreshWorkflowId: editingProfile.refreshWorkflowId } : {}),
      ...(editingProfile?.maxHealthAgeMs ? { maxHealthAgeMs: editingProfile.maxHealthAgeMs } : {})
    };
    setSubmitting(true);
    setFormError("");
    try {
      if (editingProfile) {
        await onUpdate({ ...editingProfile, ...draft, updatedAt: new Date().toISOString() });
      } else {
        await onCreate(draft);
      }
      resetForm();
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : `Identity ${editingProfile ? "update" : "creation"} failed. Review the profile and try again.`
      );
    } finally {
      setSubmitting(false);
    }
  };

  const hasSnapshotIdentity = workspaceIdentities.some((identity) => identity.isolation === "snapshot-only");

  return (
    <section
      className="relative w-full min-w-0 overflow-hidden border border-rule bg-surface/55 shadow-[0_22px_80px_-46px_rgba(0,0,0,0.9)]"
      aria-labelledby="identity-lab-heading"
      data-testid="identityLab"
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-signal/70 to-transparent" />
      <header className="relative flex flex-wrap items-start justify-between gap-4 border-b border-rule bg-ink/45 px-4 py-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center border border-signal/40 bg-signal/10 text-signal shadow-[0_0_24px_-8px_currentColor]">
            <Fingerprint size={18} strokeWidth={1.55} />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 id="identity-lab-heading" className="font-display text-lead uppercase tracking-key text-bone">
                Identity Lab
              </h2>
              <StatusBadge tone="move">ADVANCED</StatusBadge>
              <StatusBadge tone="good">RECORDED EVIDENCE ONLY</StatusBadge>
            </div>
            <p className="mt-1 max-w-3xl text-meta leading-5 text-muted">
              Compare isolated identities against evidence Radar already captured. This surface sends no requests and makes no authorization claim.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-px border border-rule bg-rule" aria-label="Identity Lab evidence summary">
          {[
            ["IDENTITIES", workspaceIdentities.length],
            ["ATTRIBUTED", attributedCaptures.length],
            ["UNATTRIBUTED", unattributedCount]
          ].map(([label, value]) => (
            <div key={label} className="min-w-[82px] bg-ink/90 px-2 py-1.5 text-right">
              <span className="block font-mono text-nano tracking-label text-dim">{label}</span>
              <strong className="font-display text-lead font-normal text-bone">{value}</strong>
            </div>
          ))}
        </div>
      </header>

      <div className="grid min-w-0 xl:grid-cols-[minmax(290px,0.7fr)_minmax(0,1.8fr)]">
        <aside className="min-w-0 border-b border-rule xl:border-b-0 xl:border-r" aria-label="Identity roster and editor">
          <div className="flex items-center justify-between border-b border-rule px-3 py-2">
            <span className="flex items-center gap-2 rd-label text-muted">
              <ShieldCheck size={12} className="text-sand" /> Identity roster
            </span>
            <StatusBadge>{workspaceId || "NO WORKSPACE"}</StatusBadge>
          </div>

          {hasSnapshotIdentity && (
            <div className="m-3 flex gap-2 border border-sand/35 bg-sand/10 p-2.5 text-label leading-4 text-sand" role="note" data-testid="snapshotIsolationWarning">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <span><strong className="font-mono uppercase tracking-key">Snapshot-only isolation.</strong> Cookie snapshots can drift from live browser state; treat attributed results as historical observations.</span>
            </div>
          )}

          <ul className="max-h-[360px] overflow-auto p-3" aria-label="Saved identities">
            {workspaceIdentities.map((identity) => {
              const active = identity.id === activeIdentityId;
              const snapshot = identity.isolation === "snapshot-only" || identity.isolation === "legacy-shared";
              return (
                <li
                  key={identity.id}
                  className="group mb-2 border border-rule bg-ink/35 p-3 transition hover:border-steel/45 hover:bg-ink/55"
                  data-testid={`identityRoster-${safeTestId(identity.id)}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <h3 className="truncate font-display text-body uppercase tracking-data text-bone">{identity.label}</h3>
                        {active && <StatusBadge tone={activeActivationId ? "good" : "warn"}>ACTIVE</StatusBadge>}
                        {identity.archivedAt && <StatusBadge tone="ghost">ARCHIVED</StatusBadge>}
                      </div>
                      <p className="mt-1 font-mono text-micro uppercase tracking-key text-copy">
                        {identity.roleLabel} · {identity.tenantLabel} · {identity.kind}
                      </p>
                    </div>
                    <StatusBadge tone={HEALTH_TONE[identity.health]}>HEALTH: {identity.health.toUpperCase()}</StatusBadge>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <StatusBadge tone={snapshot ? "warn" : "move"}>{ISOLATION_LABEL[identity.isolation]}</StatusBadge>
                    {active && activeActivationId && <StatusBadge title={activeActivationId}>ACT {shortRef(activeActivationId)}</StatusBadge>}
                    {active && !activeActivationId && <StatusBadge tone="warn">ACTIVATION NOT REPORTED</StatusBadge>}
                  </div>
                  <p className="mt-2 select-text truncate font-mono text-micro text-dim" title={identity.origin}>{identity.origin}</p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <Button type="button" variant="ghost" size="compact" disabled={locked || Boolean(identity.archivedAt)} onClick={() => beginEdit(identity)} aria-label={`Edit ${identity.label}`}>
                      <Edit3 size={11} /> Edit
                    </Button>
                    <Button type="button" variant="outline" size="compact" disabled={locked || Boolean(identity.archivedAt) || active} onClick={() => void onActivate(identity.id)} aria-label={`Activate ${identity.label}`} data-testid={`identityActivate-${safeTestId(identity.id)}`}>
                      <Play size={11} /> Activate
                    </Button>
                    <Button type="button" variant="outline" size="compact" disabled={locked || Boolean(identity.archivedAt)} onClick={() => void onVerify(identity.id)} aria-label={`Verify ${identity.label}`} data-testid={`identityVerify-${safeTestId(identity.id)}`}>
                      <Activity size={11} /> Verify
                    </Button>
                    <Button type="button" variant="ghost" size="compact" disabled={locked || Boolean(identity.archivedAt) || active} onClick={() => void onArchive(identity.id)} aria-label={`Archive ${identity.label}`} data-testid={`identityArchive-${safeTestId(identity.id)}`}>
                      <Archive size={11} /> Archive
                    </Button>
                  </div>
                </li>
              );
            })}
            {!workspaceIdentities.length && <li><EmptyState className="min-h-[150px]">No identities saved for this workspace.</EmptyState></li>}
          </ul>

          <form className="border-t border-rule bg-ink/20 p-3" onSubmit={(event) => void submitIdentity(event)} data-testid="identityForm">
            <div className="mb-3 flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 rd-label text-muted">
                {editingProfile ? <Edit3 size={12} className="text-signal" /> : <Plus size={12} className="text-signal" />}
                {editingProfile ? "Edit identity" : "New isolated identity"}
              </span>
              {editingProfile && (
                <Button type="button" variant="ghost" size="compact" onClick={resetForm} disabled={locked} aria-label="Cancel identity edit">
                  <X size={11} /> Cancel
                </Button>
              )}
            </div>
            <div className="grid gap-2">
              <label htmlFor={`${formId}-label`} className="grid gap-1">
                <span className="rd-label-sm text-muted">Identity label</span>
                <Input id={`${formId}-label`} variant="compact" value={form.label} onChange={(event) => setForm((current) => ({ ...current, label: event.target.value }))} disabled={locked} maxLength={160} required />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label htmlFor={`${formId}-kind`} className="grid gap-1">
                  <span className="rd-label-sm text-muted">Kind</span>
                  <Select id={`${formId}-kind`} variant="compact" value={form.kind} onChange={(event) => setForm((current) => ({ ...current, kind: event.target.value as IdentityProfile["kind"] }))} disabled={locked}>
                    {(["anonymous", "user", "admin", "service"] as const).map((kind) => <option key={kind} value={kind}>{kind}</option>)}
                  </Select>
                </label>
                <label htmlFor={`${formId}-role`} className="grid gap-1">
                  <span className="rd-label-sm text-muted">Role</span>
                  <Input id={`${formId}-role`} variant="compact" value={form.roleLabel} onChange={(event) => setForm((current) => ({ ...current, roleLabel: event.target.value }))} disabled={locked} maxLength={100} required />
                </label>
              </div>
              <label htmlFor={`${formId}-tenant`} className="grid gap-1">
                <span className="rd-label-sm text-muted">Tenant</span>
                <Input id={`${formId}-tenant`} variant="compact" value={form.tenantLabel} onChange={(event) => setForm((current) => ({ ...current, tenantLabel: event.target.value }))} disabled={locked} maxLength={120} required />
              </label>
              <label htmlFor={`${formId}-origin`} className="grid gap-1">
                <span className="rd-label-sm text-muted">Target origin</span>
                <Input id={`${formId}-origin`} variant="compact" type="url" placeholder="https://app.target.test" value={form.origin} onChange={(event) => setForm((current) => ({ ...current, origin: event.target.value }))} disabled={locked} required />
              </label>
              <label htmlFor={`${formId}-notes`} className="grid gap-1">
                <span className="rd-label-sm text-muted">Operator notes</span>
                  <Textarea id={`${formId}-notes`} variant="bare" className="h-[68px]" value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} disabled={locked} maxLength={2000} data-testid="identityNotes" />
              </label>
              <div className="flex items-center justify-between gap-2 border border-rule bg-surface/40 px-2 py-1.5 font-mono text-nano uppercase tracking-key text-muted">
                <span>Isolation</span>
                <span className={editingProfile?.isolation === "snapshot-only" ? "text-sand" : "text-steel"}>
                  {editingProfile ? `${ISOLATION_LABEL[editingProfile.isolation]} · immutable` : "DEDICATED PROFILE · default"}
                </span>
              </div>
              {formError && <p className="border border-rust/35 bg-rust/10 p-2 text-label text-rust" role="alert">{formError}</p>}
              <Button type="submit" variant="solid" size="compact" disabled={locked} data-testid="identitySubmit">
                {editingProfile ? <Edit3 size={11} /> : <Plus size={11} />} {editingProfile ? "Save identity" : "Create identity"}
              </Button>
            </div>
          </form>
        </aside>

        <div className="min-w-0">
          <section className="min-w-0 border-b border-rule" aria-labelledby="identity-matrix-heading">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rule px-3 py-2">
              <h3 id="identity-matrix-heading" className="flex items-center gap-2 rd-label text-muted">
                <Database size={12} className="text-steel" /> Role × tenant × resource
              </h3>
              <div className="flex gap-1.5"><StatusBadge tone="good">{attributedCaptures.length} ATTRIBUTED</StatusBadge><StatusBadge tone={unattributedCount ? "warn" : "ghost"}>{unattributedCount} EXCLUDED</StatusBadge></div>
            </div>
            <div className="grid gap-px border-b border-rule bg-rule sm:grid-cols-3" aria-label="Evidence interpretation rules">
              <div className="bg-ink/70 px-3 py-2 font-mono text-micro leading-4 text-copy"><strong className="text-signal">2XX</strong> RESPONSE OBSERVED ≠ AUTHORIZATION PROOF</div>
              <div className="bg-ink/70 px-3 py-2 font-mono text-micro leading-4 text-copy"><strong className="text-sand">401 / 403</strong> DENIAL RESPONSE OBSERVED</div>
              <div className="bg-ink/70 px-3 py-2 font-mono text-micro leading-4 text-copy"><strong className="text-muted">NO ACTIVATION</strong> EXCLUDED FROM MATRIX</div>
            </div>
            <div className="max-h-[360px] overflow-auto" data-testid="identityMatrix">
              <table className="w-full min-w-[760px] border-collapse text-left">
                <caption className="sr-only">Recorded identity evidence grouped by role, tenant, and normalized resource</caption>
                <thead className="sticky top-0 z-10 bg-graphite">
                  <tr className="border-b border-rule rd-label-sm text-dim">
                    <th scope="col" className="px-3 py-2 font-normal">Role</th>
                    <th scope="col" className="px-3 py-2 font-normal">Tenant</th>
                    <th scope="col" className="px-3 py-2 font-normal">Normalized resource</th>
                    <th scope="col" className="px-3 py-2 font-normal">Identity</th>
                    <th scope="col" className="px-3 py-2 font-normal">Recorded evidence</th>
                    <th scope="col" className="px-3 py-2 font-normal">Interpretation</th>
                  </tr>
                </thead>
                <tbody>
                  {matrixRows.map((row) => {
                    const statuses = [...new Set(row.captures.map((capture) => capture.status))];
                    return (
                      <tr key={row.key} className="border-b border-rule/80 align-top text-label text-copy" data-testid={`identityMatrixRow-${safeTestId(row.key)}`}>
                        <th scope="row" className="px-3 py-2 font-mono font-medium text-bone">{row.role}</th>
                        <td className="px-3 py-2 font-mono">{row.tenant}</td>
                        <td className="max-w-[300px] px-3 py-2 font-mono text-steel"><span className="select-text break-all">{row.resource}</span></td>
                        <td className="px-3 py-2">
                          <span>{row.identityLabels.join(", ")}</span>
                          <span className="mt-1 block font-mono text-nano text-dim">
                            {[
                              ...new Set(row.captures.map((capture) => capture.activationId).filter((value): value is string => Boolean(value)))
                            ].map((value) => `ACT ${shortRef(value)}`).join(" · ")}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap items-center gap-1">
                            <StatusBadge tone="move">{row.captures.length} {row.captures.length === 1 ? "CAPTURE" : "CAPTURES"}</StatusBadge>
                            {statuses.map((status) => <StatusBadge key={String(status)} tone={statusTone(status)}>{statusText(status)}</StatusBadge>)}
                          </div>
                        </td>
                        <td className="max-w-[250px] px-3 py-2 leading-4 text-muted">{matrixMeaning(row.captures)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {!matrixRows.length && <EmptyState className="min-h-[180px]">No capture has both a known identity ID and activation ID.</EmptyState>}
            </div>
          </section>

          <div className="grid min-w-0 lg:grid-cols-[minmax(320px,0.9fr)_minmax(380px,1.1fr)]">
            <section className="min-w-0 border-b border-rule lg:border-b-0 lg:border-r" aria-labelledby="identity-comparison-heading">
              <div className="flex items-center justify-between gap-2 border-b border-rule px-3 py-2">
                <h3 id="identity-comparison-heading" className="flex items-center gap-2 rd-label text-muted">
                  <GitCompare size={12} className="text-signal" /> One-dimension comparison
                </h3>
                <StatusBadge tone="good">RECORDED ONLY</StatusBadge>
              </div>
              <div className="grid gap-3 p-3">
                <p className="border-l-2 border-jade/60 bg-jade/5 px-2 py-1.5 font-mono text-micro uppercase leading-4 tracking-key text-jade">
                  Recorded evidence only · no traffic is sent · identity must be the sole changing dimension.
                </p>
                <label className="grid gap-1">
                  <span className="rd-label-sm text-muted">First recording</span>
                  <Select variant="compact" value={leftCaptureId} onChange={(event) => { setLeftCaptureId(event.target.value); setRightCaptureId(""); }} disabled={!attributedCaptures.length} aria-label="First recorded request">
                    <option value="">Select attributed capture</option>
                    {attributedCaptures.map((capture) => <option key={capture.id} value={capture.id}>{captureOptionLabel(capture, identityById)}</option>)}
                  </Select>
                </label>
                <label className="grid gap-1">
                  <span className="rd-label-sm text-muted">Matching second recording</span>
                  <Select variant="compact" value={rightCaptureId} onChange={(event) => setRightCaptureId(event.target.value)} disabled={!leftCapture || !matchingRightCaptures.length} aria-label="Matching recorded request">
                    <option value="">Select different identity</option>
                    {matchingRightCaptures.map((capture) => <option key={capture.id} value={capture.id}>{captureOptionLabel(capture, identityById)}</option>)}
                  </Select>
                </label>

                <div className="min-h-[118px] border border-rule bg-ink/30 p-2.5" aria-live="polite" data-testid="identityComparisonState">
                  {!leftCapture && <p className="text-label leading-5 text-muted">Choose an attributed recording. Radar will offer only recorded requests with the same method, exact target, query-key set, source, and payload under a different identity.</p>}
                  {leftCapture && !matchingRightCaptures.length && (
                    <p className="flex gap-2 text-label leading-5 text-sand"><AlertTriangle size={13} className="mt-1 shrink-0" /> Comparison blocked: no already-recorded request changes only the identity dimension.</p>
                  )}
                  {leftCapture && matchingRightCaptures.length > 0 && !rightCapture && <p className="text-label leading-5 text-muted">{matchingRightCaptures.length} matching recording{matchingRightCaptures.length === 1 ? "" : "s"} available. Select the second identity.</p>}
                  {leftCapture && rightCapture && (
                    <div>
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                        <StatusBadge tone={comparisonDiffers ? "warn" : "good"}>{comparisonDiffers ? "RECORDED FIELDS DIFFER" : "RECORDED FIELDS EQUIVALENT"}</StatusBadge>
                        <span className="font-mono text-nano text-dim">NOT AN AUTHORIZATION CONCLUSION</span>
                      </div>
                      <table className="w-full text-left font-mono text-micro">
                        <caption className="sr-only">Recorded response comparison</caption>
                        <thead><tr className="text-dim"><th className="py-1 font-normal">Field</th><th className="py-1 font-normal">First</th><th className="py-1 font-normal">Second</th></tr></thead>
                        <tbody>
                          {comparedFields.map((field) => (
                            <tr key={field.label} className="border-t border-rule">
                              <th scope="row" className="py-1 font-normal text-muted">{field.label}</th>
                              <td className="py-1 text-copy">{field.left}</td>
                              <td className={field.different ? "py-1 text-sand" : "py-1 text-copy"}>{field.right}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            </section>

            <section className="min-w-0" aria-labelledby="causal-evidence-heading">
              <div className="flex items-center justify-between gap-2 border-b border-rule px-3 py-2">
                <h3 id="causal-evidence-heading" className="flex items-center gap-2 rd-label text-muted">
                  <Activity size={12} className="text-sand" /> Action context → request ledger
                </h3>
                <StatusBadge>{actionGroups.length} ACTION KEYS</StatusBadge>
              </div>
              <div className="max-h-[430px] overflow-auto p-3" data-testid="causalEvidenceLedger">
                {actionGroups.map((group) => (
                  <article key={group.actionId} className="mb-2 border border-rule bg-ink/30" data-testid={`causalAction-${safeTestId(group.actionId)}`}>
                    <header className="flex flex-wrap items-center justify-between gap-2 border-b border-rule px-2.5 py-2">
                      <span className="flex min-w-0 items-center gap-2 font-mono text-micro text-bone"><Fingerprint size={11} className="shrink-0 text-signal" /><span className="select-text break-all">ACTION {group.actionId}</span></span>
                      <StatusBadge tone="move">{group.requests.length} REQUEST{group.requests.length === 1 ? "" : "S"}</StatusBadge>
                    </header>
                    <ol aria-label={`Requests observed under action context ${group.actionId}`}>
                      {group.requests.map((capture) => (
                        <li key={capture.id} className="grid grid-cols-[16px_minmax(0,1fr)] gap-1.5 border-b border-rule/70 px-2.5 py-2 last:border-b-0" data-testid={`causalCapture-${safeTestId(capture.id)}`}>
                          <ArrowRight size={11} className="mt-0.5 text-sand" />
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="select-text break-all font-mono text-micro text-copy">{capture.method.toUpperCase()} {requestParts(capture).path}</span>
                              <StatusBadge tone={statusTone(capture.status)}>{statusText(capture.status)}</StatusBadge>
                            </div>
                            <p className="mt-1 font-mono text-nano text-dim">{capture.id} · {captureAttribution(capture, identityById)}</p>
                          </div>
                        </li>
                      ))}
                    </ol>
                  </article>
                ))}

                <section className="border border-dashed border-sand/45 bg-sand/5" aria-labelledby="unmatched-evidence-heading" data-testid="causalUnmatched">
                  <header className="flex items-center justify-between gap-2 border-b border-sand/20 px-2.5 py-2">
                    <h4 id="unmatched-evidence-heading" className="flex items-center gap-2 rd-label text-sand"><AlertTriangle size={11} /> Unmatched / background</h4>
                    <StatusBadge tone={unmatchedCaptures.length ? "warn" : "ghost"}>{unmatchedCaptures.length} RETAINED</StatusBadge>
                  </header>
                  {unmatchedCaptures.length ? (
                    <ul>
                      {unmatchedCaptures.map((capture) => (
                        <li key={capture.id} className="border-b border-sand/15 px-2.5 py-2 last:border-b-0" data-testid={`causalUnmatchedCapture-${safeTestId(capture.id)}`}>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="select-text break-all font-mono text-micro text-copy">{capture.method.toUpperCase()} {requestParts(capture).path}</span>
                            <StatusBadge tone={statusTone(capture.status)}>{statusText(capture.status)}</StatusBadge>
                          </div>
                          <p className="mt-1 font-mono text-nano leading-4 text-dim">{capture.id} · no explicit actionId · {captureAttribution(capture, identityById)}</p>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="px-2.5 py-3 text-label text-muted">Every retained request has an explicit actionId.</p>
                  )}
                </section>
                {!actionGroups.length && !unmatchedCaptures.length && <EmptyState className="min-h-[150px]"><Database size={20} />No recorded requests to correlate.</EmptyState>}
              </div>
            </section>
          </div>
        </div>
      </div>
    </section>
  );
}
