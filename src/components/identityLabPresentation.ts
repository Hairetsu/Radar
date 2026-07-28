import type { IdentityProfile } from "../../shared/identityProfiles.js";
import type { CapturedRequest } from "../types";

export type IdentityFormState = {
  label: string;
  kind: IdentityProfile["kind"];
  roleLabel: string;
  tenantLabel: string;
  origin: string;
  notes: string;
};

export type MatrixRow = {
  key: string;
  role: string;
  tenant: string;
  resource: string;
  identityLabels: string[];
  captures: CapturedRequest[];
};

export type ComparisonField = {
  label: string;
  left: string;
  right: string;
  different: boolean;
};

export const EMPTY_FORM: IdentityFormState = {
  label: "",
  kind: "user",
  roleLabel: "",
  tenantLabel: "",
  origin: "",
  notes: ""
};

export const HEALTH_TONE: Record<IdentityProfile["health"], "good" | "warn" | "danger" | "move" | "ghost"> = {
  unknown: "ghost",
  checking: "move",
  healthy: "good",
  stale: "warn",
  expired: "danger",
  error: "danger"
};

export const ISOLATION_LABEL: Record<IdentityProfile["isolation"], string> = {
  "dedicated-profile": "DEDICATED PROFILE",
  "snapshot-only": "SNAPSHOT ONLY",
  "legacy-shared": "LEGACY SHARED"
};

export const COMPARISON_HEADER_NAMES = new Set([
  "accept",
  "accept-language",
  "content-type",
  "if-match",
  "if-none-match",
  "x-http-method-override"
]);

export function cleanActionId(value?: string) {
  return String(value || "").trim();
}

export function safeTestId(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 96);
}

export function requestParts(capture: CapturedRequest) {
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

export function normalizedResourcePath(path: string) {
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

export function resourceLabel(capture: CapturedRequest) {
  const target = requestParts(capture);
  return `${capture.method.toUpperCase()} ${target.host}${normalizedResourcePath(target.path)}`;
}

export function comparisonSignature(capture: CapturedRequest) {
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

export function statusText(status: number | null) {
  return status === null ? "NO STATUS" : `${status} RECORDED`;
}

export function statusTone(status: number | null): "good" | "warn" | "danger" | "move" | "ghost" {
  if (status === null) return "ghost";
  if (status === 401 || status === 403) return "warn";
  if (status >= 500) return "danger";
  if (status >= 300 && status < 400) return "move";
  return "ghost";
}

export function matrixMeaning(captures: readonly CapturedRequest[]) {
  const statuses = captures.map((capture) => capture.status);
  const hasTwoHundred = statuses.some((status) => status !== null && status >= 200 && status < 300);
  const hasDenial = statuses.some((status) => status === 401 || status === 403);
  if (hasTwoHundred && hasDenial) return "Mixed responses observed; authorization remains unproven.";
  if (hasDenial) return "401/403 denial response observed.";
  if (hasTwoHundred) return "2xx response observed; not authorization proof.";
  return "Response observed; decision remains unclassified.";
}

export function responseShape(capture: CapturedRequest) {
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

export function comparisonFields(left: CapturedRequest, right: CapturedRequest): ComparisonField[] {
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

export function captureOptionLabel(capture: CapturedRequest, identities: ReadonlyMap<string, IdentityProfile>) {
  const identity = capture.identityId ? identities.get(capture.identityId) : undefined;
  return `${capture.id} · ${identity?.label || capture.identityId || "unknown"} · ${resourceLabel(capture)} · ${statusText(capture.status)}`;
}

export function shortRef(value?: string) {
  const next = String(value || "");
  return next.length > 14 ? `${next.slice(0, 6)}…${next.slice(-6)}` : next;
}

export function validOrigin(value: string) {
  try {
    const parsed = new URL(value.trim());
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.origin : "";
  } catch {
    return "";
  }
}

export function captureAttribution(capture: CapturedRequest, identities: ReadonlyMap<string, IdentityProfile>) {
  const profile = capture.identityId ? identities.get(capture.identityId) : undefined;
  if (profile && capture.activationId) return `${profile.label} · activation ${shortRef(capture.activationId)}`;
  if (profile) return `${profile.label} · activation missing`;
  if (capture.identityId) return `${capture.identityId} · identity unknown`;
  return "identity unattributed";
}

