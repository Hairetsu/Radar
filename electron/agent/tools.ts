import type { AgentToolCall, AgentToolName, AgentWorkbenchView } from "../../shared/agent-types.js";
import { MAX_REPLAY_BODY, normalizeDraft } from "../../shared/draft.js";

export type AgentToolDefinition = {
  name: AgentToolName;
  description: string;
  safety: "view" | "observe" | "navigate" | "replay" | "prepare";
  schema: Record<string, unknown>;
};

export const AGENT_TOOL_REGISTRY: AgentToolDefinition[] = [
  {
    name: "showView",
    description: "Move the visible workbench to a Radar evidence view.",
    safety: "view",
    schema: { view: "traffic|websocket|intercept|repeater|scope|ssl", reason: "string" }
  },
  {
    name: "getBrowserState",
    description: "Read current browser launch and URL state.",
    safety: "observe",
    schema: {}
  },
  {
    name: "openBrowser",
    description: "Launch the scoped browser at an in-scope URL.",
    safety: "navigate",
    schema: { url: "http(s) URL inside scope" }
  },
  {
    name: "navigateBrowser",
    description: "Navigate the scoped browser to an in-scope URL.",
    safety: "navigate",
    schema: { url: "http(s) URL inside scope" }
  },
  {
    name: "waitForNetworkIdle",
    description: "Wait until captured traffic has been idle long enough.",
    safety: "observe",
    schema: { idleMs: "number optional", timeoutMs: "number optional" }
  },
  {
    name: "getPageText",
    description: "Read visible page text from the active browser surface.",
    safety: "observe",
    schema: {}
  },
  {
    name: "getDomSummary",
    description: "Read compact links, buttons, forms, and text from the active page.",
    safety: "observe",
    schema: {}
  },
  {
    name: "getClickableElements",
    description: "List clickable page elements with selectors that can be used by clickElement.",
    safety: "observe",
    schema: {}
  },
  {
    name: "clickElement",
    description: "Click a page element by selector from getClickableElements or getDomSummary.",
    safety: "navigate",
    schema: { selector: "CSS selector" }
  },
  {
    name: "fillInput",
    description: "Fill an input, textarea, or contenteditable element.",
    safety: "navigate",
    schema: { selector: "CSS selector", value: "string" }
  },
  {
    name: "submitForm",
    description: "Submit a form or the closest form around a selector.",
    safety: "navigate",
    schema: { selector: "CSS selector" }
  },
  {
    name: "getCookies",
    description: "Read browser cookies for the active page context.",
    safety: "observe",
    schema: {}
  },
  {
    name: "getStorageState",
    description: "Read cookies, localStorage, and sessionStorage for the active page.",
    safety: "observe",
    schema: {}
  },
  {
    name: "saveAuthState",
    description: "Save current cookies and storage as a named auth/session state.",
    safety: "observe",
    schema: { name: "state name" }
  },
  {
    name: "loadAuthState",
    description: "Load a named auth/session state into the active browser context.",
    safety: "navigate",
    schema: { name: "state name" }
  },
  {
    name: "listAuthStates",
    description: "List saved auth/session states.",
    safety: "observe",
    schema: {}
  },
  {
    name: "compareAuthStates",
    description: "Compare two saved auth/session states and report cookie/storage differences.",
    safety: "observe",
    schema: { left: "state name", right: "state name" }
  },
  {
    name: "getCaptures",
    description: "Read run-scoped in-scope HTTP captures across target redirects; targetOrigin optionally narrows results.",
    safety: "observe",
    schema: { limit: "number optional", targetOrigin: "origin optional" }
  },
  {
    name: "getInterceptQueue",
    description: "Read queued in-scope intercept items without forwarding, dropping, or mutating traffic.",
    safety: "observe",
    schema: { limit: "number optional" }
  },
  {
    name: "prepareInterceptEdit",
    description: "Prepare request or response edits for a queued intercept item; the operator must still forward or drop manually.",
    safety: "prepare",
    schema: {
      id: "intercept queue item id",
      draft: { method: "HTTP method", url: "http(s) URL inside scope", headers: {}, body: "" },
      response: { status: "number", statusText: "string", headers: {}, body: "" },
      note: "string optional"
    }
  },
  {
    name: "sendReplay",
    description: "Send one policy-capped replay draft to an in-scope URL.",
    safety: "replay",
    schema: { draft: { method: "HTTP method", url: "http(s) URL inside scope", headers: {}, body: "" } }
  },
  {
    name: "analyzeSecurityHeaders",
    description: "Produce evidence observations for missing or weak response security headers.",
    safety: "observe",
    schema: { targetOrigin: "origin optional" }
  },
  {
    name: "analyzeCookieFlags",
    description: "Produce evidence observations for weak Set-Cookie flags.",
    safety: "observe",
    schema: { targetOrigin: "origin optional" }
  },
  {
    name: "checkCorsPolicy",
    description: "Produce evidence observations for permissive CORS response headers.",
    safety: "observe",
    schema: { targetOrigin: "origin optional" }
  }
];

const WORK_VIEWS = ["traffic", "websocket", "intercept", "repeater", "scope", "ssl"] as const;

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

export function toolSchemas() {
  return Object.fromEntries(
    AGENT_TOOL_REGISTRY.map((tool) => [
      tool.name,
      {
        description: tool.description,
        safety: tool.safety,
        input: tool.schema
      }
    ])
  );
}

export function availableToolNames() {
  return AGENT_TOOL_REGISTRY.map((tool) => tool.name);
}

export function normalizeAgentToolCall(call: AgentToolCall): AgentToolCall {
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
    case "clickElement":
    case "submitForm":
      return { tool: call.tool, input: { selector: String(input.selector || "").trim() } };
    case "fillInput":
      return { tool: call.tool, input: { selector: String(input.selector || "").trim(), value: String(input.value || "") } };
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
  }
}
