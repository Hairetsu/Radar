function formatHeaders(headers) {
  return JSON.stringify(headers, null, 2);
}

function parseHeaders(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) {
    return {};
  }

  const parsed = JSON.parse(trimmed);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Headers must be a JSON object.");
  }
  return Object.fromEntries(Object.entries(parsed).map(([key, headerValue]) => [key, String(headerValue)]));
}

function safeJsonHeaders(headers = {}) {
  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key, Array.isArray(value) ? value.join(", ") : String(value)])
  );
}

module.exports = { formatHeaders, parseHeaders, safeJsonHeaders };
