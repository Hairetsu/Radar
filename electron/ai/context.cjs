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

function redactHeaders(headers) {
  const next = {};
  for (const [key, value] of Object.entries(headers || {})) {
    if (SENSITIVE_HEADERS.has(key.toLowerCase())) {
      next[key] = "[REDACTED]";
    } else {
      next[key] = value;
    }
  }
  return next;
}

function redactBody(text) {
  if (!text) {
    return "";
  }
  return String(text).replace(TOKEN_PATTERN, "[REDACTED]");
}

function formatCapture(capture, includeRaw) {
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

function buildContextPayload({ captures, targets, browserUrl, includeRaw }) {
  const blocks = captures.map((c) => formatCapture(c, includeRaw));
  const header = [
    "RADAR AI CONTEXT",
    `allowlist: ${targets.join(", ") || "(none)"}`,
    `browser_url: ${browserUrl || "(none)"}`,
    `redacted: ${includeRaw ? "no" : "yes"}`,
    ""
  ].join("\n");

  return `${header}${blocks.join("\n\n")}`;
}

module.exports = {
  buildContextPayload,
  redactHeaders,
  redactBody
};
