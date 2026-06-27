// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import type { AgentRun, CapturedRequest, WebSocketEvent } from "./types";

const capture = (id: string, url: string, overrides: Partial<CapturedRequest> = {}): CapturedRequest => {
  const parsed = new URL(url);
  return {
    id,
    startedAt: "2026-05-25T00:00:00.000Z",
    method: "GET",
    url,
    host: parsed.host,
    path: parsed.pathname,
    requestHeaders: {},
    requestBody: "",
    status: 200,
    statusText: "OK",
    mimeType: "text/html",
    type: "Document",
    responseHeaders: {},
    responseBody: "",
    durationMs: 12,
    allowed: false,
    source: "browser",
    ...overrides
  };
};

afterEach(() => {
  window.localStorage.clear();
  vi.mocked(window.radar!.getCaptures).mockResolvedValue([]);
  vi.mocked(window.radar!.getInterceptState).mockResolvedValue({
    config: { requestEnabled: false, responseEnabled: false },
    queue: []
  });
  vi.mocked(window.radar!.setInterceptConfig).mockClear();
  vi.mocked(window.radar!.setInterceptConfig).mockImplementation(async (config) => ({
    config: {
      requestEnabled: typeof config.requestEnabled === "boolean" ? config.requestEnabled : false,
      responseEnabled: typeof config.responseEnabled === "boolean" ? config.responseEnabled : false
    },
    queue: []
  }));
  vi.mocked(window.radar!.forwardIntercept).mockClear();
  vi.mocked(window.radar!.dropIntercept).mockClear();
  vi.mocked(window.radar!.resumeAllIntercepts).mockClear();
  vi.mocked(window.radar!.getInterceptRules).mockResolvedValue([]);
  vi.mocked(window.radar!.setInterceptRules).mockClear();
  vi.mocked(window.radar!.setInterceptRules).mockImplementation(async (rules) => rules);
  vi.mocked(window.radar!.getMatchReplaceRules).mockResolvedValue([]);
  vi.mocked(window.radar!.setMatchReplaceRules).mockClear();
  vi.mocked(window.radar!.setMatchReplaceRules).mockImplementation(async (rules) => rules);
  vi.mocked(window.radar!.getProxyProfiles).mockResolvedValue([]);
  vi.mocked(window.radar!.saveProxyProfile).mockClear();
  vi.mocked(window.radar!.saveProxyProfile).mockResolvedValue([]);
  vi.mocked(window.radar!.searchGlobal).mockClear();
  vi.mocked(window.radar!.searchGlobal).mockResolvedValue({ ok: true, query: "", results: [], total: 0, limit: 40, offset: 0 });
  vi.mocked(window.radar!.getProjectNotes).mockResolvedValue([]);
  vi.mocked(window.radar!.saveProjectNote).mockClear();
  vi.mocked(window.radar!.saveProjectNote).mockImplementation(async (note) => note);
  vi.mocked(window.radar!.deleteProjectNote).mockClear();
  vi.mocked(window.radar!.deleteProjectNote).mockResolvedValue({ ok: true, notes: [] });
  vi.mocked(window.radar!.getSavedViews).mockResolvedValue([]);
  vi.mocked(window.radar!.saveSavedView).mockClear();
  vi.mocked(window.radar!.saveSavedView).mockImplementation(async (view) => view);
  vi.mocked(window.radar!.deleteSavedView).mockClear();
  vi.mocked(window.radar!.deleteSavedView).mockResolvedValue({ ok: true, views: [] });
  vi.mocked(window.radar!.previewProjectBundleExport).mockClear();
  vi.mocked(window.radar!.previewProjectBundleExport).mockResolvedValue({
    ok: true,
    bundle: null,
    stats: {
      sessions: 1,
      captures: 0,
      webSocketEvents: 0,
      findings: 0,
      workflows: 0,
      projectNotes: 0,
      savedViews: 0,
      replayCollections: 0,
      plugins: 0,
      proposedTargets: 0
    },
    warnings: []
  });
  vi.mocked(window.radar!.writeProjectBundle).mockClear();
  vi.mocked(window.radar!.writeProjectBundle).mockResolvedValue({
    ok: true,
    path: "/tmp/radar-project.radar-bundle.json",
    preview: {
      ok: true,
      bundle: null,
      stats: {
        sessions: 1,
        captures: 0,
        webSocketEvents: 0,
        findings: 0,
        workflows: 0,
        projectNotes: 0,
        savedViews: 0,
        replayCollections: 0,
        plugins: 0,
        proposedTargets: 0
      },
      warnings: []
    }
  });
  vi.mocked(window.radar!.previewProjectBundleImport).mockClear();
  vi.mocked(window.radar!.previewProjectBundleImport).mockResolvedValue({
    ok: true,
    bundle: null,
    stats: {
      sessions: 0,
      captures: 0,
      webSocketEvents: 0,
      findings: 0,
      workflows: 0,
      projectNotes: 0,
      savedViews: 0,
      replayCollections: 0,
      plugins: 0,
      proposedTargets: 0
    },
    warnings: [],
    conflicts: [],
    proposedTargets: [],
    inactiveTargets: []
  });
  vi.mocked(window.radar!.applyProjectBundleImport).mockClear();
  vi.mocked(window.radar!.applyProjectBundleImport).mockResolvedValue({
    ok: true,
    imported: {
      sessions: 0,
      captures: 0,
      webSocketEvents: 0,
      findings: 0,
      workflows: 0,
      projectNotes: 0,
      savedViews: 0,
      replayCollections: 0,
      plugins: 0,
      proposedTargets: 0
    },
    skipped: {
      sessions: 0,
      captures: 0,
      webSocketEvents: 0,
      findings: 0,
      workflows: 0,
      projectNotes: 0,
      savedViews: 0,
      replayCollections: 0,
      plugins: 0,
      proposedTargets: 0
    },
    proposedTargets: [],
    message: "Bundle import applied."
  });
  vi.mocked(window.radar!.previewHandoffPackage).mockClear();
  vi.mocked(window.radar!.previewHandoffPackage).mockResolvedValue({
    ok: true,
    package: null,
    stats: {
      findings: 0,
      captures: 0,
      webSocketEvents: 0,
      workflows: 0,
      replayCollections: 0,
      projectNotes: 0,
      targets: 0
    },
    warnings: []
  });
  vi.mocked(window.radar!.writeHandoffPackage).mockClear();
  vi.mocked(window.radar!.writeHandoffPackage).mockResolvedValue({
    ok: true,
    path: "/tmp/radar-handoff.json",
    preview: {
      ok: true,
      package: null,
      stats: {
        findings: 0,
        captures: 0,
        webSocketEvents: 0,
        workflows: 0,
        replayCollections: 0,
        projectNotes: 0,
        targets: 0
      },
      warnings: []
    }
  });
  vi.mocked(window.radar!.getTargets).mockResolvedValue([]);
  vi.mocked(window.radar!.setTargets).mockClear();
  vi.mocked(window.radar!.setTargets).mockResolvedValue(undefined as unknown as string[]);
  vi.mocked(window.radar!.getReplayCollections).mockResolvedValue([]);
  vi.mocked(window.radar!.setReplayCollections).mockClear();
  vi.mocked(window.radar!.setReplayCollections).mockImplementation(async (items) => items);
  vi.mocked(window.radar!.getWebSocketEvents).mockResolvedValue([]);
  vi.mocked(window.radar!.getAutomatePayloadSets).mockResolvedValue([]);
  vi.mocked(window.radar!.setAutomatePayloadSets).mockClear();
  vi.mocked(window.radar!.listAutomateSessions).mockResolvedValue([]);
  vi.mocked(window.radar!.startAutomateSession).mockClear();
  vi.mocked(window.radar!.listAgentRuns).mockResolvedValue([]);
  vi.mocked(window.radar!.getFindings).mockResolvedValue([]);
  vi.mocked(window.radar!.saveFinding).mockClear();
  vi.mocked(window.radar!.saveFinding).mockImplementation(async (finding) => finding);
  vi.mocked(window.radar!.buildFindingReport).mockClear();
  vi.mocked(window.radar!.buildFindingReport).mockResolvedValue({
    format: "markdown",
    title: "Test Findings",
    generatedAt: "2026-05-25T00:00:00.000Z",
    findingCount: 1,
    body: "# Test Findings\n\n## Missing security headers"
  });
  vi.mocked(window.radar!.getWorkflows).mockResolvedValue([]);
  vi.mocked(window.radar!.saveWorkflow).mockClear();
  vi.mocked(window.radar!.deleteWorkflow).mockClear();
  vi.mocked(window.radar!.validateWorkflow).mockClear();
  vi.mocked(window.radar!.getWorkflowRevisions).mockClear();
  vi.mocked(window.radar!.getWorkflowRevisions).mockResolvedValue([]);
  vi.mocked(window.radar!.getWorkflowRuns).mockResolvedValue([]);
  vi.mocked(window.radar!.runWorkflow).mockClear();
  vi.mocked(window.radar!.promoteWorkflowResultToFinding).mockClear();
  vi.mocked(window.radar!.getPlugins).mockResolvedValue([]);
  vi.mocked(window.radar!.getPluginAudit).mockResolvedValue([]);
  vi.mocked(window.radar!.previewPluginInstall).mockClear();
  vi.mocked(window.radar!.installPlugin).mockClear();
  vi.mocked(window.radar!.approvePlugin).mockClear();
  vi.mocked(window.radar!.setPluginStatus).mockClear();
  vi.mocked(window.radar!.removePlugin).mockClear();
  vi.mocked(window.radar!.renderPluginPanel).mockClear();
  vi.mocked(window.radar!.validatePlugin).mockClear();
  vi.mocked(window.radar!.runPluginApiAction).mockClear();
  vi.mocked(window.radar!.seedDemoProject).mockClear();
  vi.mocked(window.radar!.listLocalSessions).mockResolvedValue([
    {
      id: "session-test",
      workspaceId: "workspace-test",
      name: "Session 2026-05-25 00:00",
      startedAt: "2026-05-25T00:00:00.000Z",
      updatedAt: "2026-05-25T00:00:00.000Z",
      captureCount: 0,
      sslEventCount: 0
    }
  ]);
});

describe("App", () => {
  it("renders the workbench shell", async () => {
    render(<App />);
    expect(await screen.findByRole("heading", { name: "HTTP / HTTPS Traffic" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /open browser/i })).toBeInTheDocument();
    expect(screen.queryByTestId("markTarget")).not.toBeInTheDocument();
    expect(screen.getByText(/Attack Surface Workbench/i)).toBeInTheDocument();
    expect(screen.getByTestId("aiConnectionIndicator")).toBeInTheDocument();
    expect(screen.getByTestId("openProfileSessionPanel")).toBeInTheDocument();
  });

  it("opens global search and jumps to a capture result", async () => {
    const searchableCapture = capture("cap-search", "https://app.test/api/session", {
      allowed: true,
      method: "POST",
      responseBody: "session response"
    });
    vi.mocked(window.radar!.getTargets).mockResolvedValue(["https://app.test"]);
    vi.mocked(window.radar!.getCaptures).mockResolvedValue([searchableCapture]);
    vi.mocked(window.radar!.searchGlobal).mockImplementation(async (request) => ({
      ok: true,
      query: request.query,
      total: 1,
      limit: 40,
      offset: 0,
      results: [
        {
          id: "capture:cap-search",
          kind: "capture",
          title: "POST 200 /api/session",
          subtitle: "app.test",
          detail: "https://app.test/api/session",
          refId: "cap-search",
          createdAt: "2026-05-25T00:00:00.000Z",
          updatedAt: "2026-05-25T00:00:00.000Z",
          url: "https://app.test/api/session",
          host: "app.test",
          path: "/api/session",
          status: "200",
          source: "browser",
          score: 12,
          matches: [{ field: "url", label: "URL", snippet: "https://app.test/api/session", start: 21, end: 28 }],
          target: { view: "traffic", id: "cap-search" }
        }
      ]
    }));

    render(<App />);
    fireEvent.click(await screen.findByTestId("openGlobalSearch"));
    fireEvent.change(await screen.findByTestId("globalSearchInput"), { target: { value: "session" } });

    expect(await screen.findByText("POST 200 /api/session")).toBeInTheDocument();
    fireEvent.click(screen.getByText("POST 200 /api/session"));

    await waitFor(() => expect(screen.queryByTestId("globalSearchOverlay")).not.toBeInTheDocument());
    expect(screen.getByRole("heading", { name: "HTTP / HTTPS Traffic" })).toBeInTheDocument();
    expect(screen.getByTestId("trafficRow-cap-search")).toHaveAttribute("data-selected", "true");
  });

  it("shows full AI-First observation history and recovery actions", async () => {
    const failedRun: AgentRun = {
      id: "agent-observe",
      sessionId: "session-test",
      createdAt: "2026-05-25T00:00:00.000Z",
      updatedAt: "2026-05-25T00:00:07.000Z",
      goal: "Review security headers.",
      profileId: "header-cookie-review",
      status: "failed",
      policy: {
        maxRuntimeMs: 120000,
        maxSteps: 8,
        maxReplay: 1,
        maxWorkflowRequests: 1,
        maxCaptureSample: 20,
        allowRawContext: false
      },
      timeline: [
        {
          id: "step-1",
          createdAt: "2026-05-25T00:00:00.000Z",
          note: "Run queued from AI-First goal prompt.",
          phase: "status"
        },
        ...Array.from({ length: 6 }, (_, index) => ({
          id: `step-mid-${index}`,
          createdAt: `2026-05-25T00:00:0${index + 1}.000Z`,
          note: `Intermediate step ${index + 1}`,
          phase: "status" as const
        })),
        {
          id: "step-failed-tool",
          createdAt: "2026-05-25T00:00:07.000Z",
          note: "Tool result: analyzeSecurityHeaders",
          phase: "failure",
          summary: "analyzeSecurityHeaders failed",
          target: { view: "advanced" },
          recoveryActions: ["retry-tool", "retry-with-evidence", "skip-and-continue", "stop-run", "draft-finding"],
          toolResult: {
            tool: "analyzeSecurityHeaders",
            ok: false,
            error: "No target-origin captures for https://apexads.io"
          }
        }
      ],
      findings: [],
      error: "No target-origin captures for https://apexads.io"
    };
    vi.mocked(window.radar!.listAgentRuns).mockResolvedValue([failedRun]);

    render(<App />);
    fireEvent.click(await screen.findByTestId("aiFirstMode"));

    const timeline = await screen.findByTestId("agentTimeline");
    expect(timeline.textContent).toContain("Run queued from AI-First goal prompt.");
    expect(screen.getByText("analyzeSecurityHeaders failed")).toBeInTheDocument();
    expect(screen.getByText("No target-origin captures for https://apexads.io")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("agentRecovery-retry-tool"));
    await waitFor(() => {
      expect((screen.getByTestId("agentGoalInput") as HTMLTextAreaElement).value).toContain(
        "Retry analyzeSecurityHeaders after reviewing visible evidence."
      );
    });
  });

  it("starts AI-First with the selected run profile", async () => {
    const startAgentRun = vi.mocked(window.radar!.startAgentRun);
    vi.mocked(window.radar!.getTargets).mockResolvedValue(["https://hairetsu.com"]);

    render(<App />);
    fireEvent.click(await screen.findByTestId("aiFirstMode"));
    fireEvent.change(screen.getByTestId("agentProfileSelect"), { target: { value: "header-cookie-review" } });
    fireEvent.change(screen.getByTestId("agentGoalInput"), { target: { value: "Inspect https://hairetsu.com headers" } });
    fireEvent.click(screen.getByTestId("startAgentRun"));

    await waitFor(() => {
      expect(startAgentRun).toHaveBeenCalledWith(
        expect.objectContaining({
          profileId: "header-cookie-review"
        })
      );
    });
  });

  it("confirms proposed run memory and supports manual memory creation", async () => {
    const saveAgentRunMemory = vi.mocked(window.radar!.saveAgentRunMemory);
    const run: AgentRun = {
      id: "agent-memory",
      sessionId: "session-test",
      createdAt: "2026-05-25T00:00:00.000Z",
      updatedAt: "2026-05-25T00:00:01.000Z",
      goal: "Remember tested leads.",
      profileId: "passive-map",
      status: "completed",
      policy: {
        maxRuntimeMs: 120000,
        maxSteps: 8,
        maxReplay: 0,
        maxWorkflowRequests: 0,
        maxCaptureSample: 20,
        allowRawContext: false
      },
      timeline: [
        {
          id: "memory-step",
          createdAt: "2026-05-25T00:00:01.000Z",
          phase: "tool-result",
          summary: "proposeRunMemory completed",
          toolResult: {
            tool: "proposeRunMemory",
            ok: true,
            data: {
              note: "Proposed run memory for operator confirmation.",
              memory: {
                id: "memory-proposed",
                createdAt: "2026-05-25T00:00:01.000Z",
                updatedAt: "2026-05-25T00:00:01.000Z",
                kind: "hypothesis",
                status: "proposed",
                title: "Redirect reviewed",
                notes: "Landing redirect has been reviewed.",
                evidenceRefs: ["capture:home"]
              }
            }
          }
        }
      ],
      findings: []
    };
    vi.mocked(window.radar!.listAgentRuns).mockResolvedValue([run]);

    render(<App />);
    fireEvent.click(await screen.findByTestId("aiFirstMode"));
    fireEvent.click(await screen.findByTestId("agentMemoryConfirm-memory-step"));
    fireEvent.change(screen.getByTestId("agentMemoryTitle"), { target: { value: "Manual hypothesis" } });
    fireEvent.change(screen.getByTestId("agentMemoryNotes"), { target: { value: "Retest after fix." } });
    fireEvent.click(screen.getByTestId("agentMemoryCreate"));

    await waitFor(() => {
      expect(saveAgentRunMemory).toHaveBeenCalledWith(expect.objectContaining({ id: "memory-proposed", status: "confirmed" }));
      expect(saveAgentRunMemory).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Manual hypothesis", notes: "Retest after fix.", status: "confirmed" })
      );
    });
  });

  it("loads AI-prepared workflow drafts into the visible editor without running them", async () => {
    const runWorkflow = vi.mocked(window.radar!.runWorkflow);
    const run: AgentRun = {
      id: "agent-workflow-draft",
      sessionId: "session-test",
      createdAt: "2026-05-25T00:00:00.000Z",
      updatedAt: "2026-05-25T00:00:01.000Z",
      goal: "Prepare a workflow draft.",
      profileId: "api-hardening",
      status: "completed",
      policy: {
        maxRuntimeMs: 120000,
        maxSteps: 8,
        maxReplay: 0,
        maxWorkflowRequests: 0,
        maxCaptureSample: 20,
        allowRawContext: false
      },
      timeline: [
        {
          id: "workflow-draft-step",
          createdAt: "2026-05-25T00:00:01.000Z",
          phase: "tool-result",
          summary: "prepareWorkflowDraft completed",
          toolResult: {
            tool: "prepareWorkflowDraft",
            ok: true,
            data: {
              note: "Prepared workflow draft for operator review.",
              workflow: {
                id: "ai-header-workflow",
                name: "AI Header Review",
                description: "Prepared draft.",
                mode: "passive",
                builtIn: false,
                inputs: [],
                scope: { requireInScope: true, allowActive: false, maxRequests: 0, timeoutMs: 5000, delayMs: 0, maxResults: 20 },
                steps: [{ id: "step-1", title: "Headers", kind: "security-headers", config: {} }],
                createdAt: "2026-05-25T00:00:00.000Z",
                updatedAt: "2026-05-25T00:00:00.000Z"
              }
            }
          }
        }
      ],
      findings: []
    };
    vi.mocked(window.radar!.listAgentRuns).mockResolvedValue([run]);

    render(<App />);
    fireEvent.click(await screen.findByTestId("aiFirstMode"));

    expect(await screen.findByTestId("aiPreparedWorkflowDraft")).toBeInTheDocument();
    expect((screen.getByTestId("workflowDefinition") as HTMLTextAreaElement).value).toContain("AI Header Review");
    expect(runWorkflow).not.toHaveBeenCalled();
  });

  it("saves project notes and current view snapshots", async () => {
    const saveProjectNote = vi.mocked(window.radar!.saveProjectNote);
    const saveSavedView = vi.mocked(window.radar!.saveSavedView);

    render(<App />);
    fireEvent.click(await screen.findByTestId("openProjectArtifacts"));

    fireEvent.change(await screen.findByTestId("projectNoteTitle"), { target: { value: "Auth handoff" } });
    fireEvent.change(screen.getByTestId("projectNoteBody"), {
      target: { value: "Session refresh needs a follow-up replay." }
    });
    fireEvent.click(screen.getByTestId("saveProjectNote"));

    await waitFor(() =>
      expect(saveProjectNote).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Auth handoff",
          body: "Session refresh needs a follow-up replay."
        })
      )
    );

    fireEvent.change(screen.getByTestId("savedViewName"), { target: { value: "Traffic triage" } });
    fireEvent.change(screen.getByTestId("savedViewDescription"), { target: { value: "Return to the traffic queue." } });
    fireEvent.click(screen.getByTestId("saveCurrentView"));

    await waitFor(() =>
      expect(saveSavedView).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Traffic triage",
          view: "traffic",
          description: "Return to the traffic queue.",
          state: expect.any(Object)
        })
      )
    );
  });

  it("previews and applies project bundle import/export controls", async () => {
    const previewExport = vi.mocked(window.radar!.previewProjectBundleExport);
    const previewImport = vi.mocked(window.radar!.previewProjectBundleImport);
    const applyImport = vi.mocked(window.radar!.applyProjectBundleImport);
    previewImport.mockResolvedValue({
      ok: true,
      bundle: null,
      stats: {
        sessions: 1,
        captures: 2,
        webSocketEvents: 1,
        findings: 1,
        workflows: 1,
        projectNotes: 1,
        savedViews: 1,
        replayCollections: 0,
        plugins: 0,
        proposedTargets: 1
      },
      warnings: ["Imported scope targets are previewed but will not be applied automatically."],
      conflicts: [{ kind: "capture", id: "cap-1", action: "skip" }],
      proposedTargets: ["https://app.test"],
      inactiveTargets: ["https://app.test"]
    });

    render(<App />);
    fireEvent.click(await screen.findByTestId("openProjectArtifacts"));
    fireEvent.change(await screen.findByTestId("bundleRedaction"), { target: { value: "raw-evidence" } });
    fireEvent.click(screen.getByTestId("previewProjectBundleExport"));

    await waitFor(() =>
      expect(previewExport).toHaveBeenCalledWith(
        expect.objectContaining({
          redaction: "raw-evidence",
          includeReplayCollections: true,
          includePlugins: false
        })
      )
    );

    fireEvent.change(screen.getByTestId("bundleImportPath"), {
      target: { value: "/tmp/client.radar-bundle.json" }
    });
    fireEvent.click(screen.getByTestId("previewProjectBundleImport"));

    expect(await screen.findByText(/Inactive proposed scope: https:\/\/app.test/)).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("applyProjectBundleImport"));

    await waitFor(() =>
      expect(applyImport).toHaveBeenCalledWith({ sourcePath: "/tmp/client.radar-bundle.json" })
    );
  });

  it("previews and exports handoff packages", async () => {
    const previewHandoff = vi.mocked(window.radar!.previewHandoffPackage);
    const writeHandoff = vi.mocked(window.radar!.writeHandoffPackage);
    previewHandoff.mockResolvedValue({
      ok: true,
      package: null,
      stats: {
        findings: 2,
        captures: 3,
        webSocketEvents: 1,
        workflows: 1,
        replayCollections: 1,
        projectNotes: 1,
        targets: 1
      },
      warnings: ["Evidence payloads are redacted. Use raw evidence only after explicit operator approval."]
    });

    render(<App />);
    fireEvent.click(await screen.findByTestId("openProjectArtifacts"));
    fireEvent.change(await screen.findByTestId("handoffTitle"), { target: { value: "Auth review handoff" } });
    fireEvent.click(screen.getByTestId("handoffIncludeDraftFindings"));
    fireEvent.click(screen.getByTestId("previewHandoffPackage"));

    await waitFor(() =>
      expect(previewHandoff).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Auth review handoff",
          redaction: "redacted-evidence",
          includeDraftFindings: true,
          includeProjectNotes: true,
          includeWorkflows: true
        })
      )
    );
    expect(await screen.findByText(/2 findings \/ 3 req \/ 1 ws/)).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("writeHandoffPackage"));
    await waitFor(() => expect(writeHandoff).toHaveBeenCalledWith(expect.objectContaining({ title: "Auth review handoff" })));
  });

  it("loads the seeded demo project from the local ledger panel", async () => {
    const seedDemoProject = vi.mocked(window.radar!.seedDemoProject);

    render(<App />);
    fireEvent.click(await screen.findByTestId("openProfileSessionPanel"));
    fireEvent.click(await screen.findByTestId("seedDemoProject"));

    await waitFor(() => expect(seedDemoProject).toHaveBeenCalledTimes(1));
  });

  it("renders advanced testing analysis and import previews", async () => {
    vi.mocked(window.radar!.getTargets).mockResolvedValue(["https://allowed.test"]);
    vi.mocked(window.radar!.getCaptures).mockResolvedValue([
      capture("advanced-graphql", "https://allowed.test/graphql", {
        method: "POST",
        requestHeaders: {
          Authorization: "Bearer token",
          "Content-Type": "application/json"
        },
        requestBody: JSON.stringify({
          query: "query Me($id: ID) { me(id: $id) { id } }",
          variables: { id: "1" }
        }),
        responseHeaders: { "Cache-Control": "public, max-age=3600" }
      })
    ]);

    render(<App />);

    fireEvent.click(await screen.findByTestId("view-advanced"));
    expect(await screen.findByRole("heading", { name: "Advanced Testing" })).toBeInTheDocument();
    expect(screen.getByTestId("advancedWorkbench")).toHaveTextContent("GraphQL Review");
    expect(screen.getByTestId("advancedWorkbench")).toHaveTextContent("Me");
    expect(screen.getByTestId("advancedWorkbench")).toHaveTextContent("cache-poisoning");

    fireEvent.change(screen.getByTestId("advancedImportText"), {
      target: {
        value: JSON.stringify({
          openapi: "3.0.0",
          info: { title: "Advanced API" },
          servers: [{ url: "https://allowed.test" }],
          paths: {
            "/users": {
              get: { operationId: "listUsers" }
            }
          }
        })
      }
    });

    await waitFor(() => {
      expect(screen.getByTestId("advancedImportPreview")).toHaveTextContent("GET");
      expect(screen.getByTestId("advancedImportPreview")).toHaveTextContent("/users");
    });

    fireEvent.click(screen.getByTestId("saveAdvancedImportCollection"));
    await waitFor(() => {
      expect(window.radar!.setReplayCollections).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            name: "Advanced API",
            items: expect.arrayContaining([expect.objectContaining({ name: "/users" })])
          })
        ])
      );
    });

    fireEvent.click(screen.getByTestId("view-advanced"));
    fireEvent.click(await screen.findByTestId("draftAdvancedImportWorkflow"));
    expect(await screen.findByRole("heading", { name: "Workflows" })).toBeInTheDocument();
    expect(screen.getByTestId("aiPreparedWorkflowDraft")).toBeInTheDocument();
    expect(screen.getByTestId("workflowDefinition")).toHaveTextContent("OPENAPI imported API review");

    fireEvent.click(screen.getByTestId("view-advanced"));
    fireEvent.click(await screen.findByTestId("loadAdvancedImportDraft"));
    expect(await screen.findByRole("heading", { name: "Repeater" })).toBeInTheDocument();
    expect((screen.getByTestId("repeaterUrl") as HTMLInputElement).value).toBe("https://allowed.test/users");
  });

  it("marks automate payload positions and loads a materialized preview into repeater", async () => {
    render(<App />);

    fireEvent.click(await screen.findByTestId("view-automate"));
    expect(await screen.findByRole("heading", { name: "Automate" })).toBeInTheDocument();

    fireEvent.change(screen.getByTestId("automateMarkerName"), { target: { value: "id" } });
    fireEvent.change(screen.getByTestId("automatePayloads"), { target: { value: "42\n43" } });
    fireEvent.click(screen.getByTestId("markAutomateUrl"));

    await waitFor(() => {
      expect(screen.getByTestId("automatePreview")).toHaveTextContent("id=42");
    });

    fireEvent.click(screen.getByTestId("loadAutomatePreviewInline"));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Repeater" })).toBeInTheDocument();
      expect((screen.getByTestId("repeaterUrl") as HTMLInputElement).value).toContain("id=42");
    });
  });

  it("starts bounded automate sessions from visible controls", async () => {
    render(<App />);

    fireEvent.click(await screen.findByTestId("view-automate"));
    fireEvent.change(screen.getByTestId("automateMarkerName"), { target: { value: "id" } });
    fireEvent.change(screen.getByTestId("automatePayloads"), { target: { value: "42\n43" } });
    fireEvent.click(screen.getByTestId("markAutomateUrl"));
    await waitFor(() => {
      expect(screen.getByTestId("automatePreview")).toHaveTextContent("id=42");
    });
    fireEvent.click(screen.getByTestId("startAutomateSession"));

    await waitFor(() => {
      expect(window.radar!.startAutomateSession).toHaveBeenCalledWith(
        expect.objectContaining({
          payloads: ["42", "43"],
          limits: expect.objectContaining({ count: 10, concurrency: 1 })
        })
      );
    });
  });

  it("creates a draft finding from selected capture and builds report preview", async () => {
    vi.mocked(window.radar!.getTargets).mockResolvedValue(["https://allowed.test"]);
    vi.mocked(window.radar!.getCaptures).mockResolvedValue([
      capture("finding-cap", "https://allowed.test/admin", { allowed: true })
    ]);

    render(<App />);

    expect(await screen.findByTestId("trafficRow-finding-cap")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("view-findings"));
    expect(await screen.findByRole("heading", { name: "Findings" })).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("createFindingFromCapture"));

    await waitFor(() => {
      expect(window.radar!.saveFinding).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Missing security headers",
          evidence: [expect.objectContaining({ kind: "capture", id: "finding-cap" })]
        })
      );
    });

    fireEvent.change(await screen.findByTestId("findingComponent"), { target: { value: "Admin Console" } });
    fireEvent.change(screen.getByTestId("findingAssignee"), { target: { value: "Dana" } });
    vi.mocked(window.radar!.saveFinding).mockClear();
    fireEvent.click(screen.getByTestId("saveFinding"));
    await waitFor(() => {
      expect(window.radar!.saveFinding).toHaveBeenCalledWith(
        expect.objectContaining({
          component: "Admin Console",
          assignee: "Dana"
        })
      );
    });

    fireEvent.change(screen.getByTestId("findingReportPreset"), { target: { value: "raw-technical-appendix" } });
    fireEvent.change(screen.getByTestId("findingReportTitle"), { target: { value: "External Report" } });
    fireEvent.change(screen.getByTestId("findingReportExecutiveSummary"), {
      target: { value: "One reviewed issue is ready for delivery." }
    });
    fireEvent.click(screen.getByTestId("buildFindingReport"));

    await waitFor(() => {
      expect(window.radar!.buildFindingReport).toHaveBeenCalledWith(
        expect.objectContaining({
          format: "markdown",
          preset: "raw-technical-appendix",
          title: "External Report",
          executiveSummary: "One reviewed issue is ready for delivery.",
          includeAppendix: true,
          includeRetestMatrix: true
        })
      );
      expect(screen.getByTestId("findingReportPreview")).toHaveTextContent("Missing security headers");
    });
  });

  it("runs a selected workflow from the workflows view", async () => {
    vi.mocked(window.radar!.getWorkflows).mockResolvedValue([
      {
        id: "builtin-security-headers",
        name: "Security Headers",
        description: "Checks response headers.",
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
        steps: [{ id: "headers", title: "Security headers", kind: "security-headers", config: {} }],
        createdAt: "2026-05-25T00:00:00.000Z",
        updatedAt: "2026-05-25T00:00:00.000Z"
      }
    ]);
    vi.mocked(window.radar!.runWorkflow).mockResolvedValue({
      id: "workflow-run-1",
      workflowId: "builtin-security-headers",
      workflowName: "Security Headers",
      sessionId: "session-test",
      source: "manual",
      mode: "passive",
      status: "completed",
      inputs: {},
      startedAt: "2026-05-25T00:00:00.000Z",
      completedAt: "2026-05-25T00:00:01.000Z",
      stepCount: 1,
      actionCount: 0,
      results: [
        {
          id: "workflow-result-1",
          stepId: "headers",
          stepTitle: "Security headers",
          level: "warn",
          title: "Missing security headers",
          message: "Missing HSTS.",
          evidence: [],
          details: {},
          createdAt: "2026-05-25T00:00:01.000Z"
        }
      ]
    });

    render(<App />);

    fireEvent.click(await screen.findByTestId("view-workflows"));
    expect(await screen.findByRole("heading", { name: "Security Headers" })).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("runWorkflow"));

    await waitFor(() => {
      expect(window.radar!.runWorkflow).toHaveBeenCalledWith({
        workflowId: "builtin-security-headers",
        inputs: {},
        source: "manual"
      });
      expect(screen.getByTestId("workflowResults")).toHaveTextContent("Missing security headers");
    });
  });

  it("saves an edited workflow definition from the workflows view", async () => {
    vi.mocked(window.radar!.getWorkflowRevisions).mockResolvedValue([
      {
        id: "revision-1",
        workflowId: "builtin-security-headers",
        workflowName: "Security Headers",
        savedAt: "2026-05-25T00:00:00.000Z",
        summary: "Initial workflow version saved",
        diff: [{ kind: "added", field: "workflow", after: "Security Headers" }],
        workflow: {
          id: "builtin-security-headers",
          name: "Security Headers",
          description: "Checks response headers.",
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
          steps: [{ id: "headers", title: "Security headers", kind: "security-headers", config: {} }],
          createdAt: "2026-05-25T00:00:00.000Z",
          updatedAt: "2026-05-25T00:00:00.000Z"
        }
      }
    ]);
    vi.mocked(window.radar!.getWorkflows).mockResolvedValue([
      {
        id: "builtin-security-headers",
        name: "Security Headers",
        description: "Checks response headers.",
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
        steps: [{ id: "headers", title: "Security headers", kind: "security-headers", config: {} }],
        createdAt: "2026-05-25T00:00:00.000Z",
        updatedAt: "2026-05-25T00:00:00.000Z"
      }
    ]);

    render(<App />);

    fireEvent.click(await screen.findByTestId("view-workflows"));
    expect(await screen.findByTestId("workflowGraph")).toHaveTextContent("Security headers");
    fireEvent.click(screen.getByTestId("validateWorkflow"));
    await waitFor(() => expect(window.radar!.validateWorkflow).toHaveBeenCalled());
    fireEvent.click(screen.getByTestId("workflowTemplate-cache-control"));
    expect(screen.getByTestId("workflowDryRun")).toHaveTextContent("runnable");
    expect(await screen.findByTestId("workflowRevisions")).toHaveTextContent("Initial workflow version saved");
    fireEvent.click(await screen.findByTestId("saveWorkflow"));

    await waitFor(() => {
      expect(window.radar!.saveWorkflow).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "builtin-security-headers-custom",
          name: "Security Headers",
          builtIn: false
        })
      );
    });
  });

  it("previews, installs, approves, disables, and removes a local plugin", async () => {
    const plugin = {
      id: "jwt-helper",
      manifest: {
        schemaVersion: 1 as const,
        id: "jwt-helper",
        name: "JWT Helper",
        version: "1.0.0",
        description: "Decode token-shaped values.",
        author: "Radar",
        sdkVersion: "0.1",
        minRadarVersion: "",
        entry: "dist/index.js",
        permissions: ["captures:read" as const, "ui:panel" as const],
        panels: [{ id: "token-panel", title: "Token Panel", entry: "panel.html" }]
      },
      sourcePath: "/tmp/jwt-helper",
      grantedPermissions: [],
      status: "pending" as const,
      trustLevel: "first-party" as const,
      compatibilityWarnings: [],
      warnings: [],
      installedAt: "2026-05-25T00:00:00.000Z",
      updatedAt: "2026-05-25T00:00:00.000Z"
    };
    vi.mocked(window.radar!.getPlugins).mockResolvedValueOnce([]).mockResolvedValue([plugin]);
    vi.mocked(window.radar!.getPluginAudit).mockResolvedValue([
      {
        id: "plugin-audit-1",
        pluginId: "jwt-helper",
        pluginName: "JWT Helper",
        action: "captures:list",
        permission: "captures:read",
        ok: true,
        message: "Plugin API action completed.",
        inputSummary: "{}",
        outputSummary: "[]",
        durationMs: 1,
        createdAt: "2026-05-25T00:00:03.000Z"
      }
    ]);

    render(<App />);

    fireEvent.click(await screen.findByTestId("view-plugins"));
    fireEvent.change(screen.getByTestId("pluginInstallPath"), { target: { value: "/tmp/jwt-helper" } });
    fireEvent.click(screen.getByTestId("validatePlugin"));
    await waitFor(() => expect(window.radar!.validatePlugin).toHaveBeenCalledWith("/tmp/jwt-helper"));
    expect(await screen.findByTestId("pluginDeveloperValidation")).toHaveTextContent("passed");
    fireEvent.click(screen.getByTestId("previewPlugin"));

    expect(await screen.findByTestId("pluginInstallPreview")).toHaveTextContent("JWT Helper");
    expect(window.radar!.previewPluginInstall).toHaveBeenCalledWith("/tmp/jwt-helper");

    fireEvent.click(screen.getByTestId("installPlugin"));
    await waitFor(() => expect(window.radar!.installPlugin).toHaveBeenCalledWith("/tmp/jwt-helper"));
    expect(await screen.findByTestId("pluginRow-jwt-helper")).toHaveTextContent("pending");

    fireEvent.click(screen.getByTestId("approvePlugin-jwt-helper"));
    await waitFor(() =>
      expect(window.radar!.approvePlugin).toHaveBeenCalledWith({
        id: "jwt-helper",
        permissions: ["captures:read", "ui:panel"]
      })
    );
    fireEvent.click(await screen.findByTestId("renderPluginPanel-jwt-helper-token-panel"));
    await waitFor(() =>
      expect(window.radar!.renderPluginPanel).toHaveBeenCalledWith({
        pluginId: "jwt-helper",
        panelId: "token-panel"
      })
    );
    expect(await screen.findByTestId("pluginPanelRender")).toHaveTextContent("Token Panel");

    fireEvent.change(screen.getByTestId("pluginApiRequest"), {
      target: { value: JSON.stringify({ pluginId: "jwt-helper", action: "captures:list", input: { query: "" } }) }
    });
    fireEvent.click(screen.getByTestId("runPluginApi"));
    await waitFor(() => expect(window.radar!.runPluginApiAction).toHaveBeenCalled());
    expect(await screen.findByTestId("pluginAudit")).toHaveTextContent("Plugin API action completed");

    fireEvent.click(screen.getByTestId("disablePlugin-jwt-helper"));
    await waitFor(() =>
      expect(window.radar!.setPluginStatus).toHaveBeenCalledWith({
        id: "jwt-helper",
        status: "disabled"
      })
    );

    fireEvent.click(screen.getByTestId("removePlugin-jwt-helper"));
    await waitFor(() => expect(window.radar!.removePlugin).toHaveBeenCalledWith("jwt-helper"));
  });

  it("hydrates profiles and http captures when websocket ipc is unavailable", async () => {
    const originalWebSocketSnapshot = window.radar!.getWebSocketEvents;
    const legacyRadar = window.radar as unknown as { getWebSocketEvents?: unknown };
    try {
      legacyRadar.getWebSocketEvents = undefined;
      vi.mocked(window.radar!.getTargets).mockResolvedValue(["https://allowed.test"]);
      vi.mocked(window.radar!.getCaptures).mockResolvedValue([capture("allowed", "https://allowed.test/path")]);

      render(<App />);

      expect(await screen.findByTestId("trafficRow-allowed")).toBeInTheDocument();
      fireEvent.click(screen.getByTestId("openProfileSessionPanel"));
      expect(await screen.findByTestId("profileSessionPanel")).toBeInTheDocument();
    } finally {
      legacyRadar.getWebSocketEvents = originalWebSocketSnapshot;
    }
  });

  it("switches to AI-First and starts an agent run from a goal", async () => {
    const startAgentRun = vi.mocked(window.radar!.startAgentRun);
    const setTargets = vi.mocked(window.radar!.setTargets);
    startAgentRun.mockClear();
    setTargets.mockClear();
    setTargets.mockImplementation(async (nextTargets) => nextTargets);
    vi.mocked(window.radar!.getTargets).mockResolvedValue(["http://localhost:*"]);

    render(<App />);

    fireEvent.click(await screen.findByTestId("aiFirstMode"));
    expect(screen.getByTestId("aiFirstConsole")).toBeInTheDocument();

    fireEvent.change(screen.getByTestId("agentGoalInput"), { target: { value: "Inspect hairetsu.com for auth hardening" } });
    fireEvent.click(screen.getByTestId("startAgentRun"));

    await waitFor(() => {
      expect(setTargets).toHaveBeenCalledWith(["http://localhost:*", "https://hairetsu.com"]);
      expect(startAgentRun).toHaveBeenCalledWith({
        goal: "Inspect hairetsu.com for auth hardening",
        startUrl: "https://hairetsu.com",
        profileId: "passive-map"
      });
    });
  });

  it("follows agent view changes while AI-First is active", async () => {
    window.localStorage.setItem("radar.appMode", "ai-first");
    vi.mocked(window.radar!.listAgentRuns).mockResolvedValue([
      {
        id: "agent-view",
        sessionId: "session-test",
        createdAt: "2026-05-25T00:00:00.000Z",
        updatedAt: "2026-05-25T00:00:01.000Z",
        goal: "Drive the app",
        profileId: "api-hardening",
        status: "running",
          policy: {
            maxRuntimeMs: 120000,
            maxSteps: 8,
            maxReplay: 1,
            maxWorkflowRequests: 1,
            maxCaptureSample: 20,
            allowRawContext: false
        },
        timeline: [
          {
            id: "step-repeater",
            createdAt: "2026-05-25T00:00:01.000Z",
            note: "Agent is moving to Repeater.",
            toolCall: { tool: "showView", input: { view: "repeater", reason: "Replay inspection" } }
          }
        ],
        findings: []
      }
    ]);

    render(<App />);

    expect(await screen.findByTestId("aiFirstConsole")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Repeater" })).toBeInTheDocument();
    });
  });

  it("saves active profile and session names from the profile session panel", async () => {
    const saveProfile = vi.mocked(window.radar!.saveLocalProfile);
    const saveSession = vi.mocked(window.radar!.saveLocalSession);
    saveProfile.mockClear();
    saveSession.mockClear();

    render(<App />);

    fireEvent.click(await screen.findByTestId("openProfileSessionPanel"));
    expect(await screen.findByTestId("profileSessionPanel")).toBeInTheDocument();

    fireEvent.change(screen.getByTestId("profileNameInput"), { target: { value: "Client Alpha" } });
    fireEvent.click(screen.getByTestId("saveProfile"));

    await waitFor(() => {
      expect(saveProfile).toHaveBeenCalledWith({ id: "profile-test", name: "Client Alpha" });
    });

    fireEvent.change(screen.getByTestId("sessionNameInput"), { target: { value: "Retest 01" } });
    fireEvent.click(screen.getByTestId("saveSession"));

    await waitFor(() => {
      expect(saveSession).toHaveBeenCalledWith({ id: "session-test", name: "Retest 01" });
    });
  });

  it("names a new traffic session before creating it", async () => {
    const createSession = vi.mocked(window.radar!.createLocalSession);
    createSession.mockClear();

    render(<App />);

    fireEvent.click(await screen.findByTestId("createLocalSession"));
    expect(await screen.findByTestId("newSessionDialog")).toBeInTheDocument();

    fireEvent.change(screen.getByTestId("newSessionNameInput"), { target: { value: "Checkout retest" } });
    fireEvent.click(screen.getByTestId("confirmNewSession"));

    await waitFor(() => {
      expect(createSession).toHaveBeenCalledWith("Checkout retest");
    });
  });

  it("loads sessions from the main nav selector", async () => {
    vi.mocked(window.radar!.listLocalSessions).mockResolvedValue([
      {
        id: "session-test",
        workspaceId: "workspace-test",
        name: "Baseline",
        startedAt: "2026-05-25T00:00:00.000Z",
        updatedAt: "2026-05-25T00:00:00.000Z",
        captureCount: 0,
        sslEventCount: 0
      },
      {
        id: "session-archive",
        workspaceId: "workspace-test",
        name: "Archive",
        startedAt: "2026-05-25T00:01:00.000Z",
        updatedAt: "2026-05-25T00:01:00.000Z",
        captureCount: 2,
        sslEventCount: 1
      }
    ]);
    vi.mocked(window.radar!.loadLocalSession).mockResolvedValue({
      profile: {
        id: "profile-test",
        name: "Local Operator",
        createdAt: "2026-05-25T00:00:00.000Z",
        updatedAt: "2026-05-25T00:00:00.000Z"
      },
      workspace: {
        id: "workspace-test",
        profileId: "profile-test",
        name: "Default Workspace",
        createdAt: "2026-05-25T00:00:00.000Z",
        updatedAt: "2026-05-25T00:00:00.000Z"
      },
      session: {
        id: "session-archive",
        workspaceId: "workspace-test",
        name: "Archive",
        startedAt: "2026-05-25T00:01:00.000Z",
        updatedAt: "2026-05-25T00:01:00.000Z"
      }
    });

    render(<App />);

    expect(await screen.findByText("Archive - 2 req")).toBeInTheDocument();
    fireEvent.change(screen.getByTestId("sessionSelector"), { target: { value: "session-archive" } });

    await waitFor(() => {
      expect(window.radar!.loadLocalSession).toHaveBeenCalledWith("session-archive");
    });
  });

  it("shows websocket frames in the websocket analyzer tab", async () => {
    vi.mocked(window.radar!.getTargets).mockResolvedValue(["https://allowed.test"]);
    const frame: WebSocketEvent = {
      id: "ws-frame-1",
      requestId: "request-ws-1",
      createdAt: "2026-05-25T00:00:00.000Z",
      url: "wss://allowed.test/socket",
      host: "allowed.test",
      direction: "received",
      opcode: 1,
      payloadData: "{\"type\":\"ready\"}",
      size: 16,
      responseHeaders: { Upgrade: "websocket" },
      requestHeaders: { Connection: "Upgrade" },
      allowed: true
    };
    vi.mocked(window.radar!.getWebSocketEvents).mockResolvedValue([frame]);

    render(<App />);

    fireEvent.click(await screen.findByTestId("view-websocket"));

    expect(await screen.findByRole("heading", { name: "WebSocket" })).toBeInTheDocument();
    expect(screen.getByTestId("webSocketRow-ws-frame-1")).toBeInTheDocument();
    expect(screen.getByTestId("webSocketDetailText")).toHaveTextContent("wss://allowed.test/socket");

    fireEvent.change(screen.getByTestId("webSocketDirectionFilter"), { target: { value: "sent" } });
    expect(screen.queryByTestId("webSocketRow-ws-frame-1")).not.toBeInTheDocument();
    expect(screen.getByText("No WebSocket frames match filters")).toBeInTheDocument();
  });

  it("queues and edits scoped requests in the intercept view", async () => {
    vi.mocked(window.radar!.getTargets).mockResolvedValue(["https://allowed.test"]);
    vi.mocked(window.radar!.getInterceptState).mockResolvedValue({
      config: { requestEnabled: true, responseEnabled: false },
      queue: [
        {
          id: "intercept-1",
          captureId: "cap-intercept-1",
          stage: "request",
          queuedAt: "2026-05-25T00:00:00.000Z",
          method: "POST",
          url: "https://allowed.test/login",
          host: "allowed.test",
          path: "/login",
          headers: { "Content-Type": "application/json" },
          body: "{\"role\":\"user\"}",
          allowed: true,
          source: "proxy",
          note: "Paused before upstream"
        }
      ]
    });

    render(<App />);

    fireEvent.click(await screen.findByTestId("view-intercept"));
    expect(await screen.findByRole("heading", { name: "Intercept" })).toBeInTheDocument();
    expect(screen.getByTestId("interceptRow-intercept-1")).toHaveAttribute("data-selected", "true");
    expect(screen.getByTestId("interceptBody")).toHaveValue("{\"role\":\"user\"}");

    fireEvent.change(screen.getByTestId("interceptBody"), { target: { value: "{\"role\":\"admin\"}" } });
    fireEvent.click(screen.getByTestId("forwardIntercept"));

    await waitFor(() => {
      expect(window.radar!.forwardIntercept).toHaveBeenCalledWith({
        id: "intercept-1",
        draft: {
          method: "POST",
          url: "https://allowed.test/login",
          headers: { "Content-Type": "application/json" },
          body: "{\"role\":\"admin\"}"
        }
      });
    });
  });

  it("queues and edits scoped responses in the intercept view", async () => {
    vi.mocked(window.radar!.getTargets).mockResolvedValue(["https://allowed.test"]);
    vi.mocked(window.radar!.getInterceptState).mockResolvedValue({
      config: { requestEnabled: false, responseEnabled: true },
      queue: [
        {
          id: "intercept-response-1",
          captureId: "cap-intercept-response-1",
          stage: "response",
          queuedAt: "2026-05-25T00:00:00.000Z",
          method: "POST",
          url: "https://allowed.test/login",
          host: "allowed.test",
          path: "/login",
          headers: { "content-type": "application/json" },
          body: "{\"ok\":true}",
          allowed: true,
          source: "proxy",
          note: "Paused before client",
          status: 200,
          statusText: "OK"
        }
      ]
    });

    render(<App />);

    fireEvent.click(await screen.findByTestId("view-intercept"));
    expect(await screen.findByTestId("interceptRow-intercept-response-1")).toHaveAttribute("data-selected", "true");
    expect(screen.getByTestId("interceptStatus")).toHaveValue(200);

    fireEvent.change(screen.getByTestId("interceptStatus"), { target: { value: "401" } });
    fireEvent.change(screen.getByTestId("interceptStatusText"), { target: { value: "Unauthorized" } });
    fireEvent.click(screen.getByTestId("forwardIntercept"));

    await waitFor(() => {
      expect(window.radar!.forwardIntercept).toHaveBeenCalledWith({
        id: "intercept-response-1",
        response: {
          status: 401,
          statusText: "Unauthorized",
          headers: { "content-type": "application/json" },
          body: "{\"ok\":true}"
        }
      });
    });
  });

  it("saves intercept rules from the intercept view", async () => {
    vi.mocked(window.radar!.getInterceptRules).mockResolvedValue([
      {
        id: "rule-login",
        name: "Login JSON",
        enabled: true,
        stage: "request",
        method: "POST",
        path: "/login",
        createdAt: "2026-05-25T00:00:00.000Z",
        updatedAt: "2026-05-25T00:00:00.000Z"
      }
    ]);

    render(<App />);

    fireEvent.click(await screen.findByTestId("view-intercept"));
    expect((await screen.findByTestId("interceptRulesText") as HTMLTextAreaElement).value).toContain("Login JSON");

    fireEvent.change(screen.getByTestId("interceptRulesText"), {
      target: {
        value: JSON.stringify([
          {
            id: "rule-admin",
            name: "Admin responses",
            enabled: true,
            stage: "response",
            status: 403,
            createdAt: "2026-05-25T00:00:00.000Z",
            updatedAt: "2026-05-25T00:00:00.000Z"
          }
        ])
      }
    });
    fireEvent.click(screen.getByTestId("saveInterceptRules"));

    await waitFor(() => {
      expect(window.radar!.setInterceptRules).toHaveBeenCalledWith([
        expect.objectContaining({ id: "rule-admin", name: "Admin responses", stage: "response", status: 403 })
      ]);
    });
  });

  it("saves match and replace rules from the intercept view", async () => {
    vi.mocked(window.radar!.getMatchReplaceRules).mockResolvedValue([
      {
        id: "rewrite-role",
        name: "Promote Role",
        enabled: true,
        stage: "response",
        target: "body",
        match: "\"user\"",
        replace: "\"admin\"",
        createdAt: "2026-05-25T00:00:00.000Z",
        updatedAt: "2026-05-25T00:00:00.000Z"
      }
    ]);

    render(<App />);

    fireEvent.click(await screen.findByTestId("view-intercept"));
    expect((await screen.findByTestId("matchReplaceRulesText") as HTMLTextAreaElement).value).toContain("Promote Role");

    fireEvent.change(screen.getByTestId("matchReplaceRulesText"), {
      target: {
        value: JSON.stringify([
          {
            id: "rewrite-token",
            name: "Swap Token",
            enabled: true,
            stage: "request",
            target: "header",
            headerName: "authorization",
            match: "old-token",
            replace: "new-token",
            createdAt: "2026-05-25T00:00:00.000Z",
            updatedAt: "2026-05-25T00:00:00.000Z"
          }
        ])
      }
    });
    fireEvent.click(screen.getByTestId("saveMatchReplaceRules"));

    await waitFor(() => {
      expect(window.radar!.setMatchReplaceRules).toHaveBeenCalledWith([
        expect.objectContaining({ id: "rewrite-token", name: "Swap Token", target: "header" })
      ]);
    });
  });

  it("saves proxy profile notes from the SSL view", async () => {
    vi.mocked(window.radar!.getProxyProfiles).mockResolvedValue([
      {
        id: "radar-browser",
        label: "Radar Browser",
        hint: "Use Open Browser.",
        notes: "",
        updatedAt: ""
      },
      {
        id: "cli",
        label: "CLI Tools",
        hint: "Export proxy variables.",
        notes: "old note",
        updatedAt: "2026-05-25T00:00:00.000Z"
      }
    ]);
    vi.mocked(window.radar!.saveProxyProfile).mockResolvedValue([
      {
        id: "cli",
        label: "CLI Tools",
        hint: "Export proxy variables.",
        notes: "export HTTPS_PROXY=http://127.0.0.1:8088",
        updatedAt: "2026-05-25T00:01:00.000Z"
      }
    ]);

    render(<App />);

    fireEvent.click(await screen.findByTestId("view-ssl"));
    fireEvent.click(await screen.findByTestId("proxyProfile-cli"));
    expect(screen.getByTestId("proxyProfileNotes")).toHaveValue("old note");

    fireEvent.change(screen.getByTestId("proxyProfileNotes"), {
      target: { value: "export HTTPS_PROXY=http://127.0.0.1:8088" }
    });
    fireEvent.click(screen.getByTestId("saveProxyProfile"));

    await waitFor(() => {
      expect(window.radar!.saveProxyProfile).toHaveBeenCalledWith({
        id: "cli",
        notes: "export HTTPS_PROXY=http://127.0.0.1:8088"
      });
    });
  });

  it("filters the traffic list to current scope", async () => {
    vi.mocked(window.radar!.getTargets).mockResolvedValue(["https://allowed.test"]);
    vi.mocked(window.radar!.getCaptures).mockResolvedValue([
      capture("allowed", "https://allowed.test/path"),
      capture("blocked", "https://blocked.test/path")
    ]);

    render(<App />);

    expect(await screen.findByTestId("trafficRow-allowed")).toBeInTheDocument();
    expect(screen.queryByTestId("trafficRow-blocked")).not.toBeInTheDocument();
  });

  it("keeps traffic detail text selectable and copyable", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(window.navigator, "clipboard", {
      configurable: true,
      value: { writeText }
    });
    vi.mocked(window.radar!.getTargets).mockResolvedValue(["https://allowed.test"]);
    vi.mocked(window.radar!.getCaptures).mockResolvedValue([capture("allowed", "https://allowed.test/path")]);

    render(<App />);

    expect(await screen.findByTestId("trafficRow-allowed")).toBeInTheDocument();
    expect(screen.getByTestId("trafficDetailText")).toHaveClass("select-text");

    fireEvent.click(screen.getByTestId("copyTrafficDetail"));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("GET https://allowed.test/path"));
  });

  it("opens a request context menu and copies export snippets", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(window.navigator, "clipboard", {
      configurable: true,
      value: { writeText }
    });
    vi.mocked(window.radar!.getTargets).mockResolvedValue(["https://allowed.test"]);
    vi.mocked(window.radar!.getCaptures).mockResolvedValue([
      capture("allowed", "https://allowed.test/api", {
        method: "POST",
        requestHeaders: { Accept: "application/json" },
        requestBody: "{\"probe\":true}"
      })
    ]);

    render(<App />);

    fireEvent.contextMenu(await screen.findByTestId("trafficRow-allowed"), { clientX: 120, clientY: 140 });
    expect(screen.getByTestId("requestContextMenu")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("requestMenuCopyCurl"));

    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("curl -i"));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("--data-raw '{\"probe\":true}'"));
  });

  it("adds a request origin to scope and deletes captures from the context menu", async () => {
    const setTargets = vi.mocked(window.radar!.setTargets);
    const deleteCapture = vi.mocked(window.radar!.deleteCapture);
    setTargets.mockClear();
    deleteCapture.mockClear();
    vi.mocked(window.radar!.getTargets).mockResolvedValue(["https://*.test"]);
    vi.mocked(window.radar!.getCaptures).mockResolvedValue([capture("new", "https://new.test/api")]);

    render(<App />);

    fireEvent.contextMenu(await screen.findByTestId("trafficRow-new"), { clientX: 100, clientY: 100 });
    fireEvent.click(screen.getByTestId("requestMenuAddScope"));

    await waitFor(() => {
      expect(setTargets).toHaveBeenCalledWith(["https://*.test", "https://new.test"]);
    });

    fireEvent.contextMenu(screen.getByTestId("trafficRow-new"), { clientX: 100, clientY: 100 });
    fireEvent.click(screen.getByTestId("requestMenuDelete"));

    await waitFor(() => {
      expect(deleteCapture).toHaveBeenCalledWith("new");
      expect(screen.queryByTestId("trafficRow-new")).not.toBeInTheDocument();
    });
  });

  it("filters traffic by method and resource type", async () => {
    vi.mocked(window.radar!.getTargets).mockResolvedValue(["https://allowed.test"]);
    vi.mocked(window.radar!.getCaptures).mockResolvedValue([
      capture("fetch", "https://allowed.test/api", { method: "POST", type: "Fetch" }),
      capture("document", "https://allowed.test/page", { method: "GET", type: "Document" })
    ]);

    render(<App />);

    expect(await screen.findByTestId("trafficRow-fetch")).toBeInTheDocument();
    expect(screen.getByTestId("trafficRow-document")).toBeInTheDocument();

    fireEvent.change(screen.getByTestId("trafficMethodFilter"), { target: { value: "POST" } });
    expect(screen.getByTestId("trafficRow-fetch")).toBeInTheDocument();
    expect(screen.queryByTestId("trafficRow-document")).not.toBeInTheDocument();

    fireEvent.change(screen.getByTestId("trafficTypeFilter"), { target: { value: "Document" } });
    expect(screen.queryByTestId("trafficRow-fetch")).not.toBeInTheDocument();
    expect(screen.getByText("No captures match filters")).toBeInTheDocument();
  });

  it("multi-selects traffic rows for the ai palette", async () => {
    vi.mocked(window.radar!.getTargets).mockResolvedValue(["https://allowed.test"]);
    vi.mocked(window.radar!.getCaptures).mockResolvedValue([
      capture("one", "https://allowed.test/one", { startedAt: "2026-05-25T00:00:01.000Z" }),
      capture("two", "https://allowed.test/two", { startedAt: "2026-05-25T00:00:02.000Z" }),
      capture("three", "https://allowed.test/three", { startedAt: "2026-05-25T00:00:03.000Z" })
    ]);

    render(<App />);

    const rowOne = await screen.findByTestId("trafficRow-one");
    const rowTwo = screen.getByTestId("trafficRow-two");
    const rowThree = screen.getByTestId("trafficRow-three");

    fireEvent.click(rowOne);
    expect(rowOne).toHaveAttribute("data-selected", "true");
    expect(rowTwo).toHaveAttribute("data-selected", "false");

    fireEvent.click(rowTwo, { metaKey: true });
    expect(rowOne).toHaveAttribute("data-selected", "true");
    expect(rowTwo).toHaveAttribute("data-selected", "true");

    fireEvent.click(rowThree, { shiftKey: true });
    expect(rowOne).toHaveAttribute("data-selected", "true");
    expect(rowTwo).toHaveAttribute("data-selected", "true");
    expect(rowThree).toHaveAttribute("data-selected", "true");
  });

  it("sorts traffic by selected field and direction", async () => {
    vi.mocked(window.radar!.getTargets).mockResolvedValue(["https://*.test"]);
    vi.mocked(window.radar!.getCaptures).mockResolvedValue([
      capture("b", "https://alpha.test/z", {
        startedAt: "2026-05-25T00:00:02.000Z",
        host: "alpha.test",
        path: "/z",
        durationMs: 50
      }),
      capture("a", "https://beta.test/a", {
        startedAt: "2026-05-25T00:00:01.000Z",
        host: "beta.test",
        path: "/a",
        durationMs: 10
      })
    ]);

    render(<App />);

    await screen.findByTestId("trafficRow-b");

    const rowOrder = () =>
      screen.getAllByTestId(/^trafficRow-/).map((row) => row.getAttribute("data-testid")?.replace("trafficRow-", ""));

    expect(rowOrder()).toEqual(["b", "a"]);

    fireEvent.change(screen.getByTestId("trafficSortField"), { target: { value: "host" } });
    expect(rowOrder()).toEqual(["a", "b"]);

    fireEvent.click(screen.getByTestId("trafficSortDirection"));
    expect(rowOrder()).toEqual(["b", "a"]);

    fireEvent.change(screen.getByTestId("trafficSortField"), { target: { value: "duration" } });
    expect(rowOrder()).toEqual(["a", "b"]);
  });

  it("searches traffic across request and response details", async () => {
    vi.mocked(window.radar!.getTargets).mockResolvedValue(["https://allowed.test"]);
    vi.mocked(window.radar!.getCaptures).mockResolvedValue([
      capture("match", "https://allowed.test/api", {
        requestHeaders: { "X-Probe": "request-needle" },
        responseBody: "response-needle"
      }),
      capture("miss", "https://allowed.test/page", { responseBody: "ordinary body" })
    ]);

    render(<App />);

    expect(await screen.findByTestId("trafficRow-match")).toBeInTheDocument();
    expect(screen.getByTestId("trafficRow-miss")).toBeInTheDocument();

    fireEvent.change(screen.getByTestId("trafficSearch"), { target: { value: "response-needle" } });
    expect(screen.getByTestId("trafficRow-match")).toBeInTheDocument();
    expect(screen.queryByTestId("trafficRow-miss")).not.toBeInTheDocument();

    fireEvent.change(screen.getByTestId("trafficSearch"), { target: { value: "request-needle" } });
    expect(screen.getByTestId("trafficRow-match")).toBeInTheDocument();
    expect(screen.queryByTestId("trafficRow-miss")).not.toBeInTheDocument();
  });
});
