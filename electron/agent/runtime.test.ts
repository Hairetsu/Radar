import { describe, expect, it, vi } from "vitest";
import { defaultReplayTabState } from "../../shared/replayTabs.js";
import { createAgentMission } from "../../shared/agentMission.js";
import type {
  AgentCapabilityLeaseRequest,
  AgentDecision,
  AgentDecisionContext,
  AgentRun,
  AgentRunMemoryEntry,
  AgentStorageState
} from "../../shared/agent-types.js";
import type {
  AutomatePayloadSet,
  AutomateSession,
  BrowserState,
  CapturedRequest,
  Finding,
  InstalledPlugin,
  InterceptQueueItem,
  ProjectNote,
  SavedView,
  WorkflowDefinition,
  WorkflowRun
} from "../../shared/domain.js";
import { AgentRuntime } from "./runtime.js";
import type { IdentityProfile } from "../../shared/identityProfiles.js";

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
    automatePayloadSets?: AutomatePayloadSet[];
    automateSessions?: AutomateSession[];
    workflows?: WorkflowDefinition[];
    workflowRuns?: WorkflowRun[];
    workflowRun?: WorkflowRun;
    findings?: Finding[];
    projectNotes?: ProjectNote[];
    savedViews?: SavedView[];
    runMemory?: AgentRunMemoryEntry[];
    plugins?: InstalledPlugin[];
    identities?: IdentityProfile[];
    browserState?: BrowserState;
    openBrowser?: (url: string) => Promise<BrowserState>;
    navigateBrowser?: (url: string) => Promise<BrowserState>;
    getStorageState?: () => Promise<AgentStorageState>;
    decideNextAction?: (context: AgentDecisionContext) => Promise<AgentDecision>;
    leaseRequest?: AgentCapabilityLeaseRequest;
  } = {}
) {
  const runs = new Map<string, AgentRun>();
  if (seed) {
    runs.set(seed.id, seed);
  }

  const closedBrowserState = { open: false, url: "", title: "", loading: false, engine: "none" as const };
  const getBrowserState = vi.fn(() => options.browserState || closedBrowserState);
  const openBrowser = vi.fn(
    options.openBrowser ||
      (async (url: string) => ({ open: true, url, title: "Chrome", loading: false, engine: "chrome" as const }))
  );
  const navigateBrowser = vi.fn(
    options.navigateBrowser ||
      (async (url: string) => ({
        open: true,
        url,
        title: "Chrome",
        loading: false,
        engine: "chrome" as const
      }))
  );
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
  const getStorageState = vi.fn(
    options.getStorageState ||
      (async () => ({
        url: "https://hairetsu.com",
        origin: "https://hairetsu.com",
        cookies: [],
        localStorage: {},
        sessionStorage: {}
      }))
  );
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
  const listIdentityProfiles = vi.fn(() => options.identities || []);
  const getIdentityLabContext = vi.fn(async () => ({
    identities: listIdentityProfiles(),
    activeIdentityId: undefined,
    activeActivationId: undefined,
    attributedCaptureCount: (options.captures || []).filter((item) => item.identityId && item.activationId).length
  }));
  const activateIdentityProfile = vi.fn(async ({ identityId }: { identityId: string }) => {
    const identity = listIdentityProfiles().find((item) => item.id === identityId);
    if (!identity) throw new Error("Identity was not found.");
    return {
      identity,
      activation: {
        id: "activation-test",
        sessionId: "session-test",
        workspaceId: identity.workspaceId,
        identityId,
        startedAt: "2026-05-25T00:00:00.000Z",
        status: "active" as const,
        browserInstanceId: "browser-test"
      },
      url: identity.origin
    };
  });
  const verifyIdentityProfile = vi.fn(async ({ identityId }: { identityId: string }) => {
    const identity = listIdentityProfiles().find((item) => item.id === identityId);
    if (!identity) throw new Error("Identity was not found.");
    return { identity: { ...identity, health: "healthy" as const }, url: identity.origin };
  });
  const runWorkflow = vi.fn(async ({ workflowId, inputs, source }: { workflowId: string; inputs?: Record<string, string>; source?: "manual" | "ai" }) => ({
    id: "workflow-run-test",
    workflowId,
    workflowName: "Security Headers",
    sessionId: "session-test",
    source: source || "ai",
    mode: "passive" as const,
    status: "completed" as const,
    inputs: inputs || {},
    startedAt: "2026-05-25T00:00:00.000Z",
    completedAt: "2026-05-25T00:00:01.000Z",
    stepCount: 1,
    actionCount: 0,
    results: []
  }));
  let activeRunId = "";
  const baseDecideNextAction =
    options.decideNextAction ||
    (async () => ({
      action: "finish" as const,
      rationale: "Planner finished.",
      findings: []
    }));
  const decideNextAction = vi.fn(async (context: AgentDecisionContext) => {
    const decision = await baseDecideNextAction(context);
    if (
      decision.action === "tool" &&
      options.leaseRequest?.tools.includes(decision.call.tool) &&
      context.capabilities.leases.length === 0
    ) {
      return { ...decision, leaseRequest: options.leaseRequest };
    }
    return decision;
  });
  const runtime = new AgentRuntime({
    currentSessionId: () => "session-test",
    allowlist: () => options.allowlist || ["https://allowed.test"],
    saveRun: (run) => {
      runs.set(run.id, run);
    },
    loadRun: (runId) => runs.get(runId) || null,
    listRuns: () => Array.from(runs.values()),
    getBrowserState,
    openBrowser,
    navigateBrowser,
    getCaptures: () => (options.captures || []).map((item) => ({ ...item, agentRunId: item.agentRunId || activeRunId })),
    getWebSocketEvents: () => [],
    getInterceptState: () => ({
      config: { requestEnabled: true, responseEnabled: true },
      queue: options.interceptQueue || []
    }),
    getReplayTabState: () => options.replayTabState || defaultReplayTabState(),
    setReplayTabState: (state) => state,
    listReplayEnvironments: () => [],
    listReplayCollections: () => [],
    listAutomatePayloadSets: () => options.automatePayloadSets || [],
    listAutomateSessions: () => options.automateSessions || [],
    listWorkflows: () => options.workflows || [],
    listWorkflowRuns: () => options.workflowRuns || [],
    listFindings: () => options.findings || [],
    listProjectNotes: () => options.projectNotes || [],
    listSavedViews: () => options.savedViews || [],
    listRunMemory: () => options.runMemory || [],
    listPlugins: () => options.plugins || [],
    runWorkflow: (input) => options.workflowRun ? Promise.resolve(options.workflowRun) : runWorkflow(input),
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
    listIdentityProfiles,
    getIdentityLabContext,
    activateIdentityProfile,
    verifyIdentityProfile,
    decideNextAction,
    setActiveRunId: (runId) => {
      activeRunId = runId || "";
    },
    waitForSettle: vi.fn(async () => undefined)
  });

  return {
    runtime,
    runs,
    openBrowser,
    navigateBrowser,
    getBrowserState,
    sendReplay,
    runWorkflow,
    decideNextAction,
    clickElement,
    fillInput,
    submitForm,
    saveAuthState,
    activateIdentityProfile,
    verifyIdentityProfile
  };
}

async function grantNextDraftAndResume(
  runtime: AgentRuntime,
  runId: string
) {
  let paused: AgentRun | undefined;
  await vi.waitFor(() => {
    paused = runtime.get(runId) || undefined;
    expect(paused?.status).toBe("paused");
    expect(paused?.capabilities?.leases.some((item) => item.status === "draft")).toBe(true);
  });
  const draft = paused?.capabilities?.leases.find((item) => item.status === "draft");
  if (!draft) {
    throw new Error("Test capability lease draft was not created.");
  }
  await runtime.updateCapabilities(runId, {
    action: "grant",
    expectedRevision: paused?.capabilities?.revision || 0,
    leaseId: draft.id
  });
  runtime.resume(runId);
}

function browserLease(
  tools: AgentCapabilityLeaseRequest["tools"],
  grants: AgentCapabilityLeaseRequest["grants"],
  riskTier: AgentCapabilityLeaseRequest["riskTier"] = "active"
): AgentCapabilityLeaseRequest {
  return {
    name: "Test browser authority",
    riskTier,
    tools,
    grants,
    durationMs: 180_000,
    maxUses: 8,
    maxRequests: 16,
    maxConcurrency: 1,
    maxPayloadBytes: 64 * 1024,
    reason: "Exercise the exact capability selected by this runtime test."
  };
}

function identityProfile(id = "identity-user-a"): IdentityProfile {
  return {
    id,
    workspaceId: "workspace-test",
    label: "Tenant A user",
    kind: "user",
    roleLabel: "member",
    tenantLabel: "tenant-a",
    origin: "https://hairetsu.com",
    notes: "",
    isolation: "dedicated-profile",
    health: "unknown",
    refreshMode: "manual",
    jarRevision: 0,
    containerId: `container-${id}`,
    createdAt: "2026-05-25T00:00:00.000Z",
    updatedAt: "2026-05-25T00:00:00.000Z"
  };
}

describe("AgentRuntime", () => {
  it("uses one sequential browser operator and reviews captured path data before continuing", async () => {
    const captures: CapturedRequest[] = [];
    const plannerContexts: AgentDecisionContext[] = [];
    let decisionIndex = 0;
    const { runtime, runs, navigateBrowser, decideNextAction } = makeRuntime(undefined, {
      allowlist: ["https://hairetsu.com"],
      captures,
      browserState: {
        open: true,
        url: "https://hairetsu.com/",
        title: "Home",
        loading: false,
        engine: "chrome"
      },
      navigateBrowser: async (url) => {
        captures.push(capture("capture-account", url, { mimeType: "text/html" }));
        return { open: true, url, title: "Account", loading: false, engine: "chrome" };
      },
      decideNextAction: async (context) => {
        plannerContexts.push(context);
        decisionIndex += 1;
        if (decisionIndex === 1) {
          return {
            action: "tool",
            call: { tool: "navigateBrowser", input: { url: "https://hairetsu.com/account" } },
            rationale: "Visit one task-relevant in-scope path."
          };
        }
        if (decisionIndex === 2) {
          return {
            action: "tool",
            call: { tool: "waitForNetworkIdle", input: {} },
            rationale: "Let the visited path finish collecting traffic."
          };
        }
        return { action: "finish", rationale: "The sequential path evidence is available.", findings: [] };
      }
    });

    const run = runtime.start({
      goal: "Inspect the account path on https://hairetsu.com",
      startUrl: "https://hairetsu.com/",
      profileId: "browser-assessment"
    });

    await vi.waitFor(() => expect(runs.get(run.id)?.status).toBe("completed"));
    expect(navigateBrowser).toHaveBeenCalledTimes(1);
    expect(decideNextAction).toHaveBeenCalledTimes(3);
    expect(plannerContexts[0]?.capturedTraffic).toEqual([]);
    expect(plannerContexts[1]?.capturedTraffic).toEqual([
      expect.objectContaining({ id: "capture-account", url: "https://hairetsu.com/account" })
    ]);
    expect(runs.get(run.id)?.timeline.some((entry) => entry.phase === "recon")).toBe(false);
  });

  it("continues a standard run through scoped browser navigation without manual resume", async () => {
    let storageReadCount = 0;
    const decisions: AgentDecision[] = [
      {
        action: "tool",
        call: { tool: "openBrowser", input: { url: "https://hairetsu.com" } },
        rationale: "Open the scoped target."
      },
      {
        action: "tool",
        call: { tool: "getDomSummary", input: {} },
        rationale: "Inspect the visible page structure."
      },
      { action: "finish", rationale: "Scoped inspection complete.", findings: [] }
    ];
    const { runtime, runs, openBrowser, decideNextAction } = makeRuntime(undefined, {
      allowlist: ["https://hairetsu.com"],
      getStorageState: async () => {
        storageReadCount += 1;
        if (storageReadCount <= 2) {
          throw new Error("Browser is not open yet.");
        }
        return {
          url: "https://hairetsu.com",
          origin: "https://hairetsu.com",
          cookies: [],
          localStorage: {},
          sessionStorage: {}
        };
      },
      decideNextAction: async () => decisions.shift() || { action: "finish", rationale: "Done.", findings: [] }
    });

    const run = runtime.start({
      goal: "Inspect https://hairetsu.com",
      startUrl: "https://hairetsu.com",
      profileId: "browser-assessment"
    });

    await vi.waitFor(() => {
      const current = runs.get(run.id);
      expect(current?.status, current?.timeline.map((entry) => entry.note || entry.summary).join("\n")).toBe("completed");
    });
    expect(openBrowser).toHaveBeenCalledTimes(1);
    expect(decideNextAction).toHaveBeenCalledTimes(3);
    expect(runs.get(run.id)?.timeline).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ summary: "openBrowser can continue autonomously within saved Scope" }),
        expect.objectContaining({ summary: "openBrowser completed" })
      ])
    );
    expect(runs.get(run.id)?.timeline.some((entry) => entry.summary === "Lesson checkpoint — waiting for operator")).toBe(false);
    expect(runs.get(run.id)?.timeline.some((entry) => entry.note?.includes("Auth state changed unexpectedly"))).toBe(false);
  });

  it("keeps successful in-scope navigation redirects out of recovery", async () => {
    const decisions: AgentDecision[] = [
      {
        action: "tool",
        call: { tool: "openBrowser", input: { url: "https://hairetsu.com" } },
        rationale: "Open the scoped canonical target."
      },
      { action: "finish", rationale: "Canonical target opened.", findings: [] }
    ];
    const { runtime, runs } = makeRuntime(undefined, {
      allowlist: ["https://hairetsu.com", "https://www.hairetsu.com"],
      openBrowser: async () => ({
        open: true,
        url: "https://www.hairetsu.com/",
        title: "Canonical target",
        loading: false,
        engine: "chrome"
      }),
      decideNextAction: async () => decisions.shift() || { action: "finish", findings: [] }
    });

    const run = runtime.start({
      goal: "Inspect https://hairetsu.com",
      startUrl: "https://hairetsu.com",
      profileId: "browser-assessment"
    });

    await vi.waitFor(() => expect(runs.get(run.id)?.status).toBe("completed"));
    expect(
      runs.get(run.id)?.timeline.some((entry) => entry.summary === "Unexpected effect revoked capability lease")
    ).toBe(false);
  });

  it("does not treat session rotation during successful navigation as a failed step", async () => {
    let storageReadCount = 0;
    const decisions: AgentDecision[] = [
      {
        action: "tool",
        call: { tool: "navigateBrowser", input: { url: "https://hairetsu.com/next" } },
        rationale: "Follow the scoped link."
      },
      { action: "finish", rationale: "Scoped navigation complete.", findings: [] }
    ];
    const { runtime, runs } = makeRuntime(undefined, {
      allowlist: ["https://hairetsu.com"],
      browserState: {
        open: true,
        url: "https://hairetsu.com/",
        title: "Target",
        loading: false,
        engine: "chrome"
      },
      getStorageState: async () => {
        storageReadCount += 1;
        return {
          url: "https://hairetsu.com/",
          origin: "https://hairetsu.com",
          cookies: [
            {
              name: "session",
              value: storageReadCount <= 2 ? "before-navigation" : "after-navigation",
              domain: "hairetsu.com",
              path: "/"
            }
          ],
          localStorage: {},
          sessionStorage: {}
        };
      },
      decideNextAction: async () => decisions.shift() || { action: "finish", findings: [] }
    });

    const run = runtime.start({
      goal: "Inspect https://hairetsu.com/next",
      startUrl: "https://hairetsu.com/",
      profileId: "browser-assessment"
    });

    await vi.waitFor(() => expect(runs.get(run.id)?.status).toBe("completed"));
    expect(storageReadCount).toBe(2);
    expect(runs.get(run.id)?.timeline.some((entry) => entry.note?.includes("Auth state changed unexpectedly"))).toBe(false);
  });

  it("still blocks unexpected auth drift during a replay", async () => {
    let storageReadCount = 0;
    const { runtime, runs, sendReplay } = makeRuntime(undefined, {
      allowlist: ["https://hairetsu.com"],
      getStorageState: async () => {
        storageReadCount += 1;
        return {
          url: "https://hairetsu.com/",
          origin: "https://hairetsu.com",
          cookies: [
            {
              name: "session",
              value: storageReadCount <= 3 ? "before-replay" : "after-replay",
              domain: "hairetsu.com",
              path: "/"
            }
          ],
          localStorage: {},
          sessionStorage: {}
        };
      },
      decideNextAction: async () => ({
        action: "tool",
        call: {
          tool: "sendReplay",
          input: { draft: { method: "GET", url: "https://hairetsu.com/account", headers: {}, body: "" } }
        }
      })
    });
    const run = runtime.start({
      goal: "Compare account response",
      startUrl: "https://hairetsu.com/account",
      profileId: "advanced-api-review"
    });

    await grantNextDraftAndResume(runtime, run.id);
    await vi.waitFor(() => expect(runs.get(run.id)?.status).toBe("paused"));
    expect(sendReplay).toHaveBeenCalledTimes(1);
    expect(runs.get(run.id)?.timeline.some((entry) => entry.note?.includes("Auth state changed unexpectedly"))).toBe(true);
  });

  it("paces Tutorial Mode at evidence checkpoints and preserves lesson guidance", async () => {
    const decisions: AgentDecision[] = [
      {
        action: "tool",
        call: { tool: "getBrowserState", input: {} },
        rationale: "Establish the visible browser baseline.",
        tutorial: {
          stage: "observe",
          title: "Establish a baseline",
          clue: "The current URL and browser state anchor later comparisons.",
          whyItMatters: "A trustworthy test records what changed and what stayed constant.",
          lookFor: ["The exact scoped origin"],
          strongerEvidence: ["A capture tied to the same navigation"],
          falsifiers: ["The browser is on a different or out-of-scope origin"],
          safeNextStep: "Review the browser state, then continue the lesson.",
          disposition: "learning-clue",
          dispositionRationale: "This is orientation evidence, not a vulnerability.",
          evidenceRefs: []
        }
      },
      { action: "finish", rationale: "Baseline lesson complete.", findings: [] }
    ];
    const { runtime, runs } = makeRuntime(undefined, {
      decideNextAction: async () => decisions.shift() || { action: "finish", findings: [] }
    });

    const run = runtime.start({
      goal: "Teach a bounded browser baseline",
      startUrl: "https://allowed.test",
      tutorialMode: true
    });

    await vi.waitFor(() => expect(runs.get(run.id)?.status).toBe("paused"));
    expect(runs.get(run.id)?.policy.tutorialMode).toBe(true);
    expect(runs.get(run.id)?.timeline.find((entry) => entry.tutorial?.title === "Establish a baseline")).toBeTruthy();
    expect(runs.get(run.id)?.timeline.at(-1)?.summary).toBe("Lesson checkpoint — waiting for operator");

    runtime.resume(run.id);
    await vi.waitFor(() => expect(runs.get(run.id)?.status).toBe("completed"));
    expect(runs.get(run.id)?.timeline.at(-1)?.tutorial?.disposition).toBe("learning-clue");
  });

  it("uses a capability-gated stable identity ID for a visible dedicated-profile switch", async () => {
    const profile = identityProfile();
    const lease = browserLease(
      ["activateIdentityProfile"],
      [{ origin: profile.origin, method: "GET", pathPrefix: "/", identity: profile.id }],
      "reversible"
    );
    const decisions: AgentDecision[] = [
      { action: "tool", call: { tool: "activateIdentityProfile", input: { identityId: profile.id } } },
      { action: "finish", rationale: "Identity activated.", findings: [] }
    ];
    const { runtime, runs, activateIdentityProfile } = makeRuntime(undefined, {
      identities: [profile],
      allowlist: [profile.origin],
      leaseRequest: lease,
      decideNextAction: async () => decisions.shift() || { action: "finish", findings: [] }
    });

    const run = runtime.start({
      goal: "Activate the Tenant A identity",
      startUrl: profile.origin,
      profileId: "auth-review"
    });
    await vi.waitFor(() => expect(runs.get(run.id)?.status).toBe("paused"));
    expect(activateIdentityProfile).not.toHaveBeenCalled();
    const paused = runs.get(run.id);
    const draft = paused?.capabilities?.leases.find((item) => item.status === "draft");
    await runtime.updateCapabilities(run.id, {
      action: "grant",
      expectedRevision: paused?.capabilities?.revision || 0,
      leaseId: draft?.id || ""
    });
    runtime.resume(run.id);

    await vi.waitFor(() => expect(runs.get(run.id)?.status).toBe("completed"));
    expect(activateIdentityProfile).toHaveBeenCalledTimes(1);
    expect(activateIdentityProfile).toHaveBeenCalledWith({ identityId: profile.id });
    expect(runs.get(run.id)?.checkpoint?.activeIdentity).toBe(profile.id);
    expect(runs.get(run.id)?.capabilities?.receipts).toEqual([
      expect.objectContaining({ tool: "activateIdentityProfile", decision: "allowed", status: "succeeded" })
    ]);
  });

  it("pauses a capability request before dispatch, then grants, resumes, and executes the pending call exactly once", async () => {
    const lease = browserLease(
      ["sendReplay"],
      [{ origin: "https://hairetsu.com", method: "GET", pathPrefix: "/account", identity: "current" }]
    );
    const decisions: AgentDecision[] = [
      {
        action: "tool",
        call: {
          tool: "sendReplay",
          input: { draft: { method: "GET", url: "https://hairetsu.com/account", headers: {}, body: "" } }
        }
      },
      { action: "finish", rationale: "Replay complete.", findings: [] }
    ];
    const { runtime, runs, sendReplay } = makeRuntime(undefined, {
      allowlist: ["https://hairetsu.com"],
      leaseRequest: lease,
      decideNextAction: async () => decisions.shift() || { action: "finish", rationale: "Done.", findings: [] }
    });
    const run = runtime.start({
      goal: "Compare account response",
      startUrl: "https://hairetsu.com/account",
      profileId: "advanced-api-review"
    });

    await vi.waitFor(() => expect(runs.get(run.id)?.status).toBe("paused"));
    const paused = runs.get(run.id);
    expect(sendReplay).not.toHaveBeenCalled();
    expect(paused?.checkpoint?.pendingCapabilityCall).toMatchObject({ tool: "sendReplay" });
    const draft = paused?.capabilities?.leases.find((item) => item.status === "draft");
    expect(draft).toBeTruthy();

    const granted = await runtime.updateCapabilities(run.id, {
      action: "grant",
      expectedRevision: paused?.capabilities?.revision || 0,
      leaseId: draft?.id || "",
      resumeAfterApproval: true
    });
    expect(granted?.status).toBe("queued");
    expect(granted?.timeline.at(-1)?.note).toContain("queued to resume");

    await vi.waitFor(() => expect(runs.get(run.id)?.status).toBe("completed"));
    expect(sendReplay).toHaveBeenCalledTimes(1);
    expect(runs.get(run.id)?.capabilities).toMatchObject({
      leases: [expect.objectContaining({ status: "exhausted", usedUses: 1, usedRequests: 1 })],
      receipts: [expect.objectContaining({ decision: "allowed", status: "succeeded", tool: "sendReplay" })]
    });
  });

  it("saves approval but stays paused when a normal resume guard blocks continuation", async () => {
    const lease = browserLease(
      ["sendReplay"],
      [{ origin: "https://hairetsu.com", method: "GET", pathPrefix: "/account", identity: "current" }]
    );
    const { runtime, runs, sendReplay } = makeRuntime(undefined, {
      allowlist: ["https://hairetsu.com"],
      leaseRequest: lease,
      decideNextAction: async () => ({
        action: "tool",
        call: {
          tool: "sendReplay",
          input: { draft: { method: "GET", url: "https://hairetsu.com/account", headers: {}, body: "" } }
        }
      })
    });
    const run = runtime.start({
      goal: "Compare account response",
      startUrl: "https://hairetsu.com/account",
      profileId: "advanced-api-review"
    });

    await vi.waitFor(() => expect(runs.get(run.id)?.status).toBe("paused"));
    const paused = runs.get(run.id);
    if (!paused?.checkpoint) {
      throw new Error("Expected a durable capability checkpoint.");
    }
    runs.set(run.id, {
      ...paused,
      checkpoint: { ...paused.checkpoint, stepCount: paused.policy.maxSteps }
    });
    const draft = paused.capabilities?.leases.find((item) => item.status === "draft");
    const granted = await runtime.updateCapabilities(run.id, {
      action: "grant",
      expectedRevision: paused.capabilities?.revision || 0,
      leaseId: draft?.id || "",
      resumeAfterApproval: true
    });

    expect(granted?.status).toBe("paused");
    expect(granted?.capabilities?.leases.at(-1)?.status).toBe("granted");
    expect(granted?.timeline.at(-1)).toMatchObject({
      summary: "Approval saved; automatic resume unavailable",
      note: expect.stringContaining("tool-call budget exhausted")
    });
    expect(sendReplay).not.toHaveBeenCalled();
  });

  it("revalidates saved scope after grant and revokes before pending dispatch", async () => {
    const targets = ["https://hairetsu.com"];
    const lease = browserLease(
      ["sendReplay"],
      [{ origin: "https://hairetsu.com", method: "GET", pathPrefix: "/account", identity: "current" }]
    );
    const { runtime, runs, sendReplay } = makeRuntime(undefined, {
      allowlist: targets,
      leaseRequest: lease,
      decideNextAction: async () => ({
        action: "tool",
        call: {
          tool: "sendReplay",
          input: { draft: { method: "GET", url: "https://hairetsu.com/account", headers: {}, body: "" } }
        }
      })
    });
    const run = runtime.start({
      goal: "Compare account response",
      startUrl: "https://hairetsu.com/account",
      profileId: "advanced-api-review"
    });
    await vi.waitFor(() => expect(runs.get(run.id)?.status).toBe("paused"));
    const paused = runs.get(run.id);
    const draft = paused?.capabilities?.leases.find((item) => item.status === "draft");
    await runtime.updateCapabilities(run.id, {
      action: "grant",
      expectedRevision: paused?.capabilities?.revision || 0,
      leaseId: draft?.id || ""
    });
    targets.push("https://new.target.test");
    runtime.resume(run.id);

    await vi.waitFor(() => {
      expect(runs.get(run.id)?.status).toBe("paused");
      expect(runs.get(run.id)?.capabilities?.leases[0]?.status).toBe("revoked");
    });
    expect(sendReplay).not.toHaveBeenCalled();
    expect(runs.get(run.id)?.capabilities?.receipts.at(-1)).toMatchObject({
      decision: "revoked",
      status: "decided",
      reason: expect.stringContaining("scope changed")
    });
    expect(
      [...(runs.get(run.id)?.timeline || [])]
        .reverse()
        .find((entry) => entry.summary === "Capability lease blocked sendReplay")
        ?.recoveryActions
    ).toEqual(["skip-and-continue", "stop-run"]);
  });

  it("derives an exact review draft when a gated action has no model-authored lease", async () => {
    const { runtime, runs, sendReplay } = makeRuntime(undefined, {
      allowlist: ["https://hairetsu.com"],
      decideNextAction: async () => ({
        action: "tool",
        call: {
          tool: "sendReplay",
          input: { draft: { method: "GET", url: "https://hairetsu.com/account", headers: {}, body: "" } }
        }
      })
    });
    const run = runtime.start({
      goal: "Compare account response",
      startUrl: "https://hairetsu.com/account",
      profileId: "advanced-api-review"
    });

    await vi.waitFor(() => expect(runs.get(run.id)?.status).toBe("paused"));
    expect(sendReplay).not.toHaveBeenCalled();
    expect(runs.get(run.id)?.capabilities?.receipts).toEqual([]);
    expect(runs.get(run.id)?.capabilities?.leases.at(-1)).toMatchObject({
      name: "Authorize sendReplay",
      status: "draft",
      riskTier: "active",
      tools: ["sendReplay"],
      grants: [
        {
          origin: "https://hairetsu.com",
          method: "GET",
          pathPrefix: "/account",
          identity: "current"
        }
      ],
      maxUses: 1,
      maxRequests: 1,
      maxConcurrency: 1,
      maxPayloadBytes: 0
    });
    expect(runs.get(run.id)?.checkpoint?.pendingCapabilityCall).toMatchObject({ tool: "sendReplay" });
  });

  it("does not resume while a browser capability lease is still a draft", async () => {
    const { runtime, runs, clickElement } = makeRuntime(undefined, {
      allowlist: ["https://hairetsu.com"],
      browserState: {
        open: true,
        url: "https://hairetsu.com/login",
        title: "Sign in",
        loading: false,
        engine: "chrome"
      },
      decideNextAction: async () => ({
        action: "tool",
        call: { tool: "clickElement", input: { selector: "#login" } },
        rationale: "Reveal the client-side validation state."
      })
    });
    const run = runtime.start({
      goal: "Inspect the sign-in surface",
      startUrl: "https://hairetsu.com/login",
      profileId: "browser-assessment"
    });

    await vi.waitFor(() => {
      expect(runs.get(run.id)?.status).toBe("paused");
      expect(runs.get(run.id)?.capabilities?.leases.at(-1)).toMatchObject({
        status: "draft",
        tools: ["clickElement"]
      });
    });

    await vi.waitFor(() => {
      expect(() => runtime.resume(run.id)).toThrow(
        "Approve the pending capability lease"
      );
    });
    const paused = runs.get(run.id);
    if (!paused?.checkpoint) {
      throw new Error("Expected a durable capability checkpoint.");
    }
    runs.set(run.id, {
      ...paused,
      checkpoint: { ...paused.checkpoint, pendingCapabilityCall: undefined },
      timeline: [
        ...paused.timeline,
        {
          id: "legacy-capability-block",
          createdAt: new Date(
            Date.parse(paused.capabilities?.leases.at(-1)?.createdAt || paused.createdAt) + 1_000
          ).toISOString(),
          phase: "policy-block",
          summary: "Capability lease blocked clickElement",
          recoveryActions: ["retry-tool", "skip-and-continue", "stop-run"],
          toolCall: { tool: "clickElement", input: { selector: "#login" } },
          toolResult: {
            tool: "clickElement",
            ok: false,
            error: "No granted capability lease matches this normalized action."
          }
        }
      ]
    });
    expect(() => runtime.resume(run.id)).toThrow(
      "Approve the pending capability lease"
    );
    const legacyPaused = runs.get(run.id);
    const draft = legacyPaused?.capabilities?.leases.find(
      (lease) => lease.status === "draft" && lease.tools.includes("clickElement")
    );
    const granted = await runtime.updateCapabilities(run.id, {
      action: "grant",
      expectedRevision: legacyPaused?.capabilities?.revision || 0,
      leaseId: draft?.id || ""
    });
    expect(granted?.checkpoint?.pendingCapabilityCall).toMatchObject({
      tool: "clickElement",
      input: { selector: "#login" }
    });
    runtime.resume(run.id);
    await vi.waitFor(() => expect(clickElement).toHaveBeenCalledTimes(1));
    expect(runs.get(run.id)?.capabilities?.receipts).toEqual([
      expect.objectContaining({
        tool: "clickElement",
        decision: "allowed",
        status: "succeeded"
      })
    ]);
  });

  it("approves repeated matching clicks without widening beyond the current origin", async () => {
    let decisions = 0;
    const { runtime, runs, clickElement } = makeRuntime(undefined, {
      allowlist: ["https://hairetsu.com", "https://api.hairetsu.com"],
      browserState: {
        open: true,
        url: "https://hairetsu.com/login",
        title: "Sign in",
        loading: false,
        engine: "chrome"
      },
      decideNextAction: async () => {
        decisions += 1;
        return decisions <= 2
          ? {
              action: "tool" as const,
              call: {
                tool: "clickElement" as const,
                input: { selector: decisions === 1 ? "#login" : "#learn-more" }
              },
              rationale: "Inspect another visible control on this origin."
            }
          : { action: "finish" as const, rationale: "Visible controls reviewed.", findings: [] };
      }
    });
    const run = runtime.start({
      goal: "Inspect the sign-in surface",
      startUrl: "https://hairetsu.com/login",
      profileId: "browser-assessment"
    });

    await vi.waitFor(() => expect(runs.get(run.id)?.status).toBe("paused"));
    const paused = runs.get(run.id);
    const draft = paused?.capabilities?.leases.find((lease) => lease.status === "draft");
    const granted = await runtime.updateCapabilities(run.id, {
      action: "grant",
      approval: "all-matching",
      expectedRevision: paused?.capabilities?.revision || 0,
      leaseId: draft?.id || ""
    });
    expect(granted?.capabilities?.leases.at(-1)).toMatchObject({
      status: "granted",
      tools: ["clickElement"],
      grants: [
        {
          origin: "https://hairetsu.com",
          method: "GET",
          pathPrefix: "/",
          identity: "current"
        }
      ],
      maxUses: 12,
      maxRequests: 20
    });

    runtime.resume(run.id);
    await vi.waitFor(() => expect(runs.get(run.id)?.status).toBe("completed"));
    expect(clickElement).toHaveBeenCalledTimes(2);
    expect(runs.get(run.id)?.capabilities?.leases).toHaveLength(1);
    expect(runs.get(run.id)?.capabilities?.receipts).toEqual([
      expect.objectContaining({ tool: "clickElement", decision: "allowed", status: "succeeded" }),
      expect.objectContaining({ tool: "clickElement", decision: "allowed", status: "succeeded" })
    ]);
  });

  it("does not advertise raw browser-state tools when raw context is off", async () => {
    const contexts: AgentDecisionContext[] = [];
    const { runtime, runs } = makeRuntime(undefined, {
      decideNextAction: async (context) => {
        contexts.push(context);
        return { action: "finish", rationale: "No raw context was requested.", findings: [] };
      }
    });

    const run = runtime.start({
      goal: "Review authentication state for https://allowed.test",
      startUrl: "https://allowed.test",
      profileId: "auth-review"
    });

    await vi.waitFor(() => expect(runs.get(run.id)?.status).toBe("completed"));
    expect(contexts[0]?.availableTools).not.toEqual(
      expect.arrayContaining(["getCookies", "getStorageState"])
    );
    expect(contexts[0]?.availableTools).toContain("getIdentityLabContext");
  });

  it("persists a revision-checked Mission Graph patch before the selected tool runs", async () => {
    const seenContexts: AgentDecisionContext[] = [];
    const { runtime, runs } = makeRuntime(undefined, {
      decideNextAction: async (context) => {
        seenContexts.push(context);
        if (context.stepCount === 0) {
          return {
            action: "tool",
            call: { tool: "getBrowserState", input: {} },
            rationale: "Establish the current browser state.",
            missionPatch: {
              baseRevision: context.mission.revision,
              updates: [
                {
                  kind: "hypothesis",
                  id: "hyp-browser",
                  objectiveId: "obj-primary",
                  statement: "The controlled browser may already be attached.",
                  status: "testing"
                },
                {
                  kind: "experiment",
                  id: "exp-browser-state",
                  hypothesisId: "hyp-browser",
                  title: "Inspect controlled browser state",
                  expectedObservation: "Open state and current scoped URL",
                  status: "running"
                }
              ]
            }
          };
        }
        return { action: "finish", rationale: "Browser state recorded.", findings: [] };
      }
    });

    const started = runtime.start({ goal: "Inspect https://allowed.test", startUrl: "https://allowed.test" });
    await vi.waitFor(() => expect(runs.get(started.id)?.status).toBe("completed"));

    expect(seenContexts[0]?.mission).toMatchObject({ revision: 0, status: "active" });
    expect(seenContexts[1]?.mission).toMatchObject({
      revision: 1,
      hypotheses: [expect.objectContaining({ id: "hyp-browser" })],
      experiments: [expect.objectContaining({ id: "exp-browser-state" })]
    });
    expect(runs.get(started.id)?.mission).toMatchObject({
      status: "completed",
      objectives: [expect.objectContaining({ id: "obj-primary", status: "completed" })],
      hypotheses: [expect.objectContaining({ id: "hyp-browser", status: "open" })],
      experiments: [expect.objectContaining({ id: "exp-browser-state", status: "completed" })],
      coverage: [expect.objectContaining({ dimension: "host", status: "untested" })]
    });
    const timelineEntries = runs.get(started.id)?.timeline || [];
    const missionIndex = timelineEntries.findIndex((entry) => entry.note?.includes("Mission graph advanced"));
    const toolIndex = timelineEntries.findIndex((entry) => entry.phase === "tool-call");
    expect(missionIndex).toBeGreaterThan(-1);
    expect(toolIndex).toBeGreaterThan(missionIndex);
    const operationEntries = timelineEntries.filter(
      (entry) => entry.toolCall?.tool === "getBrowserState" || entry.toolResult?.tool === "getBrowserState" || entry.note?.includes("Mission graph advanced")
    );
    expect(operationEntries.length).toBeGreaterThanOrEqual(4);
    expect(new Set(operationEntries.map((entry) => entry.operationId)).size).toBe(1);
    expect(operationEntries[0]?.operationId).toMatch(/^operation_/);
    expect(operationEntries.find((entry) => entry.phase === "tool-result")?.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("pauses before tool execution when the planner adds an operator question", async () => {
    const { runtime, runs } = makeRuntime(undefined, {
      decideNextAction: async (context) => ({
        action: "tool",
        call: { tool: "getBrowserState", input: {} },
        missionPatch: {
          baseRevision: context.mission.revision,
          updates: [{ kind: "operator-question", id: "ask-identity", prompt: "Which identity is authorized for active testing?" }]
        }
      })
    });

    const started = runtime.start({ goal: "Inspect https://allowed.test", startUrl: "https://allowed.test" });
    await vi.waitFor(() => expect(runs.get(started.id)?.status).toBe("paused"));

    const paused = runs.get(started.id);
    expect(paused?.checkpoint?.stepCount).toBe(0);
    expect(paused?.mission).toMatchObject({
      status: "awaiting-operator",
      operatorQuestions: [expect.objectContaining({ id: "ask-identity", status: "open" })]
    });
    expect(paused?.timeline.some((entry) => entry.phase === "tool-call")).toBe(false);
    expect(() => runtime.resume(started.id)).toThrow("Answer or dismiss the open mission question");
  });

  it("continues valid actions when planner mission patches are malformed, unsupported, or stale", async () => {
    let decisionCount = 0;
    const { runtime, runs } = makeRuntime(undefined, {
      decideNextAction: async () => {
        decisionCount += 1;
        if (decisionCount === 1) {
          return {
            action: "tool" as const,
            call: { tool: "getBrowserState" as const, input: {} },
            rationale: "Observe the visible browser state.",
            missionPatchWarning: "The planner returned an invalid mission patch."
          };
        }
        if (decisionCount === 2) {
          return {
            action: "tool" as const,
            call: { tool: "getBrowserState" as const, input: {} },
            rationale: "Recheck the visible browser state.",
            missionPatch: {
              baseRevision: 0,
              updates: [{
                kind: "claim" as const,
                id: "clm-unsupported",
                statement: "An unsupported security claim.",
                status: "supported" as const,
                confidence: "high" as const,
                evidenceRefs: ["capture:missing"]
              }]
            }
          };
        }
        return {
          action: "finish" as const,
          rationale: "The visible state was observed.",
          findings: [],
          missionPatch: {
            baseRevision: 99,
            updates: [{
              kind: "experiment" as const,
              id: "exp-stale",
              title: "Stale experiment update",
              status: "completed" as const
            }]
          }
        };
      }
    });

    const started = runtime.start({
      goal: "Inspect https://allowed.test",
      startUrl: "https://allowed.test"
    });
    await vi.waitFor(() => expect(runs.get(started.id)?.status).toBe("completed"));

    const completed = runs.get(started.id);
    expect(completed?.error).toBeUndefined();
    expect(completed?.timeline.filter(
      (entry) => entry.summary === "Mission update ignored; action continues"
    )).toHaveLength(3);
    expect(completed?.timeline.filter(
      (entry) => entry.phase === "tool-result" && entry.toolResult?.tool === "getBrowserState"
    )).toHaveLength(2);
    expect(completed?.timeline.some((entry) => entry.phase === "failure")).toBe(false);
    expect(completed?.mission?.experiments.some((experiment) => experiment.id === "exp-stale")).toBe(false);
    expect(completed?.mission?.claims.some((claim) => claim.id === "clm-unsupported")).toBe(false);
  });

  it("accepts settled revision-checked steering and rejects live or stale mutations", () => {
    const mission = createAgentMission("Inspect target", "https://allowed.test", "2026-05-25T00:00:00.000Z");
    const pausedRun: AgentRun = {
      id: "agent-steer",
      sessionId: "session-test",
      createdAt: "2026-05-25T00:00:00.000Z",
      updatedAt: "2026-05-25T00:00:00.000Z",
      goal: "Inspect target",
      profileId: "passive-map",
      status: "paused",
      policy: {
        maxRuntimeMs: 120000,
        maxSteps: 8,
        maxReplay: 1,
        maxWorkflowRequests: 1,
        maxCaptureSample: 20,
        allowRawContext: false
      },
      mission,
      timeline: [],
      findings: []
    };
    const { runtime, runs } = makeRuntime(pausedRun);

    const steered = runtime.steerMission(pausedRun.id, {
      action: "add-hypothesis",
      expectedRevision: 0,
      statement: "Authorization may be inconsistent.",
      objectiveId: "obj-primary",
      priority: 2
    });
    expect(steered?.mission).toMatchObject({
      revision: 1,
      hypotheses: [expect.objectContaining({ statement: "Authorization may be inconsistent." })]
    });
    expect(runs.get(pausedRun.id)?.timeline.at(-1)?.note).toContain("Operator added hypothesis");

    expect(() =>
      runtime.steerMission(pausedRun.id, {
        action: "add-objective",
        expectedRevision: 0,
        title: "Stale mutation"
      })
    ).toThrow("expected revision 0");

    runs.set(pausedRun.id, { ...runs.get(pausedRun.id)!, status: "running" });
    expect(() =>
      runtime.steerMission(pausedRun.id, {
        action: "add-objective",
        expectedRevision: 1,
        title: "Live mutation"
      })
    ).toThrow("Pause the run");
  });

  it("marks active runs stopped", () => {
    const run: AgentRun = {
      id: "agent-1",
      sessionId: "session-test",
      createdAt: "2026-05-25T00:00:00.000Z",
      updatedAt: "2026-05-25T00:00:00.000Z",
      goal: "Inspect target",
      profileId: "passive-map",
      status: "running",
      policy: {
        maxRuntimeMs: 120000,
        maxSteps: 8,
        maxReplay: 1,
        maxWorkflowRequests: 1,
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
      leaseRequest: browserLease(
        ["openBrowser"],
        [{ origin: "https://hairetsu.com", method: "GET", pathPrefix: "/", identity: "current" }],
        "navigate"
      ),
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
        report: {
          executiveSummary: "The public surface exposed one low-confidence hardening lead.",
          scopeSummary: "Reviewed the public Hairetsu origin and login path.",
          methodology: ["Navigated the visible public surface.", "Reviewed captured HTTP evidence."],
          observations: [{
            title: "Document hardening requires review",
            detail: "The captured document response should be checked for the expected browser hardening policy.",
            status: "supported",
            confidence: "medium",
            evidenceRefs: ["capture:home"]
          }],
          limitations: ["No authenticated identity was available."],
          recommendations: ["Confirm the expected header policy on every canonical document response."]
        },
        findings: [
          {
            title: "Draft",
            confidence: "low",
            evidenceRefs: ["capture:home"],
            affectedAssets: ["https://hairetsu.com"],
            reproductionNotes: "Review capture:home response headers.",
            severityRationale: "Evidence indicates a low-confidence hardening gap.",
            remediation: "Confirm expected headers and add missing browser hardening headers.",
            notes: "Needs review.",
            uncertainties: ["Requires manual confirmation."]
          }
        ]
      }
    ];
    const { runtime, runs, navigateBrowser } = makeRuntime(undefined, {
      allowlist: ["https://hairetsu.com"],
      leaseRequest: browserLease(
        ["openBrowser", "navigateBrowser"],
        [{ origin: "https://hairetsu.com", method: "GET", pathPrefix: "/", identity: "current" }],
        "navigate"
      ),
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
    const completionReport = runs.get(run.id)?.timeline.find(
      (entry) => entry.summary === "Completion report ready"
    )?.completionReport;
    expect(completionReport).toMatchObject({
      outcome: "draft-findings",
      findingCount: 1,
      rejectedFindingCount: 0,
      executiveSummary: "The public surface exposed one low-confidence hardening lead.",
      observations: [expect.objectContaining({
        title: "Document hardening requires review",
        evidenceRefs: ["capture:home"]
      })]
    });
    expect(completionReport?.evidenceRefs).toEqual(["capture:home"]);
  });

  it("records browser open as successful when the requested page is visible after a readiness failure", async () => {
    const decisions: AgentDecision[] = [
      { action: "tool", call: { tool: "openBrowser", input: { url: "https://hairetsu.com" } } },
      { action: "finish", rationale: "Done.", findings: [] }
    ];
    const { runtime, runs, openBrowser, getBrowserState } = makeRuntime(undefined, {
      allowlist: ["https://hairetsu.com"],
      leaseRequest: browserLease(
        ["openBrowser"],
        [{ origin: "https://hairetsu.com", method: "GET", pathPrefix: "/", identity: "current" }],
        "navigate"
      ),
      browserState: {
        open: true,
        url: "https://hairetsu.com/",
        title: "Chrome",
        loading: false,
        engine: "chrome"
      },
      openBrowser: async () => {
        throw new Error("fetch failed");
      },
      decideNextAction: async () => decisions.shift() || { action: "finish", rationale: "Done.", findings: [] }
    });

    const run = runtime.start({
      goal: "Open target for passive observation.",
      startUrl: "https://hairetsu.com"
    });

    await vi.waitFor(() => {
      expect(runs.get(run.id)?.status).toBe("completed");
    });

    const result = runs.get(run.id)?.timeline.find((entry) => entry.toolResult?.tool === "openBrowser")?.toolResult;
    expect(openBrowser).toHaveBeenCalledWith("https://hairetsu.com");
    expect(getBrowserState).toHaveBeenCalled();
    expect(result?.ok && result.data.url).toBe("https://hairetsu.com/");
    expect(runs.get(run.id)?.timeline.some((entry) => entry.summary === "openBrowser failed")).toBe(false);
  });

  it("keeps browser open failures visible when the browser state does not match the requested page", async () => {
    const decisions: AgentDecision[] = [
      { action: "tool", call: { tool: "openBrowser", input: { url: "https://hairetsu.com" } } },
      { action: "finish", rationale: "Done.", findings: [] }
    ];
    const { runtime, runs } = makeRuntime(undefined, {
      allowlist: ["https://hairetsu.com"],
      leaseRequest: browserLease(
        ["openBrowser"],
        [{ origin: "https://hairetsu.com", method: "GET", pathPrefix: "/", identity: "current" }],
        "navigate"
      ),
      browserState: {
        open: true,
        url: "https://other.test/",
        title: "Chrome",
        loading: false,
        engine: "chrome"
      },
      openBrowser: async () => {
        throw new Error("fetch failed");
      },
      decideNextAction: async () => decisions.shift() || { action: "finish", rationale: "Done.", findings: [] }
    });

    const run = runtime.start({
      goal: "Open target for passive observation.",
      startUrl: "https://hairetsu.com"
    });

    await vi.waitFor(() => {
      expect(runs.get(run.id)?.status).toBe("paused");
    });

    const result = runs.get(run.id)?.timeline.find((entry) => entry.toolResult?.tool === "openBrowser")?.toolResult;
    expect(result).toEqual({ tool: "openBrowser", ok: false, error: "fetch failed" });
    expect(runs.get(run.id)?.timeline.some((entry) => entry.summary === "openBrowser failed")).toBe(true);
    expect(
      runs.get(run.id)?.timeline.find((entry) => entry.summary === "openBrowser failed")?.recoveryActions
    ).toEqual(["skip-and-continue", "stop-run", "draft-finding"]);
    expect(runs.get(run.id)?.timeline.at(-1)?.note).toContain("fetch failed");
  });

  it("repairs legacy retry actions for effect-bearing browser calls without dispatching them again", async () => {
    const decisions: AgentDecision[] = [
      { action: "tool", call: { tool: "openBrowser", input: { url: "https://hairetsu.com" } } }
    ];
    const { runtime, runs, openBrowser } = makeRuntime(undefined, {
      allowlist: ["https://hairetsu.com"],
      leaseRequest: browserLease(
        ["openBrowser"],
        [{ origin: "https://hairetsu.com", method: "GET", pathPrefix: "/", identity: "current" }],
        "navigate"
      ),
      openBrowser: async () => {
        throw new Error("fetch failed");
      },
      decideNextAction: async () => decisions.shift() || { action: "finish", rationale: "Done.", findings: [] }
    });

    const run = runtime.start({
      goal: "Open target for passive observation.",
      startUrl: "https://hairetsu.com"
    });

    await vi.waitFor(() => expect(runs.get(run.id)?.status).toBe("paused"));
    const paused = runs.get(run.id);
    const failure = paused?.timeline.find((entry) => entry.summary === "openBrowser failed");
    if (!paused || !failure) {
      throw new Error("Expected a paused openBrowser failure.");
    }
    runs.set(run.id, {
      ...paused,
      timeline: paused.timeline.map((entry) =>
        entry.id === failure.id
          ? { ...entry, recoveryActions: ["retry-tool", "skip-and-continue", "stop-run"] }
          : entry
      )
    });

    const corrected = runtime.recover(run.id, {
      action: "retry-tool",
      entryId: failure.id
    });

    expect(corrected?.status).toBe("paused");
    expect(openBrowser).toHaveBeenCalledTimes(1);
    expect(
      corrected?.timeline.find((entry) => entry.id === failure.id)?.recoveryActions
    ).toEqual(["skip-and-continue", "stop-run", "draft-finding"]);
    expect(corrected?.timeline.at(-1)?.summary).toBe(
      "Automatic retry unavailable for openBrowser"
    );
    expect(corrected?.checkpoint?.pendingRecovery).toBeUndefined();
  });

  it("retains operator-created draft findings in the final completion report", async () => {
    const decisions: AgentDecision[] = [
      { action: "tool", call: { tool: "openBrowser", input: { url: "https://hairetsu.com" } } },
      { action: "finish", rationale: "Completed after recording the failed browser step.", findings: [] }
    ];
    const { runtime, runs } = makeRuntime(undefined, {
      allowlist: ["https://hairetsu.com"],
      leaseRequest: browserLease(
        ["openBrowser"],
        [{ origin: "https://hairetsu.com", method: "GET", pathPrefix: "/", identity: "current" }],
        "navigate"
      ),
      openBrowser: async () => {
        throw new Error("browser readiness failed");
      },
      decideNextAction: async () => decisions.shift() || { action: "finish", rationale: "Done.", findings: [] }
    });

    const started = runtime.start({
      goal: "Inspect the public Hairetsu surface.",
      startUrl: "https://hairetsu.com"
    });
    await vi.waitFor(() => expect(runs.get(started.id)?.status).toBe("paused"));
    const failure = runs.get(started.id)?.timeline.find((entry) => entry.summary === "openBrowser failed");
    if (!failure) throw new Error("Expected the failed browser operation.");

    const drafted = runtime.recover(started.id, {
      action: "draft-finding",
      entryId: failure.id
    });
    expect(drafted?.findings).toHaveLength(1);
    runtime.recover(started.id, { action: "skip-and-continue", entryId: failure.id });

    await vi.waitFor(() => expect(runs.get(started.id)?.status).toBe("completed"));
    const completed = runs.get(started.id);
    expect(completed?.findings).toHaveLength(1);
    expect(completed?.findings[0]?.title).toBe("Review failed openBrowser step");
    expect(completed?.timeline.at(-1)?.completionReport).toMatchObject({
      outcome: "draft-findings",
      findingCount: 1
    });
  });

  it("refreshes evidence for a legacy browser recovery without replaying the browser action", async () => {
    const decisions: AgentDecision[] = [
      { action: "tool", call: { tool: "openBrowser", input: { url: "https://hairetsu.com" } } },
      { action: "finish", rationale: "Recovered from fresh evidence.", findings: [] }
    ];
    const { runtime, runs, openBrowser } = makeRuntime(undefined, {
      allowlist: ["https://hairetsu.com"],
      leaseRequest: browserLease(
        ["openBrowser"],
        [{ origin: "https://hairetsu.com", method: "GET", pathPrefix: "/", identity: "current" }],
        "navigate"
      ),
      openBrowser: async () => {
        throw new Error("fetch failed");
      },
      decideNextAction: async () => decisions.shift() || { action: "finish", rationale: "Done.", findings: [] }
    });

    const run = runtime.start({
      goal: "Open target for passive observation.",
      startUrl: "https://hairetsu.com"
    });

    await vi.waitFor(() => expect(runs.get(run.id)?.status).toBe("paused"));
    const paused = runs.get(run.id);
    const failure = paused?.timeline.find((entry) => entry.summary === "openBrowser failed");
    if (!paused || !failure) {
      throw new Error("Expected a paused openBrowser failure.");
    }
    runs.set(run.id, {
      ...paused,
      timeline: paused.timeline.map((entry) =>
        entry.id === failure.id
          ? { ...entry, recoveryActions: ["retry-with-evidence", "stop-run"] }
          : entry
      )
    });

    const recovered = runtime.recover(run.id, {
      action: "retry-with-evidence",
      entryId: failure.id
    });
    expect(recovered?.checkpoint?.pendingRecovery?.call).toBeUndefined();

    await vi.waitFor(() => expect(runs.get(run.id)?.status).toBe("completed"));
    expect(openBrowser).toHaveBeenCalledTimes(1);
    expect(
      runs.get(run.id)?.timeline.some((entry) =>
        entry.note?.includes("Refreshed scoped captures and project context before recovery.")
      )
    ).toBe(true);
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
    const failure = runs.get(run.id)?.timeline.at(-1);
    expect(failure?.note).toBe("Run failed: planner unavailable");
    expect(failure?.phase).toBe("failure");
    expect(failure?.recoveryActions).toEqual(["retry-with-evidence", "stop-run"]);
    expect(openBrowser).not.toHaveBeenCalled();
  });

  it("records failed tool calls with visible target and recovery actions", async () => {
    const decisions: AgentDecision[] = [
      { action: "tool", call: { tool: "prepareInterceptEdit", input: { id: "missing" } }, rationale: "Inspect queued edit." },
      { action: "finish", rationale: "Done.", findings: [] }
    ];
    const { runtime, runs } = makeRuntime(undefined, {
      allowlist: ["https://hairetsu.com"],
      decideNextAction: async () => decisions.shift() || { action: "finish", findings: [] }
    });

    const run = runtime.start({
      goal: "Inspect queued intercept edits.",
      startUrl: "https://hairetsu.com"
    });

    await vi.waitFor(() => {
      expect(runs.get(run.id)?.status).toBe("paused");
    });

    const failure = runs.get(run.id)?.timeline.find((entry) => entry.phase === "failure");
    expect(failure?.summary).toBe("prepareInterceptEdit failed");
    expect(failure?.target).toEqual({ view: "intercept", evidenceId: "missing" });
    expect(failure?.toolResult).toEqual({
      tool: "prepareInterceptEdit",
      ok: false,
      error: "Intercept queue item was not found."
    });
    expect(failure?.recoveryActions).toEqual([
      "retry-tool",
      "retry-with-evidence",
      "skip-and-continue",
      "stop-run",
      "draft-finding"
    ]);
  });

  it("retries a safe failed tool from the durable checkpoint", async () => {
    const queue: InterceptQueueItem[] = [];
    const queueItem: InterceptQueueItem = {
      id: "intercept-retry",
      captureId: "capture-retry",
      stage: "request",
      queuedAt: "2026-05-25T00:00:00.000Z",
      method: "GET",
      url: "https://hairetsu.com/account",
      host: "hairetsu.com",
      path: "/account",
      headers: {},
      body: "",
      allowed: true,
      source: "proxy",
      note: "Queued"
    };
    const decisions: AgentDecision[] = [
      { action: "tool", call: { tool: "prepareInterceptEdit", input: { id: queueItem.id } } },
      { action: "finish", rationale: "Recovered safely.", findings: [] }
    ];
    const { runtime, runs } = makeRuntime(undefined, {
      allowlist: ["https://hairetsu.com"],
      interceptQueue: queue,
      decideNextAction: async () => decisions.shift() || { action: "finish", findings: [] }
    });

    const started = runtime.start({ goal: "Inspect the queued request", startUrl: "https://hairetsu.com" });
    await vi.waitFor(() => expect(runs.get(started.id)?.status).toBe("paused"));
    const failure = runs.get(started.id)?.timeline.find((entry) => entry.summary === "prepareInterceptEdit failed");
    expect(failure?.toolCall?.tool).toBe("prepareInterceptEdit");

    queue.push(queueItem);
    const recovered = runtime.recover(started.id, { action: "retry-tool", entryId: failure?.id });
    expect(recovered?.status).toBe("queued");
    await vi.waitFor(() => expect(runs.get(started.id)?.status).toBe("completed"));

    const successfulRetry = runs
      .get(started.id)
      ?.timeline.filter((entry) => entry.toolResult?.tool === "prepareInterceptEdit")
      .find((entry) => entry.toolResult?.ok);
    expect(successfulRetry?.toolResult?.ok).toBe(true);
    expect(runs.get(started.id)?.checkpoint?.stepCount).toBe(2);
  });

  it("resumes with accumulated budgets instead of resetting the run", async () => {
    const pausedRun: AgentRun = {
      id: "agent-resume",
      sessionId: "session-test",
      createdAt: "2026-05-25T00:00:00.000Z",
      updatedAt: "2026-05-25T00:00:05.000Z",
      goal: "Resume https://hairetsu.com",
      profileId: "passive-map",
      status: "paused",
      policy: {
        maxRuntimeMs: 120000,
        maxSteps: 8,
        maxReplay: 1,
        maxWorkflowRequests: 1,
        maxCaptureSample: 20,
        allowRawContext: false
      },
      checkpoint: {
        startUrl: "https://hairetsu.com",
        targetOrigin: "https://hairetsu.com",
        stepCount: 3,
        replayCount: 1,
        workflowRequestCount: 1,
        elapsedMs: 5000,
        lastResumedAt: "2026-05-25T00:00:05.000Z"
      },
      timeline: [],
      findings: []
    };
    const contexts: AgentDecisionContext[] = [];
    const { runtime, runs } = makeRuntime(pausedRun, {
      allowlist: ["https://hairetsu.com"],
      decideNextAction: async (context) => {
        contexts.push(context);
        return { action: "finish", rationale: "Checkpoint restored.", findings: [] };
      }
    });

    expect(runtime.resume(pausedRun.id)?.status).toBe("queued");
    await vi.waitFor(() => expect(runs.get(pausedRun.id)?.status).toBe("completed"));

    expect(contexts[0]).toMatchObject({ stepCount: 3, replayCount: 1, workflowRequestCount: 1 });
    expect(runs.get(pausedRun.id)?.checkpoint).toMatchObject({
      stepCount: 3,
      replayCount: 1,
      workflowRequestCount: 1,
      startUrl: "https://hairetsu.com"
    });
  });

  it("explains exhausted resume budgets and creates an audited continuation", async () => {
    const exhaustedRun: AgentRun = {
      id: "agent-exhausted",
      sessionId: "session-test",
      createdAt: "2026-07-19T00:00:00.000Z",
      updatedAt: "2026-07-19T00:05:32.763Z",
      goal: "Inspect https://www.tylerstech.net/",
      profileId: "browser-assessment",
      status: "failed",
      policy: {
        maxRuntimeMs: 300000,
        maxSteps: 40,
        maxReplay: 3,
        maxWorkflowRequests: 3,
        maxCaptureSample: 100,
        allowRawContext: false
      },
      checkpoint: {
        startUrl: "https://www.tylerstech.net/",
        targetOrigin: "https://www.tylerstech.net",
        stepCount: 19,
        replayCount: 0,
        workflowRequestCount: 0,
        elapsedMs: 332763,
        lastResumedAt: "2026-07-19T00:05:32.763Z"
      },
      timeline: [],
      findings: [],
      error: "Agent exceeded its runtime budget while waiting for the next planner decision."
    };
    const { runtime } = makeRuntime(exhaustedRun, {
      allowlist: ["https://www.tylerstech.net"],
      decideNextAction: async () => ({ action: "finish", rationale: "Continuation complete.", findings: [] })
    });

    expect(() => runtime.resume(exhaustedRun.id)).toThrow(
      "Agent runtime budget exhausted (333s used / 300s allowed). Resume never resets safety budgets; start a continuation run with a fresh bounded budget."
    );

    const continuation = runtime.start({
      goal: exhaustedRun.goal,
      startUrl: exhaustedRun.checkpoint?.startUrl,
      profileId: exhaustedRun.profileId,
      continuationOf: exhaustedRun.id
    });
    expect(continuation.id).not.toBe(exhaustedRun.id);
    expect(continuation.goal).toBe(exhaustedRun.goal);
    expect(continuation.policy.maxRuntimeMs).toBe(600000);
    expect(continuation.timeline[0]?.note).toContain(`Continuation queued from ${exhaustedRun.id}`);
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
      expect(runs.get(run.id)?.status).toBe("completed");
    });

    expect(runs.get(run.id)?.findings).toEqual([]);
    const rejection = runs.get(run.id)?.timeline.find((entry) => entry.summary === "Draft finding rejected by quality gate");
    expect(rejection?.note).toContain("at least one evidence reference is required");
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
      leaseRequest: browserLease(
        ["clickElement", "fillInput", "submitForm"],
        [
          { origin: "https://hairetsu.com", method: "GET", pathPrefix: "/", identity: "current" },
          { origin: "https://hairetsu.com", method: "POST", pathPrefix: "/", identity: "current" }
        ]
      ),
      decideNextAction: async () => decisions.shift() || { action: "finish", rationale: "Done.", findings: [] }
    });

    const run = runtime.start({
      goal: "Inspect hairetsu.com",
      startUrl: "https://hairetsu.com"
    });
    await grantNextDraftAndResume(runtime, run.id);
    await grantNextDraftAndResume(runtime, run.id);
    await grantNextDraftAndResume(runtime, run.id);

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

  it("lets AI prepare automate controls and analyze completed sessions without starting runs", async () => {
    const automateSession: AutomateSession = {
      id: "automate-1",
      name: "Role probes",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:01:00.000Z",
      status: "completed",
      draft: { method: "GET", url: "https://hairetsu.com/api?role={{payload:role}}", headers: {}, body: "" },
      environmentId: "",
      payloads: ["admin"],
      positions: [
        {
          id: "url:role:1",
          name: "role",
          location: "url",
          occurrence: 1,
          marker: "{{payload:role}}",
          preview: "role={{payload:role}}"
        }
      ],
      limits: { count: 1, concurrency: 1, delayMs: 0, timeoutMs: 1000 },
      rules: [],
      results: [
        {
          id: "result-1",
          index: 1,
          createdAt: "2026-01-01T00:01:00.000Z",
          payload: "admin",
          request: { method: "GET", url: "https://hairetsu.com/api?role=admin", headers: {}, body: "" },
          ok: false,
          status: 500,
          statusText: "Server Error",
          length: 5,
          latencyMs: 12,
          wordCount: 1,
          headers: {},
          bodyPreview: "error",
          matchedRules: [],
          extracts: [],
          clusterId: "cluster-1"
        }
      ],
      clusters: [
        {
          id: "cluster-1",
          fingerprint: "5xx:tiny:a:b",
          statusFamily: "5xx",
          count: 1,
          representativeResultId: "result-1",
          averageLength: 5,
          averageLatencyMs: 12,
          labels: []
        }
      ]
    };
    const decisions: AgentDecision[] = [
      { action: "tool", call: { tool: "getAutomateContext", input: {} } },
      {
        action: "tool",
        call: {
          tool: "prepareAutomateDraft",
          input: {
            name: "Role probes",
            draft: { method: "GET", url: "https://hairetsu.com/api?role={{payload:role}}", headers: {}, body: "" },
            payloads: ["admin"],
            note: "Review payload markers"
          }
        }
      },
      { action: "tool", call: { tool: "analyzeAutomateResults", input: { sessionId: "automate-1" } } },
      { action: "finish", rationale: "Done.", findings: [] }
    ];
    const { runtime, runs, sendReplay } = makeRuntime(undefined, {
      allowlist: ["https://hairetsu.com"],
      automatePayloadSets: [{ id: "payloads", name: "Roles", source: "inline", payloads: ["admin"], createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" }],
      automateSessions: [automateSession],
      decideNextAction: async () => decisions.shift() || { action: "finish", rationale: "Done.", findings: [] }
    });

    const run = runtime.start({ goal: "Prepare Automate role probes", startUrl: "https://hairetsu.com" });

    await vi.waitFor(() => {
      expect(runs.get(run.id)?.status).toBe("completed");
    });

    expect(sendReplay).not.toHaveBeenCalled();
    const prepareResult = runs.get(run.id)?.timeline.find((entry) => entry.toolResult?.tool === "prepareAutomateDraft")?.toolResult;
    expect(prepareResult?.ok && prepareResult.data.payloads).toEqual(["admin"]);
    const analysis = runs.get(run.id)?.timeline.find((entry) => entry.toolResult?.tool === "analyzeAutomateResults")?.toolResult;
    expect(analysis?.ok && analysis.data.outlierResultIds).toEqual(["result-1"]);
  });

  it("lets AI choose an existing workflow and records the run through workflow runtime", async () => {
    const workflow: WorkflowDefinition = {
      id: "builtin-security-headers",
      name: "Security Headers",
      description: "Check headers.",
      mode: "passive",
      builtIn: true,
      inputs: [],
      scope: {
        requireInScope: true,
        allowActive: false,
        maxRequests: 0,
        timeoutMs: 10000,
        delayMs: 0,
        maxResults: 40
      },
      steps: [{ id: "headers", title: "Headers", kind: "security-headers", config: {} }],
      createdAt: "2026-05-25T00:00:00.000Z",
      updatedAt: "2026-05-25T00:00:00.000Z"
    };
    const decisions: AgentDecision[] = [
      { action: "tool", call: { tool: "getWorkflowCatalog", input: {} } },
      { action: "tool", call: { tool: "runWorkflow", input: { workflowId: workflow.id, inputs: {} } } },
      { action: "finish", rationale: "Workflow reviewed.", findings: [] }
    ];
    const { runtime, runs, runWorkflow } = makeRuntime(undefined, {
      workflows: [workflow],
      decideNextAction: async () => decisions.shift() || { action: "finish", rationale: "Done.", findings: [] }
    });

    const run = runtime.start({
      goal: "Run header workflow",
      startUrl: "https://allowed.test",
      profileId: "advanced-api-review"
    });

    await vi.waitFor(() => {
      expect(runs.get(run.id)?.status).toBe("completed");
    });

    expect(runWorkflow).toHaveBeenCalledWith({ workflowId: workflow.id, inputs: {}, source: "ai" });
    const workflowResult = runs.get(run.id)?.timeline.find((entry) => entry.toolResult?.tool === "runWorkflow")?.toolResult;
    expect(workflowResult?.ok).toBe(true);
  });

  it("exposes context summaries, prepares workflow drafts, and proposes memory without execution", async () => {
    const workflow: WorkflowDefinition = {
      id: "ai-workflow-draft",
      name: "AI Header Draft",
      description: "Prepared draft.",
      mode: "passive",
      builtIn: false,
      inputs: [],
      scope: { requireInScope: true, allowActive: false, maxRequests: 0, timeoutMs: 5000, delayMs: 0, maxResults: 20 },
      steps: [{ id: "step-1", title: "Headers", kind: "security-headers", config: {} }],
      createdAt: "2026-05-25T00:00:00.000Z",
      updatedAt: "2026-05-25T00:00:00.000Z"
    };
    const decisions: AgentDecision[] = [
      { action: "tool", call: { tool: "getAgentContextSummary", input: {} } },
      { action: "tool", call: { tool: "prepareWorkflowDraft", input: { workflow, note: "Review this workflow." } } },
      {
        action: "tool",
        call: {
          tool: "proposeRunMemory",
          input: {
            kind: "hypothesis",
            title: "Redirect reviewed",
            notes: "Keep redirect finding for retest.",
            evidenceRefs: ["capture:home"]
          }
        }
      },
      { action: "finish", rationale: "Drafts prepared.", findings: [] }
    ];
    const { runtime, runs, runWorkflow } = makeRuntime(undefined, {
      allowlist: ["https://hairetsu.com"],
      captures: [capture("home", "https://hairetsu.com/")],
      decideNextAction: async () => decisions.shift() || { action: "finish", rationale: "Done.", findings: [] }
    });

    const run = runtime.start({
      goal: "Prepare review artifacts",
      startUrl: "https://hairetsu.com",
      profileId: "api-hardening"
    });

    await vi.waitFor(() => {
      expect(runs.get(run.id)?.status).toBe("completed");
    });

    const summary = runs.get(run.id)?.timeline.find((entry) => entry.toolResult?.tool === "getAgentContextSummary")?.toolResult;
    expect(summary?.ok && summary.data.sitemap.hostCount).toBe(1);
    const draft = runs.get(run.id)?.timeline.find((entry) => entry.toolResult?.tool === "prepareWorkflowDraft")?.toolResult;
    expect(draft?.ok && draft.data.workflow.name).toBe("AI Header Draft");
    const memory = runs.get(run.id)?.timeline.find((entry) => entry.toolResult?.tool === "proposeRunMemory")?.toolResult;
    expect(memory?.ok && memory.data.memory.status).toBe("proposed");
    expect(runWorkflow).not.toHaveBeenCalled();
  });

  it("exposes plugin inventory read-only to AI-First", async () => {
    const plugin: InstalledPlugin = {
      id: "jwt-helper",
      manifest: {
        schemaVersion: 1,
        id: "jwt-helper",
        name: "JWT Helper",
        version: "1.0.0",
        description: "",
        author: "Radar",
        sdkVersion: "0.1",
        minRadarVersion: "",
        entry: "dist/index.js",
        permissions: ["captures:read", "ui:panel"],
        panels: [{ id: "token-panel", title: "Token Panel", entry: "panel.html" }]
      },
      sourcePath: "/tmp/jwt-helper",
      grantedPermissions: ["captures:read", "ui:panel"],
      status: "approved",
      warnings: ["Review capture access."],
      installedAt: "2026-05-25T00:00:00.000Z",
      updatedAt: "2026-05-25T00:00:00.000Z"
    };
    const decisions: AgentDecision[] = [
      { action: "tool", call: { tool: "showView", input: { view: "plugins", reason: "Review local extensions" } } },
      { action: "tool", call: { tool: "getPluginInventory", input: {} } },
      { action: "finish", rationale: "Plugins reviewed.", findings: [] }
    ];
    const { runtime, runs } = makeRuntime(undefined, {
      plugins: [plugin],
      decideNextAction: async () => decisions.shift() || { action: "finish", rationale: "Done.", findings: [] }
    });

    const run = runtime.start({ goal: "Review installed plugins", startUrl: "https://allowed.test" });

    await vi.waitFor(() => {
      expect(runs.get(run.id)?.status).toBe("completed");
    });

    const inventory = runs.get(run.id)?.timeline.find((entry) => entry.toolResult?.tool === "getPluginInventory")?.toolResult;
    expect(inventory?.ok && inventory.data.plugins).toEqual([
      {
        id: "jwt-helper",
        name: "JWT Helper",
        version: "1.0.0",
        status: "approved",
        requestedPermissions: ["captures:read", "ui:panel"],
        grantedPermissions: ["captures:read", "ui:panel"],
        panels: [{ id: "token-panel", title: "Token Panel" }],
        warningCount: 1
      }
    ]);
  });

  it("exposes advanced testing summary read-only to AI-First", async () => {
    const decisions: AgentDecision[] = [
      { action: "tool", call: { tool: "showView", input: { view: "advanced", reason: "Review API signals" } } },
      { action: "tool", call: { tool: "getAdvancedTestingSummary", input: {} } },
      { action: "finish", rationale: "Advanced signals reviewed.", findings: [] }
    ];
    const { runtime, runs } = makeRuntime(undefined, {
      captures: [
        capture("graphql-cap", "https://allowed.test/graphql", {
          method: "POST",
          requestHeaders: { "Content-Type": "application/json" },
          requestBody: JSON.stringify({ query: "query Me { me { id } }" })
        })
      ],
      decideNextAction: async () => decisions.shift() || { action: "finish", rationale: "Done.", findings: [] }
    });

    const run = runtime.start({ goal: "Review advanced API surface", startUrl: "https://allowed.test" });

    await vi.waitFor(() => {
      expect(runs.get(run.id)?.status).toBe("completed");
    });

    const summary = runs.get(run.id)?.timeline.find((entry) => entry.toolResult?.tool === "getAdvancedTestingSummary")?.toolResult;
    expect(summary?.ok && summary.data.graphql.operationCount).toBe(1);
    expect(summary?.ok && summary.data.apiImport.drafts).toEqual([]);
  });
});
