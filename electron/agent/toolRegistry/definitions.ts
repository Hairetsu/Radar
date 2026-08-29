import type { AgentToolCall, AgentToolName } from "../../../shared/agent-types.js";

export type AgentToolDefinition = {
  name: AgentToolName;
  description: string;
  safety: "view" | "observe" | "navigate" | "replay" | "prepare";
  schema: Record<string, unknown>;
};

export type AgentToolDescriptor = AgentToolDefinition & {
  normalize: (input: unknown) => AgentToolCall;
};


export const AGENT_TOOL_DEFINITIONS: AgentToolDefinition[] = [
  {
    name: "showView",
    description: "Move the visible workbench to a Radar evidence view.",
    safety: "view",
    schema: { view: "traffic|websocket|intercept|repeater|automate|findings|workflows|plugins|advanced|sitemap|scope|ssl", reason: "string" }
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
    description: "Read a Playwright accessibility snapshot plus compact links, buttons, forms, and text from the active page.",
    safety: "observe",
    schema: {}
  },
  {
    name: "getClickableElements",
    description: "List visible page controls with stable page-specific Playwright selectors for clickElement, fillInput, or submitForm.",
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
    description: "Read browser cookies for the active page context when the run explicitly allows raw context.",
    safety: "observe",
    schema: {}
  },
  {
    name: "getStorageState",
    description: "Read cookies, localStorage, and sessionStorage for the active page when the run explicitly allows raw context.",
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
    name: "getIdentityLabContext",
    description: "Read public, workspace-scoped Identity Lab metadata and attributed-evidence counts without session secrets.",
    safety: "observe",
    schema: {}
  },
  {
    name: "activateIdentityProfile",
    description: "Switch the visible controlled browser to one dedicated, workspace-scoped identity profile.",
    safety: "navigate",
    schema: { identityId: "stable Identity Lab profile ID" }
  },
  {
    name: "verifyIdentityProfile",
    description: "Run an explicit scoped health observation for a dedicated Identity Lab profile.",
    safety: "navigate",
    schema: { identityId: "stable Identity Lab profile ID" }
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
    name: "getClientOverrides",
    description: "List saved client file overrides that replace HTML, JavaScript, or CSS responses in the Radar Browser.",
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
    name: "applyClientValidationBypass",
    description: "Create or update a visible client file override from a captured HTML or JavaScript response and relax client-side validation so the browser can submit test values. Reload the Radar Browser after this tool.",
    safety: "prepare",
    schema: { captureId: "capture id", name: "string optional" }
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
  },
  {
    name: "getSitemapCoverage",
    description: "Read scoped sitemap coverage for the active session without mutating evidence.",
    safety: "observe",
    schema: { limit: "number optional" }
  },
  {
    name: "prepareTrafficQuery",
    description: "Validate and prepare a traffic query for the operator-visible traffic filter bar.",
    safety: "prepare",
    schema: { query: "traffic query string", reason: "string" }
  },
  {
    name: "getReplayContext",
    description: "Read scoped repeater tabs, environments, and collections without mutating replay state.",
    safety: "observe",
    schema: {}
  },
  {
    name: "prepareReplayTab",
    description: "Prepare a replay draft in a visible repeater tab; the operator still confirms transmit.",
    safety: "prepare",
    schema: {
      name: "tab name optional",
      draft: { method: "HTTP method", url: "http(s) URL inside scope", headers: {}, body: "" },
      environmentId: "environment id optional",
      note: "string optional"
    }
  },
  {
    name: "compareReplayResults",
    description: "Compare two replay history entries from the active or specified repeater tab.",
    safety: "observe",
    schema: { leftHistoryId: "history id", rightHistoryId: "history id", tabId: "tab id optional" }
  },
  {
    name: "getAssessmentCandidates",
    description: "Rank in-scope captures for Autonomous Assessment with endpoint impact, parameter shapes, identities, prior coverage, and applicable probe families. Omits raw secrets.",
    safety: "observe",
    schema: {}
  },
  {
    name: "runReplayExperiment",
    description: "Run one visible Repeater experiment: baseline plus up to eight sequential family mutations, store history, and return a structured comparison. Does not reconstruct authenticated requests from prompt text.",
    safety: "replay",
    schema: {
      captureId: "durable capture id",
      family: "cors-origin|reflection-context|injection-signal|authorization-omission|resource-id",
      hypothesis: "string",
      location: {
        kind: "replace-query|remove-query|append-query|replace-json|replace-form|replace-header|replace-cookie|replace-path-segment|remove-authorization|set-origin|set-host|set-method",
        name: "required for query, form, header, or cookie mutations; use a candidate parameterNames value",
        path: "required for replace-json",
        index: "required for replace-path-segment",
        value: "optional placeholder; Radar supplies family payloads"
      },
      values: ["optional reviewed payload"],
      encoding: ["url|json-escape|base64|case-variation"]
    }
  },
  {
    name: "getAssessmentProgress",
    description: "Read the assessment queue, coverage, remaining probe-request budget, and stop reason without sending traffic.",
    safety: "observe",
    schema: {}
  },
  {
    name: "getAutomateContext",
    description: "Read saved Automate payload sets and bounded session summaries without starting traffic.",
    safety: "observe",
    schema: {}
  },
  {
    name: "prepareAutomateDraft",
    description: "Prepare visible Automate controls with markers, payloads, and optional match rules; the operator still starts the run.",
    safety: "prepare",
    schema: {
      name: "run name optional",
      draft: { method: "HTTP method", url: "http(s) URL inside scope", headers: {}, body: "" },
      payloads: ["payload string"],
      rules: [{ kind: "match|extract", target: "status|header|body|regex|redirect|length|latency" }],
      environmentId: "environment id optional",
      note: "string optional"
    }
  },
  {
    name: "analyzeAutomateResults",
    description: "Summarize an existing Automate session's results, clusters, outliers, matches, and failures.",
    safety: "observe",
    schema: { sessionId: "automate session id optional" }
  },
  {
    name: "getWorkflowCatalog",
    description: "Read the operator-visible workflow catalog without running checks.",
    safety: "observe",
    schema: {}
  },
  {
    name: "getAgentContextSummary",
    description: "Read redacted AI-visible summaries for sitemap, findings, Advanced, workflows, notes, saved views, and run memory.",
    safety: "observe",
    schema: {}
  },
  {
    name: "getPluginInventory",
    description: "Read approved and installed local plugin inventory, permissions, and panel names without installing, approving, or executing plugins.",
    safety: "observe",
    schema: {}
  },
  {
    name: "getAdvancedTestingSummary",
    description: "Read local advanced testing summaries for GraphQL, imports, auth matrix, parameters, secrets, and header behavior without sending traffic.",
    safety: "observe",
    schema: {}
  },
  {
    name: "prepareWorkflowDraft",
    description: "Prepare a workflow JSON definition in the visible Workflows editor; the operator must save or run it manually.",
    safety: "prepare",
    schema: { workflow: { id: "string", name: "string", mode: "passive|active", scope: {}, steps: [] }, note: "string optional" }
  },
  {
    name: "runWorkflow",
    description: "Run an existing workflow by id through the same scoped workflow runtime visible to the operator.",
    safety: "replay",
    schema: { workflowId: "saved or built-in workflow id", inputs: { "input-id": "string value" } }
  },
  {
    name: "proposeRunMemory",
    description: "Propose a local project memory entry for operator review; this does not persist until the operator confirms.",
    safety: "prepare",
    schema: {
      kind: "hypothesis|dismissed-lead|retest-note",
      title: "string",
      notes: "string",
      evidenceRefs: ["capture:id"],
      dismissedReason: "string optional",
      retestState: "not-started|pending|passed|failed optional"
    }
  }
];
