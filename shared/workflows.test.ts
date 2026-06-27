import { describe, expect, it } from "vitest";
import type { CapturedRequest, ReplayResult } from "./domain.js";
import {
  BUILT_IN_WORKFLOWS,
  activeBrowserWorkflowResult,
  activeReplayWorkflowResult,
  allWorkflows,
  createWorkflowRevision,
  createWorkflowRunRecord,
  diffWorkflowDefinitions,
  evaluatePassiveWorkflow,
  findingFromWorkflowResult,
  isActiveWorkflowStep,
  normalizeWorkflowDefinition,
  normalizeWorkflowRevision,
  normalizeWorkflowRevisions,
  validateWorkflowDraft,
  normalizeWorkflowInputs,
  normalizeWorkflowRun,
  normalizeWorkflowRuns,
  parseWorkflowDefinition,
  replayDraftFromCapture,
  shouldRunWorkflowStep,
  workflowTemplateById,
  workflowToGraph,
  workflowEvidenceRef
} from "./workflows.js";

const capture: CapturedRequest = {
  id: "cap-1",
  startedAt: "2026-01-01T00:00:00.000Z",
  method: "GET",
  url: "https://example.test/admin",
  host: "example.test",
  path: "/admin",
  requestHeaders: { cookie: "sid=123", authorization: "Bearer secret" },
  requestBody: "",
  status: 200,
  statusText: "OK",
  mimeType: "text/html",
  type: "document",
  responseHeaders: {
    "set-cookie": "sid=123; Path=/",
    "access-control-allow-origin": "*",
    server: "ExampleServer"
  },
  responseBody: "debug mode enabled",
  durationMs: 42,
  allowed: true,
  source: "proxy"
};

function testCapture(overrides: Partial<CapturedRequest> = {}): CapturedRequest {
  return {
    ...capture,
    ...overrides,
    requestHeaders: { ...capture.requestHeaders, ...overrides.requestHeaders },
    responseHeaders: { ...capture.responseHeaders, ...overrides.responseHeaders }
  };
}

describe("workflows", () => {
  it("normalizes declarative JSON and YAML-like workflow definitions", () => {
    const fromJson = parseWorkflowDefinition(
      JSON.stringify({
        id: "custom-headers",
        name: "Custom Headers",
        steps: [{ id: "headers", kind: "security-headers", title: "Headers" }]
      })
    );
    expect(fromJson?.id).toBe("custom-headers");
    expect(fromJson?.mode).toBe("passive");

    const fromYaml = parseWorkflowDefinition(`
id: yaml-cache
name: YAML Cache
mode: passive
scope:
  maxResults: 10
steps:
  - id: cache
    kind: cache-control
    title: Cache Control
`);
    expect(fromYaml?.steps[0]?.kind).toBe("cache-control");
    expect(fromYaml?.scope.maxResults).toBe(10);

    const browserWorkflow = parseWorkflowDefinition(`
id: open-target
name: Open Target
mode: active
scope:
  allowActive: true
  maxRequests: 1
inputs:
  - id: url
    label: URL
    type: text
    required: true
steps:
  - id: open
    kind: browser-open
    title: Open Browser
`);
    expect(browserWorkflow?.steps[0]?.kind).toBe("browser-open");
    expect(browserWorkflow?.scope.allowActive).toBe(true);
  });

  it("rejects malformed workflows and clamps active limits", () => {
    expect(normalizeWorkflowDefinition({ id: "empty", steps: [] })).toBeNull();
    expect(
      normalizeWorkflowDefinition({
        id: "bad-active",
        scope: { allowActive: false },
        steps: [{ id: "replay", kind: "active-replay" }]
      })
    ).toBeNull();
    const active = normalizeWorkflowDefinition({
      id: "active",
      name: "Active",
      mode: "active",
      scope: { maxRequests: 999, timeoutMs: 999999, allowActive: true },
      inputs: [{ id: "capture-id", label: "Capture", type: "capture-id", required: true }],
      steps: [{ id: "replay", kind: "active-replay", title: "Replay" }]
    });
    expect(active?.scope.maxRequests).toBe(12);
    expect(active?.scope.timeoutMs).toBe(30000);
    expect(() => normalizeWorkflowInputs(active!, {})).toThrow(/Capture/);
    expect(normalizeWorkflowInputs(active!, { "capture-id": "cap-1", extra: "value" }).extra).toBe("value");
  });

  it("evaluates built-in passive checks with evidence-backed findings", () => {
    const workflow = BUILT_IN_WORKFLOWS.find((item) => item.id === "builtin-security-headers");
    const results = workflow ? evaluatePassiveWorkflow(workflow, [capture], ["https://example.test"], {}) : [];
    expect(results[0]?.level).toBe("warn");
    expect(results[0]?.evidence[0]?.kind).toBe("capture");
  });

  it("covers passive workflow pass and no-evidence paths", () => {
    const headers = BUILT_IN_WORKFLOWS.find((item) => item.id === "builtin-security-headers")!;
    const passingCapture = testCapture({
      responseHeaders: {
        "strict-transport-security": "max-age=31536000",
        "content-security-policy": "default-src 'self'; frame-ancestors 'none'",
        "x-content-type-options": "nosniff",
        "referrer-policy": "no-referrer"
      },
      responseBody: ""
    });
    expect(evaluatePassiveWorkflow(headers, [passingCapture], ["https://example.test"], {})[0]?.level).toBe("pass");
    expect(evaluatePassiveWorkflow(headers, [], ["https://example.test"], {})[0]?.title).toBe("No matching evidence");
    expect(evaluatePassiveWorkflow(headers, [testCapture({ url: "https://outside.test", host: "outside.test" })], ["https://example.test"], {})[0]?.title).toBe(
      "No matching evidence"
    );
  });

  it("evaluates cookie, cors, cache, and metadata workflow branches", () => {
    const cookies = BUILT_IN_WORKFLOWS.find((item) => item.id === "builtin-cookie-flags")!;
    const corsCache = BUILT_IN_WORKFLOWS.find((item) => item.id === "builtin-cors-cache")!;
    const metadata = BUILT_IN_WORKFLOWS.find((item) => item.id === "builtin-metadata-exposure")!;
    const secureCookie = testCapture({
      responseHeaders: { "set-cookie": "sid=123; Secure; HttpOnly; SameSite=Lax" },
      responseBody: ""
    });
    expect(evaluatePassiveWorkflow(cookies, [secureCookie], ["https://example.test"], {})[0]?.level).toBe("pass");
    expect(evaluatePassiveWorkflow(cookies, [{ ...capture, responseHeaders: {}, responseBody: "" }], ["https://example.test"], {})[0]?.level).toBe("pass");

    const credentialedCors = testCapture({
      responseHeaders: {
        "access-control-allow-origin": "*",
        "access-control-allow-credentials": "true"
      },
      responseBody: ""
    });
    expect(evaluatePassiveWorkflow(corsCache, [credentialedCors], ["https://example.test"], {})[0]?.level).toBe("fail");
    const reflectiveCors = testCapture({
      requestHeaders: { origin: "https://evil.test" },
      responseHeaders: { "access-control-allow-origin": "https://evil.test" },
      responseBody: ""
    });
    expect(evaluatePassiveWorkflow(corsCache, [reflectiveCors], ["https://example.test"], {})[0]?.title).toBe("Reflective CORS without Vary");
    const cachePass = testCapture({
      responseHeaders: { "cache-control": "private, no-store" },
      responseBody: ""
    });
    expect(evaluatePassiveWorkflow(corsCache, [cachePass], ["https://example.test"], {}).some((item) => item.title === "Cache controls acceptable")).toBe(true);

    const metadataResults = evaluatePassiveWorkflow(metadata, [capture], ["https://example.test"], {});
    expect(metadataResults.map((item) => item.level)).toEqual(expect.arrayContaining(["info", "fail"]));
    expect(evaluatePassiveWorkflow(metadata, [{ ...capture, responseHeaders: {}, responseBody: "ok" }], ["https://example.test"], {})[0]?.level).toBe("pass");
  });

  it("honors workflow conditions and result caps", () => {
    const workflow = normalizeWorkflowDefinition({
      id: "conditional",
      name: "Conditional",
      scope: { maxResults: 1 },
      inputs: [{ id: "enabled", label: "Enabled", type: "text", required: false, defaultValue: "no" }],
      steps: [
        { id: "skip", kind: "security-headers", condition: { inputId: "enabled", equals: "yes" } },
        { id: "metadata", kind: "metadata-exposure" }
      ]
    })!;
    expect(shouldRunWorkflowStep(workflow.steps[0], { enabled: "no" })).toBe(false);
    expect(isActiveWorkflowStep(workflow.steps[0])).toBe(false);
    expect(evaluatePassiveWorkflow(workflow, [capture, capture], ["https://example.test"], { enabled: "yes" })).toHaveLength(1);
  });

  it("builds authoring graph, templates, dry-run issues, and revisions", () => {
    const template = workflowTemplateById("cache-control");
    expect(template?.step.kind).toBe("cache-control");

    const workflow = normalizeWorkflowDefinition({
      id: "authoring",
      name: "Authoring",
      inputs: [{ id: "enabled", label: "Enabled", type: "text", defaultValue: "no" }],
      steps: [
        { id: "headers", kind: "security-headers", title: "Headers" },
        { id: "cache", kind: "cache-control", title: "Cache", condition: { inputId: "enabled", equals: "yes" } }
      ]
    })!;
    const graph = workflowToGraph(workflow);
    expect(graph.nodes).toHaveLength(2);
    expect(graph.edges[0]).toMatchObject({ from: "headers", to: "cache" });

    const dryRun = validateWorkflowDraft(workflow, { enabled: "no" });
    expect(dryRun.ok).toBe(true);
    expect(dryRun.skippedStepIds).toEqual(["cache"]);

    const changed = normalizeWorkflowDefinition({
      ...workflow,
      name: "Authoring Updated",
      steps: [...workflow.steps, { id: "metadata", kind: "metadata-exposure", title: "Metadata" }]
    })!;
    expect(diffWorkflowDefinitions(workflow, changed).map((entry) => entry.field)).toContain("name");
    const revision = createWorkflowRevision(changed, workflow, "2026-05-25T12:00:00.000Z");
    expect(revision.diff.some((entry) => entry.field === "steps.metadata")).toBe(true);

    expect(validateWorkflowDraft("{").ok).toBe(false);
    const duplicate = validateWorkflowDraft({
      ...workflow,
      steps: [
        { id: "headers", kind: "security-headers", title: "Headers" },
        { id: "headers", kind: "cache-control", title: "Cache" }
      ]
    });
    expect(duplicate.issues.some((issue) => issue.message.includes("Duplicate"))).toBe(true);

    expect(normalizeWorkflowRevision({ workflow: null })).toBeNull();
    const normalizedRevision = normalizeWorkflowRevision({
      workflow,
      diff: [
        { kind: "removed", field: "steps.old", before: "Old step" },
        { kind: "unknown", field: "" }
      ]
    });
    expect(normalizedRevision?.diff).toEqual([{ kind: "removed", field: "steps.old", before: "Old step" }]);
    expect(normalizeWorkflowRevisions({})).toEqual([]);
  });

  it("strips credentials for active replay and classifies replay outcomes", () => {
    const workflow = BUILT_IN_WORKFLOWS.find((item) => item.id === "builtin-auth-state-check");
    const step = workflow!.steps[0];
    const draft = replayDraftFromCapture(capture, true);
    expect(draft.headers.cookie).toBeUndefined();
    expect(draft.headers.authorization).toBeUndefined();

    const replay: ReplayResult = {
      ok: true,
      status: 200,
      statusText: "OK",
      durationMs: 20,
      headers: {},
      body: "",
      bytes: 0
    };
    const result = activeReplayWorkflowResult({ step, capture, replay });
    expect(result.level).toBe("fail");
    expect(activeReplayWorkflowResult({ step, capture, replay: { ...replay, status: 403, ok: false } }).level).toBe("pass");
    expect(activeReplayWorkflowResult({ step, capture: testCapture({ status: 404 }), replay: { ...replay, status: 500, ok: false } }).level).toBe("info");
    expect(replayDraftFromCapture(capture, false).headers.cookie).toBe("sid=123");
    expect(activeBrowserWorkflowResult({ step: { id: "open", title: "Open", kind: "browser-open", config: {} }, url: "https://example.test" }).title).toBe(
      "Browser navigation opened"
    );
  });

  it("promotes warning workflow results into draft findings", () => {
    const workflow = BUILT_IN_WORKFLOWS[0];
    const result = evaluatePassiveWorkflow(workflow, [capture], ["https://example.test"], {})[0];
    const finding = findingFromWorkflowResult(
      {
        id: "run-1",
        workflowId: workflow.id,
        workflowName: workflow.name,
        sessionId: "session-1",
        source: "manual",
        mode: "passive",
        status: "completed",
        inputs: {},
        startedAt: "2026-01-01T00:00:00.000Z",
        completedAt: "2026-01-01T00:00:01.000Z",
        stepCount: 1,
        actionCount: 0,
        results: [result]
      },
      result
    );
    expect(finding?.source).toBe("workflow");
    expect(finding?.evidence[0]?.kind).toBe("workflow");
    expect(findingFromWorkflowResult({ ...workflowRunForTest(workflow, result), results: [activeBrowserWorkflowResult({ step: workflow.steps[0], url: "https://example.test" })] }, activeBrowserWorkflowResult({ step: workflow.steps[0], url: "https://example.test" }))).toBeNull();
  });

  it("normalizes workflow runs and evidence refs", () => {
    const workflow = BUILT_IN_WORKFLOWS[0];
    const run = createWorkflowRunRecord({
      definition: workflow,
      sessionId: "session-1",
      source: "ai",
      status: "failed",
      inputs: { " capture id ": "cap-1" },
      error: "boom"
    });
    expect(run.completedAt).toBeTruthy();
    expect(run.source).toBe("ai");
    expect(
      workflowEvidenceRef(run, {
        id: "result-1",
        stepId: "headers",
        stepTitle: "Headers",
        level: "warn",
        title: "Warn",
        message: "",
        evidence: [],
        details: {},
        createdAt: run.startedAt
      }).kind
    ).toBe("workflow");
    expect(normalizeWorkflowRun(null)).toBeNull();
    expect(normalizeWorkflowRun({ workflowId: "", sessionId: "" })).toBeNull();
    expect(
      normalizeWorkflowRun({
        id: "run-1",
        workflowId: "workflow-1",
        workflowName: "Workflow",
        sessionId: "session-1",
        results: [{ title: "" }, { id: "result-1", stepId: "step-1", title: "Result", level: "bad", details: { a: 1 } }]
      })?.results[0]?.level
    ).toBe("info");
    expect(normalizeWorkflowRuns([null, { workflowId: "workflow-1", sessionId: "session-1", results: [] }])).toHaveLength(1);
    expect(allWorkflows([{ ...workflow, id: "saved", builtIn: false }]).some((item) => item.id === "saved")).toBe(true);
  });
});

function workflowRunForTest(workflow: (typeof BUILT_IN_WORKFLOWS)[number], result: ReturnType<typeof evaluatePassiveWorkflow>[number]) {
  return {
    id: "run-1",
    workflowId: workflow.id,
    workflowName: workflow.name,
    sessionId: "session-1",
    source: "manual" as const,
    mode: "passive" as const,
    status: "completed" as const,
    inputs: {},
    startedAt: "2026-01-01T00:00:00.000Z",
    completedAt: "2026-01-01T00:00:01.000Z",
    stepCount: 1,
    actionCount: 0,
    results: [result]
  };
}
