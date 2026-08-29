import type {
  AgentCapturedTrafficContext,
  AgentContextSummary,
  AgentDecisionFinding,
  AgentEvidenceObservation,
  AgentRun
} from "../../shared/agent-types.js";
import type { CapturedRequest, InterceptResponseDraft } from "../../shared/domain.js";
import { buildAdvancedTestingSummary } from "../../shared/advancedTesting.js";
import { buildAgentContextSummary, emptyAgentContextSummary } from "../../shared/agentContext.js";
import { buildAgentEvidenceCatalog, type AgentEvidenceCatalog } from "../../shared/agentEvidence.js";
import { isAllowedTarget } from "../../shared/allowlist.js";
import { normalizeAgentFindingWithGate } from "../../shared/agentQuality.js";
import { createId, nowIso } from "./runtimeClock.js";
import type { AgentRuntimeDeps } from "./runtimeTypes.js";

export function clip(value: unknown, max = 1200) {
  const text = String(value ?? "");
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

export function sameOrigin(value: string, targetOrigin: string) {
  if (!targetOrigin) {
    return true;
  }

  try {
    return new URL(value).origin === targetOrigin;
  } catch {
    return false;
  }
}

export function headerValue(headers: Record<string, string>, name: string) {
  const found = Object.entries(headers || {}).find(([key]) => key.toLowerCase() === name.toLowerCase());
  return found?.[1] || "";
}

export function responseDraftFromIntercept(input: Partial<InterceptResponseDraft>, fallback: InterceptResponseDraft): InterceptResponseDraft {
  const numericStatus = Number(input.status ?? fallback.status);
  return {
    status: Number.isFinite(numericStatus) ? Math.max(100, Math.min(Math.round(numericStatus), 599)) : fallback.status,
    statusText: String(input.statusText ?? fallback.statusText).slice(0, 120),
    headers: input.headers || fallback.headers,
    body: typeof input.body === "string" ? input.body : fallback.body
  };
}

export function runCaptures(run: AgentRun, captures: CapturedRequest[], rules: string[], targetOrigin: string) {
  return captures
    .map((capture) => ({
      ...capture,
      allowed: isAllowedTarget(capture.url, rules)
    }))
    .filter((capture) => capture.agentRunId === run.id && capture.allowed && sameOrigin(capture.url, targetOrigin));
}

export function capturedTrafficContext(captures: CapturedRequest[], limit: number): AgentCapturedTrafficContext[] {
  return captures.slice(0, limit).map((capture) => ({
    id: capture.id,
    method: capture.method,
    url: capture.url,
    status: capture.status,
    statusText: capture.statusText,
    type: capture.type,
    mimeType: capture.mimeType,
    source: capture.source,
    requestHeaders: capture.requestHeaders,
    responseHeaders: capture.responseHeaders,
    requestBodyPreview: clip(capture.requestBody),
    responseBodyPreview: clip(capture.responseBody),
    agentRunId: capture.agentRunId,
    navigationId: capture.navigationId,
    frameUrl: capture.frameUrl,
    initiator: capture.initiator
  }));
}

export function analyzeSecurityHeaders(captures: CapturedRequest[]): AgentEvidenceObservation[] {
  const observations: AgentEvidenceObservation[] = [];
  for (const capture of captures) {
    const contentType = headerValue(capture.responseHeaders, "content-type");
    const isHtml = /text\/html/i.test(contentType) || /document/i.test(capture.type || "");
    if (isHtml && !headerValue(capture.responseHeaders, "content-security-policy")) {
      observations.push({
        captureId: capture.id,
        url: capture.url,
        name: "content-security-policy",
        issue: "HTML response does not include Content-Security-Policy.",
        severity: "low"
      });
    }
    if (capture.url.startsWith("https://") && !headerValue(capture.responseHeaders, "strict-transport-security")) {
      observations.push({
        captureId: capture.id,
        url: capture.url,
        name: "strict-transport-security",
        issue: "HTTPS response does not include Strict-Transport-Security.",
        severity: "low"
      });
    }
    if (isHtml && !headerValue(capture.responseHeaders, "x-frame-options") && !/frame-ancestors/i.test(headerValue(capture.responseHeaders, "content-security-policy"))) {
      observations.push({
        captureId: capture.id,
        url: capture.url,
        name: "frame-ancestors",
        issue: "HTML response does not include X-Frame-Options or CSP frame-ancestors.",
        severity: "low"
      });
    }
  }
  return observations;
}

export function splitSetCookie(value: string) {
  return String(value || "")
    .split(/,(?=\s*[^;,=\s]+=[^;,]+)/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function analyzeCookieFlags(captures: CapturedRequest[]): AgentEvidenceObservation[] {
  const observations: AgentEvidenceObservation[] = [];
  for (const capture of captures) {
    const setCookie = headerValue(capture.responseHeaders, "set-cookie");
    for (const cookie of splitSetCookie(setCookie)) {
      const name = cookie.split("=")[0] || "cookie";
      const lower = cookie.toLowerCase();
      if (capture.url.startsWith("https://") && !lower.includes("; secure")) {
        observations.push({ captureId: capture.id, url: capture.url, name, issue: "Cookie is missing Secure.", severity: "medium" });
      }
      if (!lower.includes("; httponly")) {
        observations.push({ captureId: capture.id, url: capture.url, name, issue: "Cookie is missing HttpOnly.", severity: "low" });
      }
      if (!lower.includes("; samesite")) {
        observations.push({ captureId: capture.id, url: capture.url, name, issue: "Cookie is missing SameSite.", severity: "low" });
      }
    }
  }
  return observations;
}

export function checkCorsPolicy(captures: CapturedRequest[]): AgentEvidenceObservation[] {
  const observations: AgentEvidenceObservation[] = [];
  for (const capture of captures) {
    const allowOrigin = headerValue(capture.responseHeaders, "access-control-allow-origin");
    const allowCredentials = headerValue(capture.responseHeaders, "access-control-allow-credentials");
    if (allowOrigin === "*") {
      observations.push({
        captureId: capture.id,
        url: capture.url,
        name: "access-control-allow-origin",
        value: allowOrigin,
        issue: "Response allows any CORS origin.",
        severity: /true/i.test(allowCredentials) ? "medium" : "low"
      });
    }
    if (/true/i.test(allowCredentials) && allowOrigin && allowOrigin !== "*") {
      observations.push({
        captureId: capture.id,
        url: capture.url,
        name: "access-control-allow-credentials",
        value: allowCredentials,
        issue: "Response allows credentialed CORS; confirm allowed origin is intentional.",
        severity: "info"
      });
    }
  }
  return observations;
}

export function findingFromDecision(input: AgentDecisionFinding, evidenceCatalog: AgentEvidenceCatalog) {
  return normalizeAgentFindingWithGate(input, createId("finding"), nowIso(), evidenceCatalog);
}

export function runtimeEvidenceCatalog(deps: AgentRuntimeDeps, extraCaptureIds: string[] = []) {
  const allowlist = deps.allowlist();
  const replayTabState = deps.getReplayTabState();
  const captures = [...deps.getCaptures()];
  const seen = new Set(captures.map((capture) => capture.id));
  if (deps.getCaptureById) {
    for (const id of extraCaptureIds) {
      if (!id || seen.has(id)) {
        continue;
      }
      const capture = deps.getCaptureById(id);
      if (!capture) {
        continue;
      }
      captures.push(capture);
      seen.add(capture.id);
    }
  }
  return buildAgentEvidenceCatalog({
    captures: captures.filter((capture) => isAllowedTarget(capture.url, allowlist)),
    webSocketEvents: deps.getWebSocketEvents().filter((event) => isAllowedTarget(event.url, allowlist)),
    replayTabState: {
      ...replayTabState,
      tabs: replayTabState.tabs
        .map((tab) => ({
          ...tab,
          history: tab.history.filter((entry) => isAllowedTarget(entry.draft.url, allowlist))
        }))
        .filter((tab) => isAllowedTarget(tab.draft.url, allowlist) || tab.history.length > 0)
    },
    automateSessions: deps.listAutomateSessions().map((session) => ({
      ...session,
      results: session.results.filter((result) => isAllowedTarget(result.request.url, allowlist))
    })),
    workflowRuns: deps.listWorkflowRuns(),
    agentRuns: deps.listRuns()
  });
}

export function runtimeContextSummary({
  deps,
  allowlist,
  maxCaptureSample
}: {
  deps: AgentRuntimeDeps;
  allowlist: string[];
  maxCaptureSample: number;
}): AgentContextSummary {
  try {
    const captures = deps.getCaptures();
    const frames = deps.getWebSocketEvents();
    const advancedSummary = buildAdvancedTestingSummary(
      captures.filter((capture) => isAllowedTarget(capture.url, allowlist)),
      frames.filter((frame) => isAllowedTarget(frame.url, allowlist))
    );
    return buildAgentContextSummary({
      captures,
      frames,
      findings: deps.listFindings(),
      workflows: deps.listWorkflows(),
      workflowRuns: deps.listWorkflowRuns(),
      projectNotes: deps.listProjectNotes(),
      savedViews: deps.listSavedViews(),
      runMemory: deps.listRunMemory(),
      allowlist,
      advancedSummary,
      captureLimit: maxCaptureSample
    });
  } catch {
    return emptyAgentContextSummary();
  }
}

