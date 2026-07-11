import type { IdentityLabIdentityKind, IdentityLabIdentitySummary } from "./identityLab.js";

export const MAX_IDENTITY_PROFILES = 80;

export type IdentityIsolationMode = "dedicated-profile" | "legacy-shared" | "snapshot-only";
export type IdentityHealthState = "unknown" | "checking" | "healthy" | "stale" | "expired" | "error";
export type IdentityRefreshMode = "manual" | "workflow";

export type IdentityProfile = {
  id: string;
  workspaceId: string;
  label: string;
  kind: IdentityLabIdentityKind;
  roleLabel: string;
  tenantLabel: string;
  origin: string;
  notes: string;
  isolation: IdentityIsolationMode;
  health: IdentityHealthState;
  refreshMode: IdentityRefreshMode;
  refreshWorkflowId?: string;
  maxHealthAgeMs?: number;
  jarRevision: number;
  authFingerprint?: string;
  containerId: string;
  createdAt: string;
  updatedAt: string;
  lastActivatedAt?: string;
  lastCheckedAt?: string;
  lastEvidenceRef?: string;
  archivedAt?: string;
};

export type IdentityProfileDraft = Pick<
  IdentityProfile,
  "label" | "kind" | "roleLabel" | "tenantLabel" | "origin" | "notes"
> & {
  id?: string;
  refreshMode?: IdentityRefreshMode;
  refreshWorkflowId?: string;
  maxHealthAgeMs?: number;
};

export type IdentityActivationStatus = "starting" | "active" | "ended" | "failed";

export type IdentityActivationRecord = {
  id: string;
  sessionId: string;
  workspaceId: string;
  identityId: string;
  startedAt: string;
  endedAt?: string;
  status: IdentityActivationStatus;
  browserInstanceId: string;
  authFingerprint?: string;
  error?: string;
};

const KINDS: IdentityLabIdentityKind[] = ["anonymous", "user", "admin", "service"];
const ISOLATION: IdentityIsolationMode[] = ["dedicated-profile", "legacy-shared", "snapshot-only"];
const HEALTH: IdentityHealthState[] = ["unknown", "checking", "healthy", "stale", "expired", "error"];
const REFRESH: IdentityRefreshMode[] = ["manual", "workflow"];
const ACTIVATION_STATUS: IdentityActivationStatus[] = ["starting", "active", "ended", "failed"];

function text(value: unknown, max: number) {
  return Array.from(String(value || ""))
    .filter((character) => {
      const code = character.charCodeAt(0);
      return code === 9 || code === 10 || code === 13 || (code >= 32 && code !== 127);
    })
    .join("")
    .trim()
    .slice(0, max);
}

function id(value: unknown) {
  const next = text(value, 128);
  return /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,127}$/.test(next) ? next : "";
}

function enumValue<T extends string>(value: unknown, values: readonly T[], fallback: T): T {
  return values.includes(value as T) ? (value as T) : fallback;
}

function iso(value: unknown) {
  const next = text(value, 40);
  return Number.isFinite(Date.parse(next)) ? new Date(next).toISOString() : "";
}

function origin(value: unknown) {
  try {
    const parsed = new URL(text(value, 800));
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.origin : "";
  } catch {
    return "";
  }
}

export function normalizeIdentityProfile(value: unknown): IdentityProfile | null {
  const input = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const identityId = id(input.id);
  const workspaceId = id(input.workspaceId);
  const label = text(input.label, 160);
  const targetOrigin = origin(input.origin);
  const createdAt = iso(input.createdAt);
  const updatedAt = iso(input.updatedAt);
  if (!identityId || !workspaceId || !label || !targetOrigin || !createdAt || !updatedAt) return null;
  const refreshMode = enumValue(input.refreshMode, REFRESH, "manual");
  const maxHealthAgeMs = Math.round(Number(input.maxHealthAgeMs));
  const fingerprint = text(input.authFingerprint, 160);
  const profile: IdentityProfile = {
    id: identityId,
    workspaceId,
    label,
    kind: enumValue(input.kind, KINDS, "user"),
    roleLabel: text(input.roleLabel, 100) || "unclassified",
    tenantLabel: text(input.tenantLabel, 120) || "unknown",
    origin: targetOrigin,
    notes: text(input.notes, 2_000),
    isolation: enumValue(input.isolation, ISOLATION, "dedicated-profile"),
    health: enumValue(input.health, HEALTH, "unknown"),
    refreshMode,
    jarRevision: Math.max(0, Math.min(Math.round(Number(input.jarRevision) || 0), 1_000_000)),
    containerId: id(input.containerId) || `container-${identityId}`,
    createdAt,
    updatedAt
  };
  const optionalText: Array<[keyof IdentityProfile, unknown, number]> = [
    ["authFingerprint", fingerprint, 160],
    ["lastEvidenceRef", input.lastEvidenceRef, 180]
  ];
  for (const [key, raw, max] of optionalText) {
    const next = text(raw, max);
    if (next) Object.assign(profile, { [key]: next });
  }
  for (const key of ["lastActivatedAt", "lastCheckedAt", "archivedAt"] as const) {
    const next = iso(input[key]);
    if (next) profile[key] = next;
  }
  const refreshWorkflowId = id(input.refreshWorkflowId);
  if (refreshWorkflowId) profile.refreshWorkflowId = refreshWorkflowId;
  if (refreshMode === "workflow" && !profile.refreshWorkflowId) profile.refreshMode = "manual";
  if (Number.isFinite(maxHealthAgeMs)) profile.maxHealthAgeMs = Math.max(60_000, Math.min(maxHealthAgeMs, 30 * 24 * 60 * 60 * 1_000));
  return profile;
}

export function normalizeIdentityProfiles(value: unknown) {
  if (!Array.isArray(value)) return [];
  const ids = new Set<string>();
  return value
    .map(normalizeIdentityProfile)
    .filter((item): item is IdentityProfile => Boolean(item))
    .filter((item) => !ids.has(item.id) && Boolean(ids.add(item.id)))
    .slice(0, MAX_IDENTITY_PROFILES);
}

export function normalizeIdentityActivation(value: unknown): IdentityActivationRecord | null {
  const input = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const record: IdentityActivationRecord = {
    id: id(input.id),
    sessionId: id(input.sessionId),
    workspaceId: id(input.workspaceId),
    identityId: id(input.identityId),
    startedAt: iso(input.startedAt),
    status: enumValue(input.status, ACTIVATION_STATUS, "failed"),
    browserInstanceId: id(input.browserInstanceId),
    ...(text(input.authFingerprint, 160) ? { authFingerprint: text(input.authFingerprint, 160) } : {}),
    ...(text(input.error, 500) ? { error: text(input.error, 500) } : {})
  };
  const endedAt = iso(input.endedAt);
  if (endedAt) record.endedAt = endedAt;
  return record.id && record.sessionId && record.workspaceId && record.identityId && record.startedAt && record.browserInstanceId
    ? record
    : null;
}

export function identityProfileForLab(profile: IdentityProfile): IdentityLabIdentitySummary {
  return {
    id: profile.id,
    projectId: profile.workspaceId,
    key: profile.id,
    label: profile.label,
    kind: profile.kind,
    role: profile.roleLabel,
    tenant: profile.tenantLabel,
    origin: profile.origin,
    health:
      profile.health === "healthy"
        ? "ready"
        : profile.health === "expired" || profile.health === "error"
          ? "invalid"
          : profile.health === "stale"
            ? "stale"
            : "unknown",
    cookieNames: [],
    cookieCount: 0,
    localStorageKeys: [],
    localStorageKeyCount: 0,
    sessionStorageKeys: [],
    sessionStorageKeyCount: 0,
    updatedAt: profile.updatedAt
  };
}
