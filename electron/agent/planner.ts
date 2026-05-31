import type {
  AgentCapturedTrafficContext,
  AgentDecision,
  AgentDecisionContext,
  AgentDecisionFinding,
  AgentToolCall,
  AgentWorkbenchView
} from "../../shared/agent-types.js";
import { normalizeDraft } from "../../shared/draft.js";
import { redactBody, redactHeaders } from "../ai/context.js";
import { complete } from "../ai/providers.js";
import { loadSettings } from "../ai/settings.js";
import { toolSchemas } from "./tools.js";

const SYSTEM_PROMPT = `You are Radar's autonomous defensive web security agent.

You do not describe a script. You choose exactly one next action from the available tools, then wait for the tool result in the next turn.
Stay inside saved scope and the intended target/redirect origins. Prefer observation before replay. Use replay only for safe, low-impact verification.
Stop only when you have enough evidence, there are no useful in-scope actions left, or the policy budget is nearly exhausted.
The capturedTraffic field already contains the current run's in-scope HTTP evidence across redirects and canonical hostnames.
Do not repeat getCaptures just to reread the same capturedTraffic. Use getCaptures only when you need a fresh sample after navigation, clicking, form submission, or replay.
If page/DOM tools fail because the Chrome debugging endpoint is unavailable, choose openBrowser with browserState.url or startUrl to reopen the controlled browser, then continue.

Return JSON only in one of these forms:
{"action":"tool","tool":"openBrowser","input":{"url":"https://example.com"},"rationale":"why this is the next best action"}
{"action":"finish","rationale":"why the run is complete","findings":[{"title":"string","confidence":"low|medium|high","evidenceRefs":["capture:id"],"notes":"string","uncertainties":["string"]}]}`;

const WORK_VIEWS: AgentWorkbenchView[] = ["traffic", "websocket", "repeater", "scope", "ssl"];

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
      policy: context.policy,
      budgetRemaining: {
        toolCalls: Math.max(context.policy.maxSteps - context.stepCount, 0),
      replay: Math.max(context.policy.maxReplay - context.replayCount, 0)
      },
      availableTools: context.availableTools,
      toolSchema: toolSchemas(),
      capturedTraffic: context.capturedTraffic.map((capture) => compactCapturedTraffic(capture, includeRaw)),
      timeline: context.timeline.map((entry) => ({
        note: entry.note,
        toolCall: entry.toolCall,
        toolResult: compactToolResult(entry.toolResult, includeRaw)
      }))
    },
    null,
    2
  );
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
    case "getCaptures":
      return {
        tool,
        input: {
          limit: Number.isFinite(Number(input.limit)) ? Math.max(1, Math.min(Math.round(Number(input.limit)), 100)) : undefined,
          targetOrigin: String(input.targetOrigin || "")
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
    default:
      throw new Error(`Invalid agent tool: ${tool}`);
  }
}

export function normalizeAgentDecision(parsed: Record<string, unknown>): AgentDecision {
  const action = String(parsed.action || "").toLowerCase();
  if (action === "finish") {
    return {
      action: "finish",
      rationale: String(parsed.rationale || ""),
      findings: normalizeFindings(parsed.findings)
    };
  }

  if (action === "tool") {
    return {
      action: "tool",
      call: normalizeToolCall(parsed),
      rationale: String(parsed.rationale || "")
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
