import { describe, expect, it, vi } from "vitest";
import type { AgentDecision, AgentDecisionContext, AgentRun } from "../../shared/agent-types.js";
import type { CapturedRequest } from "../../shared/domain.js";
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
});
