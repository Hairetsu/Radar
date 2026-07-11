import type { CapturedRequest } from "./domain.js";

export const MAX_CAUSAL_ID_LENGTH = 120;
export const MAX_CAUSAL_URL_LENGTH = 2_048;
export const MAX_CAUSAL_TEXT_LENGTH = 4_000;
export const MAX_CAUSAL_INPUTS = 80;
export const MAX_CAUSAL_WINDOW_MS = 30_000;
export const MAX_CAUSAL_ACTION_DURATION_MS = 60_000;
export const DEFAULT_CAUSAL_BEFORE_MS = 250;
export const DEFAULT_CAUSAL_AFTER_MS = 5_000;

export type CausalActionKind = "open" | "navigate" | "click" | "fill" | "submit" | "identity-switch" | "replay" | "workflow" | "manual";

export type CausalValueInput = {
  name: string;
  type?: string;
  selector?: string;
  value: string;
};

export type CausalValueFingerprint = {
  name: string;
  type: string;
  selector: string;
  hasValue: boolean;
  valueLength: number;
  valueHash?: string;
};

export type CausalActionTarget = {
  selector: string;
  role: string;
  name: string;
};

export type CausalActionInput = {
  id: string;
  runId: string;
  identityId: string;
  activationId: string;
  navigationId?: string;
  sequenceRunId: string;
  experimentId: string;
  kind: CausalActionKind;
  startedAt: string;
  finishedAt?: string;
  url: string;
  target?: Partial<CausalActionTarget>;
  inputs?: CausalValueInput[];
};

export type CausalAction = Omit<CausalActionInput, "target" | "inputs"> & {
  target: CausalActionTarget;
  inputs: CausalValueFingerprint[];
};

export type CausalDomSnapshotInput = {
  id: string;
  actionId: string;
  runId: string;
  identityId: string;
  activationId: string;
  navigationId?: string;
  sequenceRunId: string;
  experimentId: string;
  phase: "before" | "after";
  capturedAt: string;
  url: string;
  title?: string;
  summary: string;
  inputs?: CausalValueInput[];
};

export type CausalDomSnapshot = Omit<CausalDomSnapshotInput, "title" | "summary" | "inputs"> & {
  title: string;
  summary: string;
  inputs: CausalValueFingerprint[];
};

export type CausalCaptureContext = {
  actionId?: string;
  identityId?: string;
  activationId?: string;
  sequenceRunId?: string;
  experimentId?: string;
};

export type CausalCapturedRequest = CapturedRequest & CausalCaptureContext;

export type CausalClassification = "exact" | "correlated" | "inferred" | "unmatched";

export type CausalLinkReason =
  | "action-id"
  | "navigation-id"
  | "bounded-context-window"
  | "unknown-action"
  | "unknown-navigation"
  | "boundary-mismatch"
  | "outside-window"
  | "invalid-timestamp"
  | "missing-context";

export type CausalCaptureLink = {
  classification: CausalClassification;
  reason: CausalLinkReason;
  actionId?: string;
  deltaMs?: number;
  capture: CausalCapturedRequest;
};

export type CausalDomLink = {
  classification: "exact" | "unmatched";
  reason: CausalLinkReason;
  actionId?: string;
  deltaMs?: number;
  snapshot: CausalDomSnapshot;
};

export type CausalEvidenceChain = {
  action: CausalAction;
  captures: CausalCaptureLink[];
  domSnapshots: CausalDomLink[];
};

export type CausalWindow = {
  beforeMs: number;
  afterMs: number;
  maxActionDurationMs: number;
};

export type CausalEvidenceGraph = {
  version: 1;
  window: CausalWindow;
  chains: CausalEvidenceChain[];
  unmatchedCaptures: CausalCaptureLink[];
  unmatchedDomSnapshots: CausalDomLink[];
};

export type BuildCausalEvidenceInput = {
  actions: readonly CausalAction[];
  captures: readonly CausalCapturedRequest[];
  domSnapshots?: readonly CausalDomSnapshot[];
  beforeMs?: number;
  afterMs?: number;
};

type ActionWindow = {
  action: CausalAction;
  startedAtMs: number;
  earliestMs: number;
  latestMs: number;
};

const ACTION_KINDS: CausalActionKind[] = [
  "open",
  "navigate",
  "click",
  "fill",
  "submit",
  "identity-switch",
  "replay",
  "workflow",
  "manual"
];
const SENSITIVE_ASSIGNMENT_PATTERN =
  /\b(password|passwd|pwd|secret|token|api[-_ ]?key|authorization|cookie|session(?:id)?)\b\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi;
const BEARER_PATTERN = /\bbearer\s+[a-z0-9._~+/=-]+/gi;
const JWT_PATTERN = /\beyJ[a-z0-9_-]{6,}\.[a-z0-9_-]{6,}\.[a-z0-9_-]{6,}\b/gi;
const VALUE_ATTRIBUTE_PATTERN = /(\bvalue\s*=\s*["'])[^"']*(["'])/gi;

function boundedString(value: unknown, maxLength: number) {
  return Array.from(String(value || ""))
    .filter((character) => {
      const code = character.charCodeAt(0);
      return code === 9 || code === 10 || code === 13 || (code >= 32 && code !== 127);
    })
    .join("")
    .trim()
    .slice(0, maxLength);
}

function boundedId(value: unknown) {
  return boundedString(value, MAX_CAUSAL_ID_LENGTH);
}

function enumValue<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  const normalized = String(value || "");
  return allowed.includes(normalized as T) ? (normalized as T) : null;
}

function timestampMs(value: unknown) {
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function isoTimestamp(value: unknown) {
  const parsed = timestampMs(value);
  return parsed === null ? "" : new Date(parsed).toISOString();
}

function clampInteger(value: unknown, fallback: number, min: number, max: number) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.min(Math.max(Math.round(numeric), min), max);
}

function stableValueHash(value: string) {
  let first = 2_166_136_261;
  let second = 2_166_136_261 ^ 0x9e3779b9;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    first = Math.imul(first ^ code, 16_777_619);
    second = Math.imul(second ^ (code + index), 16_777_619);
  }
  return `h1:${(first >>> 0).toString(16).padStart(8, "0")}${(second >>> 0).toString(16).padStart(8, "0")}`;
}

function redactText(value: unknown, maxLength = MAX_CAUSAL_TEXT_LENGTH) {
  return boundedString(value, maxLength)
    .replace(JWT_PATTERN, "[redacted-jwt]")
    .replace(BEARER_PATTERN, "Bearer [redacted]")
    .replace(SENSITIVE_ASSIGNMENT_PATTERN, (_match, label: string) => `${label}=[redacted]`)
    .replace(VALUE_ATTRIBUTE_PATTERN, "$1[redacted]$2")
    .replace(/\s+/g, " ")
    .trim();
}

function sanitizeUrl(value: unknown) {
  const text = boundedString(value, MAX_CAUSAL_URL_LENGTH);
  if (!text) {
    return "";
  }
  try {
    const parsed = new URL(text);
    for (const key of [...parsed.searchParams.keys()]) {
      const values = parsed.searchParams.getAll(key);
      parsed.searchParams.delete(key);
      for (const item of values) {
        parsed.searchParams.append(key, item ? `[value:${stableValueHash(item)}]` : "");
      }
    }
    parsed.hash = "";
    return parsed.toString().slice(0, MAX_CAUSAL_URL_LENGTH);
  } catch {
    return redactText(text, MAX_CAUSAL_URL_LENGTH);
  }
}

function sanitizeTarget(value: Partial<CausalActionTarget> | undefined): CausalActionTarget {
  return {
    selector: redactText(value?.selector, 500),
    role: redactText(value?.role, 100),
    name: redactText(value?.name, 300)
  };
}

function fingerprintInputs(inputs: readonly CausalValueInput[] | undefined) {
  return (inputs || []).slice(0, MAX_CAUSAL_INPUTS).map((input) => {
    const value = String(input.value || "");
    return {
      name: redactText(input.name, 200),
      type: redactText(input.type, 80),
      selector: redactText(input.selector, 500),
      hasValue: value.length > 0,
      valueLength: value.length,
      ...(value ? { valueHash: stableValueHash(value) } : {})
    };
  });
}

export function normalizeCausalAction(input: CausalActionInput): CausalAction | null {
  const id = boundedId(input.id);
  const runId = boundedId(input.runId);
  const identityId = boundedId(input.identityId);
  const activationId = boundedId(input.activationId);
  const sequenceRunId = boundedId(input.sequenceRunId);
  const experimentId = boundedId(input.experimentId);
  const kind = enumValue(input.kind, ACTION_KINDS);
  const startedAtMs = timestampMs(input.startedAt);
  if (!id || !runId || !identityId || !activationId || !sequenceRunId || !experimentId || !kind || startedAtMs === null) {
    return null;
  }

  const finishedAtMs = timestampMs(input.finishedAt);
  const boundedFinishedAtMs =
    finishedAtMs === null || finishedAtMs < startedAtMs
      ? null
      : Math.min(finishedAtMs, startedAtMs + MAX_CAUSAL_ACTION_DURATION_MS);
  const navigationId = boundedId(input.navigationId);
  return {
    id,
    runId,
    identityId,
    activationId,
    ...(navigationId ? { navigationId } : {}),
    sequenceRunId,
    experimentId,
    kind,
    startedAt: new Date(startedAtMs).toISOString(),
    ...(boundedFinishedAtMs === null ? {} : { finishedAt: new Date(boundedFinishedAtMs).toISOString() }),
    url: sanitizeUrl(input.url),
    target: sanitizeTarget(input.target),
    inputs: fingerprintInputs(input.inputs)
  };
}

export function sanitizeCausalDomSnapshot(input: CausalDomSnapshotInput): CausalDomSnapshot | null {
  const id = boundedId(input.id);
  const actionId = boundedId(input.actionId);
  const runId = boundedId(input.runId);
  const identityId = boundedId(input.identityId);
  const activationId = boundedId(input.activationId);
  const sequenceRunId = boundedId(input.sequenceRunId);
  const experimentId = boundedId(input.experimentId);
  const phase = enumValue(input.phase, ["before", "after"] as const);
  const capturedAt = isoTimestamp(input.capturedAt);
  if (!id || !actionId || !runId || !identityId || !activationId || !sequenceRunId || !experimentId || !phase || !capturedAt) {
    return null;
  }

  const navigationId = boundedId(input.navigationId);
  return {
    id,
    actionId,
    runId,
    identityId,
    activationId,
    ...(navigationId ? { navigationId } : {}),
    sequenceRunId,
    experimentId,
    phase,
    capturedAt,
    url: sanitizeUrl(input.url),
    title: redactText(input.title, 500),
    summary: redactText(input.summary),
    inputs: fingerprintInputs(input.inputs)
  };
}

function compareTimestampAndId(
  leftTimestamp: string,
  leftId: string,
  rightTimestamp: string,
  rightId: string
) {
  const leftMs = timestampMs(leftTimestamp) ?? Number.MAX_SAFE_INTEGER;
  const rightMs = timestampMs(rightTimestamp) ?? Number.MAX_SAFE_INTEGER;
  return leftMs - rightMs || leftId.localeCompare(rightId);
}

function normalizedWindow(input: BuildCausalEvidenceInput): CausalWindow {
  return {
    beforeMs: clampInteger(input.beforeMs, DEFAULT_CAUSAL_BEFORE_MS, 0, MAX_CAUSAL_WINDOW_MS),
    afterMs: clampInteger(input.afterMs, DEFAULT_CAUSAL_AFTER_MS, 0, MAX_CAUSAL_WINDOW_MS),
    maxActionDurationMs: MAX_CAUSAL_ACTION_DURATION_MS
  };
}

function actionWindows(actions: readonly CausalAction[], window: CausalWindow) {
  return [...actions]
    .filter((action) => timestampMs(action.startedAt) !== null)
    .sort((left, right) => compareTimestampAndId(left.startedAt, left.id, right.startedAt, right.id))
    .map((action): ActionWindow => {
      const startedAtMs = timestampMs(action.startedAt) || 0;
      const declaredFinishMs = timestampMs(action.finishedAt);
      const finishedAtMs =
        declaredFinishMs === null || declaredFinishMs < startedAtMs
          ? startedAtMs
          : Math.min(declaredFinishMs, startedAtMs + window.maxActionDurationMs);
      return {
        action,
        startedAtMs,
        earliestMs: startedAtMs - window.beforeMs,
        latestMs: finishedAtMs + window.afterMs
      };
    });
}

function strictBoundaryMatch(action: CausalAction, capture: CausalCapturedRequest) {
  return (
    capture.agentRunId === action.runId &&
    capture.identityId === action.identityId &&
    capture.activationId === action.activationId &&
    capture.sequenceRunId === action.sequenceRunId &&
    capture.experimentId === action.experimentId
  );
}

function domBoundaryMatch(action: CausalAction, snapshot: CausalDomSnapshot) {
  return (
    snapshot.runId === action.runId &&
    snapshot.identityId === action.identityId &&
    snapshot.activationId === action.activationId &&
    snapshot.sequenceRunId === action.sequenceRunId &&
    snapshot.experimentId === action.experimentId &&
    (!snapshot.navigationId || !action.navigationId || snapshot.navigationId === action.navigationId)
  );
}

function insideWindow(candidate: ActionWindow, eventMs: number) {
  return eventMs >= candidate.earliestMs && eventMs <= candidate.latestMs;
}

function closestCandidate(candidates: readonly ActionWindow[], eventMs: number) {
  return [...candidates].sort(
    (left, right) =>
      Math.abs(eventMs - left.startedAtMs) - Math.abs(eventMs - right.startedAtMs) ||
      left.startedAtMs - right.startedAtMs ||
      left.action.id.localeCompare(right.action.id)
  )[0];
}

function linkedCapture(
  capture: CausalCapturedRequest,
  candidate: ActionWindow,
  classification: Exclude<CausalClassification, "unmatched">,
  reason: CausalLinkReason,
  captureMs: number
): CausalCaptureLink {
  return {
    classification,
    reason,
    actionId: candidate.action.id,
    deltaMs: captureMs - candidate.startedAtMs,
    capture
  };
}

function unmatchedCapture(capture: CausalCapturedRequest, reason: CausalLinkReason): CausalCaptureLink {
  return { classification: "unmatched", reason, capture };
}

function classifyCapture(capture: CausalCapturedRequest, windows: readonly ActionWindow[]): CausalCaptureLink {
  const captureMs = timestampMs(capture.startedAt);
  if (captureMs === null) {
    return unmatchedCapture(capture, "invalid-timestamp");
  }

  if (capture.actionId) {
    const candidate = windows.find((item) => item.action.id === capture.actionId);
    if (!candidate) {
      return unmatchedCapture(capture, "unknown-action");
    }
    const hasStrictContext = Boolean(
      capture.agentRunId && capture.identityId && capture.activationId && capture.sequenceRunId && capture.experimentId
    );
    if (!hasStrictContext) {
      return unmatchedCapture(capture, "missing-context");
    }
    if (!strictBoundaryMatch(candidate.action, capture)) {
      return unmatchedCapture(capture, "boundary-mismatch");
    }
    if (!insideWindow(candidate, captureMs)) {
      return unmatchedCapture(capture, "outside-window");
    }
    return linkedCapture(capture, candidate, "exact", "action-id", captureMs);
  }

  if (capture.navigationId) {
    const navigationCandidates = windows.filter((item) => item.action.navigationId === capture.navigationId);
    if (navigationCandidates.length === 0) {
      return unmatchedCapture(capture, "unknown-navigation");
    }
    const matchingBoundaries = navigationCandidates.filter((item) => strictBoundaryMatch(item.action, capture));
    if (matchingBoundaries.length === 0) {
      return unmatchedCapture(capture, "boundary-mismatch");
    }
    const matchingWindow = matchingBoundaries.filter((item) => insideWindow(item, captureMs));
    if (matchingWindow.length === 0) {
      return unmatchedCapture(capture, "outside-window");
    }
    const candidate = closestCandidate(matchingWindow, captureMs);
    return linkedCapture(capture, candidate, "correlated", "navigation-id", captureMs);
  }

  const hasStrictContext = Boolean(
    capture.agentRunId && capture.identityId && capture.activationId && capture.sequenceRunId && capture.experimentId
  );
  if (!hasStrictContext) {
    return unmatchedCapture(capture, "missing-context");
  }
  const boundaryCandidates = windows.filter((item) => strictBoundaryMatch(item.action, capture));
  if (boundaryCandidates.length === 0) {
    return unmatchedCapture(capture, "boundary-mismatch");
  }
  const matchingWindow = boundaryCandidates.filter((item) => insideWindow(item, captureMs));
  if (matchingWindow.length === 0) {
    return unmatchedCapture(capture, "outside-window");
  }
  const candidate = closestCandidate(matchingWindow, captureMs);
  return linkedCapture(capture, candidate, "inferred", "bounded-context-window", captureMs);
}

function classifyDomSnapshot(snapshot: CausalDomSnapshot, windows: readonly ActionWindow[]): CausalDomLink {
  const candidate = windows.find((item) => item.action.id === snapshot.actionId);
  if (!candidate) {
    return { classification: "unmatched", reason: "unknown-action", snapshot };
  }
  if (!domBoundaryMatch(candidate.action, snapshot)) {
    return { classification: "unmatched", reason: "boundary-mismatch", snapshot };
  }
  const capturedAtMs = timestampMs(snapshot.capturedAt);
  if (capturedAtMs === null) {
    return { classification: "unmatched", reason: "invalid-timestamp", snapshot };
  }
  if (!insideWindow(candidate, capturedAtMs)) {
    return { classification: "unmatched", reason: "outside-window", snapshot };
  }
  return {
    classification: "exact",
    reason: "action-id",
    actionId: candidate.action.id,
    deltaMs: capturedAtMs - candidate.startedAtMs,
    snapshot
  };
}

function compareCaptureLinks(left: CausalCaptureLink, right: CausalCaptureLink) {
  return compareTimestampAndId(
    left.capture.startedAt,
    left.capture.id,
    right.capture.startedAt,
    right.capture.id
  );
}

function compareDomLinks(left: CausalDomLink, right: CausalDomLink) {
  return compareTimestampAndId(
    left.snapshot.capturedAt,
    left.snapshot.id,
    right.snapshot.capturedAt,
    right.snapshot.id
  );
}

export function buildCausalEvidenceChains(input: BuildCausalEvidenceInput): CausalEvidenceGraph {
  const window = normalizedWindow(input);
  const windows = actionWindows(input.actions, window);
  const links = input.captures.map((capture) => classifyCapture(capture, windows));
  const domLinks = (input.domSnapshots || []).map((snapshot) => classifyDomSnapshot(snapshot, windows));
  const chains = windows.map(({ action }): CausalEvidenceChain => ({
    action,
    captures: links.filter((link) => link.actionId === action.id).sort(compareCaptureLinks),
    domSnapshots: domLinks.filter((link) => link.actionId === action.id).sort(compareDomLinks)
  }));

  return {
    version: 1,
    window,
    chains,
    unmatchedCaptures: links.filter((link) => link.classification === "unmatched").sort(compareCaptureLinks),
    unmatchedDomSnapshots: domLinks.filter((link) => link.classification === "unmatched").sort(compareDomLinks)
  };
}
