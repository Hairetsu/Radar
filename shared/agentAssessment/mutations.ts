import type { ReplayDraft } from "../domain.js";
import { MAX_MUTATION_VALUE_BYTES } from "./constants.js";
import type { EncodingStep, ProbeMutation } from "./types.js";

function hashValue(value: string) {
  let first = 2_166_136_261;
  let second = 2_166_136_261 ^ 0x9e3779b9;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    first = Math.imul(first ^ code, 16_777_619);
    second = Math.imul(second ^ (code + index), 16_777_619);
  }
  return `h1:${(first >>> 0).toString(16).padStart(8, "0")}${(second >>> 0).toString(16).padStart(8, "0")}`;
}

function utf8Bytes(value: string) {
  return unescape(encodeURIComponent(value));
}

function encodeBase64(value: string) {
  return btoa(utf8Bytes(value));
}

export function applyEncodingChain(value: string, encoding: EncodingStep[] = []) {
  return encoding.reduce((current, step) => {
    switch (step) {
      case "url":
        return encodeURIComponent(current);
      case "json-escape":
        return JSON.stringify(current).slice(1, -1);
      case "base64":
        return encodeBase64(current);
      case "case-variation":
        return current === current.toUpperCase() ? current.toLowerCase() : current.toUpperCase();
      default: {
        const _exhaustive: never = step;
        return _exhaustive;
      }
    }
  }, value);
}

function headerKey(headers: Record<string, string>, name: string) {
  const lower = name.toLowerCase();
  return Object.keys(headers).find((key) => key.toLowerCase() === lower) || name;
}

function cloneDraft(draft: ReplayDraft): ReplayDraft {
  return {
    method: draft.method,
    url: draft.url,
    headers: { ...draft.headers },
    body: draft.body
  };
}

function parsedUrl(draft: ReplayDraft) {
  return new URL(draft.url);
}

function setJsonPath(value: unknown, path: string, next: string): unknown {
  const parts = path.split(".").filter(Boolean);
  if (parts.length === 0) {
    return next;
  }
  const [head, ...rest] = parts;
  const index = /^\[(\d+)\]$/.test(head) ? Number(RegExp.$1) : /^\d+$/.test(head) ? Number(head) : -1;
  if (Array.isArray(value) && index >= 0) {
    const copy = [...value];
    copy[index] = rest.length === 0 ? next : setJsonPath(copy[index], rest.join("."), next);
    return copy;
  }
  const record = value && typeof value === "object" && !Array.isArray(value) ? { ...(value as Record<string, unknown>) } : {};
  record[head] = rest.length === 0 ? next : setJsonPath(record[head], rest.join("."), next);
  return record;
}

function readJsonPath(value: unknown, path: string): string {
  const parts = path.split(".").filter(Boolean);
  let current: unknown = value;
  for (const part of parts) {
    if (current == null || typeof current !== "object") {
      return "";
    }
    const index = /^\d+$/.test(part) ? Number(part) : -1;
    current = Array.isArray(current) && index >= 0 ? current[index] : (current as Record<string, unknown>)[part];
  }
  return current == null ? "" : String(current);
}

function cookieMap(header: string) {
  const entries = header
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part): [string, string] => {
      const index = part.indexOf("=");
      return index === -1 ? [part, ""] : [part.slice(0, index), part.slice(index + 1)];
    });
  return new Map(entries);
}

export function readMutationValue(draft: ReplayDraft, mutation: ProbeMutation): string {
  try {
    switch (mutation.kind) {
      case "replace-query":
      case "remove-query":
      case "append-query":
        return parsedUrl(draft).searchParams.get(mutation.name) || "";
      case "replace-json":
        return readJsonPath(JSON.parse(draft.body || "{}"), mutation.path);
      case "replace-form":
        return new URLSearchParams(draft.body).get(mutation.name) || "";
      case "replace-header":
        return draft.headers[headerKey(draft.headers, mutation.name)] || "";
      case "replace-cookie":
        return cookieMap(draft.headers[headerKey(draft.headers, "Cookie")] || "").get(mutation.name) || "";
      case "replace-path-segment": {
        const segments = parsedUrl(draft).pathname.split("/").filter(Boolean);
        return segments[mutation.index] || "";
      }
      case "remove-authorization":
        return draft.headers[headerKey(draft.headers, "Authorization")] || draft.headers[headerKey(draft.headers, "Cookie")] || "";
      case "set-origin":
        return draft.headers[headerKey(draft.headers, "Origin")] || "";
      case "set-host":
        return draft.headers[headerKey(draft.headers, "Host")] || new URL(draft.url).host;
      case "set-method":
        return draft.method;
      default: {
        const _exhaustive: never = mutation;
        return _exhaustive;
      }
    }
  } catch {
    return "";
  }
}

export function applyProbeMutation(draft: ReplayDraft, mutation: ProbeMutation): ReplayDraft {
  const next = cloneDraft(draft);
  switch (mutation.kind) {
    case "replace-query":
    case "remove-query":
    case "append-query": {
      const url = parsedUrl(next);
      if (mutation.kind === "remove-query") {
        url.searchParams.delete(mutation.name);
      } else if (mutation.kind === "append-query") {
        url.searchParams.append(mutation.name, applyEncodingChain(mutation.value, mutation.encoding));
      } else {
        url.searchParams.set(mutation.name, applyEncodingChain(mutation.value, mutation.encoding));
      }
      next.url = url.toString();
      return next;
    }
    case "replace-json": {
      const parsed = JSON.parse(next.body || "{}") as unknown;
      next.body = JSON.stringify(setJsonPath(parsed, mutation.path, applyEncodingChain(mutation.value, mutation.encoding)));
      return next;
    }
    case "replace-form": {
      const params = new URLSearchParams(next.body);
      params.set(mutation.name, applyEncodingChain(mutation.value, mutation.encoding));
      next.body = params.toString();
      return next;
    }
    case "replace-header": {
      const key = headerKey(next.headers, mutation.name);
      next.headers[key] = applyEncodingChain(mutation.value, mutation.encoding);
      return next;
    }
    case "replace-cookie": {
      const key = headerKey(next.headers, "Cookie");
      const cookies = cookieMap(next.headers[key] || "");
      cookies.set(mutation.name, applyEncodingChain(mutation.value, mutation.encoding));
      next.headers[key] = [...cookies.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
      return next;
    }
    case "replace-path-segment": {
      const url = parsedUrl(next);
      const leading = url.pathname.startsWith("/");
      const segments = url.pathname.split("/").filter(Boolean);
      if (mutation.index < 0 || mutation.index >= segments.length) {
        throw new Error("Path segment index is outside the captured path.");
      }
      segments[mutation.index] = applyEncodingChain(mutation.value, mutation.encoding);
      url.pathname = `${leading ? "/" : ""}${segments.join("/")}`;
      next.url = url.toString();
      return next;
    }
    case "remove-authorization": {
      for (const name of ["Authorization", "Cookie", "X-Api-Key", "X-Auth-Token"]) {
        const key = headerKey(next.headers, name);
        delete next.headers[key];
      }
      return next;
    }
    case "set-origin": {
      next.headers[headerKey(next.headers, "Origin")] = mutation.value;
      return next;
    }
    case "set-host": {
      next.headers[headerKey(next.headers, "Host")] = mutation.value;
      return next;
    }
    case "set-method": {
      next.method = mutation.value.toUpperCase();
      if (next.method === "GET" || next.method === "HEAD") {
        next.body = "";
      }
      return next;
    }
    default: {
      const _exhaustive: never = mutation;
      return _exhaustive;
    }
  }
}

export function mutationPayloadBytes(mutation: ProbeMutation) {
  const payload = "value" in mutation ? mutation.value : "";
  return Math.min(MAX_MUTATION_VALUE_BYTES, utf8Bytes(payload).length);
}

export function originalValueHash(draft: ReplayDraft, mutation: ProbeMutation) {
  return hashValue(readMutationValue(draft, mutation));
}

export function originStayedFixed(before: ReplayDraft, after: ReplayDraft) {
  try {
    return new URL(before.url).origin === new URL(after.url).origin;
  } catch {
    return false;
  }
}
