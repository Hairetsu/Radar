import type {
  AgentCapturedTrafficContext,
  AgentDecision,
  AgentDecisionContext,
  AgentDecisionFinding,
  AgentToolCall,
  AgentWorkbenchView
} from "../../shared/agent-types.js";
import { normalizeAgentRunMemory } from "../../shared/agentMemory.js";
import { normalizeAgentMissionPatch } from "../../shared/agentMission.js";
import { normalizeAgentCapabilityLeaseRequest } from "../../shared/agentCapabilities.js";
import { normalizeAutomateRules } from "../../shared/automate.js";
import { normalizeDraft } from "../../shared/draft.js";
import { normalizeWorkflowDefinition } from "../../shared/workflows.js";
import { redactBody, redactHeaders } from "../ai/context.js";
import { complete } from "../ai/providers.js";
import { loadSettings } from "../ai/settings.js";
import { toolSchemas } from "./tools.js";

const SYSTEM_PROMPT = `You are Radar's autonomous defensive web security agent.

You do not describe a script. You choose exactly one next action from the available tools, then wait for the tool result in the next turn.
Stay inside saved scope and the intended target/redirect origins. Prefer observation before replay. Use replay only for safe, low-impact verification.
Stop only when you have enough evidence, there are no useful in-scope actions left, or the policy budget is nearly exhausted.
The profile field and availableTools list are authoritative. Do not call tools that are absent from availableTools.
The capturedTraffic field already contains the current run's in-scope HTTP evidence across redirects and canonical hostnames.
The contextSummary field contains redacted local sitemap, finding, Advanced, workflow, note, saved-view, and run-memory summaries. Use it before asking for raw or broad evidence.
The mission field is the durable operational plan. Keep objectives, falsifiable hypotheses, bounded experiments, evidence-backed claims, and explicit coverage gaps current with a revision-checked missionPatch. Reuse stable ids. Do not change hypothesis pins; pins are operator-owned.
When operator input is required, add an operator-question update. Radar will pause before another tool runs. Do not guess past a missing authorization, identity, or destructive side-effect decision.
The capabilities field is the durable authority ledger. Browser navigation, auth-state mutation, form interaction, replay, and active workflows require a granted lease matching one exact origin/method/path/identity tuple. If no grant matches, include a minimal leaseRequest for the selected tool; this only creates a review draft and Radar pauses before execution. Never request destructive or DELETE authority.
Do not repeat getCaptures just to reread the same capturedTraffic. Use getCaptures only when you need a fresh sample after navigation, clicking, form submission, or replay.
If page/DOM tools fail because the Chrome debugging endpoint is unavailable, choose openBrowser with browserState.url or startUrl to reopen the controlled browser, then continue.
For queued intercept traffic, use getInterceptQueue to inspect and prepareInterceptEdit to load visible draft edits. Never forward or drop intercepted traffic; those actions are operator-confirmed.
For payload variation, use getAutomateContext and prepareAutomateDraft to load visible Automate controls. Never start, pause, stop, or retry an Automate run from AI-First.
Use prepareReplayTab and prepareWorkflowDraft to create visible drafts for operator review. Do not run or save prepared work unless a policy and profile explicitly allow the execution tool.
For plugins and Advanced testing, use getPluginInventory and getAdvancedTestingSummary as read-only tools. Never install plugins, approve permissions, import API files, or run imported requests.
Any finish findings must include evidenceRefs, affectedAssets, reproductionNotes, severityRationale, remediation, and uncertainties. Weak findings will be rejected by Radar's quality gate.

Return JSON only in one of these forms:
{"action":"tool","tool":"openBrowser","input":{"url":"https://example.com"},"rationale":"why this is the next best action","leaseRequest":{"name":"Open scoped target","riskTier":"navigate","tools":["openBrowser"],"grants":[{"origin":"https://example.com","method":"GET","pathPrefix":"/","identity":"current"}],"durationMs":120000,"maxUses":1,"maxRequests":1,"maxConcurrency":1,"maxPayloadBytes":0,"reason":"Open the exact scoped target once"},"missionPatch":{"baseRevision":0,"updates":[{"kind":"hypothesis","id":"hyp-authz","objectiveId":"obj-primary","statement":"Authorization may be inconsistent","status":"testing"},{"kind":"experiment","id":"exp-authz-map","hypothesisId":"hyp-authz","title":"Map authenticated endpoints","expectedObservation":"Scoped endpoints and auth signals","status":"running"}]}}
{"action":"finish","rationale":"why the run is complete and what remains untested","missionPatch":{"baseRevision":1,"updates":[{"kind":"mission-status","status":"completed","stopReason":"No useful scoped actions remain"}]},"findings":[{"title":"string","confidence":"low|medium|high","evidenceRefs":["capture:id"],"affectedAssets":["https://example.com"],"reproductionNotes":"string","severityRationale":"string","remediation":"string","notes":"string","uncertainties":["string"]}]}`;

const WORK_VIEWS: AgentWorkbenchView[] = [
  "traffic",
  "websocket",
  "intercept",
  "repeater",
  "automate",
  "findings",
  "workflows",
  "plugins",
  "advanced",
  "sitemap",
  "scope",
  "ssl"
];

function clip(value: unknown, max = 700) {
  const text = String(value ?? "");
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

function compactCapturedTraffic(capture: AgentCapturedTrafficContext, includeRaw: boolean) {
  return {
    ...capture,
    requestHeaders: includeRaw ? capture.requestHeaders : redactHeaders(capture.requestHeaders),
    responseHeaders: includeRaw ? capture.responseHeaders : redactHeaders(capture.responseHeaders),
    requestBodyPreview: includeRaw ? clip(capture.requestBodyPreview) : clip(redactBody(capture.requestBodyPreview)),
    responseBodyPreview: includeRaw ? clip(capture.responseBodyPreview) : clip(redactBody(capture.responseBodyPreview))
  };
}

function compactInterceptItem<T extends { headers: Record<string, string>; body: string }>(item: T, includeRaw: boolean) {
  return {
    ...item,
    headers: includeRaw ? item.headers : redactHeaders(item.headers),
    body: includeRaw ? clip(item.body) : clip(redactBody(item.body))
  };
}

function compactToolResult(result: AgentDecisionContext["timeline"][number]["toolResult"], includeRaw: boolean) {
  if (!result) {
    return undefined;
  }

  if (!result.ok) {
    return result;
  }

  if (result.tool === "getCaptures") {
    return {
      tool: result.tool,
      ok: true,
      data: {
        captures: result.data.captures.map((capture) => ({
          id: capture.id,
          method: capture.method,
          url: capture.url,
          status: capture.status,
          statusText: capture.statusText,
          type: capture.type,
          mimeType: capture.mimeType,
          requestHeaders: includeRaw ? capture.requestHeaders : redactHeaders(capture.requestHeaders),
          responseHeaders: includeRaw ? capture.responseHeaders : redactHeaders(capture.responseHeaders),
          requestBodyPreview: includeRaw ? clip(capture.requestBody) : clip(redactBody(capture.requestBody)),
          responseBodyPreview: includeRaw ? clip(capture.responseBody) : clip(redactBody(capture.responseBody))
        }))
      }
    };
  }

  if (result.tool === "sendReplay") {
    return {
      tool: result.tool,
      ok: true,
      data: {
        ok: result.data.ok,
        status: result.data.status,
        statusText: result.data.statusText,
        headers: result.data.headers,
        bodyPreview: clip(result.data.body),
        durationMs: result.data.durationMs
      }
    };
  }

  if (result.tool === "getInterceptQueue") {
    return {
      tool: result.tool,
      ok: true,
      data: {
        queue: result.data.queue.map((item) => compactInterceptItem(item, includeRaw))
      }
    };
  }

  if (result.tool === "prepareAutomateDraft") {
    return {
      tool: result.tool,
      ok: true,
      data: {
        ...result.data,
        draft: {
          ...result.data.draft,
          headers: includeRaw ? result.data.draft.headers : redactHeaders(result.data.draft.headers),
          body: includeRaw ? clip(result.data.draft.body) : clip(redactBody(result.data.draft.body))
        },
        payloads: includeRaw ? result.data.payloads.slice(0, 25) : result.data.payloads.slice(0, 25).map(() => "[redacted]"),
        rules: result.data.rules,
        note: result.data.note
      }
    };
  }

  if (result.tool === "getWorkflowCatalog") {
    return {
      tool: result.tool,
      ok: true,
      data: {
        workflows: result.data.workflows.map((workflow) => ({
          id: workflow.id,
          name: workflow.name,
          mode: workflow.mode,
          inputIds: workflow.inputs.map((input) => input.id),
          steps: workflow.steps.map((step) => ({ id: step.id, kind: step.kind }))
        })),
        recentRuns: result.data.recentRuns
      }
    };
  }

  if (result.tool === "runWorkflow") {
    return {
      tool: result.tool,
      ok: true,
      data: {
        id: result.data.id,
        workflowId: result.data.workflowId,
        status: result.data.status,
        mode: result.data.mode,
        actionCount: result.data.actionCount,
        results: result.data.results.map((item) => ({
          id: item.id,
          level: item.level,
          title: item.title,
          evidenceRefs: item.evidence.map((ref) => `${ref.kind}:${ref.id}`)
        }))
      }
    };
  }

  if (result.tool === "prepareInterceptEdit") {
    return {
      tool: result.tool,
      ok: true,
      data: {
        item: compactInterceptItem(result.data.item, includeRaw),
        draft: result.data.draft
          ? {
              ...result.data.draft,
              headers: includeRaw ? result.data.draft.headers : redactHeaders(result.data.draft.headers),
              body: includeRaw ? clip(result.data.draft.body) : clip(redactBody(result.data.draft.body))
            }
          : undefined,
        response: result.data.response
          ? {
              ...result.data.response,
              headers: includeRaw ? result.data.response.headers : redactHeaders(result.data.response.headers),
              body: includeRaw ? clip(result.data.response.body) : clip(redactBody(result.data.response.body))
            }
          : undefined,
        note: result.data.note
      }
    };
  }

  if (result.tool === "getPageText") {
    return { ...result, data: { ...result.data, text: clip(result.data.text, 1600) } };
  }

  if (result.tool === "getDomSummary") {
    return {
      ...result,
      data: {
        ...result.data,
        text: clip(result.data.text, 1600),
        links: result.data.links.slice(0, 30),
        buttons: result.data.buttons.slice(0, 30),
        forms: result.data.forms.slice(0, 10)
      }
    };
  }

  if (result.tool === "getClickableElements") {
    return { ...result, data: { ...result.data, elements: result.data.elements.slice(0, 50) } };
  }

  if (result.tool === "getCookies") {
    return { ...result, data: { cookies: result.data.cookies.map((cookie) => ({ ...cookie, value: cookie.value ? "[redacted]" : "" })) } };
  }

  if (result.tool === "getStorageState") {
    return {
      ...result,
      data: {
        ...result.data,
        cookies: result.data.cookies.map((cookie) => ({ ...cookie, value: cookie.value ? "[redacted]" : "" })),
        localStorage: Object.fromEntries(Object.keys(result.data.localStorage).map((key) => [key, "[redacted]"])),
        sessionStorage: Object.fromEntries(Object.keys(result.data.sessionStorage).map((key) => [key, "[redacted]"]))
      }
    };
  }

  return result;
}

function buildUserPrompt(context: AgentDecisionContext) {
  const includeRaw = context.policy.allowRawContext;
  return JSON.stringify(
    {
      goal: context.goal,
      startUrl: context.startUrl,
      targetOrigin: context.targetOrigin,
      allowlist: context.allowlist,
      browserState: context.browserState,
      profile: context.profile,
      policy: context.policy,
      budgetRemaining: {
        toolCalls: Math.max(context.policy.maxSteps - context.stepCount, 0),
        replay: Math.max(context.policy.maxReplay - context.replayCount, 0),
        workflowRequests: Math.max(context.policy.maxWorkflowRequests - context.workflowRequestCount, 0)
      },
      availableTools: context.availableTools,
      toolSchema: toolSchemas(),
      capturedTraffic: context.capturedTraffic.map((capture) => compactCapturedTraffic(capture, includeRaw)),
      contextSummary: context.contextSummary,
      runMemory: context.runMemory,
      mission: compactMission(context.mission),
      capabilities: compactCapabilities(context.capabilities),
      timeline: context.timeline.map((entry) => ({
        id: entry.id,
        note: entry.note,
        phase: entry.phase,
        summary: entry.summary,
        target: entry.target,
        toolCall: entry.toolCall,
        toolResult: compactToolResult(entry.toolResult, includeRaw)
      }))
    },
    null,
    2
  );
}

function compactCapabilities(state: AgentDecisionContext["capabilities"]) {
  return {
    revision: state.revision,
    leases: state.leases.map((lease) => ({
      id: lease.id,
      name: lease.name,
      status: lease.status,
      riskTier: lease.riskTier,
      tools: lease.tools,
      grants: lease.grants,
      expiresAt: lease.expiresAt,
      remainingUses: Math.max(0, lease.maxUses - lease.usedUses),
      remainingRequests: Math.max(0, lease.maxRequests - lease.usedRequests),
      reason: lease.reason,
      revocationReason: lease.revocationReason
    })),
    recentReceipts: state.receipts.slice(-16)
  };
}

function compactMission(mission: AgentDecisionContext["mission"]) {
  const objectives = [...mission.objectives]
    .sort((left, right) => left.priority - right.priority || left.id.localeCompare(right.id))
    .slice(0, 16);
  const hypotheses = [...mission.hypotheses]
    .sort(
      (left, right) =>
        Number(right.pinned) - Number(left.pinned) || left.priority - right.priority || left.id.localeCompare(right.id)
    )
    .slice(0, 32);
  const experiments = [...mission.experiments]
    .sort((left, right) => left.status.localeCompare(right.status) || left.id.localeCompare(right.id))
    .slice(0, 40);
  const claims = [...mission.claims]
    .sort((left, right) => left.status.localeCompare(right.status) || left.id.localeCompare(right.id))
    .slice(0, 32);
  const coverage = [...mission.coverage]
    .sort((left, right) => left.status.localeCompare(right.status) || left.dimension.localeCompare(right.dimension) || left.id.localeCompare(right.id))
    .slice(0, 64);
  return {
    version: mission.version,
    revision: mission.revision,
    status: mission.status,
    stopReason: mission.stopReason,
    counts: {
      objectives: mission.objectives.length,
      hypotheses: mission.hypotheses.length,
      experiments: mission.experiments.length,
      claims: mission.claims.length,
      coverage: mission.coverage.length
    },
    objectives,
    hypotheses,
    experiments,
    claims,
    coverage,
    operatorQuestions: mission.operatorQuestions
  };
}

function objectValue(value: unknown) {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function stringRecord(value: unknown) {
  const input = objectValue(value);
  return Object.fromEntries(Object.entries(input).map(([key, item]) => [key, String(item)]));
}

function normalizeView(value: unknown): AgentWorkbenchView {
  const view = String(value || "");
  if (!WORK_VIEWS.includes(view as AgentWorkbenchView)) {
    throw new Error(`Invalid agent view: ${view}`);
  }
  return view as AgentWorkbenchView;
}

function normalizeConfidence(value: unknown) {
  const confidence = String(value || "low");
  return confidence === "medium" || confidence === "high" ? confidence : "low";
}

function normalizeFindings(value: unknown): AgentDecisionFinding[] {
  return Array.isArray(value)
    ? value.map((item) => {
        const entry = objectValue(item);
        return {
          title: String(entry.title || "Draft finding"),
          confidence: normalizeConfidence(entry.confidence),
          evidenceRefs: Array.isArray(entry.evidenceRefs) ? entry.evidenceRefs.map(String) : [],
          notes: String(entry.notes || ""),
          affectedAssets: Array.isArray(entry.affectedAssets) ? entry.affectedAssets.map(String) : [],
          reproductionNotes: String(entry.reproductionNotes || ""),
          severityRationale: String(entry.severityRationale || ""),
          remediation: String(entry.remediation || ""),
          uncertainties: Array.isArray(entry.uncertainties) ? entry.uncertainties.map(String) : []
        };
      })
    : [];
}

function normalizeToolCall(parsed: Record<string, unknown>): AgentToolCall {
  const call = objectValue(parsed.call);
  const tool = String(parsed.tool || call.tool || "");
  const input = objectValue(parsed.input || call.input);

  switch (tool) {
    case "showView":
      return { tool, input: { view: normalizeView(input.view), reason: String(input.reason || parsed.rationale || "") } };
    case "getBrowserState":
      return { tool, input: {} };
    case "openBrowser":
    case "navigateBrowser":
      return { tool, input: { url: String(input.url || "") } };
    case "waitForNetworkIdle":
      return {
        tool,
        input: {
          idleMs: Number.isFinite(Number(input.idleMs)) ? Number(input.idleMs) : undefined,
          timeoutMs: Number.isFinite(Number(input.timeoutMs)) ? Number(input.timeoutMs) : undefined
        }
      };
    case "getPageText":
    case "getDomSummary":
    case "getClickableElements":
    case "getCookies":
    case "getStorageState":
    case "listAuthStates":
    case "getIdentityLabContext":
    case "getReplayContext":
    case "getAutomateContext":
    case "getWorkflowCatalog":
    case "getAgentContextSummary":
    case "getPluginInventory":
    case "getAdvancedTestingSummary":
      return { tool, input: {} };
    case "clickElement":
    case "submitForm":
      return { tool, input: { selector: String(input.selector || "") } };
    case "fillInput":
      return { tool, input: { selector: String(input.selector || ""), value: String(input.value || "") } };
    case "saveAuthState":
    case "loadAuthState":
      return { tool, input: { name: String(input.name || "") } };
    case "compareAuthStates":
      return { tool, input: { left: String(input.left || ""), right: String(input.right || "") } };
    case "activateIdentityProfile":
    case "verifyIdentityProfile":
      return { tool, input: { identityId: String(input.identityId || "") } };
    case "getCaptures":
      return {
        tool,
        input: {
          limit: Number.isFinite(Number(input.limit)) ? Math.max(1, Math.min(Math.round(Number(input.limit)), 100)) : undefined,
          targetOrigin: String(input.targetOrigin || "")
        }
      };
    case "getInterceptQueue":
      return {
        tool,
        input: {
          limit: Number.isFinite(Number(input.limit)) ? Math.max(1, Math.min(Math.round(Number(input.limit)), 100)) : undefined
        }
      };
    case "getSitemapCoverage":
      return {
        tool,
        input: {
          limit: Number.isFinite(Number(input.limit)) ? Math.max(1, Math.min(Math.round(Number(input.limit)), 40)) : undefined
        }
      };
    case "prepareTrafficQuery":
      return {
        tool,
        input: {
          query: String(input.query || "").trim().slice(0, 400),
          reason: String(input.reason || parsed.rationale || "").slice(0, 240)
        }
      };
    case "analyzeSecurityHeaders":
    case "analyzeCookieFlags":
    case "checkCorsPolicy":
      return { tool, input: { targetOrigin: String(input.targetOrigin || "") } };
    case "sendReplay":
      return {
        tool,
        input: {
          draft: normalizeDraft({
            ...objectValue(input.draft),
            headers: stringRecord(objectValue(input.draft).headers)
          })
        }
      };
    case "prepareReplayTab":
      return {
        tool,
        input: {
          name: String(input.name || "").trim().slice(0, 60),
          draft: normalizeDraft({
            ...objectValue(input.draft),
            headers: stringRecord(objectValue(input.draft).headers)
          }),
          environmentId: String(input.environmentId || "").trim().slice(0, 80),
          note: String(input.note || "").slice(0, 240)
        }
      };
    case "compareReplayResults":
      return {
        tool,
        input: {
          leftHistoryId: String(input.leftHistoryId || "").trim(),
          rightHistoryId: String(input.rightHistoryId || "").trim(),
          tabId: String(input.tabId || "").trim()
        }
      };
    case "prepareInterceptEdit":
      return {
        tool,
        input: {
          id: String(input.id || "").trim(),
          draft:
            input.draft && typeof input.draft === "object"
              ? normalizeDraft({
                  ...objectValue(input.draft),
                  headers: stringRecord(objectValue(input.draft).headers)
                })
              : undefined,
          response:
            input.response && typeof input.response === "object"
              ? {
                  status: Number.isFinite(Number(objectValue(input.response).status))
                    ? Math.max(100, Math.min(Math.round(Number(objectValue(input.response).status)), 599))
                    : 200,
                  statusText: String(objectValue(input.response).statusText || "").slice(0, 120),
                  headers: stringRecord(objectValue(input.response).headers),
                  body: String(objectValue(input.response).body || "")
                }
              : undefined,
          note: String(input.note || "").slice(0, 240)
        }
      };
    case "prepareAutomateDraft":
      return {
        tool,
        input: {
          name: String(input.name || "").slice(0, 60),
          draft: normalizeDraft({
            ...objectValue(input.draft),
            headers: stringRecord(objectValue(input.draft).headers)
          }),
          payloads: (Array.isArray(input.payloads) ? input.payloads : [])
            .map((payload) => String(payload || ""))
            .filter((payload) => payload.trim().length > 0)
            .slice(0, 25),
          rules: normalizeAutomateRules(input.rules),
          environmentId: String(input.environmentId || "").slice(0, 80),
          note: String(input.note || "").slice(0, 240)
        }
      };
    case "analyzeAutomateResults":
      return { tool, input: { sessionId: String(input.sessionId || "").slice(0, 120) } };
    case "prepareWorkflowDraft": {
      const workflow = normalizeWorkflowDefinition(input.workflow);
      if (!workflow) {
        throw new Error("Prepared workflow definition was invalid.");
      }
      return { tool, input: { workflow, note: String(input.note || "").slice(0, 240) } };
    }
    case "runWorkflow":
      return {
        tool,
        input: {
          workflowId: String(input.workflowId || "").trim().slice(0, 160),
          inputs: Object.fromEntries(
            Object.entries(objectValue(input.inputs))
              .map(([key, value]) => [String(key).trim().slice(0, 80), String(value || "").slice(0, 400)])
              .filter(([key]) => Boolean(key))
          )
        }
      };
    case "proposeRunMemory": {
      const memory = normalizeAgentRunMemory(input, "memory-draft");
      if (!memory) {
        throw new Error("Run memory proposal requires a title and notes.");
      }
      return {
        tool,
        input: {
          kind: memory.kind,
          title: memory.title,
          notes: memory.notes,
          evidenceRefs: memory.evidenceRefs,
          dismissedReason: memory.dismissedReason,
          retestState: memory.retestState
        }
      };
    }
    default:
      throw new Error(`Invalid agent tool: ${tool}`);
  }
}

export function normalizeAgentDecision(parsed: Record<string, unknown>): AgentDecision {
  const action = String(parsed.action || "").toLowerCase();
  const missionPatch = normalizeAgentMissionPatch(parsed.missionPatch);
  const leaseRequest = normalizeAgentCapabilityLeaseRequest(parsed.leaseRequest);
  if (parsed.missionPatch !== undefined && !missionPatch) {
    throw new Error("Agent missionPatch was invalid or empty.");
  }
  if (parsed.leaseRequest !== undefined && !leaseRequest) {
    throw new Error("Agent leaseRequest was invalid or insufficiently bounded.");
  }
  if (action === "finish") {
    if (leaseRequest) {
      throw new Error("Agent finish decisions cannot request a capability lease.");
    }
    return {
      action: "finish",
      rationale: String(parsed.rationale || ""),
      findings: normalizeFindings(parsed.findings),
      ...(missionPatch ? { missionPatch } : {})
    };
  }

  if (action === "tool") {
    return {
      action: "tool",
      call: normalizeToolCall(parsed),
      rationale: String(parsed.rationale || ""),
      ...(missionPatch ? { missionPatch } : {}),
      ...(leaseRequest ? { leaseRequest } : {})
    };
  }

  throw new Error("Agent decision must return action=tool or action=finish.");
}

export function createAiAgentPlanner(userDataPath: string) {
  return async (context: AgentDecisionContext): Promise<AgentDecision> => {
    const settings = loadSettings(userDataPath);
    const { parsed } = await complete({
      settings,
      system: SYSTEM_PROMPT,
      user: buildUserPrompt(context)
    });
    return normalizeAgentDecision(parsed);
  };
}
