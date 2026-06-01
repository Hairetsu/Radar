import type {
  AutomateCluster,
  AutomateExtract,
  AutomateLimits,
  AutomatePayloadAssignments,
  AutomatePayloadLocation,
  AutomatePayloadPosition,
  AutomatePayloadSet,
  AutomatePayloadSetSource,
  AutomateResult,
  AutomateResultMarker,
  AutomateRule,
  AutomateRuleKind,
  AutomateRuleTarget,
  AutomateSession,
  ReplayDraft,
  ReplayResult
} from "./domain.js";
import { normalizeDraft } from "./draft.js";
import { safeJsonHeaders } from "./headers.js";
import { DEFAULT_URL } from "./url.js";

export const AUTOMATE_MARKER_NAME_PATTERN = /^[a-zA-Z0-9_.-]+$/;
export const AUTOMATE_MARKER_SOURCE = "\\{\\{payload:([a-zA-Z0-9_.-]+)\\}\\}";
export const MAX_AUTOMATE_POSITIONS = 32;
export const MAX_AUTOMATE_PAYLOADS = 500;
export const MAX_AUTOMATE_PAYLOAD_LENGTH = 8000;
export const MAX_AUTOMATE_PAYLOAD_SETS = 40;
export const MAX_AUTOMATE_COUNT = 100;
export const MAX_AUTOMATE_CONCURRENCY = 5;
export const MAX_AUTOMATE_DELAY_MS = 10_000;
export const MAX_AUTOMATE_TIMEOUT_MS = 30_000;
export const MAX_AUTOMATE_RULES = 30;
export const MAX_AUTOMATE_SESSIONS = 50;
export const MAX_AUTOMATE_RESPONSE_PREVIEW = 20_000;

export type { AutomatePayloadAssignments, AutomatePayloadLocation, AutomatePayloadPosition };

type AutomateRuleEvaluationInput = {
  status: number;
  redirect: string;
  length: number;
  latencyMs: number;
  headers: Record<string, string>;
  bodyPreview: string;
};

function cleanMarkerName(value: unknown) {
  const cleaned = String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9_.-]/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
  return cleaned || "payload";
}

function markerPattern() {
  return new RegExp(AUTOMATE_MARKER_SOURCE, "g");
}

function nowIso() {
  return new Date().toISOString();
}

function objectValue(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function cleanName(value: unknown, fallback: string, max = 80) {
  const cleaned = String(value || "").trim().replace(/\s+/g, " ").slice(0, max);
  return cleaned || fallback;
}

function cleanId(value: unknown, prefix: string) {
  const cleaned = String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9_.:-]/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 120);
  return cleaned || `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function cleanIso(value: unknown, fallback: string) {
  const date = new Date(String(value || ""));
  return Number.isFinite(date.getTime()) ? date.toISOString() : fallback;
}

function clampNumber(value: unknown, fallback: number, min: number, max: number) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.min(Math.max(Math.round(numeric), min), max);
}

function cleanPattern(value: unknown, max = 1200) {
  return String(value || "").slice(0, max);
}

function headerValue(headers: Record<string, string>, name: string) {
  const needle = name.toLowerCase();
  return Object.entries(headers || {}).find(([key]) => key.toLowerCase() === needle)?.[1] || "";
}

function compileRegex(pattern: string) {
  try {
    return new RegExp(pattern, "i");
  } catch {
    return null;
  }
}

function previewAround(text: string, index: number, length: number) {
  const before = Math.max(0, index - 24);
  const after = Math.min(text.length, index + length + 24);
  const prefix = before > 0 ? "..." : "";
  const suffix = after < text.length ? "..." : "";
  return `${prefix}${text.slice(before, after)}${suffix}`.replace(/\s+/g, " ").trim();
}

function scanTextForPositions(
  text: string,
  location: AutomatePayloadLocation,
  existingCount: number,
  headerName?: string
) {
  const positions: AutomatePayloadPosition[] = [];
  const pattern = markerPattern();
  let match = pattern.exec(text);

  while (match && existingCount + positions.length < MAX_AUTOMATE_POSITIONS) {
    const name = match[1];
    const occurrence = positions.length + 1;
    const locationKey = headerName ? `${location}:${headerName}` : location;
    positions.push({
      id: `${locationKey}:${name}:${occurrence}`,
      name,
      location,
      headerName,
      occurrence,
      marker: match[0],
      preview: previewAround(text, match.index, match[0].length)
    });
    match = pattern.exec(text);
  }

  return positions;
}

export function createAutomatePayloadMarker(name: unknown) {
  return `{{payload:${cleanMarkerName(name)}}}`;
}

export function findAutomatePayloadPositions(draft: ReplayDraft) {
  const positions: AutomatePayloadPosition[] = [];
  positions.push(...scanTextForPositions(draft.url, "url", positions.length));

  for (const [headerName, value] of Object.entries(safeJsonHeaders(draft.headers))) {
    if (positions.length >= MAX_AUTOMATE_POSITIONS) {
      break;
    }
    positions.push(...scanTextForPositions(value, "header", positions.length, headerName));
  }

  if (positions.length < MAX_AUTOMATE_POSITIONS) {
    positions.push(...scanTextForPositions(draft.body, "body", positions.length));
  }

  return positions;
}

export function automatePayloadNames(positions: AutomatePayloadPosition[]) {
  return Array.from(new Set(positions.map((position) => position.name))).sort((left, right) =>
    left.localeCompare(right)
  );
}

export function normalizeAutomatePayloads(text: string) {
  return String(text || "")
    .split(/\n/)
    .map((line) => line.replace(/\r$/, "").slice(0, MAX_AUTOMATE_PAYLOAD_LENGTH))
    .filter((line) => line.trim().length > 0)
    .slice(0, MAX_AUTOMATE_PAYLOADS);
}

export function replaceAutomatePayloadMarkers(text: string, assignments: AutomatePayloadAssignments) {
  return text.replace(markerPattern(), (match, name: string) => {
    if (!Object.prototype.hasOwnProperty.call(assignments, name)) {
      return match;
    }
    return assignments[name].slice(0, MAX_AUTOMATE_PAYLOAD_LENGTH);
  });
}

export function materializeAutomateDraft(draft: ReplayDraft, assignments: AutomatePayloadAssignments): ReplayDraft {
  const headers = Object.fromEntries(
    Object.entries(safeJsonHeaders(draft.headers)).map(([name, value]) => [
      name,
      replaceAutomatePayloadMarkers(value, assignments)
    ])
  );

  return normalizeDraft({
    method: draft.method,
    url: replaceAutomatePayloadMarkers(draft.url, assignments),
    headers,
    body: replaceAutomatePayloadMarkers(draft.body, assignments)
  });
}

export function assignmentsForPayload(positions: AutomatePayloadPosition[], payload: string): AutomatePayloadAssignments {
  const clipped = payload.slice(0, MAX_AUTOMATE_PAYLOAD_LENGTH);
  return Object.fromEntries(automatePayloadNames(positions).map((name) => [name, clipped]));
}

export function insertAutomatePayloadMarker(
  draft: ReplayDraft,
  location: AutomatePayloadLocation,
  name: unknown,
  headerName?: string
) {
  const markerName = cleanMarkerName(name);
  const marker = createAutomatePayloadMarker(markerName);

  if (location === "url") {
    const baseUrl = draft.url.trim() || DEFAULT_URL;
    const separator = baseUrl.includes("?") ? (/[?&]$/.test(baseUrl) ? "" : "&") : "?";
    return {
      ...draft,
      url: `${baseUrl}${separator}${encodeURIComponent(markerName)}=${marker}`
    };
  }

  if (location === "header") {
    const normalizedHeaderName = cleanMarkerName(headerName || "X-Radar-Payload");
    return {
      ...draft,
      headers: {
        ...safeJsonHeaders(draft.headers),
        [normalizedHeaderName]: marker
      }
    };
  }

  return {
    ...draft,
    body: draft.body ? `${draft.body}\n${marker}` : marker
  };
}

export function normalizeAutomatePayloadSet(input: unknown, fallbackNow = nowIso()): AutomatePayloadSet | null {
  const value = objectValue(input);
  const payloads = Array.isArray(value.payloads)
    ? value.payloads
        .map((payload) => String(payload ?? "").slice(0, MAX_AUTOMATE_PAYLOAD_LENGTH))
        .filter((payload) => payload.trim().length > 0)
        .slice(0, MAX_AUTOMATE_PAYLOADS)
    : normalizeAutomatePayloads(String(value.payloadText || ""));
  const source: AutomatePayloadSetSource = value.source === "wordlist" ? "wordlist" : "inline";
  const wordlistPath = String(value.wordlistPath || "").trim().slice(0, 600);

  if (payloads.length === 0 && source !== "wordlist") {
    return null;
  }

  const createdAt = cleanIso(value.createdAt, fallbackNow);
  const updatedAt = cleanIso(value.updatedAt, fallbackNow);
  const set: AutomatePayloadSet = {
    id: cleanId(value.id, "payload_set"),
    name: cleanName(value.name, source === "wordlist" ? "Wordlist reference" : "Payload set"),
    source,
    payloads,
    createdAt,
    updatedAt
  };
  if (wordlistPath) {
    set.wordlistPath = wordlistPath;
  }
  return set;
}

export function normalizeAutomatePayloadSets(input: unknown, fallbackNow = nowIso()) {
  const values = Array.isArray(input) ? input : [];
  const seen = new Set<string>();
  const sets: AutomatePayloadSet[] = [];

  for (const entry of values) {
    const normalized = normalizeAutomatePayloadSet(entry, fallbackNow);
    if (!normalized || seen.has(normalized.id)) {
      continue;
    }
    seen.add(normalized.id);
    sets.push(normalized);
    if (sets.length >= MAX_AUTOMATE_PAYLOAD_SETS) {
      break;
    }
  }

  return sets;
}

export function createAutomatePayloadSet(input: {
  name?: string;
  payloads?: string[];
  payloadText?: string;
  source?: AutomatePayloadSetSource;
  wordlistPath?: string;
}) {
  const createdAt = nowIso();
  return normalizeAutomatePayloadSet(
    {
      ...input,
      id: cleanId("", "payload_set"),
      createdAt,
      updatedAt: createdAt
    },
    createdAt
  );
}

export function normalizeAutomateLimits(input: unknown): AutomateLimits {
  const value = objectValue(input);
  return {
    count: clampNumber(value.count, 10, 1, MAX_AUTOMATE_COUNT),
    concurrency: clampNumber(value.concurrency, 1, 1, MAX_AUTOMATE_CONCURRENCY),
    delayMs: clampNumber(value.delayMs, 0, 0, MAX_AUTOMATE_DELAY_MS),
    timeoutMs: clampNumber(value.timeoutMs, MAX_AUTOMATE_TIMEOUT_MS, 1000, MAX_AUTOMATE_TIMEOUT_MS)
  };
}

function normalizeRuleKind(value: unknown): AutomateRuleKind {
  return value === "extract" ? "extract" : "match";
}

function normalizeRuleTarget(value: unknown): AutomateRuleTarget {
  const target = String(value || "");
  if (
    target === "status" ||
    target === "header" ||
    target === "body" ||
    target === "regex" ||
    target === "redirect" ||
    target === "length" ||
    target === "latency"
  ) {
    return target;
  }
  return "body";
}

export function normalizeAutomateRule(input: unknown, fallbackNow = nowIso()): AutomateRule | null {
  const value = objectValue(input);
  const kind = normalizeRuleKind(value.kind);
  const target = normalizeRuleTarget(value.target);
  const pattern = cleanPattern(value.pattern);
  const headerName = cleanName(value.headerName, "", 120);
  const createdAt = cleanIso(value.createdAt, fallbackNow);
  const updatedAt = cleanIso(value.updatedAt, fallbackNow);
  const rule: AutomateRule = {
    id: cleanId(value.id, "automate_rule"),
    name: cleanName(value.name, kind === "extract" ? "Extract" : "Match"),
    enabled: value.enabled !== false,
    kind,
    target,
    createdAt,
    updatedAt
  };

  if (pattern) {
    rule.pattern = pattern;
  }
  if (headerName) {
    rule.headerName = headerName;
  }

  if (target === "status") {
    const status = clampNumber(value.status ?? value.pattern, 0, 0, 599);
    if (status === 0) {
      return null;
    }
    rule.status = status;
  }

  if (target === "length" || target === "latency") {
    const min = Number(value.min);
    const max = Number(value.max);
    if (Number.isFinite(min)) {
      rule.min = Math.max(0, Math.round(min));
    }
    if (Number.isFinite(max)) {
      rule.max = Math.max(0, Math.round(max));
    }
    if (typeof rule.min !== "number" && typeof rule.max !== "number") {
      return null;
    }
  }

  if (target === "header" && !rule.headerName) {
    return null;
  }

  if ((target === "body" || target === "header" || target === "redirect" || target === "regex") && !rule.pattern) {
    return null;
  }

  if (kind === "extract" && (target === "status" || target === "length" || target === "latency")) {
    return null;
  }

  if ((target === "regex" || kind === "extract") && rule.pattern && !compileRegex(rule.pattern)) {
    return null;
  }

  return rule;
}

export function normalizeAutomateRules(input: unknown, fallbackNow = nowIso()) {
  const values = Array.isArray(input) ? input : [];
  const rules: AutomateRule[] = [];
  const seen = new Set<string>();

  for (const entry of values) {
    const normalized = normalizeAutomateRule(entry, fallbackNow);
    if (!normalized || seen.has(normalized.id)) {
      continue;
    }
    seen.add(normalized.id);
    rules.push(normalized);
    if (rules.length >= MAX_AUTOMATE_RULES) {
      break;
    }
  }

  return rules;
}

function textForRuleTarget(result: AutomateRuleEvaluationInput, rule: AutomateRule) {
  if (rule.target === "header") {
    return headerValue(result.headers, rule.headerName || "");
  }
  if (rule.target === "redirect") {
    return result.redirect;
  }
  return result.bodyPreview;
}

function numericForRuleTarget(result: AutomateRuleEvaluationInput, rule: AutomateRule) {
  if (rule.target === "length") {
    return result.length;
  }
  if (rule.target === "latency") {
    return result.latencyMs;
  }
  return 0;
}

function evaluateRule(result: AutomateRuleEvaluationInput, rule: AutomateRule): {
  matched: AutomateResultMarker | null;
  extracts: AutomateExtract[];
} {
  if (!rule.enabled) {
    return { matched: null, extracts: [] };
  }

  if (rule.target === "status") {
    return result.status === rule.status
      ? { matched: { ruleId: rule.id, name: rule.name, kind: rule.kind }, extracts: [] }
      : { matched: null, extracts: [] };
  }

  if (rule.target === "length" || rule.target === "latency") {
    const numeric = numericForRuleTarget(result, rule);
    const passesMin = typeof rule.min !== "number" || numeric >= rule.min;
    const passesMax = typeof rule.max !== "number" || numeric <= rule.max;
    return passesMin && passesMax
      ? { matched: { ruleId: rule.id, name: rule.name, kind: rule.kind }, extracts: [] }
      : { matched: null, extracts: [] };
  }

  const text = textForRuleTarget(result, rule);
  if (!rule.pattern) {
    return { matched: null, extracts: [] };
  }

  if (rule.target === "regex" || rule.kind === "extract") {
    const regex = compileRegex(rule.pattern);
    if (!regex) {
      return { matched: null, extracts: [] };
    }
    const match = regex.exec(text);
    if (!match) {
      return { matched: null, extracts: [] };
    }
    const extracts =
      rule.kind === "extract"
        ? Object.entries(match.groups || {}).map(([name, value]) => ({
            ruleId: rule.id,
            name: `${rule.name}.${name}`,
            value: String(value).slice(0, 1200)
          }))
        : [];
    if (rule.kind === "extract" && extracts.length === 0) {
      extracts.push({
        ruleId: rule.id,
        name: rule.name,
        value: String(match[1] || match[0] || "").slice(0, 1200)
      });
    }
    return { matched: { ruleId: rule.id, name: rule.name, kind: rule.kind }, extracts };
  }

  const matched = text.toLowerCase().includes(rule.pattern.toLowerCase());
  return matched
    ? { matched: { ruleId: rule.id, name: rule.name, kind: rule.kind }, extracts: [] }
    : { matched: null, extracts: [] };
}

export function evaluateAutomateRules(result: AutomateRuleEvaluationInput, rules: AutomateRule[]) {
  const matchedRules: AutomateResultMarker[] = [];
  const extracts: AutomateExtract[] = [];
  for (const rule of rules) {
    const evaluation = evaluateRule(result, rule);
    if (evaluation.matched) {
      matchedRules.push(evaluation.matched);
    }
    extracts.push(...evaluation.extracts);
  }
  return { matchedRules, extracts };
}

export function responseWordCount(text: string) {
  const words = String(text || "").trim().match(/\S+/g);
  return words ? words.length : 0;
}

export function redirectLocation(headers: Record<string, string>) {
  return headerValue(headers, "location");
}

function simpleHash(value: string) {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 33) ^ value.charCodeAt(index);
  }
  return (hash >>> 0).toString(36);
}

function statusFamily(status: number) {
  return status > 0 ? `${Math.floor(status / 100)}xx` : "error";
}

function lengthBand(length: number) {
  if (length < 200) {
    return "tiny";
  }
  if (length < 2000) {
    return "small";
  }
  if (length < 20_000) {
    return "medium";
  }
  return "large";
}

export function automateResultFingerprint(result: AutomateResult) {
  const normalizedBody = result.bodyPreview
    .replace(/\d+/g, "0")
    .replace(/[a-f0-9]{16,}/gi, "hash")
    .replace(/\s+/g, " ")
    .slice(0, 800);
  const headerKeys = Object.keys(result.headers || {})
    .map((key) => key.toLowerCase())
    .sort()
    .slice(0, 16)
    .join(",");
  return `${statusFamily(result.status)}:${lengthBand(result.length)}:${simpleHash(headerKeys)}:${simpleHash(normalizedBody)}`;
}

export function clusterAutomateResults(results: AutomateResult[]) {
  const buckets = new Map<string, AutomateResult[]>();
  for (const result of results) {
    const fingerprint = automateResultFingerprint(result);
    const bucket = buckets.get(fingerprint) || [];
    bucket.push(result);
    buckets.set(fingerprint, bucket);
  }

  const clusters: AutomateCluster[] = [];
  const clusterIds = new Map<string, string>();
  Array.from(buckets.entries())
    .sort((left, right) => right[1].length - left[1].length || left[0].localeCompare(right[0]))
    .forEach(([fingerprint, bucket], index) => {
      const representative = bucket[0];
      const id = `cluster-${index + 1}`;
      clusterIds.set(fingerprint, id);
      clusters.push({
        id,
        fingerprint,
        statusFamily: statusFamily(representative.status),
        count: bucket.length,
        representativeResultId: representative.id,
        averageLength: Math.round(bucket.reduce((sum, item) => sum + item.length, 0) / bucket.length),
        averageLatencyMs: Math.round(bucket.reduce((sum, item) => sum + item.latencyMs, 0) / bucket.length),
        labels: Array.from(new Set(bucket.flatMap((item) => item.matchedRules.map((marker) => marker.name)))).slice(0, 6)
      });
    });

  return {
    clusters,
    results: results.map((result) => ({
      ...result,
      clusterId: clusterIds.get(automateResultFingerprint(result))
    }))
  };
}

export function automateResultFromReplay(input: {
  id: string;
  index: number;
  createdAt?: string;
  payload: string;
  request: ReplayDraft;
  response: ReplayResult;
  rules?: AutomateRule[];
}): AutomateResult {
  const bodyPreview = String(input.response.body || "").slice(0, MAX_AUTOMATE_RESPONSE_PREVIEW);
  const evaluationInput = {
    status: input.response.status,
    redirect: redirectLocation(input.response.headers),
    length: input.response.bytes,
    latencyMs: input.response.durationMs,
    headers: input.response.headers,
    bodyPreview
  };
  const evaluated = evaluateAutomateRules(evaluationInput, input.rules || []);
  return {
    id: input.id,
    index: input.index,
    createdAt: input.createdAt || nowIso(),
    payload: input.payload.slice(0, MAX_AUTOMATE_PAYLOAD_LENGTH),
    request: normalizeDraft(input.request),
    ok: input.response.ok,
    status: input.response.status,
    statusText: input.response.statusText,
    redirect: evaluationInput.redirect || undefined,
    length: input.response.bytes,
    latencyMs: input.response.durationMs,
    wordCount: responseWordCount(bodyPreview),
    headers: safeJsonHeaders(input.response.headers),
    bodyPreview,
    matchedRules: evaluated.matchedRules,
    extracts: evaluated.extracts
  };
}

export function automateErrorResult(input: {
  id: string;
  index: number;
  createdAt?: string;
  payload: string;
  request: ReplayDraft;
  error: string;
  rules?: AutomateRule[];
}): AutomateResult {
  const bodyPreview = "";
  const evaluated = evaluateAutomateRules(
    { status: 0, redirect: "", length: 0, latencyMs: 0, headers: {}, bodyPreview },
    input.rules || []
  );
  return {
    id: input.id,
    index: input.index,
    createdAt: input.createdAt || nowIso(),
    payload: input.payload.slice(0, MAX_AUTOMATE_PAYLOAD_LENGTH),
    request: normalizeDraft(input.request),
    ok: false,
    status: 0,
    statusText: "Error",
    error: input.error.slice(0, 1000),
    length: 0,
    latencyMs: 0,
    wordCount: 0,
    headers: {},
    bodyPreview,
    matchedRules: evaluated.matchedRules,
    extracts: evaluated.extracts
  };
}

function normalizeAutomatePosition(input: unknown): AutomatePayloadPosition | null {
  const value = objectValue(input);
  const name = cleanMarkerName(value.name);
  const location = value.location === "header" || value.location === "body" ? value.location : "url";
  return {
    id: cleanId(value.id, "position"),
    name,
    location,
    headerName: typeof value.headerName === "string" && value.headerName.trim() ? value.headerName.trim().slice(0, 120) : undefined,
    occurrence: clampNumber(value.occurrence, 1, 1, MAX_AUTOMATE_POSITIONS),
    marker: String(value.marker || createAutomatePayloadMarker(name)).slice(0, 120),
    preview: String(value.preview || "").replace(/\s+/g, " ").slice(0, 200)
  };
}

function normalizeAutomateResult(input: unknown): AutomateResult | null {
  const value = objectValue(input);
  const request = normalizeDraft(objectValue(value.request));
  const createdAt = cleanIso(value.createdAt, nowIso());
  return {
    id: cleanId(value.id, "automate_result"),
    index: clampNumber(value.index, 1, 1, MAX_AUTOMATE_PAYLOADS),
    createdAt,
    payload: String(value.payload || "").slice(0, MAX_AUTOMATE_PAYLOAD_LENGTH),
    request,
    ok: Boolean(value.ok),
    status: clampNumber(value.status, 0, 0, 599),
    statusText: String(value.statusText || "").slice(0, 120),
    error: typeof value.error === "string" && value.error ? value.error.slice(0, 1000) : undefined,
    redirect: typeof value.redirect === "string" && value.redirect ? value.redirect.slice(0, 1200) : undefined,
    length: clampNumber(value.length, 0, 0, Number.MAX_SAFE_INTEGER),
    latencyMs: clampNumber(value.latencyMs, 0, 0, Number.MAX_SAFE_INTEGER),
    wordCount: clampNumber(value.wordCount, 0, 0, Number.MAX_SAFE_INTEGER),
    headers: safeJsonHeaders(objectValue(value.headers)),
    bodyPreview: String(value.bodyPreview || "").slice(0, MAX_AUTOMATE_RESPONSE_PREVIEW),
    matchedRules: Array.isArray(value.matchedRules)
      ? value.matchedRules
          .map((marker) => {
            const item = objectValue(marker);
            const ruleId = String(item.ruleId || "").trim();
            if (!ruleId) {
              return null;
            }
            return {
              ruleId,
              name: cleanName(item.name, "Match"),
              kind: normalizeRuleKind(item.kind)
            };
          })
          .filter((marker): marker is AutomateResultMarker => Boolean(marker))
      : [],
    extracts: Array.isArray(value.extracts)
      ? value.extracts
          .map((extract) => {
            const item = objectValue(extract);
            const ruleId = String(item.ruleId || "").trim();
            if (!ruleId) {
              return null;
            }
            return {
              ruleId,
              name: cleanName(item.name, "Extract"),
              value: String(item.value || "").slice(0, 1200)
            };
          })
          .filter((extract): extract is AutomateExtract => Boolean(extract))
      : [],
    clusterId: typeof value.clusterId === "string" && value.clusterId ? value.clusterId.slice(0, 120) : undefined
  };
}

export function createAutomateSession(input: {
  name?: string;
  draft: ReplayDraft;
  environmentId?: string;
  payloadSetId?: string;
  payloads: string[];
  positions?: AutomatePayloadPosition[];
  limits?: Partial<AutomateLimits>;
  rules?: AutomateRule[];
}) {
  const createdAt = nowIso();
  const draft = normalizeDraft(input.draft);
  const positions = (input.positions && input.positions.length > 0 ? input.positions : findAutomatePayloadPositions(draft)).slice(
    0,
    MAX_AUTOMATE_POSITIONS
  );
  const limits = normalizeAutomateLimits(input.limits || {});
  const payloads = input.payloads
    .map((payload) => String(payload || "").slice(0, MAX_AUTOMATE_PAYLOAD_LENGTH))
    .filter((payload) => payload.trim().length > 0)
    .slice(0, limits.count);
  return normalizeAutomateSession(
    {
      id: cleanId("", "automate_session"),
      name: input.name || "Automate run",
      createdAt,
      updatedAt: createdAt,
      status: "ready",
      draft,
      environmentId: input.environmentId || "",
      payloadSetId: input.payloadSetId || undefined,
      payloads,
      positions,
      limits,
      rules: input.rules || [],
      results: [],
      clusters: []
    },
    createdAt
  );
}

export function normalizeAutomateSession(input: unknown, fallbackNow = nowIso()): AutomateSession | null {
  const value = objectValue(input);
  const draft = normalizeDraft(objectValue(value.draft));
  const limits = normalizeAutomateLimits(value.limits);
  const payloads = (Array.isArray(value.payloads) ? value.payloads : [])
    .map((payload) => String(payload || "").slice(0, MAX_AUTOMATE_PAYLOAD_LENGTH))
    .filter((payload) => payload.trim().length > 0)
    .slice(0, MAX_AUTOMATE_PAYLOADS);
  const positions = (Array.isArray(value.positions) ? value.positions : [])
    .map(normalizeAutomatePosition)
    .filter((position): position is AutomatePayloadPosition => Boolean(position))
    .slice(0, MAX_AUTOMATE_POSITIONS);
  const rules = normalizeAutomateRules(value.rules, fallbackNow);
  const results = (Array.isArray(value.results) ? value.results : [])
    .map(normalizeAutomateResult)
    .filter((result): result is AutomateResult => Boolean(result))
    .slice(0, MAX_AUTOMATE_PAYLOADS);
  const clustered = clusterAutomateResults(results);
  const status = String(value.status || "ready");
  const normalizedStatus =
    status === "running" ||
    status === "paused" ||
    status === "stopped" ||
    status === "completed" ||
    status === "failed"
      ? status
      : "ready";
  const createdAt = cleanIso(value.createdAt, fallbackNow);
  const updatedAt = cleanIso(value.updatedAt, fallbackNow);
  const session: AutomateSession = {
    id: cleanId(value.id, "automate_session"),
    name: cleanName(value.name, "Automate run"),
    createdAt,
    updatedAt,
    status: normalizedStatus,
    draft,
    environmentId: String(value.environmentId || "").trim().slice(0, 120),
    payloadSetId: typeof value.payloadSetId === "string" && value.payloadSetId.trim() ? value.payloadSetId.trim().slice(0, 120) : undefined,
    payloads: payloads.slice(0, limits.count),
    positions,
    limits,
    rules,
    results: clustered.results,
    clusters: clustered.clusters,
    error: typeof value.error === "string" && value.error ? value.error.slice(0, 1000) : undefined
  };

  if (session.positions.length === 0 && session.results.length === 0) {
    session.positions = findAutomatePayloadPositions(session.draft);
  }

  return session;
}

export function summarizeAutomateSession(session: AutomateSession) {
  const failures = session.results.filter((result) => !result.ok || result.status >= 400 || result.error).length;
  const matches = session.results.filter((result) => result.matchedRules.length > 0 || result.extracts.length > 0).length;
  const outlierClusters = session.clusters.filter((cluster) => cluster.count === 1).map((cluster) => cluster.id);
  return {
    id: session.id,
    name: session.name,
    status: session.status,
    payloadCount: session.payloads.length,
    resultCount: session.results.length,
    failures,
    matches,
    clusterCount: session.clusters.length,
    outlierClusters,
    latestResult: session.results.at(-1) || null
  };
}
