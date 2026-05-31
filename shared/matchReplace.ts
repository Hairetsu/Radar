import type { CapturedRequest, MatchReplaceHit, MatchReplaceRule } from "./domain.js";

const MAX_RULES = 40;
const MAX_TEXT = 500;

function cleanText(value: unknown, max = MAX_TEXT) {
  return String(value || "").trim().slice(0, max);
}

function cleanOptional(value: unknown) {
  const text = cleanText(value, 120);
  return text ? text : undefined;
}

export function normalizeMatchReplaceRule(input: Partial<MatchReplaceRule>, fallbackId: string, now: string): MatchReplaceRule | null {
  const name = cleanText(input.name, 80);
  const match = cleanText(input.match);
  if (!name || !match) {
    return null;
  }
  return {
    id: cleanText(input.id, 80) || fallbackId,
    name,
    enabled: input.enabled !== false,
    stage: input.stage === "response" ? "response" : "request",
    target: input.target === "header" ? "header" : "body",
    match,
    replace: String(input.replace || "").slice(0, MAX_TEXT),
    headerName: cleanOptional(input.headerName),
    createdAt: cleanText(input.createdAt) || now,
    updatedAt: now
  };
}

export function normalizeMatchReplaceRules(input: unknown, now = new Date().toISOString()) {
  if (!Array.isArray(input)) {
    return [];
  }
  return input
    .slice(0, MAX_RULES)
    .map((item, index) =>
      item && typeof item === "object" && !Array.isArray(item)
        ? normalizeMatchReplaceRule(item as Partial<MatchReplaceRule>, `rewrite-${index + 1}`, now)
        : null
    )
    .filter((rule): rule is MatchReplaceRule => Boolean(rule));
}

function replaceAll(value: string, match: string, replacement: string) {
  return value.split(match).join(replacement);
}

function applyHeaderRule(headers: Record<string, string>, rule: MatchReplaceRule) {
  const next = { ...headers };
  const candidates = rule.headerName
    ? Object.keys(next).filter((key) => key.toLowerCase() === rule.headerName?.toLowerCase())
    : Object.keys(next);
  let changed = false;
  for (const key of candidates) {
    const value = next[key] || "";
    if (!value.includes(rule.match)) {
      continue;
    }
    next[key] = replaceAll(value, rule.match, rule.replace);
    changed = true;
  }
  return changed ? next : headers;
}

export function applyMatchReplaceRules(
  rules: MatchReplaceRule[],
  capture: CapturedRequest,
  stage: MatchReplaceRule["stage"]
): { capture: CapturedRequest; hits: MatchReplaceHit[]; changed: boolean } {
  let next = { ...capture };
  const hits: MatchReplaceHit[] = [];

  for (const rule of rules) {
    if (!rule.enabled || rule.stage !== stage) {
      continue;
    }
    if (rule.target === "body") {
      const field = stage === "response" ? "responseBody" : "requestBody";
      const value = next[field];
      if (!value.includes(rule.match)) {
        continue;
      }
      next = {
        ...next,
        [field]: replaceAll(value, rule.match, rule.replace)
      };
      hits.push({ ruleId: rule.id, name: rule.name, stage, target: "body", detail: `body: ${rule.match}` });
      continue;
    }

    const field = stage === "response" ? "responseHeaders" : "requestHeaders";
    const headers = applyHeaderRule(next[field], rule);
    if (headers === next[field]) {
      continue;
    }
    next = {
      ...next,
      [field]: headers
    };
    hits.push({
      ruleId: rule.id,
      name: rule.name,
      stage,
      target: "header",
      detail: `${rule.headerName || "headers"}: ${rule.match}`
    });
  }

  if (hits.length > 0) {
    next.rewrites = [...(next.rewrites || []), ...hits];
  }

  return { capture: next, hits, changed: hits.length > 0 };
}
