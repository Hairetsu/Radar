import { safeJsonHeaders } from "./headers.js";

export const MAX_REPLAY_BODY = 500_000;

type DraftInput = {
  method?: string;
  url?: string;
  headers?: Record<string, unknown>;
  body?: string;
};

export function normalizeDraft(input: DraftInput = {}) {
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
