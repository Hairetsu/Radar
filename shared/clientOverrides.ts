import { MAX_CAPTURED_BODY } from "./text.js";
import type { CapturedRequest, ClientOverride, ClientOverrideSummary, MatchReplaceHit } from "./domain.js";

export const MAX_CLIENT_OVERRIDES = 20;

const MAX_NAME = 80;
const MAX_HOST = 240;
const MAX_PATH = 400;
const MAX_MIME = 120;
const CLIENT_PATH_PATTERN = /\.(html?|jsx?|tsx?|mjs|cjs|css|json|svg|xml)$/i;
const CLIENT_MIME_PATTERN = /(javascript|ecmascript|typescript|html|css|json|xml|svg)/i;
const DROP_CACHE_HEADERS = new Set(["etag", "last-modified", "content-length", "age", "expires"]);

function cleanText(value: unknown, max = 80) {
  return String(value || "").trim().slice(0, max);
}

function pathnameOf(url: string, fallbackPath: string) {
  try {
    return new URL(url).pathname || "/";
  } catch {
    const path = String(fallbackPath || "/").split("?")[0];
    return path || "/";
  }
}

function hostOf(url: string, fallbackHost: string) {
  try {
    return new URL(url).host;
  } catch {
    return String(fallbackHost || "").trim();
  }
}

export function isOverridableClientCapture(capture: CapturedRequest) {
  const path = pathnameOf(capture.url, capture.path);
  const mime = String(capture.mimeType || "").toLowerCase();
  return CLIENT_PATH_PATTERN.test(path) || CLIENT_MIME_PATTERN.test(mime);
}

export function summarizeClientOverride(override: ClientOverride): ClientOverrideSummary {
  const { body, ...rest } = override;
  return { ...rest, bodyChars: body.length };
}

export function clientOverrideFromCapture(
  capture: CapturedRequest,
  now = new Date().toISOString()
): ClientOverride | null {
  if (!isOverridableClientCapture(capture)) {
    return null;
  }
  const host = hostOf(capture.url, capture.host);
  const path = pathnameOf(capture.url, capture.path);
  if (!host || !path) {
    return null;
  }
  const fileName = path.split("/").filter(Boolean).at(-1) || path;
  return {
    id: `client-${capture.id}`.slice(0, 80),
    name: cleanText(fileName, MAX_NAME) || "Client file",
    enabled: true,
    host,
    path,
    mimeType: cleanText(capture.mimeType, MAX_MIME),
    body: String(capture.responseBody || "").slice(0, MAX_CAPTURED_BODY),
    captureId: cleanText(capture.id, 80),
    relaxApplied: false,
    createdAt: now,
    updatedAt: now
  };
}

export function normalizeClientOverride(
  input: Partial<ClientOverride>,
  fallbackId: string,
  now: string
): ClientOverride | null {
  const name = cleanText(input.name, MAX_NAME);
  const host = cleanText(input.host, MAX_HOST).toLowerCase();
  const path = cleanText(input.path, MAX_PATH) || "/";
  if (!name || !host) {
    return null;
  }
  return {
    id: cleanText(input.id, 80) || fallbackId,
    name,
    enabled: input.enabled !== false,
    host,
    path: path.startsWith("/") ? path : `/${path}`,
    mimeType: cleanText(input.mimeType, MAX_MIME),
    body: String(input.body || "").slice(0, MAX_CAPTURED_BODY),
    captureId: cleanText(input.captureId, 80),
    relaxApplied: input.relaxApplied === true,
    createdAt: cleanText(input.createdAt) || now,
    updatedAt: now
  };
}

export function normalizeClientOverrides(input: unknown, now = new Date().toISOString()) {
  if (!Array.isArray(input)) {
    return [];
  }
  const seen = new Set<string>();
  const next: ClientOverride[] = [];
  for (const [index, item] of input.slice(0, MAX_CLIENT_OVERRIDES).entries()) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      continue;
    }
    const override = normalizeClientOverride(item as Partial<ClientOverride>, `client-${index + 1}`, now);
    if (!override) {
      continue;
    }
    const key = `${override.host}${override.path}`;
    if (seen.has(key)) {
      const existing = next.findIndex((entry) => `${entry.host}${entry.path}` === key);
      if (existing >= 0) {
        next[existing] = override;
      }
      continue;
    }
    seen.add(key);
    next.push(override);
  }
  return next;
}

function replaceAll(value: string, pattern: RegExp, replacement: string) {
  const next = value.replace(pattern, replacement);
  return { value: next, changed: next !== value };
}

export function relaxClientValidation(body: string) {
  const changes: string[] = [];
  let next = body;

  const htmlConstraints = replaceAll(
    next,
    /\s+(?:required(?=[\s>/])|(?:pattern|minlength|maxlength)=(?:"[^"]*"|'[^']*'|[^\s>]+))/gi,
    ""
  );
  if (htmlConstraints.changed) {
    next = htmlConstraints.value;
    changes.push("Removed HTML required, pattern, and length attributes");
  }

  const forms = replaceAll(next, /<form\b(?![^>]*\bnovalidate\b)/gi, "<form noValidate");
  if (forms.changed) {
    next = forms.value;
    changes.push("Added noValidate to forms");
  }

  const jsxLength = replaceAll(next, /\b(?:max|min)Length\s*[:=]\s*\{?\s*\d+\s*\}?/g, "");
  if (jsxLength.changed) {
    next = jsxLength.value;
    changes.push("Removed maxLength and minLength constraints");
  }

  const validators = replaceAll(next, /return\s+invalid\s*\((?:[^()]|\([^()]*\))*\)/g, "return valid()");
  if (validators.changed) {
    next = validators.value;
    changes.push("Passed client validator returns");
  }

  return { body: next, changes };
}

function bustClientCacheHeaders(headers: Record<string, string>) {
  const next: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (DROP_CACHE_HEADERS.has(key.toLowerCase()) || key.toLowerCase() === "cache-control" || key.toLowerCase() === "pragma") {
      continue;
    }
    next[key] = value;
  }
  next["Cache-Control"] = "no-store";
  next.Pragma = "no-cache";
  return next;
}

export function clientOverrideMatches(override: ClientOverride, capture: CapturedRequest) {
  if (!override.enabled) {
    return false;
  }
  const host = hostOf(capture.url, capture.host).toLowerCase();
  const path = pathnameOf(capture.url, capture.path);
  return override.host.toLowerCase() === host && override.path === path;
}

export function applyClientOverrides(
  overrides: ClientOverride[],
  capture: CapturedRequest
): { capture: CapturedRequest; hits: MatchReplaceHit[]; changed: boolean } {
  if (!capture.allowed) {
    return { capture, hits: [], changed: false };
  }
  const override = overrides.find((item) => clientOverrideMatches(item, capture));
  if (!override) {
    return { capture, hits: [], changed: false };
  }
  const headers = bustClientCacheHeaders(capture.responseHeaders);
  const hits: MatchReplaceHit[] = [
    {
      ruleId: override.id,
      name: override.name,
      stage: "response",
      target: "body",
      detail: `client-file: ${override.host}${override.path}`
    }
  ];
  return {
    capture: {
      ...capture,
      responseBody: override.body,
      responseHeaders: headers,
      rewrites: [...(capture.rewrites || []), ...hits]
    },
    hits,
    changed: true
  };
}
