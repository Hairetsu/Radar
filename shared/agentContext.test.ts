import { describe, expect, it } from "vitest";
import { buildAgentContextSummary } from "./agentContext.js";
import type { CapturedRequest, Finding, ProjectNote, SavedView, WorkflowDefinition, WorkflowRun } from "./domain.js";

function capture(id: string, url: string): CapturedRequest {
  const parsed = new URL(url);
  return {
    id,
    startedAt: "2026-05-25T00:00:00.000Z",
    method: "GET",
    url,
    host: parsed.host,
    path: parsed.pathname,
    requestHeaders: { authorization: "Bearer secret" },
    requestBody: "secret",
    status: 200,
    statusText: "OK",
    mimeType: "text/html",
    type: "Document",
    responseHeaders: { "content-type": "text/html" },
    responseBody: "<html>secret</html>",
    durationMs: 12,
    allowed: true,
    source: "browser"
  };
}

const finding: Finding = {
  id: "finding-1",
  title: "Missing CSP",
  severity: "low",
  confidence: "medium",
  status: "draft",
  affectedAssets: ["https://allowed.test"],
  evidence: [{ id: "home", kind: "capture", label: "Home", createdAt: "2026-05-25T00:00:00.000Z", metadata: {} }],
  reproductionSteps: "Inspect capture.",
  impact: "Browser hardening gap.",
  remediation: "Add CSP.",
  notes: "",
  owner: "",
  retestResult: "",
  source: "manual",
  createdAt: "2026-05-25T00:00:00.000Z",
  updatedAt: "2026-05-25T00:00:00.000Z"
};

const workflow: WorkflowDefinition = {
  id: "workflow-1",
  name: "Headers",
  description: "Check headers.",
  mode: "passive",
  builtIn: false,
  inputs: [],
  scope: { requireInScope: true, allowActive: false, maxRequests: 0, timeoutMs: 5000, delayMs: 0, maxResults: 20 },
  steps: [{ id: "step-1", title: "Headers", kind: "security-headers", config: {} }],
  createdAt: "2026-05-25T00:00:00.000Z",
  updatedAt: "2026-05-25T00:00:00.000Z"
};

const workflowRun: WorkflowRun = {
  id: "run-1",
  workflowId: "workflow-1",
  workflowName: "Headers",
  sessionId: "session-1",
  source: "manual",
  mode: "passive",
  status: "completed",
  inputs: {},
  startedAt: "2026-05-25T00:00:00.000Z",
  completedAt: "2026-05-25T00:00:01.000Z",
  stepCount: 1,
  actionCount: 0,
  results: []
};

describe("agentContext", () => {
  it("builds redacted scoped summaries for AI-First", () => {
    const notes: ProjectNote[] = [
      { id: "note-1", title: "Client context", body: "Sensitive raw note body", createdAt: "2026-05-25T00:00:00.000Z", updatedAt: "2026-05-25T00:00:00.000Z" }
    ];
    const savedViews: SavedView[] = [
      { id: "view-1", name: "Header failures", view: "traffic", description: "", state: {}, createdAt: "2026-05-25T00:00:00.000Z", updatedAt: "2026-05-25T00:00:00.000Z" }
    ];
    const summary = buildAgentContextSummary({
      captures: [capture("home", "https://allowed.test/"), capture("other", "https://blocked.test/")],
      frames: [],
      findings: [finding],
      workflows: [workflow],
      workflowRuns: [workflowRun],
      projectNotes: notes,
      savedViews,
      runMemory: [
        {
          id: "memory-1",
          createdAt: "2026-05-25T00:00:00.000Z",
          updatedAt: "2026-05-25T00:00:00.000Z",
          kind: "hypothesis",
          status: "confirmed",
          title: "Check redirects",
          notes: "Only title should be summarized.",
          evidenceRefs: ["capture:home"]
        }
      ],
      allowlist: ["https://allowed.test"],
      generatedAt: "2026-05-25T00:00:00.000Z"
    });

    expect(summary.sitemap.hostCount).toBe(1);
    expect(summary.sitemap.topHosts[0]?.host).toBe("allowed.test");
    expect(summary.findings[0]?.evidenceRefs).toEqual(["capture:home"]);
    expect(summary.workflows.definitions[0]).toEqual(
      expect.objectContaining({ id: "workflow-1", stepCount: 1, maxRequests: 0 })
    );
    expect(summary.projectArtifacts.notes).toEqual([
      { id: "note-1", title: "Client context", updatedAt: "2026-05-25T00:00:00.000Z" }
    ]);
    expect(summary.projectArtifacts.savedViews[0]?.view).toBe("traffic");
    expect(JSON.stringify(summary)).not.toContain("Sensitive raw note body");
  });
});
