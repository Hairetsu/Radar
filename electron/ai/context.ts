import type { CapturedRequest } from "../../shared/domain.js";

const SENSITIVE_HEADERS = new Set([
  "authorization",
  "cookie",
  "set-cookie",
  "x-api-key",
  "x-auth-token",
  "proxy-authorization"
]);

const TOKEN_PATTERN =
  /(bearer\s+[a-z0-9._-]+|api[_-]?key["\s:=]+[a-z0-9._-]+|token["\s:=]+[a-z0-9._-]+)/gi;

function redactHeaders(headers: Record<string, string>) {
  const next: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers || {})) {
    if (SENSITIVE_HEADERS.has(key.toLowerCase())) {
      next[key] = "[REDACTED]";
    } else {
      next[key] = value;
    }
  }
  return next;
}

function redactBody(text: string) {
  if (!text) {
    return "";
  }
  return String(text).replace(TOKEN_PATTERN, "[REDACTED]");
}

function formatCapture(capture: CapturedRequest, includeRaw: boolean) {
  const reqHeaders = includeRaw ? capture.requestHeaders : redactHeaders(capture.requestHeaders);
  const resHeaders = includeRaw ? capture.responseHeaders : redactHeaders(capture.responseHeaders);
  const reqBody = includeRaw ? capture.requestBody : redactBody(capture.requestBody);
  const resBody = includeRaw ? capture.responseBody : redactBody(capture.responseBody);

  const tls = capture.tls
    ? `TLS: ${capture.tls.protocol || "?"} | ${capture.tls.subjectName || "?"} | ${capture.tls.issuer || "?"}`
    : "TLS: none";

  return [
    `--- capture:${capture.id} ---`,
    `${capture.method} ${capture.url}`,
    `status: ${capture.status ?? "pending"} ${capture.statusText || ""}`.trim(),
    `duration: ${capture.durationMs ?? "—"}ms | source: ${capture.source}`,
    tls,
    "REQUEST HEADERS:",
    JSON.stringify(reqHeaders, null, 2),
    "REQUEST BODY:",
    reqBody || "(empty)",
    "RESPONSE HEADERS:",
    JSON.stringify(resHeaders, null, 2),
    "RESPONSE BODY:",
    resBody || "(empty)"
  ].join("\n");
}

export function buildContextPayload({
  captures,
  targets,
  browserUrl,
  includeRaw
}: {
  captures: CapturedRequest[];
  targets: string[];
  browserUrl: string;
  includeRaw: boolean;
}) {
  const blocks = captures.map((capture) => formatCapture(capture, includeRaw));
  const header = [
    "RADAR AI CONTEXT",
    `allowlist: ${targets.join(", ") || "(none)"}`,
    `browser_url: ${browserUrl || "(none)"}`,
    `redacted: ${includeRaw ? "no" : "yes"}`,
    ""
  ].join("\n");

  return `${header}${blocks.join("\n\n")}`;
}

export { redactHeaders, redactBody };
