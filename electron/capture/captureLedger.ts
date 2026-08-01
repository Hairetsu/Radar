import type { CapturedRequest } from "../../shared/domain.js";
import {
  applyCaptureAttribution,
  type CaptureAttributionContext
} from "../captureAttribution.js";

export const HOT_CAPTURE_LIMIT = 500;

const CAPTURE_SESSION_ID = Symbol("captureSessionId");
type SessionBoundCapture = CapturedRequest & { [CAPTURE_SESSION_ID]?: string };

type CaptureLedgerOptions = {
  currentSessionId: () => string;
  attribution: () => CaptureAttributionContext;
  persist: (sessionId: string, capture: CapturedRequest) => void;
  load: (sessionId: string, limit: number) => CapturedRequest[] | null;
  deletePersisted: (sessionId: string, captureId: string) => void;
  clearPersisted: (sessionId: string) => void;
};

export function createCaptureLedger({
  currentSessionId,
  attribution,
  persist,
  load,
  deletePersisted,
  clearPersisted
}: CaptureLedgerOptions) {
  const captures = new Map<string, CapturedRequest>();
  const sessionIds = new Map<string, string>();
  let lastChangeAt = Date.now();

  function bindEntryToSession(entry: CapturedRequest, sessionId: string) {
    if (!entry.id || !sessionId) return entry;
    (entry as SessionBoundCapture)[CAPTURE_SESSION_ID] = sessionId;
    if (!sessionIds.has(entry.id)) sessionIds.set(entry.id, sessionId);
    return entry;
  }

  function bindToCurrentSession(captureId: string) {
    const sessionId = currentSessionId();
    if (captureId && sessionId && !sessionIds.has(captureId)) {
      sessionIds.set(captureId, sessionId);
    }
  }

  function remember(input: CapturedRequest) {
    const activeSessionId = currentSessionId();
    const explicitSessionId = (input as SessionBoundCapture)[CAPTURE_SESSION_ID] || "";
    const boundSessionId = explicitSessionId || sessionIds.get(input.id) || activeSessionId;
    if (boundSessionId && !sessionIds.has(input.id)) {
      sessionIds.set(input.id, boundSessionId);
      while (sessionIds.size > HOT_CAPTURE_LIMIT * 4) {
        const oldest = sessionIds.keys().next().value;
        if (!oldest) break;
        sessionIds.delete(oldest);
      }
    }
    const isActiveSession = Boolean(boundSessionId && boundSessionId === activeSessionId);
    const existing = isActiveSession ? captures.get(input.id) : undefined;
    const entry = applyCaptureAttribution(
      input,
      existing,
      input.source === "proxy" || !isActiveSession ? {} : attribution()
    );
    if (boundSessionId) (entry as SessionBoundCapture)[CAPTURE_SESSION_ID] = boundSessionId;
    if (existing?.intercept && !entry.intercept) entry.intercept = existing.intercept;
    if (existing?.rewrites && !entry.rewrites) {
      if (existing.rewrites.some((hit) => hit.stage === "request")) {
        entry.requestHeaders = existing.requestHeaders;
        entry.requestBody = existing.requestBody;
      }
      if (existing.rewrites.some((hit) => hit.stage === "response")) {
        entry.status = existing.status;
        entry.statusText = existing.statusText;
        entry.responseHeaders = existing.responseHeaders;
        entry.responseBody = existing.responseBody;
      }
      entry.rewrites = existing.rewrites;
    }
    if (isActiveSession) {
      captures.set(entry.id, entry);
      lastChangeAt = Date.now();
      while (captures.size > HOT_CAPTURE_LIMIT) {
        const oldest = captures.keys().next().value;
        if (!oldest) break;
        captures.delete(oldest);
      }
    }
    if (boundSessionId) persist(boundSessionId, entry);
  }

  function hydrate(entries: CapturedRequest[], sessionId: string) {
    captures.clear();
    for (const entry of entries) {
      bindEntryToSession(entry, sessionId);
      captures.set(entry.id, entry);
    }
  }

  function listHttp(limit = 400) {
    const sessionId = currentSessionId();
    const stored = sessionId ? load(sessionId, Math.max(limit, 1)) : null;
    const entries = stored || Array.from(captures.values()).slice(-limit).reverse();
    return entries
      .filter((entry) => entry.url.startsWith("http://") || entry.url.startsWith("https://"))
      .slice(0, limit);
  }

  function remove(captureId: string) {
    if (!captureId) return false;
    captures.delete(captureId);
    const sessionId = currentSessionId();
    if (sessionId) deletePersisted(sessionId, captureId);
    return true;
  }

  function clear() {
    captures.clear();
    const sessionId = currentSessionId();
    if (sessionId) clearPersisted(sessionId);
  }

  return {
    captures,
    remember,
    bindEntryToSession,
    bindToCurrentSession,
    hydrate,
    listHttp,
    remove,
    clear,
    lastChangeAt: () => lastChangeAt
  };
}
