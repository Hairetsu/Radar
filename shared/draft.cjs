const { safeJsonHeaders } = require("./headers.cjs");

const MAX_REPLAY_BODY = 500_000;

function normalizeDraft(input = {}) {
  const method = String(input.method || "GET").toUpperCase();
  const headers = safeJsonHeaders(input.headers || {});
  const body = typeof input.body === "string" ? input.body : "";

  for (const key of Object.keys(headers)) {
    if (["host", "content-length", "connection", "upgrade", "proxy-connection"].includes(key.toLowerCase())) {
      delete headers[key];
    }
  }

  return {
    method,
    url: String(input.url || ""),
    headers,
    body: ["GET", "HEAD"].includes(method) ? "" : body.slice(0, MAX_REPLAY_BODY)
  };
}

module.exports = { MAX_REPLAY_BODY, normalizeDraft };
