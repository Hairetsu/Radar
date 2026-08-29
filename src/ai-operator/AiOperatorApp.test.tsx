// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RadarAiOperatorApi } from "../../shared/api/aiOperatorApi.js";
import type { AgentRun } from "../../shared/agent-types.js";
import type { AiSettings } from "../../shared/ai-types.js";
import type { WorkspaceContextSnapshot } from "../../shared/windowCoordination.js";
import { AiOperatorApp } from "./AiOperatorApp";

const workspaceContext: WorkspaceContextSnapshot = {
  revision: 1,
  mode: "manual-first",
  activeView: "traffic",
  project: { id: "profile-test", name: "Acme Defense" },
  session: { id: "session-test", name: "Authorization Review" },
  browser: { open: true, url: "https://target.test/dashboard", title: "Target" },
  selection: { kind: "capture", id: "capture-1", label: "GET /account" },
  executingRunId: "",
  attentionCount: 0
};

function run(overrides: Partial<AgentRun> = {}): AgentRun {
  return {
    id: "run-test",
    sessionId: "session-test",
    createdAt: "2026-05-25T00:00:00.000Z",
    updatedAt: "2026-05-25T00:01:00.000Z",
    goal: "Review tenant isolation",
    profileId: "browser-assessment",
    status: "paused",
    policy: {
      maxRuntimeMs: 120_000,
      maxSteps: 8,
      maxReplay: 1,
      maxWorkflowRequests: 1,
      maxCaptureSample: 20,
      allowRawContext: false
    },
    timeline: [],
    findings: [],
    ...overrides
  };
}

function operatorApi(overrides: Partial<RadarAiOperatorApi> = {}): RadarAiOperatorApi {
  const settings = { provider: "openai" as const, model: "gpt-4o-mini", apiKey: "test", baseUrl: "" };
  return {
    getLocalContext: vi.fn(async () => window.radar!.getLocalContext()),
    getTargets: vi.fn(async () => ["https://target.test"]),
    getAiSettings: vi.fn(async () => settings),
    setAiSettings: vi.fn(async (next) => next),
    connectAi: vi.fn(async () => ({
      settings: { provider: "codex-local" as const, model: "auto", apiKey: "local", baseUrl: "codex://local" },
      meta: { presetId: "codex" as const, label: "Codex", apiKeySource: "local" },
      probe: { ok: true, message: "Connected" }
    })),
    probeAiConnection: vi.fn(async () => ({ ok: true, message: "Connected" })),
    loginCursor: vi.fn(async () => ({ ok: true, message: "Signed in" })),
    loginGrok: vi.fn(async () => ({ ok: true, message: "Signed in" })),
    getAiModels: vi.fn(async () => [{ id: "gpt-4o-mini", label: "gpt-4o-mini" }]),
    refreshAiModels: vi.fn(async () => [{ id: "gpt-4o-mini", label: "gpt-4o-mini" }]),
    startAgentRun: vi.fn(async (request) => run({ goal: request.goal, status: "queued", profileId: request.profileId || "browser-assessment" })),
    pauseAgentRun: vi.fn(async () => run()),
    resumeAgentRun: vi.fn(async () => run({ status: "queued" })),
    recoverAgentRun: vi.fn(async () => run()),
    steerAgentMission: vi.fn(async () => run()),
    updateAgentCapabilities: vi.fn(async () => run()),
    stopAgentRun: vi.fn(async () => run({ status: "stopped" })),
    stopAgentTraffic: vi.fn(async () => ({ stopped: false })),
    getAgentRun: vi.fn(async () => null),
    listAgentRuns: vi.fn(async () => []),
    getAgentRunMemory: vi.fn(async () => []),
    saveAgentRunMemory: vi.fn(async (entry) => entry),
    deleteAgentRunMemory: vi.fn(async () => ({ ok: true, memory: [] })),
    openAiOperator: vi.fn(async (section = "runs") => ({ created: true, visible: true, focused: true, section })),
    getWorkspaceContext: vi.fn(async () => workspaceContext),
    dispatchWorkspaceIntent: vi.fn(async () => ({ ok: true })),
    focusWorkspace: vi.fn(async () => ({ ok: true })),
    getAiOperatorWindowState: vi.fn(async () => ({ created: true, visible: true, focused: true, section: "runs" as const })),
    getAppMode: vi.fn(async () => "manual-first" as const),
    setAppMode: vi.fn(async (mode) => mode),
    onWorkspaceContextChanged: vi.fn(() => () => undefined),
    onAiOperatorWindowState: vi.fn(() => () => undefined),
    onAppModeChanged: vi.fn(() => () => undefined),
    onAgentChanged: vi.fn(() => () => undefined),
    onAiConnectionChanged: vi.fn(() => () => undefined),
    ...overrides
  };
}

afterEach(() => {
  window.localStorage.clear();
  Object.defineProperty(window, "innerWidth", { value: 1024, writable: true, configurable: true });
  Object.defineProperty(window, "radarOperator", { value: undefined, writable: true, configurable: true });
});

describe("AiOperatorApp", () => {
  it("keeps task history available as a collapsible sidebar while inspection remains an overlay", async () => {
    const api = operatorApi();
    Object.defineProperty(window, "radarOperator", { value: api, writable: true, configurable: true });

    render(<AiOperatorApp />);

    expect(await screen.findByTestId("aiOperatorShell")).toBeInTheDocument();
    expect(screen.getByTestId("aiOperatorFeed")).toBeInTheDocument();
    expect(screen.getByTestId("aiOperatorComposer")).toBeInTheDocument();
    expect(screen.getByText("Acme Defense / Authorization Review / traffic")).toBeInTheDocument();
    expect(screen.getByTestId("aiRunRail")).toHaveAttribute("data-collapsed", "false");
    expect(screen.getByTestId("toggleAiRunRail")).toHaveTextContent("Tasks");

    fireEvent.click(screen.getByTestId("toggleAiRunRail"));
    expect(screen.getByTestId("aiRunRail")).toHaveAttribute("data-collapsed", "true");
    fireEvent.click(screen.getByTestId("expandAiRunRail"));
    expect(screen.getByTestId("aiRunRail")).toHaveAttribute("data-collapsed", "false");
    fireEvent.click(screen.getByTestId("toggleAiInspector"));
    expect(screen.getByTestId("aiRunRail")).toBeInTheDocument();
    expect(screen.getByTestId("aiMissionInspector")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("aiOperatorSettings"));
    expect(screen.getByTestId("aiOperatorConnectionPanel")).toBeInTheDocument();
    expect(api.probeAiConnection).toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("toggleAiRunRail"));
    expect(screen.getByTestId("aiRunRail")).toHaveAttribute("data-collapsed", "false");
  });

  it("closes task history at the compact breakpoint and restores the desktop preference", async () => {
    Object.defineProperty(window, "innerWidth", { value: 1040, writable: true, configurable: true });
    window.localStorage.setItem("radar.ai-operator.task-rail", "expanded");
    const api = operatorApi();
    Object.defineProperty(window, "radarOperator", { value: api, writable: true, configurable: true });

    render(<AiOperatorApp />);

    const taskRail = await screen.findByTestId("aiRunRail");
    expect(taskRail).toHaveAttribute("data-collapsed", "false");

    window.innerWidth = 800;
    fireEvent(window, new Event("resize"));
    expect(taskRail).toHaveAttribute("data-collapsed", "true");
    expect(window.localStorage.getItem("radar.ai-operator.task-rail")).toBe("expanded");

    window.innerWidth = 1040;
    fireEvent(window, new Event("resize"));
    expect(taskRail).toHaveAttribute("data-collapsed", "false");
  });

  it("shows task status and selection clearly in persistent history", async () => {
    const active = run({ id: "run-active", goal: "Inspect the public surface", status: "running" });
    const completed = run({ id: "run-complete", goal: "Review CORS behavior", status: "completed" });
    const api = operatorApi({ listAgentRuns: vi.fn(async () => [active, completed]) });
    Object.defineProperty(window, "radarOperator", { value: api, writable: true, configurable: true });

    render(<AiOperatorApp />);

    const taskRail = await screen.findByTestId("aiRunRail");
    expect(within(taskRail).getByText("Inspect the public surface")).toBeInTheDocument();
    expect(within(taskRail).getByText("Review CORS behavior")).toBeInTheDocument();
    expect(within(taskRail).getByText("Active")).toBeInTheDocument();
    expect(within(taskRail).getByText("Complete")).toBeInTheDocument();
    expect(screen.getByTestId("toggleAiRunRail")).toHaveTextContent("2");
    expect(screen.getByTestId("aiRun-run-active")).toHaveAttribute("aria-current", "page");

    fireEvent.click(screen.getByTestId("aiRun-run-complete"));
    expect(screen.getByTestId("aiRun-run-complete")).toHaveAttribute("aria-current", "page");
    expect(screen.getByTestId("aiRun-run-active")).not.toHaveAttribute("aria-current");
  });

  it("starts a saved-scope mission and clears its session-scoped draft", async () => {
    const api = operatorApi();
    Object.defineProperty(window, "radarOperator", { value: api, writable: true, configurable: true });
    render(<AiOperatorApp />);

    const goal = await screen.findByTestId("agentGoalInput");
    fireEvent.change(goal, { target: { value: "Inspect https://target.test/account" } });
    fireEvent.click(screen.getByTestId("startAgentRun"));

    await waitFor(() => expect(api.startAgentRun).toHaveBeenCalledWith(expect.objectContaining({
      goal: "Inspect https://target.test/account",
      startUrl: "https://target.test/account",
      profileId: "browser-assessment"
    })));
    expect(api.startAgentRun).not.toHaveBeenCalledWith(expect.objectContaining({ policy: expect.anything() }));
    expect(screen.queryByTestId("agentWorkerLimitSelect")).not.toBeInTheDocument();
    expect(screen.queryByTestId("agentGoalInput")).not.toBeInTheDocument();
    expect(window.localStorage.getItem("radar.ai-operator.draft.session-test")).toBe("");
  });

  it("offers the maximum-budget goal-driven profile", async () => {
    const api = operatorApi();
    Object.defineProperty(window, "radarOperator", { value: api, writable: true, configurable: true });
    render(<AiOperatorApp />);

    const profileSelect = await screen.findByTestId("agentProfileSelect");
    expect(within(profileSelect).getByRole("option", { name: "Goal-Driven Assessment" })).toBeInTheDocument();
    fireEvent.change(profileSelect, { target: { value: "goal-driven-assessment" } });
    expect(screen.getByText("replay 10")).toBeInTheDocument();
    expect(screen.getByText("workflow 10")).toBeInTheDocument();

    fireEvent.change(screen.getByTestId("agentGoalInput"), {
      target: { value: "Inspect https://target.test until the bounded segment completes" }
    });
    fireEvent.click(screen.getByTestId("startAgentRun"));

    await waitFor(() => expect(api.startAgentRun).toHaveBeenCalledWith(expect.objectContaining({
      profileId: "goal-driven-assessment"
    })));
  });

  it("starts continuous autonomous assessment without another approval step", async () => {
    const api = operatorApi();
    Object.defineProperty(window, "radarOperator", { value: api, writable: true, configurable: true });
    render(<AiOperatorApp />);

    const profileSelect = await screen.findByTestId("agentProfileSelect");
    fireEvent.change(profileSelect, { target: { value: "autonomous-assessment" } });

    expect(screen.getByTestId("assessmentContractDeck")).toHaveTextContent("no approval pauses");
    expect(screen.getByTestId("assessmentContractDeck")).toHaveTextContent("stops on first supported result");
    expect(screen.getByTestId("startAgentRun")).toHaveTextContent("Start Autonomous");

    fireEvent.change(screen.getByTestId("agentGoalInput"), {
      target: { value: "Assess https://target.test until Radar finds a supported result" }
    });
    fireEvent.click(screen.getByTestId("startAgentRun"));

    await waitFor(() => expect(api.startAgentRun).toHaveBeenCalledWith(expect.objectContaining({
      profileId: "autonomous-assessment",
      assessmentContract: expect.objectContaining({
        authorityLevel: "read-only-probes",
        maxConcurrency: 1
      })
    })));
  });

  it("prepares an out-of-scope origin in the visible workspace without starting", async () => {
    const api = operatorApi();
    Object.defineProperty(window, "radarOperator", { value: api, writable: true, configurable: true });
    render(<AiOperatorApp />);

    fireEvent.change(await screen.findByTestId("agentGoalInput"), { target: { value: "Inspect https://outside.test/admin" } });
    fireEvent.click(screen.getByTestId("startAgentRun"));

    await waitFor(() => expect(api.dispatchWorkspaceIntent).toHaveBeenCalledWith({
      type: "propose-scope-origin",
      origin: "https://outside.test",
      reason: "AI Operator goal requested https://outside.test."
    }));
    expect(api.focusWorkspace).toHaveBeenCalled();
    expect(api.startAgentRun).not.toHaveBeenCalled();
  });

  it("keeps failure recovery and finding evidence inline in the durable feed", async () => {
    const failed = run({
      status: "failed",
      timeline: [{
        id: "failure-1",
        createdAt: "2026-05-25T00:01:00.000Z",
        phase: "failure",
        summary: "Replay failed safely.",
        recoveryActions: ["retry-tool", "draft-finding", "stop-run"],
        toolResult: { ok: false, tool: "sendReplay", error: "Target refused the connection." }
      }],
      findings: [{
        id: "finding-1",
        title: "Tenant boundary requires review",
        notes: "Cross-tenant behavior needs operator validation.",
        evidenceRefs: ["capture:capture-1"],
        confidence: "medium",
        createdAt: "2026-05-25T00:01:00.000Z",
        affectedAssets: ["target.test"],
        reproductionNotes: "Repeat with two test tenants.",
        severityRationale: "Cross-tenant access would break authorization boundaries.",
        remediation: "Enforce object ownership on the server.",
        uncertainties: ["Requires operator validation."]
      }]
    });
    const corrected = run({
      status: "paused",
      timeline: [
        ...failed.timeline,
        {
          id: "retry-corrected",
          createdAt: "2026-05-25T00:01:01.000Z",
          phase: "policy-block",
          summary: "Automatic retry unavailable for sendReplay"
        }
      ],
      findings: failed.findings
    });
    const api = operatorApi({
      listAgentRuns: vi.fn(async () => [failed]),
      recoverAgentRun: vi.fn(async () => corrected)
    });
    Object.defineProperty(window, "radarOperator", { value: api, writable: true, configurable: true });
    render(<AiOperatorApp />);

    expect(await screen.findByText("Target refused the connection.")).toBeInTheDocument();
    expect(screen.getByText("Tenant boundary requires review")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("agentRecovery-retry-tool"));
    await waitFor(() => expect(api.recoverAgentRun).toHaveBeenCalledWith("run-test", { action: "retry-tool", entryId: "failure-1" }));
    expect(screen.getAllByText("Automatic retry unavailable for sendReplay").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByTestId("agentRecovery-draft-finding"));
    await waitFor(() => expect(api.recoverAgentRun).toHaveBeenCalledWith("run-test", { action: "draft-finding", entryId: "failure-1" }));
  });

  it("shows a detailed durable write-up when an assessment completes", async () => {
    const finding = {
      id: "finding-complete",
      title: "Credentialed CORS response lacks cache variance",
      notes: "A specific credentialed allowed origin was observed without Vary: Origin.",
      evidenceRefs: ["capture:capture-cors"],
      confidence: "medium" as const,
      createdAt: "2026-05-25T00:01:00.000Z",
      affectedAssets: ["https://analytics.target.test/ingest"],
      reproductionNotes: "Inspect capture:capture-cors and compare Origin-specific responses.",
      severityRationale: "Shared caching could serve an origin-specific response incorrectly.",
      remediation: "Add Vary: Origin whenever the response depends on Origin.",
      uncertainties: ["Exploitability was not established from the single observed origin."]
    };
    const completed = run({
      status: "completed",
      findings: [finding],
      timeline: [{
        id: "completion-1",
        operationId: "operation-finish",
        createdAt: "2026-05-25T00:01:00.000Z",
        phase: "status",
        summary: "Completion report ready",
        note: "Public assessment complete.",
        completionReport: {
          generatedAt: "2026-05-25T00:01:00.000Z",
          outcome: "draft-findings",
          findingCount: 1,
          rejectedFindingCount: 0,
          operationCount: 7,
          evidenceRefs: ["capture:capture-cors", "capture:capture-home"],
          executiveSummary: "The public assessment found one cache-hardening concern and no observed cookie-setting responses.",
          scopeSummary: "Reviewed the public document and analytics origins without an authenticated identity.",
          methodology: ["Mapped public paths.", "Reviewed captured response headers and CORS behavior."],
          observations: [{
            title: "No Set-Cookie observed",
            detail: "No Set-Cookie response was present in the retained public browsing traffic.",
            status: "supported",
            confidence: "medium",
            evidenceRefs: ["capture:capture-home"]
          }],
          limitations: ["Authenticated and stateful application paths were not available."],
          recommendations: ["Retest with an authorized authenticated identity."]
        }
      }]
    });
    const api = operatorApi({
      listAgentRuns: vi.fn(async () => [completed]),
      getTargets: vi.fn(async () => ["https://target.test", "https://analytics.target.test"])
    });
    Object.defineProperty(window, "radarOperator", { value: api, writable: true, configurable: true });

    render(<AiOperatorApp />);

    const report = await screen.findByTestId("agentCompletionReport");
    expect(report).toHaveTextContent("Completion Report");
    expect(report).toHaveTextContent("The public assessment found one cache-hardening concern");
    expect(report).toHaveTextContent("No Set-Cookie observed");
    expect(report).toHaveTextContent("Credentialed CORS response lacks cache variance");
    expect(report).toHaveTextContent("Shared caching could serve an origin-specific response incorrectly.");
    expect(report).toHaveTextContent("Inspect capture:capture-cors and compare Origin-specific responses.");
    expect(report).toHaveTextContent("Add Vary: Origin whenever the response depends on Origin.");
    expect(report).toHaveTextContent("Authenticated and stateful application paths were not available.");
    expect(report).toHaveTextContent("Retest with an authorized authenticated identity.");
    fireEvent.click(screen.getByTestId("followUpFinding-finding-complete"));
    expect(screen.getByTestId("findingFollowUpChip")).toHaveTextContent("Credentialed CORS response lacks cache variance");
    expect((screen.getByTestId("agentGoalInput") as HTMLTextAreaElement).value).toContain("Follow up on draft finding");
    fireEvent.click(screen.getByTestId("startAgentRun"));
    await waitFor(() => expect(api.startAgentRun).toHaveBeenCalledWith(expect.objectContaining({
      source: {
        kind: "finding-follow-up",
        sourceRunId: "run-test",
        sourceFindingId: "finding-complete"
      }
    })));
  });

  it("opens pending authority with once and approve-all choices and disables resume until review", async () => {
    const pending = run({
      checkpoint: {
        startUrl: "https://target.test/login",
        targetOrigin: "https://target.test",
        stepCount: 3,
        replayCount: 0,
        workflowRequestCount: 0,
        elapsedMs: 4_000,
        lastResumedAt: "2026-05-25T00:00:30.000Z",
        activeIdentity: "current",
        pendingCapabilityCall: {
          tool: "clickElement",
          input: { selector: "[data-radar-agent-ref=\"pw-3\"]" }
        }
      },
      capabilities: {
        version: 1,
        revision: 1,
        leases: [{
          id: "lease-click",
          name: "Authorize clickElement",
          riskTier: "active",
          tools: ["clickElement"],
          grants: [{
            origin: "https://target.test",
            method: "GET",
            pathPrefix: "/login",
            identity: "current"
          }],
          durationMs: 120_000,
          maxUses: 1,
          maxRequests: 1,
          maxConcurrency: 1,
          maxPayloadBytes: 0,
          reason: "Authorize one exact visible click.",
          status: "draft",
          createdAt: "2026-05-25T00:01:00.000Z",
          updatedAt: "2026-05-25T00:01:00.000Z",
          usedUses: 0,
          usedRequests: 0,
          scopeSnapshot: []
        }],
        receipts: []
      }
    });
    const updateAgentCapabilities = vi.fn(async () => pending);
    const api = operatorApi({
      listAgentRuns: vi.fn(async () => [pending]),
      updateAgentCapabilities
    });
    Object.defineProperty(window, "radarOperator", { value: api, writable: true, configurable: true });
    render(<AiOperatorApp />);

    const permissionDialog = await screen.findByTestId("agentCapabilityReview");
    expect(permissionDialog).toHaveAttribute("aria-modal", "true");
    expect(permissionDialog).toHaveTextContent("Authorize clickElement");
    expect(screen.getByTestId("capabilityPermissionDeny")).toHaveFocus();
    expect(screen.getByTestId("resumeAgentRun")).toBeDisabled();
    expect(screen.getByTestId("resumeAgentRun")).toHaveTextContent("Approve Lease First");
    expect(screen.getByTestId("capabilityPermissionGrant")).toHaveTextContent("Approve Once");
    expect(screen.getByTestId("capabilityPermissionResumeAfterApproval")).toBeChecked();
    fireEvent.click(screen.getByTestId("capabilityPermissionGrantAll"));

    await waitFor(() => expect(updateAgentCapabilities).toHaveBeenCalledWith("run-test", {
      action: "grant",
      approval: "all-matching",
      expectedRevision: 1,
      leaseId: "lease-click",
      resumeAfterApproval: true
    }));

    await waitFor(() => expect(screen.getByTestId("capabilityPermissionGrant")).toBeEnabled());
    fireEvent.click(screen.getByTestId("capabilityPermissionResumeAfterApproval"));
    expect(screen.getByTestId("capabilityPermissionResumeAfterApproval")).not.toBeChecked();
    fireEvent.click(screen.getByTestId("capabilityPermissionGrant"));
    await waitFor(() => expect(updateAgentCapabilities).toHaveBeenLastCalledWith("run-test", {
      action: "grant",
      approval: "once",
      expectedRevision: 1,
      leaseId: "lease-click",
      resumeAfterApproval: false
    }));
  });

  it("shows newest events first and pauses live-follow while the operator reviews history", async () => {
    const active = run({
      status: "running",
      timeline: [
        {
          id: "entry-oldest",
          createdAt: "2026-05-25T00:00:10.000Z",
          phase: "status",
          summary: "Run started."
        },
        {
          id: "entry-latest",
          createdAt: "2026-05-25T00:00:20.000Z",
          operationId: "operation-latest",
          phase: "decision",
          summary: "Inspect the visible account boundary.",
          target: { view: "traffic", evidenceId: "capture-1" },
          toolCall: { tool: "getCaptures", input: {} }
        }
      ]
    });
    const api = operatorApi({ listAgentRuns: vi.fn(async () => [active]) });
    Object.defineProperty(window, "radarOperator", { value: api, writable: true, configurable: true });
    render(<AiOperatorApp />);

    const timeline = await screen.findByTestId("agentTimeline");
    const renderedItems = [...timeline.querySelectorAll<HTMLElement>("[data-operation-id], [data-entry-id]")];
    expect(renderedItems.map((entry) => entry.dataset.operationId || entry.dataset.entryId)).toEqual([
      "operation-latest",
      "entry-oldest"
    ]);
    expect(timeline.querySelector("[data-stream-operation-shell='operation-latest']")).toHaveClass("animate-[stream-append_560ms_cubic-bezier(0.22,0.72,0.18,1)_both]");
    expect(screen.getByTestId("agentOperationBody-operation-latest")).toBeInTheDocument();
    expect(screen.getByTestId("agentThoughtstreamLive")).toHaveTextContent("Streaming");
    expect(screen.getByTestId("aiOperatorActiveControls")).toHaveTextContent("Review tenant isolation");
    expect(screen.getByTestId("aiOperatorActiveControls")).toHaveTextContent("Pause & Steer");
    expect(screen.getByTestId("pauseAgentRun")).toHaveAccessibleName("Pause run and open mission steering");
    expect(screen.queryByTestId("agentGoalInput")).not.toBeInTheDocument();
    expect(screen.queryByTestId("agentProfileSelect")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("agentAuditDetailToggle"));
    expect(screen.getByTestId("agentOperationAuditDetail")).toHaveTextContent("entry-latest");
    fireEvent.click(screen.getByTestId("previewOperationTarget-operation-latest"));
    expect(screen.getByTestId("agentEvidencePreview")).toHaveTextContent("capture-1");
    fireEvent.click(screen.getByTestId("revealPreviewInWorkspace"));
    expect(api.dispatchWorkspaceIntent).toHaveBeenCalledWith({
      type: "reveal-timeline-target",
      runId: "run-test",
      entryId: "entry-latest"
    });

    const scroller = screen.getByTestId("aiOperatorTranscriptScroller");
    const scrollTo = vi.fn();
    Object.defineProperty(scroller, "scrollTo", { value: scrollTo, configurable: true });
    scroller.scrollTop = 120;
    fireEvent.scroll(scroller);
    fireEvent.click(screen.getByTestId("agentFollowLatest"));

    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "smooth" });
    expect(screen.queryByTestId("agentFollowLatest")).not.toBeInTheDocument();
  });

  it("makes live mission steering explicit before revealing the paused editor", async () => {
    const active = run({ status: "running" });
    const pauseAgentRun = vi.fn(async () => run({ status: "paused" }));
    const api = operatorApi({
      listAgentRuns: vi.fn(async () => [active]),
      pauseAgentRun
    });
    Object.defineProperty(window, "radarOperator", { value: api, writable: true, configurable: true });
    render(<AiOperatorApp />);

    await screen.findByTestId("aiOperatorActiveControls");
    const pauseAndSteer = screen.getByTestId("pauseAgentRun");
    expect(pauseAndSteer).toHaveTextContent("Pause & Steer");
    fireEvent.click(pauseAndSteer);

    await waitFor(() => expect(pauseAgentRun).toHaveBeenCalledWith("run-test"));
    expect(await screen.findByText("Update mission direction")).toBeInTheDocument();
    expect(screen.getByTestId("agentGoalInput")).toHaveAttribute(
      "placeholder",
      "Tell the agent what to prioritize, avoid, or investigate next. The original goal stays in the audit trail."
    );
    expect(screen.getByTestId("steerAgentRun")).toHaveTextContent("Add Direction");
  });

  it("opens a clean New Mission composer when paused history exists", async () => {
    const api = operatorApi({ listAgentRuns: vi.fn(async () => [run()]) });
    Object.defineProperty(window, "radarOperator", { value: api, writable: true, configurable: true });
    render(<AiOperatorApp />);

    expect(await screen.findByTestId("steerAgentRun")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("newAiMission"));
    const goal = screen.getByTestId("agentGoalInput");
    fireEvent.change(goal, { target: { value: "Inspect https://target.test/new" } });
    fireEvent.click(screen.getByTestId("startAgentRun"));

    await waitFor(() => expect(api.startAgentRun).toHaveBeenCalledWith(expect.objectContaining({
      goal: "Inspect https://target.test/new"
    })));
  });

  it("moves provider editing into the companion and publishes through explicit probes", async () => {
    const api = operatorApi({
      refreshAiModels: vi.fn(async () => [{ id: "radar-fixture-model", label: "Radar fixture model" }])
    });
    Object.defineProperty(window, "radarOperator", { value: api, writable: true, configurable: true });
    render(<AiOperatorApp />);

    fireEvent.click(await screen.findByTestId("aiOperatorSettings"));
    fireEvent.click(screen.getByTestId("aiSaveSettings"));

    await waitFor(() => expect(api.setAiSettings).toHaveBeenCalled());
    expect(api.probeAiConnection).toHaveBeenCalled();
    expect(api.refreshAiModels).toHaveBeenCalled();
    await waitFor(() => expect(screen.getByTestId("aiModel")).toHaveValue("radar-fixture-model"));
  });

  it("restores a saved key when returning to a cloud provider", async () => {
    const getAiSettings = vi.fn(async (provider?: AiSettings["provider"]) => provider === "xai"
      ? { provider, model: "grok-4.5", apiKey: "xai-saved-secret", baseUrl: "https://api.x.ai/v1" }
      : { provider: "openai" as const, model: "gpt-4o-mini", apiKey: "openai-saved-secret", baseUrl: "" });
    const api = operatorApi({ getAiSettings });
    Object.defineProperty(window, "radarOperator", { value: api, writable: true, configurable: true });
    render(<AiOperatorApp />);

    fireEvent.click(await screen.findByTestId("aiOperatorSettings"));
    expect(screen.getByTestId("aiConnectOpenAi")).toBeInTheDocument();
    expect(screen.getByTestId("aiConnectAnthropic")).toBeInTheDocument();
    expect(screen.getByTestId("aiConnectXai")).toBeInTheDocument();
    expect(screen.getByTestId("aiConnectOpenRouter")).toBeInTheDocument();
    expect(screen.getByTestId("aiConnectGrokCli")).toBeInTheDocument();
    expect(screen.getByTestId("aiConnectCursorCli")).toBeInTheDocument();

    fireEvent.change(screen.getByTestId("aiProvider"), { target: { value: "xai" } });
    await waitFor(() => expect(getAiSettings).toHaveBeenCalledWith("xai"));
    expect(screen.getByTestId("aiApiKey")).toHaveValue("xai-saved-secret");
    expect(screen.getByTestId("aiModel")).toHaveValue("grok-4.5");
    expect(screen.getByTestId("aiProviderEndpoint")).toHaveTextContent("https://api.x.ai/v1");
    expect(screen.getByTestId("aiConnectionStatus")).toHaveTextContent("Save & Test to verify");
  });

  it("shows Grok CLI login controls for the local grok provider", async () => {
    const getAiSettings = vi.fn(async (provider?: AiSettings["provider"]) => provider === "grok-local"
      ? { provider, model: "auto", apiKey: "local", baseUrl: "grok://local" }
      : { provider: "openai" as const, model: "gpt-4o-mini", apiKey: "openai-saved-secret", baseUrl: "" });
    const api = operatorApi({ getAiSettings });
    Object.defineProperty(window, "radarOperator", { value: api, writable: true, configurable: true });
    render(<AiOperatorApp />);

    fireEvent.click(await screen.findByTestId("aiOperatorSettings"));
    fireEvent.change(screen.getByTestId("aiProvider"), { target: { value: "grok-local" } });
    await waitFor(() => expect(getAiSettings).toHaveBeenCalledWith("grok-local"));
    expect(screen.getByTestId("aiGrokLogin")).toBeInTheDocument();
    expect(screen.getByTestId("aiGrokApiKey")).toBeInTheDocument();
    expect(screen.queryByTestId("aiApiKey")).not.toBeInTheDocument();
    expect(screen.queryByTestId("aiProviderEndpoint")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("aiGrokLogin"));
    await waitFor(() => expect(api.loginGrok).toHaveBeenCalled());
  });
});
