import type { CapturedRequest, InterceptRule, InterceptRuleHit, InterceptStage } from "./domain.js";

const MAX_RULES = 40;
const MAX_FIELD = 240;

function cleanText(value: unknown, max = MAX_FIELD) {
  return String(value || "").trim().slice(0, max);
}

function cleanOptional(value: unknown) {
  const text = cleanText(value);
  return text ? text : undefined;
}

function ruleStage(value: unknown): InterceptRule["stage"] {
  return value === "request" || value === "response" || value === "both" ? value : "both";
}

function includesNeedle(value: unknown, needle: string | undefined) {
  if (!needle) {
    return true;
  }
  return String(value || "").toLowerCase().includes(needle.toLowerCase());
}

function headerSearch(headers: Record<string, string>, needle: string | undefined) {
  if (!needle) {
    return true;
  }
  return Object.entries(headers)
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n")
    .toLowerCase()
    .includes(needle.toLowerCase());
}

export function normalizeInterceptRule(input: Partial<InterceptRule>, fallbackId: string, now: string): InterceptRule | null {
  const name = cleanText(input.name, 80);
  if (!name) {
    return null;
  }
  const status = Number(input.status);
  return {
    id: cleanText(input.id, 80) || fallbackId,
    name,
    enabled: input.enabled !== false,
    stage: ruleStage(input.stage),
    method: cleanOptional(input.method)?.toUpperCase(),
    host: cleanOptional(input.host),
    path: cleanOptional(input.path),
    contentType: cleanOptional(input.contentType),
    status: Number.isFinite(status) && status > 0 ? Math.round(status) : undefined,
    initiator: cleanOptional(input.initiator),
    requestHeader: cleanOptional(input.requestHeader),
    responseHeader: cleanOptional(input.responseHeader),
    body: cleanOptional(input.body),
    createdAt: cleanText(input.createdAt) || now,
    updatedAt: now
  };
}

export function normalizeInterceptRules(input: unknown, now = new Date().toISOString()) {
  if (!Array.isArray(input)) {
    return [];
  }
  return input
    .slice(0, MAX_RULES)
    .map((item, index) =>
      item && typeof item === "object" && !Array.isArray(item)
        ? normalizeInterceptRule(item as Partial<InterceptRule>, `rule-${index + 1}`, now)
        : null
    )
    .filter((item): item is InterceptRule => Boolean(item));
}

export function explainInterceptRule(rule: InterceptRule, capture: CapturedRequest, stage: InterceptStage): string | null {
  if (!rule.enabled || (rule.stage !== "both" && rule.stage !== stage)) {
    return null;
  }
  if (rule.method && capture.method.toUpperCase() !== rule.method.toUpperCase()) {
    return null;
  }
  if (!includesNeedle(capture.host, rule.host)) {
    return null;
  }
  if (!includesNeedle(capture.path, rule.path)) {
    return null;
  }
  const contentType =
    stage === "response"
      ? capture.responseHeaders["content-type"] || capture.responseHeaders["Content-Type"] || capture.mimeType
      : capture.requestHeaders["content-type"] || capture.requestHeaders["Content-Type"];
  if (!includesNeedle(contentType, rule.contentType)) {
    return null;
  }
  if (rule.status && stage === "response" && capture.status !== rule.status) {
    return null;
  }
  if (rule.status && stage === "request") {
    return null;
  }
  if (!includesNeedle(capture.initiator, rule.initiator)) {
    return null;
  }
  if (!headerSearch(capture.requestHeaders, rule.requestHeader)) {
    return null;
  }
  if (!headerSearch(capture.responseHeaders, rule.responseHeader)) {
    return null;
  }
  const body = stage === "response" ? capture.responseBody : capture.requestBody;
  if (!includesNeedle(body, rule.body)) {
    return null;
  }

  const reasons = [
    rule.method ? `method=${rule.method}` : "",
    rule.host ? `host~${rule.host}` : "",
    rule.path ? `path~${rule.path}` : "",
    rule.contentType ? `content-type~${rule.contentType}` : "",
    rule.status ? `status=${rule.status}` : "",
    rule.initiator ? `initiator~${rule.initiator}` : "",
    rule.requestHeader ? `request-header~${rule.requestHeader}` : "",
    rule.responseHeader ? `response-header~${rule.responseHeader}` : "",
    rule.body ? `body~${rule.body}` : ""
  ].filter(Boolean);
  return reasons.length ? reasons.join(", ") : "enabled catch-all";
}

export function matchingInterceptRules(
  rules: InterceptRule[],
  capture: CapturedRequest,
  stage: InterceptStage
): InterceptRuleHit[] {
  return rules
    .map((rule) => {
      const reason = explainInterceptRule(rule, capture, stage);
      return reason ? { ruleId: rule.id, name: rule.name, reason } : null;
    })
    .filter((hit): hit is InterceptRuleHit => Boolean(hit));
}
