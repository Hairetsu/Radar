import { describe, expect, it, vi } from "vitest";
import { defaultReplayTabState } from "../../shared/replayTabs.js";
import type { AgentDecision, AgentDecisionContext, AgentRun } from "../../shared/agent-types.js";
import type { CapturedRequest, InterceptQueueItem } from "../../shared/domain.js";
import { AgentRuntime } from "./runtime.js";

function capture(id: string, url: string, overrides: Partial<CapturedRequest> = {}): CapturedRequest {
  const parsed = new URL(url);
  return {
    id,
    startedAt: "2026-05-25T00:00:00.000Z",
    method: "GET",
    url,
    host: parsed.host,
    path: `${parsed.pathname}${parsed.search}`,
    requestHeaders: {},
    requestBody: "",
    status: 200,
    statusText: "OK",
    mimeType: "text/html",
    type: "Document",
    responseHeaders: {},
    responseBody: "",
    durationMs: 12,
    allowed: true,
    source: "browser",
    ...overrides
  };
}

function makeRuntime(
  seed?: AgentRun,
  options: {
    allowlist?: string[];
    captures?: CapturedRequest[];
    interceptQueue?: InterceptQueueItem[];
    replayTabState?: ReturnType<typeof defaultReplayTabState>;
    decideNextAction?: (context: AgentDecisionContext) => Promise<AgentDecision>;
  } = {}
) {
  const runs = new Map<string, AgentRun>();
  if (seed) {
    runs.set(seed.id, seed);
  }

  const openBrowser = vi.fn(async (url: string) => ({ open: true, url, title: "Chrome", loading: false, engine: "chrome" as const }));
  const navigateBrowser = vi.fn(async (url: string) => ({
    open: true,
    url,
    title: "Chrome",
    loading: false,
    engine: "chrome" as const
  }));
  const sendReplay = vi.fn(async () => ({ ok: true, status: 200, statusText: "OK", headers: {}, body: "", bytes: 0, durationMs: 1 }));
  const waitForNetworkIdle = vi.fn(async () => ({ idle: true, waitedMs: 10 }));
  const getPageText = vi.fn(async () => ({ url: "https://hairetsu.com", title: "Hairetsu", text: "Welcome" }));
  const getDomSummary = vi.fn(async () => ({
    url: "https://hairetsu.com",
    title: "Hairetsu",
    text: "Welcome",
    links: [],
    buttons: [],
    forms: []
  }));
  const getClickableElements = vi.fn(async () => ({
    url: "https://hairetsu.com",
    elements: [{ selector: "#login", text: "Login", tag: "a", role: "", href: "https://hairetsu.com/login" }]
  }));
  const clickElement = vi.fn(async ({ selector }: { selector: string }) => ({ clicked: true, selector, url: "https://hairetsu.com/login" }));
  const fillInput = vi.fn(async ({ selector }: { selector: string; value: string }) => ({ filled: true, selector }));
  const submitForm = vi.fn(async ({ selector }: { selector: string }) => ({ submitted: true, selector, url: "https://hairetsu.com/account" }));
  const getCookies = vi.fn(async () => ({ cookies: [] }));
  const getStorageState = vi.fn(async () => ({
    url: "https://hairetsu.com",
    origin: "https://hairetsu.com",
    cookies: [],
    localStorage: {},
    sessionStorage: {}
  }));
  const saveAuthState = vi.fn(async ({ name }: { name: string }) => ({
    name,
    origin: "https://hairetsu.com",
    createdAt: "2026-05-25T00:00:00.000Z",
    cookieCount: 0,
    localStorageKeys: [],
    sessionStorageKeys: []
  }));
  const loadAuthState = vi.fn(saveAuthState);
  const listAuthStates = vi.fn(async () => ({ states: [] }));
  const compareAuthStates = vi.fn(async ({ left, right }: { left: string; right: string }) => ({
    left,
    right,
    observations: [{ name: "sid", issue: "Cookie value differs between auth states.", severity: "info" as const }]
  }));
  let activeRunId = "";
  const decideNextAction = vi.fn(
    options.decideNextAction ||
      (async () => ({
        action: "finish",
        rationale: "Planner finished.",
        findings: []
      }))
  );

  const runtime = new AgentRuntime({
    currentSessionId: () => "session-test",
    allowlist: () => options.allowlist || ["https://allowed.test"],
    saveRun: (run) => {
      runs.set(run.id, run);
    },
    loadRun: (runId) => runs.get(runId) || null,
    listRuns: () => Array.from(runs.values()),
    getBrowserState: () => ({ open: false, url: "", title: "", loading: false, engine: "none" }),
    openBrowser,
    navigateBrowser,
    getCaptures: () => (options.captures || []).map((item) => ({ ...item, agentRunId: item.agentRunId || activeRunId })),
    getInterceptState: () => ({
      config: { requestEnabled: true, responseEnabled: true },
      queue: options.interceptQueue || []
    }),
    getReplayTabState: () => options.replayTabState || defaultReplayTabState(),
    setReplayTabState: (state) => state,
    listReplayEnvironments: () => [],
    listReplayCollections: () => [],
    sendReplay,
    waitForNetworkIdle,
    getPageText,
    getDomSummary,
    getClickableElements,
    clickElement,
    fillInput,
    submitForm,
    getCookies,
    getStorageState,
    saveAuthState,
    loadAuthState,
    listAuthStates,
    compareAuthStates,
    decideNextAction,
    setActiveRunId: (runId) => {
      activeRunId = runId || "";
    },
    waitForSettle: vi.fn(async () => undefined)
  });

  return { runtime, runs, openBrowser, navigateBrowser, sendReplay, decideNextAction, clickElement, fillInput, submitForm, saveAuthState };
}

describe("AgentRuntime", () => {
  it("marks active runs stopped", () => {
    const run: AgentRun = {
      id: "agent-1",
      sessionId: "session-test",
      createdAt: "2026-05-25T00:00:00.000Z",
      updatedAt: "2026-05-25T00:00:00.000Z",
      goal: "Inspect target",
      status: "running",
      policy: {
        maxRuntimeMs: 120000,
        maxSteps: 8,
        maxReplay: 1,
        maxCaptureSample: 20,
        allowRawContext: false
      },
      timeline: [],
      findings: []
    };
    const { runtime, runs } = makeRuntime(run);

    const stopped = runtime.stop(run.id);

    expect(stopped?.status).toBe("stopped");
    expect(runs.get(run.id)?.timeline.at(-1)?.note).toBe("Stop requested by operator.");
  });

  it("opens a bare domain from the goal instead of the default start url", async () => {
    const { runtime, openBrowser, decideNextAction } = makeRuntime(undefined, {
      allowlist: ["https://hairetsu.com"],
      decideNextAction: async (context) =>
        context.stepCount === 0
          ? {
              action: "tool",
              call: { tool: "openBrowser", input: { url: context.startUrl } },
              rationale: "Open the target from the goal."
            }
          : { action: "finish", rationale: "Done.", findings: [] }
    });

    runtime.start({
      goal: "Inspect hairetsu.com for auth, session, and API hardening issues.",
      startUrl: "http://localhost:3000"
    });

    await vi.waitFor(() => {
      expect(openBrowser).toHaveBeenCalledWith("https://hairetsu.com");
    });
    expect(decideNextAction).toHaveBeenCalledWith(expect.objectContaining({ targetOrigin: "https://hairetsu.com" }));
  });

  it("ignores stale allowed localhost captures during a target-origin run", async () => {
    const { runtime, runs, sendReplay } = makeRuntime(undefined, {
      allowlist: ["http://localhost:*", "https://hairetsu.com"],
      captures: [
        capture("local-error", "http://localhost:3000/favicon.ico", {
          agentRunId: "previous-run",
          status: 502,
          statusText: "Error communicating with upstream server",
          path: "/favicon.ico"
        })
      ],
      decideNextAction: async (context) =>
        context.stepCount === 0
          ? {
              action: "tool",
              call: { tool: "getCaptures", input: { limit: 20, targetOrigin: context.targetOrigin } },
              rationale: "Sample target-origin traffic."
            }
          : {
              action: "finish",
              rationale: "No target-origin captures for https://hairetsu.com were available to inspect.",
              findings: []
            }
    });

    const run = runtime.start({
      goal: "Inspect hairetsu.com for auth, session, and API hardening issues.",
      startUrl: "http://localhost:3000"
    });

    await vi.waitFor(() => {
      expect(runs.get(run.id)?.status).toBe("completed");
    });

    expect(runs.get(run.id)?.findings).toEqual([]);
    expect(sendReplay).not.toHaveBeenCalled();
    expect(runs.get(run.id)?.timeline.at(-1)?.note).toContain("No target-origin captures for https://hairetsu.com");
    const captureResult = runs.get(run.id)?.timeline.find((entry) => entry.toolResult?.tool === "getCaptures")?.toolResult;
    expect(captureResult?.ok && captureResult.data.captures).toEqual([]);
  });

  it("feeds all run-scoped in-scope captures to the planner and default capture reads", async () => {
    const seenContexts: AgentDecisionContext[] = [];
    const { runtime, runs } = makeRuntime(undefined, {
      allowlist: ["https://hairetsu.com", "https://www.hairetsu.com"],
      captures: [
        capture("apex", "https://hairetsu.com/", {
          status: 307,
          statusText: "Temporary Redirect",
          responseHeaders: { location: "https://www.hairetsu.com/" }
        }),
        capture("www", "https://www.hairetsu.com/", {
          responseHeaders: { "content-type": "text/html" },
          responseBody: "<html>canonical</html>"
        })
      ],
      decideNextAction: async (context) => {
        seenContexts.push(context);
        return context.stepCount === 0
          ? { action: "tool", call: { tool: "getCaptures", input: { limit: 20 } } }
          : { action: "finish", rationale: "Done.", findings: [] };
      }
    });

    const run = runtime.start({
      goal: "Inspect hairetsu.com for auth, session, and API hardening issues.",
      startUrl: "https://hairetsu.com"
    });

    await vi.waitFor(() => {
      expect(runs.get(run.id)?.status).toBe("completed");
    });

    expect(seenContexts[0]?.capturedTraffic.map((item) => item.id)).toEqual(["apex", "www"]);
    const captureResult = runs.get(run.id)?.timeline.find((entry) => entry.toolResult?.tool === "getCaptures")?.toolResult;
    expect(captureResult?.ok && captureResult.data.captures.map((item) => item.id)).toEqual(["apex", "www"]);
  });

  it("executes only the actions selected by the agent", async () => {
    const decisions: AgentDecision[] = [
      { action: "tool", call: { tool: "showView", input: { view: "traffic", reason: "Observe traffic." } } },
      { action: "tool", call: { tool: "openBrowser", input: { url: "https://hairetsu.com" } } },
      { action: "tool", call: { tool: "navigateBrowser", input: { url: "https://hairetsu.com/login" } } },
      { action: "tool", call: { tool: "getCaptures", input: { limit: 20, targetOrigin: "https://hairetsu.com" } } },
      {
        action: "finish",
        rationale: "Agent deemed the run complete.",
        findings: [{ title: "Draft", confidence: "low", evidenceRefs: ["capture:home"], notes: "Needs review." }]
      }
    ];
    const { runtime, runs, navigateBrowser } = makeRuntime(undefined, {
      allowlist: ["https://hairetsu.com"],
      captures: [
        capture("home", "https://hairetsu.com/", {
          responseBody: '<html><a href="/login">Sign in</a></html>',
          responseHeaders: { "content-type": "text/html" }
        }),
        capture("api", "https://hairetsu.com/api", {
          mimeType: "application/json",
          type: "Fetch",
          responseHeaders: { "content-type": "application/json" },
          responseBody: "{}"
        })
      ],
      decideNextAction: async () => decisions.shift() || { action: "finish", rationale: "Done.", findings: [] }
    });

    const run = runtime.start({
      goal: "Inspect hairetsu.com for auth, session, and API hardening issues.",
      startUrl: "https://hairetsu.com"
    });

    await vi.waitFor(() => {
      expect(runs.get(run.id)?.status).toBe("completed");
    });

    expect(navigateBrowser).toHaveBeenCalledWith("https://hairetsu.com/login");
    expect(navigateBrowser).not.toHaveBeenCalledWith("https://hairetsu.com/api");
    expect(runs.get(run.id)?.findings[0]?.title).toBe("Draft");
  });

  it("lets AI read intercept queue and prepare edits without forwarding traffic", async () => {
    const queueItem: InterceptQueueItem = {
      id: "intercept-1",
      captureId: "cap-1",
      stage: "request",
      queuedAt: "2026-05-25T00:00:00.000Z",
      method: "POST",
      url: "https://hairetsu.com/login",
      host: "hairetsu.com",
      path: "/login",
      headers: { "Content-Type": "application/json" },
      body: "{\"role\":\"user\"}",
      allowed: true,
      source: "proxy",
      note: "Paused before upstream"
    };
    const decisions: AgentDecision[] = [
      { action: "tool", call: { tool: "showView", input: { view: "intercept", reason: "Inspect queued request." } } },
      { action: "tool", call: { tool: "getInterceptQueue", input: { limit: 5 } } },
      {
        action: "tool",
        call: {
          tool: "prepareInterceptEdit",
          input: {
            id: "intercept-1",
            draft: {
              method: "POST",
              url: "https://hairetsu.com/login",
              headers: { "Content-Type": "application/json" },
              body: "{\"role\":\"admin\"}"
            },
            note: "Prepare an operator-reviewed role mutation."
          }
        }
      },
      { action: "finish", rationale: "Prepared visible edit.", findings: [] }
    ];
    const { runtime, runs, sendReplay } = makeRuntime(undefined, {
      allowlist: ["https://hairetsu.com"],
      interceptQueue: [queueItem],
      decideNextAction: async () => decisions.shift() || { action: "finish", rationale: "Done.", findings: [] }
    });

    const run = runtime.start({ goal: "Prepare an intercept edit for https://hairetsu.com", startUrl: "https://hairetsu.com" });

    await vi.waitFor(() => {
      expect(runs.get(run.id)?.status).toBe("completed");
    });

    const prepared = runs.get(run.id)?.timeline.find((entry) => entry.toolResult?.tool === "prepareInterceptEdit")?.toolResult;
    expect(prepared?.ok && prepared.data.draft?.body).toBe("{\"role\":\"admin\"}");
    expect(sendReplay).not.toHaveBeenCalled();
  });

  it("fails instead of falling back when the agent cannot choose an action", async () => {
    const { runtime, runs, openBrowser } = makeRuntime(undefined, {
      allowlist: ["https://hairetsu.com"],
      decideNextAction: async () => {
        throw new Error("planner unavailable");
      }
    });

    const run = runtime.start({
      goal: "Inspect hairetsu.com for auth, session, and API hardening issues.",
      startUrl: "https://hairetsu.com"
    });

    await vi.waitFor(() => {
      expect(runs.get(run.id)?.status).toBe("failed");
    });

    expect(runs.get(run.id)?.error).toBe("planner unavailable");
    expect(openBrowser).not.toHaveBeenCalled();
  });

  it("rejects planner findings without evidence references", async () => {
    const { runtime, runs } = makeRuntime(undefined, {
      allowlist: ["https://hairetsu.com"],
      decideNextAction: async () => ({
        action: "finish",
        rationale: "Done.",
        findings: [{ title: "Unsupported claim", confidence: "low", evidenceRefs: [], notes: "No citation." }]
      })
    });

    const run = runtime.start({
      goal: "Inspect hairetsu.com",
      startUrl: "https://hairetsu.com"
    });

    await vi.waitFor(() => {
      expect(runs.get(run.id)?.status).toBe("failed");
    });

    expect(runs.get(run.id)?.error).toBe("Agent findings must cite at least one evidence reference.");
  });

  it("runs browser interaction tools selected by the planner", async () => {
    const decisions: AgentDecision[] = [
      { action: "tool", call: { tool: "getClickableElements", input: {} } },
      { action: "tool", call: { tool: "clickElement", input: { selector: "#login" } } },
      { action: "tool", call: { tool: "fillInput", input: { selector: "#email", value: "test@example.com" } } },
      { action: "tool", call: { tool: "submitForm", input: { selector: "form" } } },
      { action: "finish", rationale: "Done.", findings: [] }
    ];
    const { runtime, runs, clickElement, fillInput, submitForm } = makeRuntime(undefined, {
      allowlist: ["https://hairetsu.com"],
      decideNextAction: async () => decisions.shift() || { action: "finish", rationale: "Done.", findings: [] }
    });

    const run = runtime.start({ goal: "Inspect hairetsu.com", startUrl: "https://hairetsu.com" });

    await vi.waitFor(() => {
      expect(runs.get(run.id)?.status).toBe("completed");
    });

    expect(clickElement).toHaveBeenCalledWith({ selector: "#login" });
    expect(fillInput).toHaveBeenCalledWith({ selector: "#email", value: "test@example.com" });
    expect(submitForm).toHaveBeenCalledWith({ selector: "form" });
  });

  it("produces evidence observations from run-scoped captures", async () => {
    const decisions: AgentDecision[] = [
      { action: "tool", call: { tool: "analyzeSecurityHeaders", input: { targetOrigin: "https://hairetsu.com" } } },
      { action: "tool", call: { tool: "analyzeCookieFlags", input: { targetOrigin: "https://hairetsu.com" } } },
      { action: "tool", call: { tool: "checkCorsPolicy", input: { targetOrigin: "https://hairetsu.com" } } },
      { action: "finish", rationale: "Done.", findings: [] }
    ];
    const { runtime, runs } = makeRuntime(undefined, {
      allowlist: ["https://hairetsu.com"],
      captures: [
        capture("cap-sec", "https://hairetsu.com/", {
          responseHeaders: {
            "content-type": "text/html",
            "set-cookie": "sid=abc; Path=/",
            "access-control-allow-origin": "*"
          }
        })
      ],
      decideNextAction: async () => decisions.shift() || { action: "finish", rationale: "Done.", findings: [] }
    });

    const run = runtime.start({ goal: "Inspect hairetsu.com", startUrl: "https://hairetsu.com" });

    await vi.waitFor(() => {
      expect(runs.get(run.id)?.status).toBe("completed");
    });

    const observations = runs
      .get(run.id)
      ?.timeline.flatMap((entry) =>
        entry.toolResult?.ok && "observations" in entry.toolResult.data ? entry.toolResult.data.observations : []
      );
    expect(observations?.map((item) => item.name)).toEqual(
      expect.arrayContaining(["content-security-policy", "sid", "access-control-allow-origin"])
    );
  });

  it("exposes replay context and prepares visible replay tabs", async () => {
    const decisions: AgentDecision[] = [
      { action: "tool", call: { tool: "getReplayContext", input: {} } },
      {
        action: "tool",
        call: {
          tool: "prepareReplayTab",
          input: {
            name: "Auth",
            draft: { method: "GET", url: "https://hairetsu.com/account", headers: {}, body: "" },
            note: "Review auth replay"
          }
        }
      },
      { action: "finish", rationale: "Done.", findings: [] }
    ];
    const { runtime, runs } = makeRuntime(undefined, {
      allowlist: ["https://hairetsu.com"],
      decideNextAction: async () => decisions.shift() || { action: "finish", rationale: "Done.", findings: [] }
    });
    const run = runtime.start({ goal: "Review auth replay", startUrl: "https://hairetsu.com" });

    await vi.waitFor(() => {
      expect(runs.get(run.id)?.status).toBe("completed");
    });

    const contextResult = runs
      .get(run.id)
      ?.timeline.find((entry) => entry.toolResult?.tool === "getReplayContext" && entry.toolResult.ok);
    expect(contextResult?.toolResult?.ok).toBe(true);
    const prepareResult = runs
      .get(run.id)
      ?.timeline.find((entry) => entry.toolResult?.tool === "prepareReplayTab" && entry.toolResult.ok);
    expect(prepareResult?.toolResult?.data.note).toBe("Review auth replay");
  });

  it("compares replay history entries from the active tab", async () => {
    const tabState = defaultReplayTabState();
    tabState.tabs[0].history = [
      {
        id: "left",
        sentAt: "2026-01-01T00:00:00.000Z",
        draft: { method: "GET", url: "https://hairetsu.com", headers: {}, body: "" },
        result: { ok: true, status: 200, statusText: "OK", durationMs: 1, headers: {}, body: "a", bytes: 1 }
      },
      {
        id: "right",
        sentAt: "2026-01-02T00:00:00.000Z",
        draft: { method: "GET", url: "https://hairetsu.com", headers: {}, body: "" },
        result: { ok: false, status: 403, statusText: "Forbidden", durationMs: 2, headers: {}, body: "b", bytes: 1 }
      }
    ];
    const decisions: AgentDecision[] = [
      {
        action: "tool",
        call: {
          tool: "compareReplayResults",
          input: { leftHistoryId: "left", rightHistoryId: "right" }
        }
      },
      { action: "finish", rationale: "Done.", findings: [] }
    ];
    const { runtime, runs } = makeRuntime(undefined, {
      replayTabState: tabState,
      decideNextAction: async () => decisions.shift() || { action: "finish", rationale: "Done.", findings: [] }
    });
    const run = runtime.start({ goal: "Compare replay history", startUrl: "https://hairetsu.com" });

    await vi.waitFor(() => {
      expect(runs.get(run.id)?.status).toBe("completed");
    });

    const compareResult = runs
      .get(run.id)
      ?.timeline.find((entry) => entry.toolResult?.tool === "compareReplayResults" && entry.toolResult.ok);
    expect(compareResult?.toolResult?.data.statusChanged).toBe(true);
  });
});
