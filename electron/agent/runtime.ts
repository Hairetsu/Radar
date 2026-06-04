import { randomUUID } from "node:crypto";
import type {
  AgentCookie,
  AgentCapturedTrafficContext,
  AgentDecision,
  AgentDecisionContext,
  AgentDecisionFinding,
  AgentEvidenceObservation,
  AgentFinding,
  AgentRun,
  AgentRunRequest,
  AgentStorageState,
  AgentTimelineEntry,
  AgentToolCall,
  AgentToolResult
} from "../../shared/agent-types.js";
import type {
  AutomatePayloadSet,
  AutomateSession,
  BrowserState,
  CapturedRequest,
  InstalledPlugin,
  InterceptResponseDraft,
  InterceptState,
  ReplayDraft,
  ReplayEnvironment,
  ReplayResult,
  ReplayTabState,
  WebSocketEvent,
  WorkflowDefinition,
  WorkflowRun
} from "../../shared/domain.js";
import { buildAdvancedTestingSummary } from "../../shared/advancedTesting.js";
import { firstUrlFromText, originFromUrl } from "../../shared/url.js";
import { isAllowedTarget } from "../../shared/allowlist.js";
import { normalizeDraft } from "../../shared/draft.js";
import { summarizeAutomateSession } from "../../shared/automate.js";
import { buildSitemap } from "../../shared/sitemap.js";
import { diffReplayHistory } from "../../shared/replayDiff.js";
import { createReplayTab, normalizeReplayTabState } from "../../shared/replayTabs.js";
import { parseTrafficQuery } from "../../shared/trafficQuery.js";
import { DEFAULT_AGENT_POLICY, blockedToolReason, normalizeAgentPolicy } from "./policy.js";
import { availableToolNames, normalizeAgentToolCall } from "./tools.js";

type AgentRuntimeDeps = {
  currentSessionId: () => string;
  allowlist: () => string[];
  saveRun: (run: AgentRun) => void;
  loadRun: (runId: string) => AgentRun | null;
  listRuns: () => AgentRun[];
  getBrowserState: () => BrowserState;
  openBrowser: (url: string) => Promise<BrowserState>;
  navigateBrowser: (url: string) => Promise<BrowserState>;
  getCaptures: () => CapturedRequest[];
  getWebSocketEvents: () => WebSocketEvent[];
  getInterceptState: () => InterceptState;
  getReplayTabState: () => ReplayTabState;
  setReplayTabState: (state: ReplayTabState) => ReplayTabState;
  listReplayEnvironments: () => ReplayEnvironment[];
  listReplayCollections: () => Array<{ id: string; name: string; items: unknown[] }>;
  listAutomatePayloadSets: () => AutomatePayloadSet[];
  listAutomateSessions: () => AutomateSession[];
  listWorkflows: () => WorkflowDefinition[];
  listWorkflowRuns: () => WorkflowRun[];
  listPlugins: () => InstalledPlugin[];
  runWorkflow: (input: { workflowId: string; inputs?: Record<string, string>; source?: "manual" | "ai" }) => Promise<WorkflowRun>;
  sendReplay: (draft: ReplayDraft | { draft: ReplayDraft; environmentId?: string }) => Promise<ReplayResult>;
  waitForNetworkIdle: (input: { idleMs?: number; timeoutMs?: number }) => Promise<{ idle: boolean; waitedMs: number }>;
  getPageText: () => Promise<{ url: string; title: string; text: string }>;
  getDomSummary: () => Promise<{
    url: string;
    title: string;
    text: string;
    links: Array<{ text: string; href: string }>;
    buttons: string[];
    forms: Array<{ action: string; method: string; inputs: string[] }>;
  }>;
  getClickableElements: () => Promise<{ url: string; elements: Array<{ selector: string; text: string; tag: string; role: string; href?: string }> }>;
  clickElement: (input: { selector: string }) => Promise<{ clicked: boolean; selector: string; url: string }>;
  fillInput: (input: { selector: string; value: string }) => Promise<{ filled: boolean; selector: string }>;
  submitForm: (input: { selector: string }) => Promise<{ submitted: boolean; selector: string; url: string }>;
  getCookies: () => Promise<{ cookies: AgentCookie[] }>;
  getStorageState: () => Promise<AgentStorageState>;
  saveAuthState: (input: { name: string }) => Promise<{
    name: string;
    origin: string;
    createdAt: string;
    cookieCount: number;
    localStorageKeys: string[];
    sessionStorageKeys: string[];
  }>;
  loadAuthState: (input: { name: string }) => Promise<{
    name: string;
    origin: string;
    createdAt: string;
    cookieCount: number;
    localStorageKeys: string[];
    sessionStorageKeys: string[];
  }>;
  listAuthStates: () => Promise<{
    states: Array<{
      name: string;
      origin: string;
      createdAt: string;
      cookieCount: number;
      localStorageKeys: string[];
      sessionStorageKeys: string[];
    }>;
  }>;
  compareAuthStates: (input: { left: string; right: string }) => Promise<{ left: string; right: string; observations: AgentEvidenceObservation[] }>;
  decideNextAction: (context: AgentDecisionContext) => Promise<AgentDecision>;
  setActiveRunId?: (runId: string | null) => void;
  waitForSettle?: (ms: number) => Promise<void>;
};

type RunCounters = {
  startedAt: number;
  stepCount: number;
  replayCount: number;
};

const running = new Set<string>();
const stopped = new Set<string>();

function nowIso() {
  return new Date().toISOString();
}

function createId(prefix: string) {
  return `${prefix}_${randomUUID()}`;
}

function timeline(note: string, extra: Partial<AgentTimelineEntry> = {}): AgentTimelineEntry {
  return {
    id: createId("step"),
    createdAt: nowIso(),
    note,
    ...extra
  };
}

function withUpdate(run: AgentRun, saveRun: (run: AgentRun) => void, update: Partial<AgentRun>) {
  const next = {
    ...run,
    ...update,
    updatedAt: nowIso()
  };
  saveRun(next);
  return next;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clip(value: unknown, max = 1200) {
  const text = String(value ?? "");
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

function sameOrigin(value: string, targetOrigin: string) {
  if (!targetOrigin) {
    return true;
  }

  try {
    return new URL(value).origin === targetOrigin;
  } catch {
    return false;
  }
}

function headerValue(headers: Record<string, string>, name: string) {
  const found = Object.entries(headers || {}).find(([key]) => key.toLowerCase() === name.toLowerCase());
  return found?.[1] || "";
}

function responseDraftFromIntercept(input: Partial<InterceptResponseDraft>, fallback: InterceptResponseDraft): InterceptResponseDraft {
  const numericStatus = Number(input.status ?? fallback.status);
  return {
    status: Number.isFinite(numericStatus) ? Math.max(100, Math.min(Math.round(numericStatus), 599)) : fallback.status,
    statusText: String(input.statusText ?? fallback.statusText).slice(0, 120),
    headers: input.headers || fallback.headers,
    body: typeof input.body === "string" ? input.body : fallback.body
  };
}

function runCaptures(run: AgentRun, captures: CapturedRequest[], rules: string[], targetOrigin: string) {
  return captures
    .map((capture) => ({
      ...capture,
      allowed: isAllowedTarget(capture.url, rules)
    }))
    .filter((capture) => capture.agentRunId === run.id && capture.allowed && sameOrigin(capture.url, targetOrigin));
}

function capturedTrafficContext(captures: CapturedRequest[], limit: number): AgentCapturedTrafficContext[] {
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

function analyzeSecurityHeaders(captures: CapturedRequest[]): AgentEvidenceObservation[] {
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

function splitSetCookie(value: string) {
  return String(value || "")
    .split(/,(?=\s*[^;,=\s]+=[^;,]+)/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function analyzeCookieFlags(captures: CapturedRequest[]): AgentEvidenceObservation[] {
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

function checkCorsPolicy(captures: CapturedRequest[]): AgentEvidenceObservation[] {
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

function findingFromDecision(input: AgentDecisionFinding): AgentFinding {
  const evidenceRefs = Array.isArray(input.evidenceRefs) ? input.evidenceRefs.map(String).filter(Boolean) : [];
  if (evidenceRefs.length === 0) {
    throw new Error("Agent findings must cite at least one evidence reference.");
  }
  return {
    id: createId("finding"),
    createdAt: nowIso(),
    title: String(input.title || "Draft finding"),
    confidence: input.confidence || "low",
    evidenceRefs,
    notes: String(input.notes || ""),
    uncertainties: [
      ...(Array.isArray(input.uncertainties) ? input.uncertainties.map(String) : []),
      "Agent findings are draft-only until manually reviewed."
    ]
  };
}

function decisionContext({
  run,
  counters,
  startUrl,
  targetOrigin,
  deps
}: {
  run: AgentRun;
  counters: RunCounters;
  startUrl: string;
  targetOrigin: string;
  deps: AgentRuntimeDeps;
}): AgentDecisionContext {
  const activeAllowlist = deps.allowlist();
  const captures = runCaptures(run, deps.getCaptures(), activeAllowlist, "");
  return {
    goal: run.goal,
    startUrl,
    targetOrigin,
    allowlist: activeAllowlist,
    browserState: deps.getBrowserState(),
    policy: run.policy,
    stepCount: counters.stepCount,
    replayCount: counters.replayCount,
    availableTools: availableToolNames(),
    capturedTraffic: capturedTrafficContext(captures, run.policy.maxCaptureSample),
    timeline: run.timeline.slice(-16)
  };
}

export class AgentRuntime {
  constructor(private readonly deps: AgentRuntimeDeps) {}

  private waitForSettle(ms: number) {
    return this.deps.waitForSettle ? this.deps.waitForSettle(ms) : sleep(ms);
  }

  start(request: AgentRunRequest) {
    const goal = String(request.goal || "").trim();
    if (!goal) {
      throw new Error("Agent goal is required.");
    }

    const createdAt = nowIso();
    const run: AgentRun = {
      id: createId("agent"),
      sessionId: this.deps.currentSessionId(),
      createdAt,
      updatedAt: createdAt,
      goal,
      status: "queued",
      policy: normalizeAgentPolicy(request.policy),
      timeline: [timeline("Run queued from AI-First goal prompt.")],
      findings: []
    };

    this.deps.saveRun(run);
    void this.execute(run.id, firstUrlFromText(goal) || request.startUrl || "");
    return run;
  }

  stop(runId: string) {
    stopped.add(runId);
    const run = this.deps.loadRun(runId);
    if (!run) {
      return null;
    }
    if (run.status === "completed" || run.status === "failed" || run.status === "stopped") {
      return run;
    }
    return withUpdate(run, this.deps.saveRun, {
      status: "stopped",
      timeline: [...run.timeline, timeline("Stop requested by operator.")]
    });
  }

  get(runId: string) {
    return this.deps.loadRun(runId);
  }

  list() {
    return this.deps.listRuns();
  }

  private isStopped(runId: string) {
    const persisted = this.deps.loadRun(runId);
    return stopped.has(runId) || persisted?.status === "stopped" || persisted?.status === "paused";
  }

  private async callTool(run: AgentRun, counters: RunCounters, call: AgentToolCall) {
    const normalizedCall = normalizeAgentToolCall(call);
    const blocked = blockedToolReason({
      call: normalizedCall,
      allowlist: this.deps.allowlist(),
      policy: run.policy,
      replayCount: counters.replayCount,
      stepCount: counters.stepCount,
      startedAt: counters.startedAt
    });
    if (blocked) {
      counters.stepCount += 1;
      return withUpdate(run, this.deps.saveRun, {
        timeline: [
          ...run.timeline,
          timeline(blocked, {
            toolCall: normalizedCall,
            toolResult: { tool: normalizedCall.tool, ok: false, error: blocked }
          })
        ]
      });
    }

    let next = withUpdate(run, this.deps.saveRun, {
      timeline: [...run.timeline, timeline(`Tool call: ${normalizedCall.tool}`, { toolCall: normalizedCall })]
    });
    counters.stepCount += 1;

    let result: AgentToolResult;
    try {
      switch (normalizedCall.tool) {
        case "getBrowserState":
          result = { tool: normalizedCall.tool, ok: true, data: this.deps.getBrowserState() };
          break;
        case "showView":
          result = { tool: normalizedCall.tool, ok: true, data: { view: normalizedCall.input.view } };
          break;
        case "openBrowser":
          result = { tool: normalizedCall.tool, ok: true, data: await this.deps.openBrowser(normalizedCall.input.url) };
          break;
        case "navigateBrowser":
          result = { tool: normalizedCall.tool, ok: true, data: await this.deps.navigateBrowser(normalizedCall.input.url) };
          break;
        case "waitForNetworkIdle":
          result = { tool: normalizedCall.tool, ok: true, data: await this.deps.waitForNetworkIdle(normalizedCall.input) };
          break;
        case "getPageText":
          result = { tool: normalizedCall.tool, ok: true, data: await this.deps.getPageText() };
          break;
        case "getDomSummary":
          result = { tool: normalizedCall.tool, ok: true, data: await this.deps.getDomSummary() };
          break;
        case "getClickableElements":
          result = { tool: normalizedCall.tool, ok: true, data: await this.deps.getClickableElements() };
          break;
        case "clickElement":
          result = { tool: normalizedCall.tool, ok: true, data: await this.deps.clickElement(normalizedCall.input) };
          break;
        case "fillInput":
          result = { tool: normalizedCall.tool, ok: true, data: await this.deps.fillInput(normalizedCall.input) };
          break;
        case "submitForm":
          result = { tool: normalizedCall.tool, ok: true, data: await this.deps.submitForm(normalizedCall.input) };
          break;
        case "getCookies":
          result = { tool: normalizedCall.tool, ok: true, data: await this.deps.getCookies() };
          break;
        case "getStorageState":
          result = { tool: normalizedCall.tool, ok: true, data: await this.deps.getStorageState() };
          break;
        case "saveAuthState":
          result = { tool: normalizedCall.tool, ok: true, data: await this.deps.saveAuthState(normalizedCall.input) };
          break;
        case "loadAuthState":
          result = { tool: normalizedCall.tool, ok: true, data: await this.deps.loadAuthState(normalizedCall.input) };
          break;
        case "listAuthStates":
          result = { tool: normalizedCall.tool, ok: true, data: await this.deps.listAuthStates() };
          break;
        case "compareAuthStates":
          result = { tool: normalizedCall.tool, ok: true, data: await this.deps.compareAuthStates(normalizedCall.input) };
          break;
        case "getCaptures":
          {
            const activeAllowlist = this.deps.allowlist();
            const targetOrigin = String(normalizedCall.input.targetOrigin || "").trim();
            const captures = runCaptures(run, this.deps.getCaptures(), activeAllowlist, targetOrigin);
            result = {
              tool: normalizedCall.tool,
              ok: true,
              data: { captures: captures.slice(0, normalizedCall.input.limit || run.policy.maxCaptureSample) }
            };
          }
          break;
        case "getInterceptQueue": {
          const state = this.deps.getInterceptState();
          result = {
            tool: normalizedCall.tool,
            ok: true,
            data: { queue: state.queue.slice(0, normalizedCall.input.limit || run.policy.maxCaptureSample) }
          };
          break;
        }
        case "prepareInterceptEdit": {
          const state = this.deps.getInterceptState();
          const item = state.queue.find((entry) => entry.id === normalizedCall.input.id);
          if (!item) {
            throw new Error("Intercept queue item was not found.");
          }
          if (item.stage === "response") {
            const response = responseDraftFromIntercept(normalizedCall.input.response || {}, {
              status: item.status || 200,
              statusText: item.statusText || "",
              headers: item.headers,
              body: item.body
            });
            result = {
              tool: normalizedCall.tool,
              ok: true,
              data: { item, response, note: normalizedCall.input.note || "Prepared response edit for operator review." }
            };
          } else {
            const draft = normalizeDraft(normalizedCall.input.draft || item);
            if (!isAllowedTarget(draft.url, this.deps.allowlist())) {
              throw new Error(`Prepared intercept URL is out of scope: ${draft.url}`);
            }
            result = {
              tool: normalizedCall.tool,
              ok: true,
              data: { item, draft, note: normalizedCall.input.note || "Prepared request edit for operator review." }
            };
          }
          break;
        }
        case "analyzeSecurityHeaders": {
          const captures = runCaptures(run, this.deps.getCaptures(), this.deps.allowlist(), normalizedCall.input.targetOrigin || "");
          result = { tool: normalizedCall.tool, ok: true, data: { observations: analyzeSecurityHeaders(captures) } };
          break;
        }
        case "analyzeCookieFlags": {
          const captures = runCaptures(run, this.deps.getCaptures(), this.deps.allowlist(), normalizedCall.input.targetOrigin || "");
          result = { tool: normalizedCall.tool, ok: true, data: { observations: analyzeCookieFlags(captures) } };
          break;
        }
        case "checkCorsPolicy": {
          const captures = runCaptures(run, this.deps.getCaptures(), this.deps.allowlist(), normalizedCall.input.targetOrigin || "");
          result = { tool: normalizedCall.tool, ok: true, data: { observations: checkCorsPolicy(captures) } };
          break;
        }
        case "getSitemapCoverage": {
          const captures = runCaptures(run, this.deps.getCaptures(), this.deps.allowlist(), "");
          const sitemap = buildSitemap(captures);
          const limit = normalizedCall.input.limit || 12;
          const hosts = sitemap.roots.slice(0, limit).map((hostId) => {
            const hostNode = sitemap.nodes[hostId];
            return {
              host: hostNode?.host || hostId,
              requestCount: hostNode?.requestCount || 0,
              paths: (hostNode?.childIds || [])
                .slice(0, 8)
                .map((pathId) => sitemap.nodes[pathId]?.path || pathId)
            };
          });
          const endpointCount = Object.values(sitemap.nodes).filter((node) => node.kind === "endpoint").length;
          result = {
            tool: normalizedCall.tool,
            ok: true,
            data: {
              hostCount: sitemap.roots.length,
              endpointCount,
              hosts,
              suggestedQueries: hosts.flatMap((host) => [
                `host:${host.host}`,
                `host:${host.host} status:4xx`
              ]).slice(0, 8)
            }
          };
          break;
        }
        case "prepareTrafficQuery": {
          const parsed = parseTrafficQuery(normalizedCall.input.query);
          if (!parsed.ok) {
            throw new Error(parsed.error);
          }
          result = {
            tool: normalizedCall.tool,
            ok: true,
            data: {
              query: normalizedCall.input.query,
              reason: normalizedCall.input.reason || "Prepared traffic query for operator review."
            }
          };
          break;
        }
        case "getReplayContext": {
          const tabState = this.deps.getReplayTabState();
          const environments = this.deps.listReplayEnvironments();
          const collections = this.deps.listReplayCollections();
          result = {
            tool: normalizedCall.tool,
            ok: true,
            data: {
              tabState,
              environments: environments.map((environment) => ({
                id: environment.id,
                name: environment.name,
                variableCount: Object.keys(environment.variables).length
              })),
              collections: collections.map((collection) => ({
                id: collection.id,
                name: collection.name,
                itemCount: collection.items.length
              }))
            }
          };
          break;
        }
        case "prepareReplayTab": {
          const current = this.deps.getReplayTabState();
          const tab = createReplayTab(normalizedCall.input.name || `AI ${current.tabs.length + 1}`, normalizedCall.input.draft);
          const next = normalizeReplayTabState({
            tabs: [...current.tabs, { ...tab, environmentId: normalizedCall.input.environmentId || "" }],
            activeTabId: tab.id
          });
          this.deps.setReplayTabState(next);
          result = {
            tool: normalizedCall.tool,
            ok: true,
            data: {
              tabId: tab.id,
              name: tab.name,
              draft: tab.draft,
              environmentId: normalizedCall.input.environmentId || "",
              note: normalizedCall.input.note || "Prepared replay tab for operator review."
            }
          };
          break;
        }
        case "compareReplayResults": {
          const tabState = this.deps.getReplayTabState();
          const tab =
            tabState.tabs.find((item) => item.id === (normalizedCall.input.tabId || tabState.activeTabId)) ||
            tabState.tabs[0];
          if (!tab) {
            throw new Error("No repeater tab is available.");
          }
          const left = tab.history.find((entry) => entry.id === normalizedCall.input.leftHistoryId);
          const right = tab.history.find((entry) => entry.id === normalizedCall.input.rightHistoryId);
          if (!left || !right) {
            throw new Error("Replay history entries were not found in the selected tab.");
          }
          const summary = diffReplayHistory(left, right);
          result = {
            tool: normalizedCall.tool,
            ok: true,
            data: {
              statusChanged: summary.statusChanged,
              statusBefore: summary.statusBefore,
              statusAfter: summary.statusAfter,
              latencyDeltaMs: summary.latencyDeltaMs,
              bodyLengthDelta: summary.bodyLengthDelta,
              identical: summary.identical
            }
          };
          break;
        }
        case "getAutomateContext": {
          const payloadSets = this.deps.listAutomatePayloadSets();
          const sessions = this.deps.listAutomateSessions();
          result = {
            tool: normalizedCall.tool,
            ok: true,
            data: {
              payloadSets: payloadSets.map((payloadSet) => ({
                id: payloadSet.id,
                name: payloadSet.name,
                source: payloadSet.source,
                payloadCount: payloadSet.payloads.length,
                wordlistPath: payloadSet.wordlistPath
              })),
              sessions: sessions.map((item) => ({
                id: item.id,
                name: item.name,
                status: item.status,
                payloadCount: item.payloads.length,
                resultCount: item.results.length,
                clusterCount: item.clusters.length,
                matchCount: item.results.filter((entry) => entry.matchedRules.length > 0 || entry.extracts.length > 0).length,
                updatedAt: item.updatedAt
              }))
            }
          };
          break;
        }
        case "prepareAutomateDraft": {
          if (!isAllowedTarget(normalizedCall.input.draft.url, this.deps.allowlist())) {
            throw new Error(`Prepared Automate URL is out of scope: ${normalizedCall.input.draft.url}`);
          }
          result = {
            tool: normalizedCall.tool,
            ok: true,
            data: {
              draft: normalizedCall.input.draft,
              payloads: normalizedCall.input.payloads,
              rules: normalizedCall.input.rules || [],
              name: normalizedCall.input.name || "AI prepared run",
              environmentId: normalizedCall.input.environmentId || "",
              note: normalizedCall.input.note || "Prepared Automate controls for operator review."
            }
          };
          break;
        }
        case "analyzeAutomateResults": {
          const sessions = this.deps.listAutomateSessions();
          const session =
            sessions.find((item) => item.id === normalizedCall.input.sessionId) ||
            sessions[0];
          if (!session) {
            throw new Error("No Automate session is available to analyze.");
          }
          const summary = summarizeAutomateSession(session);
          result = {
            tool: normalizedCall.tool,
            ok: true,
            data: {
              sessionId: session.id,
              status: session.status,
              resultCount: summary.resultCount,
              failures: summary.failures,
              matches: summary.matches,
              clusters: session.clusters,
              outlierResultIds: session.clusters
                .filter((cluster) => cluster.count === 1)
                .map((cluster) => cluster.representativeResultId)
            }
          };
          break;
        }
        case "getWorkflowCatalog": {
          result = {
            tool: normalizedCall.tool,
            ok: true,
            data: {
              workflows: this.deps.listWorkflows().map((workflow) => ({
                id: workflow.id,
                name: workflow.name,
                description: workflow.description,
                mode: workflow.mode,
                inputs: workflow.inputs,
                scope: workflow.scope,
                steps: workflow.steps
              })),
              recentRuns: this.deps.listWorkflowRuns().slice(0, 8).map((run) => ({
                id: run.id,
                workflowId: run.workflowId,
                workflowName: run.workflowName,
                status: run.status,
                mode: run.mode,
                actionCount: run.actionCount,
                startedAt: run.startedAt,
                resultCount: run.results.length
              }))
            }
          };
          break;
        }
        case "getPluginInventory": {
          result = {
            tool: normalizedCall.tool,
            ok: true,
            data: {
              plugins: this.deps.listPlugins().map((plugin) => ({
                id: plugin.id,
                name: plugin.manifest.name,
                version: plugin.manifest.version,
                status: plugin.status,
                requestedPermissions: plugin.manifest.permissions,
                grantedPermissions: plugin.grantedPermissions,
                panels: plugin.manifest.panels.map((panel) => ({
                  id: panel.id,
                  title: panel.title
                })),
                warningCount: plugin.warnings.length
              }))
            }
          };
          break;
        }
        case "getAdvancedTestingSummary": {
          const activeAllowlist = this.deps.allowlist();
          const captures = runCaptures(run, this.deps.getCaptures(), activeAllowlist, "");
          const frames = this.deps.getWebSocketEvents().filter((event) => isAllowedTarget(event.url, activeAllowlist));
          result = {
            tool: normalizedCall.tool,
            ok: true,
            data: buildAdvancedTestingSummary(captures, frames)
          };
          break;
        }
        case "runWorkflow": {
          const workflow = this.deps.listWorkflows().find((item) => item.id === normalizedCall.input.workflowId);
          if (!workflow) {
            throw new Error("Workflow was not found.");
          }
          if (workflow.mode === "active" && counters.replayCount + workflow.scope.maxRequests > run.policy.maxReplay) {
            throw new Error("Workflow would exceed the AI-First replay budget.");
          }
          const workflowRun = await this.deps.runWorkflow({
            workflowId: normalizedCall.input.workflowId,
            inputs: normalizedCall.input.inputs,
            source: "ai"
          });
          counters.replayCount += workflowRun.actionCount;
          result = {
            tool: normalizedCall.tool,
            ok: true,
            data: workflowRun
          };
          break;
        }
        case "sendReplay": {
          counters.replayCount += 1;
          result = { tool: normalizedCall.tool, ok: true, data: await this.deps.sendReplay(normalizedCall.input.draft) };
          break;
        }
      }
    } catch (error) {
      result = {
        tool: normalizedCall.tool,
        ok: false,
        error: error instanceof Error ? error.message : "Agent tool failed."
      };
    }

    next = withUpdate(next, this.deps.saveRun, {
      timeline: [...next.timeline, timeline(`Tool result: ${normalizedCall.tool}`, { toolResult: result })]
    });
    return next;
  }

  private async execute(runId: string, startUrl: string) {
    if (running.has(runId)) {
      return;
    }
    running.add(runId);
    const counters = { startedAt: Date.now(), stepCount: 0, replayCount: 0 };

    try {
      let run = this.deps.loadRun(runId);
      if (!run) {
        return;
      }
      this.deps.setActiveRunId?.(run.id);

      run = withUpdate(run, this.deps.saveRun, {
        status: "running",
        timeline: [...run.timeline, timeline("Run started. Scope and policy checks are active.")]
      });

      if (this.isStopped(runId)) {
        return;
      }

      const targetOrigin = startUrl ? originFromUrl(startUrl) : "";

      while (!this.isStopped(runId)) {
        if (Date.now() - counters.startedAt > run.policy.maxRuntimeMs) {
          throw new Error("Agent exceeded its runtime budget before returning finish.");
        }
        if (counters.stepCount >= run.policy.maxSteps) {
          throw new Error("Agent exhausted its tool-call budget before returning finish.");
        }

        const decision = await this.deps.decideNextAction(
          decisionContext({
            run,
            counters,
            startUrl,
            targetOrigin,
            deps: this.deps
          })
        );

        if (!decision || (decision.action !== "tool" && decision.action !== "finish")) {
          throw new Error("Agent decision must choose either tool or finish.");
        }

        if (decision.action === "finish") {
          const nextFindings = (decision.findings || []).map(findingFromDecision);
          run = withUpdate(run, this.deps.saveRun, {
            status: "completed",
            findings: nextFindings,
            timeline: [
              ...run.timeline,
              timeline(
                decision.rationale ||
                  `Agent returned finish with ${nextFindings.length} draft finding${nextFindings.length === 1 ? "" : "s"}.`
              )
            ]
          });
          return;
        }

        if (!decision.call) {
          throw new Error("Agent tool decision did not include a tool call.");
        }

        if (decision.rationale) {
          run = withUpdate(run, this.deps.saveRun, {
            timeline: [...run.timeline, timeline(`Agent selected ${decision.call.tool}: ${decision.rationale}`)]
          });
        }
        run = await this.callTool(run, counters, decision.call);

        if (
          decision.call.tool === "openBrowser" ||
          decision.call.tool === "navigateBrowser" ||
          decision.call.tool === "clickElement" ||
          decision.call.tool === "submitForm" ||
          decision.call.tool === "loadAuthState"
        ) {
          await this.waitForSettle(1200);
        }
      }
    } catch (error) {
      const run = this.deps.loadRun(runId);
      if (run) {
        withUpdate(run, this.deps.saveRun, {
          status: "failed",
          error: error instanceof Error ? error.message : "Agent run failed.",
          timeline: [...run.timeline, timeline("Run failed.")]
        });
      }
    } finally {
      this.deps.setActiveRunId?.(null);
      running.delete(runId);
      stopped.delete(runId);
    }
  }
}

export { DEFAULT_AGENT_POLICY };
