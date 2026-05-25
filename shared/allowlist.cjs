const DEFAULT_ALLOWLIST = [
  "http://localhost:*",
  "http://127.0.0.1:*",
  "http://[::1]:*"
];

function isLocalHost(hostname) {
  return hostname === "localhost" || hostname === "::1" || /^127\./.test(hostname);
}

function wildcardToRegExp(pattern) {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`, "i");
}

function ruleAllows(url, rule) {
  const trimmed = String(rule || "").trim();
  if (!trimmed) {
    return false;
  }

  if (trimmed === "local") {
    return isLocalHost(url.hostname);
  }

  const target = `${url.protocol}//${url.host}`;
  if (trimmed.includes("*")) {
    return wildcardToRegExp(trimmed).test(target) || wildcardToRegExp(trimmed).test(url.href);
  }

  try {
    const parsedRule = new URL(trimmed);
    return parsedRule.origin === url.origin;
  } catch {
    return trimmed.toLowerCase() === url.hostname.toLowerCase();
  }
}

function isAllowedTarget(urlString, rules = DEFAULT_ALLOWLIST) {
  let parsed;
  try {
    parsed = new URL(urlString);
  } catch {
    return false;
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    return false;
  }

  const activeRules = Array.isArray(rules) && rules.length > 0 ? rules : DEFAULT_ALLOWLIST;
  return activeRules.some((rule) => ruleAllows(parsed, rule));
}

function shouldTrustLocalCertificate(urlString) {
  try {
    const parsed = new URL(urlString);
    return parsed.protocol === "https:" && isLocalHost(parsed.hostname);
  } catch {
    return false;
  }
}

module.exports = {
  DEFAULT_ALLOWLIST,
  isLocalHost,
  wildcardToRegExp,
  ruleAllows,
  isAllowedTarget,
  shouldTrustLocalCertificate
};
