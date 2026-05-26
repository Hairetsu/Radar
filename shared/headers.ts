export function formatHeaders(headers: Record<string, string>) {
  return JSON.stringify(headers, null, 2);
}

export function parseHeaders(value: string) {
  const trimmed = String(value || "").trim();
  if (!trimmed) {
    return {};
  }

  const parsed: unknown = JSON.parse(trimmed);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Headers must be a JSON object.");
  }
  return Object.fromEntries(
    Object.entries(parsed).map(([key, headerValue]) => [
      key,
      String(headerValue),
    ]),
  );
}

export function safeJsonHeaders(headers: Record<string, unknown> = {}) {
  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [
      key,
      Array.isArray(value) ? value.join(", ") : String(value),
    ]),
  );
}
