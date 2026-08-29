import { randomUUID } from "node:crypto";
import type { CompletedRequest } from "mockttp";
import { isAllowedTarget } from "../../shared/allowlist.js";
import { proxyRequestToCapture } from "../../shared/capture.js";
import {
  applyClientOverrides,
  normalizeClientOverrides
} from "../../shared/clientOverrides.js";
import type {
  CapturedRequest,
  CaptureInterceptRecord,
  ClientOverride,
  InterceptConfig,
  InterceptQueueItem,
  InterceptResponseDraft,
  InterceptResolution,
  InterceptRule,
  InterceptState,
  MatchReplaceRule,
  ReplayDraft
} from "../../shared/domain.js";
import { normalizeDraft } from "../../shared/draft.js";
import { safeJsonHeaders } from "../../shared/headers.js";
import {
  matchingInterceptRules,
  normalizeInterceptRules
} from "../../shared/interceptRules.js";
import {
  applyMatchReplaceRules,
  normalizeMatchReplaceRules
} from "../../shared/matchReplace.js";
import { truncateText } from "../../shared/text.js";

const MAX_INTERCEPT_QUEUE = 80;

export type ProxyRequestCallbackResult =
  | void
  | {
      method?: string;
      url?: string;
      headers?: Record<string, string>;
      body?: string;
      response?: "close" | "reset";
    };

export type ProxyResponseCallbackResult =
  | void
  | "close"
  | "reset"
  | {
      statusCode?: number;
      statusMessage?: string;
      headers?: Record<string, string>;
      body?: string;
    };

export type ProxyPassThroughResponse = {
  id: string;
  statusCode: number;
  statusMessage?: string;
  headers?: Record<string, unknown>;
  body: { getText: () => Promise<string | undefined> };
};

type PendingIntercept = {
  item: InterceptQueueItem;
} & (
  | {
      item: InterceptQueueItem & { stage: "request" };
      resolve: (result: ProxyRequestCallbackResult) => void;
    }
  | {
      item: InterceptQueueItem & { stage: "response" };
      resolve: (result: ProxyResponseCallbackResult) => void;
    }
);

type InterceptControllerOptions = {
  currentSessionId: () => string;
  allowlist: () => string[];
  captureById: (captureId: string) => CapturedRequest | undefined;
  rememberCapture: (capture: CapturedRequest) => void;
  bindCaptureToCurrentSession: (captureId: string) => void;
  bindCaptureToSession: (capture: CapturedRequest, sessionId: string) => CapturedRequest;
  saveInterceptRules: (rules: InterceptRule[]) => InterceptRule[];
  saveMatchReplaceRules: (rules: MatchReplaceRule[]) => MatchReplaceRule[];
  saveClientOverrides: (overrides: ClientOverride[]) => ClientOverride[];
};

function parseCaptureUrlParts(url: string) {
  try {
    const parsed = new URL(url);
    return { host: parsed.host, path: `${parsed.pathname}${parsed.search}` };
  } catch {
    return { host: url || "request", path: "/" };
  }
}

function normalizeResponseDraft(input: InterceptResponseDraft): InterceptResponseDraft {
  return {
    status: Math.min(Math.max(Math.round(Number(input.status || 200)), 100), 599),
    statusText: String(input.statusText || "").slice(0, 120),
    headers: safeJsonHeaders(input.headers || {}),
    body: truncateText(typeof input.body === "string" ? input.body : "")
  };
}

function queuedItemChanged(item: InterceptQueueItem, draft: ReplayDraft) {
  return (
    item.method !== draft.method ||
    item.url !== draft.url ||
    item.body !== draft.body ||
    JSON.stringify(item.headers) !== JSON.stringify(draft.headers)
  );
}

function queuedResponseChanged(item: InterceptQueueItem, draft: InterceptResponseDraft) {
  return (
    item.status !== draft.status ||
    (item.statusText || "") !== draft.statusText ||
    item.body !== draft.body ||
    JSON.stringify(item.headers) !== JSON.stringify(draft.headers)
  );
}

export function createInterceptController({
  currentSessionId,
  allowlist,
  captureById,
  rememberCapture,
  bindCaptureToCurrentSession,
  bindCaptureToSession,
  saveInterceptRules,
  saveMatchReplaceRules,
  saveClientOverrides
}: InterceptControllerOptions) {
  const queue = new Map<string, PendingIntercept>();
  let config: InterceptConfig = { requestEnabled: false, responseEnabled: false };
  let interceptRules: InterceptRule[] = [];
  let matchReplaceRules: MatchReplaceRule[] = [];
  let clientOverrides: ClientOverride[] = [];

  function state(): InterceptState {
    return {
      config: { ...config },
      queue: Array.from(queue.values()).map((pending) => ({ ...pending.item }))
    };
  }

  function updateCaptureIntercept(
    captureId: string,
    stage: "request" | "response",
    queuedAt: string,
    resolution: InterceptResolution,
    edited: boolean,
    note: string,
    ruleHits = [] as CaptureInterceptRecord["ruleHits"]
  ) {
    const entry = captureById(captureId);
    if (!entry) return;
    const record: CaptureInterceptRecord = {
      stage,
      queuedAt,
      resolvedAt: resolution === "queued" ? undefined : new Date().toISOString(),
      resolution,
      edited,
      note,
      ruleHits
    };
    const existing = entry.intercept || [];
    entry.intercept = [
      ...existing.filter((item) => item.stage !== stage || item.queuedAt !== queuedAt),
      record
    ];
    rememberCapture(entry);
  }

  function applyDraftToCapture(captureId: string, draft: ReplayDraft) {
    const entry = captureById(captureId);
    if (!entry) return;
    const parts = parseCaptureUrlParts(draft.url);
    entry.method = draft.method;
    entry.url = draft.url;
    entry.host = parts.host;
    entry.path = parts.path;
    entry.requestHeaders = draft.headers;
    entry.requestBody = draft.body;
    entry.allowed = isAllowedTarget(draft.url, allowlist());
    rememberCapture(entry);
  }

  function applyResponseDraftToCapture(captureId: string, draft: InterceptResponseDraft) {
    const entry = captureById(captureId);
    if (!entry) return;
    entry.status = draft.status;
    entry.statusText = draft.statusText;
    entry.responseHeaders = draft.headers;
    entry.responseBody = draft.body;
    rememberCapture(entry);
  }

  function shouldQueueForRules(capture: CapturedRequest, stage: "request" | "response") {
    const enabledRules = interceptRules.filter((rule) => rule.enabled);
    if (enabledRules.length === 0) return { queue: true, hits: [] };
    const hits = matchingInterceptRules(enabledRules, capture, stage);
    return { queue: hits.length > 0, hits };
  }

  function applyScopedMatchReplace(capture: CapturedRequest, stage: "request" | "response") {
    if (!capture.allowed) return { capture, hits: [], changed: false };
    return applyMatchReplaceRules(matchReplaceRules, capture, stage);
  }

  function transformResponse(capture: CapturedRequest) {
    const rewriteResult = applyScopedMatchReplace(capture, "response");
    const overrideResult = applyClientOverrides(clientOverrides, rewriteResult.capture);
    return {
      capture: overrideResult.capture,
      hits: [...rewriteResult.hits, ...overrideResult.hits],
      changed: rewriteResult.changed || overrideResult.changed
    };
  }

  function resolveItem(
    id: string,
    resolution: Exclude<InterceptResolution, "queued">,
    draftInput?: ReplayDraft,
    responseInput?: InterceptResponseDraft
  ) {
    const pending = queue.get(id);
    if (!pending) throw new Error("Intercept queue item was not found.");
    const item = pending.item;
    const draft = draftInput ? normalizeDraft(draftInput) : normalizeDraft(item);
    const responseDraft = responseInput
      ? normalizeResponseDraft(responseInput)
      : normalizeResponseDraft({
          status: item.status || 200,
          statusText: item.statusText || "",
          headers: item.headers,
          body: item.body
        });
    const edited =
      item.stage === "response"
        ? queuedResponseChanged(item, responseDraft)
        : queuedItemChanged(item, draft);
    const hasRewrites = Boolean(item.rewrites?.length);

    if (item.stage === "request" && resolution !== "dropped" && !isAllowedTarget(draft.url, allowlist())) {
      throw new Error(`Edited intercept URL is out of scope: ${draft.url}`);
    }
    queue.delete(id);

    if (resolution === "dropped") {
      const entry = captureById(item.captureId);
      if (entry) {
        entry.status = 0;
        entry.statusText = "Dropped by Radar intercept";
        entry.durationMs = Date.now() - new Date(item.queuedAt).getTime();
        rememberCapture(entry);
      }
      updateCaptureIntercept(
        item.captureId,
        item.stage,
        item.queuedAt,
        "dropped",
        edited,
        `Operator dropped the queued ${item.stage}.`,
        item.ruleHits
      );
      if (item.stage === "response") pending.resolve("close");
      else pending.resolve({ response: "close" });
      return state();
    }

    if (item.stage === "response") applyResponseDraftToCapture(item.captureId, responseDraft);
    else if (edited || hasRewrites) applyDraftToCapture(item.captureId, draft);
    updateCaptureIntercept(
      item.captureId,
      item.stage,
      item.queuedAt,
      resolution === "resumed" ? "resumed" : edited ? "edited" : "forwarded",
      edited,
      edited
        ? `Operator edited and forwarded the queued ${item.stage}.`
        : `Operator forwarded the queued ${item.stage}.`,
      item.ruleHits
    );
    if (item.stage === "response") {
      pending.resolve(
        edited || hasRewrites
          ? {
              statusCode: responseDraft.status,
              statusMessage: responseDraft.statusText,
              headers: responseDraft.headers,
              body: responseDraft.body
            }
          : undefined
      );
    } else {
      pending.resolve(edited || hasRewrites ? draft : undefined);
    }
    return state();
  }

  async function queueRequest(request: CompletedRequest): Promise<ProxyRequestCallbackResult> {
    if (!request.url?.startsWith("http") || !isAllowedTarget(request.url, allowlist())) {
      return undefined;
    }
    const requestSessionId = currentSessionId();
    bindCaptureToCurrentSession(request.id);
    const bodyText = truncateText(await request.body.getText().catch(() => ""));
    let capture = proxyRequestToCapture({ req: request, bodyText, rules: allowlist() });
    bindCaptureToSession(capture, requestSessionId);
    const rewriteResult = applyScopedMatchReplace(capture, "request");
    capture = rewriteResult.capture;
    if (rewriteResult.changed) rememberCapture(capture);
    const rewriteTransform = rewriteResult.changed
      ? {
          method: capture.method,
          url: capture.url,
          headers: capture.requestHeaders,
          body: capture.requestBody
        }
      : undefined;
    if (!config.requestEnabled || queue.size >= MAX_INTERCEPT_QUEUE) return rewriteTransform;
    const ruleDecision = shouldQueueForRules(capture, "request");
    if (!ruleDecision.queue) return rewriteTransform;
    const queuedAt = new Date().toISOString();
    capture.intercept = [
      {
        stage: "request",
        queuedAt,
        resolution: "queued",
        edited: false,
        note: "Scoped proxy request paused before upstream.",
        ruleHits: ruleDecision.hits
      }
    ];
    rememberCapture(capture);
    const { host, path } = parseCaptureUrlParts(capture.url);
    const item: InterceptQueueItem & { stage: "request" } = {
      id: `intercept_${randomUUID()}`,
      captureId: capture.id,
      stage: "request",
      queuedAt,
      method: capture.method,
      url: capture.url,
      host,
      path,
      headers: capture.requestHeaders,
      body: capture.requestBody,
      allowed: capture.allowed,
      source: "proxy",
      note: "Paused before upstream",
      ruleHits: ruleDecision.hits,
      rewrites: rewriteResult.hits
    };
    return new Promise<ProxyRequestCallbackResult>((resolve) => {
      queue.set(item.id, { item, resolve });
    });
  }

  async function queueResponse(
    response: ProxyPassThroughResponse,
    request: CompletedRequest
  ): Promise<ProxyResponseCallbackResult> {
    if (!request.url?.startsWith("http") || !isAllowedTarget(request.url, allowlist())) {
      return undefined;
    }
    const bodyText = truncateText(await response.body.getText().catch(() => ""));
    let capture =
      captureById(request.id) ||
      proxyRequestToCapture({ req: request, bodyText: "", rules: allowlist() });
    capture.status = response.statusCode;
    capture.statusText = response.statusMessage || "";
    capture.responseHeaders = safeJsonHeaders(response.headers || {});
    capture.responseBody = bodyText;
    const rewriteResult = transformResponse(capture);
    capture = rewriteResult.capture;
    if (rewriteResult.changed) rememberCapture(capture);
    const rewriteTransform = rewriteResult.changed
      ? {
          statusCode: capture.status || 200,
          statusMessage: capture.statusText,
          headers: capture.responseHeaders,
          body: capture.responseBody
        }
      : undefined;
    if (!config.responseEnabled || queue.size >= MAX_INTERCEPT_QUEUE) return rewriteTransform;
    const ruleDecision = shouldQueueForRules(capture, "response");
    if (!ruleDecision.queue) {
      rememberCapture(capture);
      return rewriteTransform;
    }
    const queuedAt = new Date().toISOString();
    capture.intercept = [
      ...(capture.intercept || []),
      {
        stage: "response",
        queuedAt,
        resolution: "queued",
        edited: false,
        note: "Scoped proxy response paused before client delivery.",
        ruleHits: ruleDecision.hits
      }
    ];
    rememberCapture(capture);
    const { host, path } = parseCaptureUrlParts(capture.url);
    const item: InterceptQueueItem & { stage: "response" } = {
      id: `intercept_${randomUUID()}`,
      captureId: capture.id,
      stage: "response",
      queuedAt,
      method: capture.method,
      url: capture.url,
      host,
      path,
      headers: capture.responseHeaders,
      body: capture.responseBody,
      allowed: capture.allowed,
      source: "proxy",
      note: "Paused before client",
      status: capture.status || 200,
      statusText: capture.statusText,
      ruleHits: ruleDecision.hits,
      rewrites: rewriteResult.hits
    };
    return new Promise<ProxyResponseCallbackResult>((resolve) => {
      queue.set(item.id, { item, resolve });
    });
  }

  return {
    state,
    configure(next: Partial<InterceptConfig>) {
      config = {
        requestEnabled:
          typeof next.requestEnabled === "boolean" ? next.requestEnabled : config.requestEnabled,
        responseEnabled:
          typeof next.responseEnabled === "boolean" ? next.responseEnabled : config.responseEnabled
      };
      return state();
    },
    forward: (
      id: string,
      draft?: ReplayDraft,
      response?: InterceptResponseDraft
    ) => resolveItem(id, draft || response ? "edited" : "forwarded", draft, response),
    drop: (id: string) => resolveItem(id, "dropped"),
    resumeAll() {
      for (const id of Array.from(queue.keys())) resolveItem(id, "resumed");
      return state();
    },
    queueRequest,
    queueResponse,
    hydrateRules(
      nextInterceptRules: InterceptRule[],
      nextMatchReplaceRules: MatchReplaceRule[],
      nextClientOverrides: ClientOverride[] = []
    ) {
      interceptRules = nextInterceptRules;
      matchReplaceRules = nextMatchReplaceRules;
      clientOverrides = nextClientOverrides;
    },
    getRules: () => interceptRules,
    setRules(value: unknown) {
      interceptRules = saveInterceptRules(normalizeInterceptRules(value));
      return interceptRules;
    },
    getMatchReplaceRules: () => matchReplaceRules,
    setMatchReplaceRules(value: unknown) {
      matchReplaceRules = saveMatchReplaceRules(normalizeMatchReplaceRules(value));
      return matchReplaceRules;
    },
    getClientOverrides: () => clientOverrides,
    setClientOverrides(value: unknown) {
      clientOverrides = saveClientOverrides(normalizeClientOverrides(value));
      return clientOverrides;
    }
  };
}
