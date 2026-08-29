import type { AgentToolCall, AgentWorkbenchView } from "../../../shared/agent-types.js";
import { normalizeReplayExperimentRequest } from "../../../shared/agentAssessment.js";
import { MAX_AUTOMATE_PAYLOADS, normalizeAutomateRules } from "../../../shared/automate.js";
import { MAX_REPLAY_BODY, normalizeDraft } from "../../../shared/draft.js";
import { normalizeAgentRunMemory } from "../../../shared/agentMemory.js";
import { normalizeWorkflowDefinition } from "../../../shared/workflows.js";

const WORK_VIEWS = [
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
] as const;

function objectValue(value: unknown) {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function clampNumber(value: unknown, fallback: number, min: number, max: number) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.min(Math.max(Math.round(numeric), min), max);
}

function normalizeHeaders(value: unknown) {
  const input = objectValue(value);
  return Object.fromEntries(Object.entries(input).map(([key, item]) => [key, String(item)]));
}

function normalizeResponseDraft(value: unknown) {
  const input = objectValue(value);
  return {
    status: clampNumber(input.status, 200, 100, 599),
    statusText: String(input.statusText || "").slice(0, 120),
    headers: normalizeHeaders(input.headers),
    body: String(input.body || "").slice(0, MAX_REPLAY_BODY)
  };
}

function hasObjectKeys(value: unknown) {
  return Object.keys(objectValue(value)).length > 0;
}

function assertUrl(value: unknown) {
  const url = String(value || "").trim();
  if (!/^https?:\/\//i.test(url)) {
    throw new Error("Agent URL tools require an explicit http(s) URL.");
  }
  return url;
}

function assertSelector(value: unknown) {
  const selector = String(value || "").trim().slice(0, 500);
  if (!selector) {
    throw new Error("Agent browser tools require a selector from getClickableElements.");
  }
  return selector;
}

export function normalizeAgentToolInput(call: AgentToolCall): AgentToolCall {
  const input = objectValue(call.input);

  switch (call.tool) {
    case "showView": {
      const view = String(input.view || "");
      if (!WORK_VIEWS.includes(view as (typeof WORK_VIEWS)[number])) {
        throw new Error(`Invalid agent view: ${view}`);
      }
      return { tool: call.tool, input: { view: view as AgentWorkbenchView, reason: String(input.reason || "") } };
    }
    case "getBrowserState":
    case "getPageText":
    case "getDomSummary":
    case "getClickableElements":
    case "getCookies":
    case "getStorageState":
    case "listAuthStates":
    case "getIdentityLabContext":
    case "getAutomateContext":
    case "getWorkflowCatalog":
    case "getAgentContextSummary":
    case "getPluginInventory":
    case "getAdvancedTestingSummary":
      return { tool: call.tool, input: {} };
    case "openBrowser":
    case "navigateBrowser":
      return { tool: call.tool, input: { url: assertUrl(input.url) } };
    case "waitForNetworkIdle":
      return {
        tool: call.tool,
        input: {
          idleMs: clampNumber(input.idleMs, 700, 100, 5000),
          timeoutMs: clampNumber(input.timeoutMs, 8000, 500, 30000)
        }
      };
    case "getCaptures":
      return {
        tool: call.tool,
        input: {
          limit: clampNumber(input.limit, 20, 1, 100),
          targetOrigin: String(input.targetOrigin || "")
        }
      };
    case "getInterceptQueue":
    case "getClientOverrides":
      return {
        tool: call.tool,
        input: {
          limit: clampNumber(input.limit, 20, 1, 100)
        }
      };
    case "analyzeSecurityHeaders":
    case "analyzeCookieFlags":
    case "checkCorsPolicy":
      return {
        tool: call.tool,
        input: {
          targetOrigin: String(input.targetOrigin || "")
        }
      };
    case "getSitemapCoverage":
      return {
        tool: call.tool,
        input: {
          limit: clampNumber(input.limit, 12, 1, 40)
        }
      };
    case "prepareTrafficQuery":
      return {
        tool: call.tool,
        input: {
          query: String(input.query || "").trim().slice(0, 400),
          reason: String(input.reason || "").slice(0, 240)
        }
      };
    case "prepareInterceptEdit":
      return {
        tool: call.tool,
        input: {
          id: String(input.id || "").trim(),
          draft: hasObjectKeys(input.draft)
            ? normalizeDraft({
                ...objectValue(input.draft),
                headers: normalizeHeaders(objectValue(input.draft).headers)
              })
            : undefined,
          response: hasObjectKeys(input.response) ? normalizeResponseDraft(input.response) : undefined,
          note: String(input.note || "").slice(0, 240)
        }
      };
    case "applyClientValidationBypass":
      return {
        tool: call.tool,
        input: {
          captureId: String(input.captureId || "").trim(),
          name: String(input.name || "").trim().slice(0, 80)
        }
      };
    case "clickElement":
    case "submitForm":
      return { tool: call.tool, input: { selector: assertSelector(input.selector) } };
    case "fillInput":
      return { tool: call.tool, input: { selector: assertSelector(input.selector), value: String(input.value || "") } };
    case "saveAuthState":
    case "loadAuthState":
      return { tool: call.tool, input: { name: String(input.name || "").trim().slice(0, 80) } };
    case "compareAuthStates":
      return {
        tool: call.tool,
        input: {
          left: String(input.left || "").trim().slice(0, 80),
          right: String(input.right || "").trim().slice(0, 80)
        }
      };
    case "activateIdentityProfile":
    case "verifyIdentityProfile":
      return {
        tool: call.tool,
        input: { identityId: String(input.identityId || "").trim().slice(0, 128) }
      };
    case "sendReplay":
      return {
        tool: call.tool,
        input: {
          draft: normalizeDraft({
            ...objectValue(input.draft),
            headers: normalizeHeaders(objectValue(input.draft).headers)
          })
        }
      };
    case "prepareReplayTab":
      return {
        tool: call.tool,
        input: {
          name: String(input.name || "").trim().slice(0, 60),
          draft: normalizeDraft({
            ...objectValue(input.draft),
            headers: normalizeHeaders(objectValue(input.draft).headers)
          }),
          environmentId: String(input.environmentId || "").trim().slice(0, 80),
          note: String(input.note || "").slice(0, 240)
        }
      };
    case "compareReplayResults":
      return {
        tool: call.tool,
        input: {
          leftHistoryId: String(input.leftHistoryId || "").trim(),
          rightHistoryId: String(input.rightHistoryId || "").trim(),
          tabId: String(input.tabId || "").trim()
        }
      };
    case "getReplayContext":
    case "getAssessmentCandidates":
    case "getAssessmentProgress":
      return { tool: call.tool, input: {} };
    case "runReplayExperiment": {
      const normalized = normalizeReplayExperimentRequest(input);
      if (!normalized) {
        throw new Error("runReplayExperiment requires a capture, approved family, and matching mutation.");
      }
      return { tool: call.tool, input: normalized };
    }
    case "prepareAutomateDraft":
      return {
        tool: call.tool,
        input: {
          name: String(input.name || "").trim().slice(0, 60),
          draft: normalizeDraft({
            ...objectValue(input.draft),
            headers: normalizeHeaders(objectValue(input.draft).headers)
          }),
          payloads: (Array.isArray(input.payloads) ? input.payloads : [])
            .map((payload) => String(payload || "").slice(0, 8000))
            .filter((payload) => payload.trim().length > 0)
            .slice(0, Math.min(MAX_AUTOMATE_PAYLOADS, 25)),
          rules: normalizeAutomateRules(input.rules),
          environmentId: String(input.environmentId || "").trim().slice(0, 80),
          note: String(input.note || "").slice(0, 240)
        }
      };
    case "analyzeAutomateResults":
      return {
        tool: call.tool,
        input: {
          sessionId: String(input.sessionId || "").trim().slice(0, 120)
        }
      };
    case "runWorkflow": {
      const rawInputs = objectValue(input.inputs);
      return {
        tool: call.tool,
        input: {
          workflowId: String(input.workflowId || "").trim().slice(0, 160),
          inputs: Object.fromEntries(
            Object.entries(rawInputs)
              .map(([key, value]) => [String(key).trim().slice(0, 80), String(value || "").slice(0, 400)])
              .filter(([key]) => Boolean(key))
          )
        }
      };
    }
    case "prepareWorkflowDraft": {
      const workflow = normalizeWorkflowDefinition(input.workflow);
      if (!workflow) {
        throw new Error("Prepared workflow definition was invalid.");
      }
      return {
        tool: call.tool,
        input: {
          workflow,
          note: String(input.note || "").slice(0, 240)
        }
      };
    }
    case "proposeRunMemory": {
      const memory = normalizeAgentRunMemory(input, "memory-draft");
      if (!memory) {
        throw new Error("Run memory proposal requires a title and notes.");
      }
      return {
        tool: call.tool,
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
  }
}
