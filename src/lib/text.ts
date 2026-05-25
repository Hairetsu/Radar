export const MAX_CAPTURED_BODY = 120_000;

export function truncateText(value: unknown, limit = MAX_CAPTURED_BODY) {
  if (!value) {
    return "";
  }
  const text = String(value);
  return text.length > limit ? `${text.slice(0, limit)}\n\n[truncated]` : text;
}

export function statusTone(status: number | null) {
  if (!status) {
    return "ghost";
  }
  if (status >= 500) {
    return "danger";
  }
  if (status >= 400) {
    return "warn";
  }
  if (status >= 300) {
    return "move";
  }
  return "good";
}

export function elapsed(value: number | null | undefined) {
  return typeof value === "number" ? `${value}ms` : "—";
}

export function bodyPreview(value: string) {
  if (!value) {
    return "";
  }
  return value.length > 5000 ? `${value.slice(0, 5000)}\n\n[preview truncated]` : value;
}

import type { CapturedRequest } from "../types";

export function tlsLine(capture: CapturedRequest | null) {
  if (!capture?.tls) {
    return "TLS: none";
  }
  return `TLS: ${capture.tls.protocol || "unknown"} | ${capture.tls.subjectName || "unknown subject"} | ${
    capture.tls.issuer || "unknown issuer"
  }`;
}
