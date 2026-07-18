export const DEFAULT_ALLOWLIST = [
  "http://localhost:*",
  "http://127.0.0.1:*",
  "http://[::1]:*"
];

const HOSTNAME_RULE = /^(?:\[::1\]|[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?)$/i;
const WILDCARD_ORIGIN_RULE = /^(https?|wss?):\/\/[^\s/]*\*[^\s/]*(?::(?:\d+|\*))?\/?$/i;

export function normalizeTargetRule(value: unknown) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return null;
  if (trimmed.toLowerCase() === "local") return "local";
  if (trimmed.includes("*")) {
    return WILDCARD_ORIGIN_RULE.test(trimmed) ? trimmed.toLowerCase().replace(/\/$/, "") : null;
  }
  try {
    const parsed = new URL(trimmed);
    return ["http:", "https:", "ws:", "wss:"].includes(parsed.protocol) ? parsed.origin : null;
  } catch {
    return HOSTNAME_RULE.test(trimmed) ? trimmed.toLowerCase() : null;
  }
}

export function normalizeTargetRules(values: unknown, fallback = DEFAULT_ALLOWLIST) {
  if (!Array.isArray(values)) return [...fallback];
  const unique = new Set<string>();
  for (const value of values.slice(0, 80)) {
    const normalized = normalizeTargetRule(value);
    if (normalized) unique.add(normalized);
    if (unique.size >= 40) break;
  }
  return unique.size > 0 ? [...unique] : [...fallback];
}

export function isLocalHost(hostname: string) {
  return hostname === "localhost" || hostname === "::1" || /^127\./.test(hostname);
}

export function wildcardToRegExp(pattern: string) {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`, "i");
}

export function ruleAllows(url: URL, rule: string) {
  const trimmed = String(rule || "").trim();
  if (!trimmed) {
    return false;
  }

  if (trimmed === "local") {
    return isLocalHost(url.hostname);
  }

  const target = `${url.protocol}//${url.host}`;
  const equivalentHttpProtocol = url.protocol === "ws:" ? "http:" : url.protocol === "wss:" ? "https:" : url.protocol;
  const equivalentTarget = `${equivalentHttpProtocol}//${url.host}`;
  if (trimmed.includes("*")) {
    const pattern = wildcardToRegExp(trimmed);
    return pattern.test(target) || pattern.test(equivalentTarget) || pattern.test(url.href);
  }

  try {
    const parsedRule = new URL(trimmed);
    return parsedRule.origin === url.origin || parsedRule.origin === equivalentTarget;
  } catch {
    return trimmed.toLowerCase() === url.hostname.toLowerCase();
  }
}

function parseScopedUrl(urlString: string): URL | null {
  try {
    const parsed = new URL(urlString);
    return ["http:", "https:", "ws:", "wss:"].includes(parsed.protocol) ? parsed : null;
  } catch {
    return null;
  }
}

export function isAllowedTarget(urlString: string, rules = DEFAULT_ALLOWLIST) {
  const parsed = parseScopedUrl(urlString);
  if (!parsed) {
    return false;
  }

  const activeRules = Array.isArray(rules) && rules.length > 0 ? rules : DEFAULT_ALLOWLIST;
  return activeRules.some((rule) => ruleAllows(parsed, rule));
}

export function shouldTrustLocalCertificate(urlString: string) {
  const parsed = parseScopedUrl(urlString);
  return parsed?.protocol === "https:" && isLocalHost(parsed.hostname) ? true : false;
}
