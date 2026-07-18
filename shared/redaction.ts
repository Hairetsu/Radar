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

export function redactSensitiveHeaders(headers: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(headers || {}).map(([key, value]) => [
      key,
      SENSITIVE_HEADERS.has(key.toLowerCase()) ? "[REDACTED]" : value
    ])
  );
}

export function redactSensitiveText(text: string) {
  return text ? String(text).replace(TOKEN_PATTERN, "[REDACTED]") : "";
}
