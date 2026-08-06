import { describe, expect, it } from "vitest";
import { searchGlobal, parseGlobalSearchQuery } from "./globalSearch.js";
import type { AdvancedTestingSummary } from "./advancedTesting.js";
import type {
  CapturedRequest,
  Finding,
  InstalledPlugin,
  ReplayTabState,
  WebSocketEvent,
  WorkflowDefinition
} from "./domain.js";

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
    mimeType: "application/json",
    type: "fetch",
    responseHeaders: {},
    responseBody: "",
    durationMs: 12,
    allowed: true,
    source: "browser",
    ...overrides
  };
};

const frame = (id: string, url: string, payloadData = "pong"): WebSocketEvent => {
  const parsed = new URL(url);
  return {
    id,
    requestId: `request-${id}`,
    createdAt: "2026-05-25T00:01:00.000Z",
    url,
    host: parsed.host,
    direction: "received",
    payloadData,
    size: payloadData.length,
    allowed: true
  };
};

const finding = (id: string): Finding => ({
  id,
  title: "Missing security headers",
  severity: "low",
  confidence: "high",
  status: "draft",
  component: "",
  affectedAssets: ["https://app.test"],
  evidence: [
    {
      id: "cap-1",
      kind: "capture",
      label: "GET https://app.test/api/session",
      createdAt: "2026-05-25T00:00:00.000Z",
      metadata: { host: "app.test" }
    }
  ],
  reproductionSteps: "Open the captured API response.",
  impact: "Browser hardening is incomplete.",
  remediation: "Set CSP and frame protections.",
  notes: "CSP is missing frame-ancestors.",
  owner: "",
  assignee: "",
  retestResult: "",
  source: "manual",
  createdAt: "2026-05-25T00:02:00.000Z",
  updatedAt: "2026-05-25T00:02:00.000Z"
});

const workflow: WorkflowDefinition = {
  id: "headers",
  name: "Security headers",
  description: "Review browser hardening headers.",
  mode: "passive",
  builtIn: false,
  inputs: [],
  scope: {
    requireInScope: true,
    allowActive: false,
    maxRequests: 0,
    timeoutMs: 1000,
    delayMs: 0,
    maxResults: 10
  },
  steps: [{ id: "step-1", title: "Headers", kind: "security-headers", config: {} }],
  createdAt: "2026-05-25T00:00:00.000Z",
  updatedAt: "2026-05-25T00:00:00.000Z"
};

const replayState: ReplayTabState = {
  activeTabId: "tab-1",
  tabs: [
    {
      id: "tab-1",
      name: "Session endpoint",
      pinned: true,
      draft: { method: "POST", url: "https://app.test/api/session", headers: { Accept: "application/json" }, body: "" },
      history: [
        {
          id: "history-1",
          sentAt: "2026-05-25T00:03:00.000Z",
          draft: { method: "POST", url: "https://app.test/api/session", headers: {}, body: "" },
          result: { ok: true, status: 403, statusText: "Forbidden", durationMs: 14, headers: {}, body: "denied", bytes: 6 }
        }
      ],
      environmentId: "",
      createdAt: "2026-05-25T00:00:00.000Z",
      updatedAt: "2026-05-25T00:03:00.000Z"
    }
  ]
};

const plugin: InstalledPlugin = {
  id: "jwt-helper",
  manifest: {
    schemaVersion: 1,
    id: "jwt-helper",
    name: "JWT Helper",
    version: "1.0.0",
    description: "Decode JSON Web Tokens in selected requests.",
    author: "Radar",
    sdkVersion: "1.0.0",
    minRadarVersion: "0.8.0",
    entry: "index.js",
    permissions: ["captures:read"],
    panels: [{ id: "main", title: "JWT Tools", entry: "panel.js" }]
  },
  sourcePath: "/tmp/plugin",
  grantedPermissions: ["captures:read"],
  status: "approved",
  trustLevel: "first-party",
  compatibilityWarnings: [],
  warnings: [],
  installedAt: "2026-05-25T00:00:00.000Z",
  updatedAt: "2026-05-25T00:00:00.000Z"
};

describe("global search", () => {
  it("parses text and supported filters", () => {
    expect(parseGlobalSearchQuery('kind:capture,websocket host:app.test "set-cookie"')).toEqual({
      ok: true,
      query: {
        terms: ["set-cookie"],
        filters: { kind: ["capture", "websocket"], host: ["app.test"] }
      }
    });
    expect(parseGlobalSearchQuery("unknown:value")).toEqual({
      ok: false,
      error: 'Unknown global search filter "unknown".'
    });
  });

  it("searches mixed project artifacts and opens targeted views", () => {
    const result = searchGlobal(
      {
        allowlist: ["https://app.test"],
        captures: [
          capture("cap-1", "https://app.test/api/session", {
            responseHeaders: { "set-cookie": "sid=1; HttpOnly" },
            responseBody: "session ok"
          }),
          capture("cap-out", "https://outside.test/api", { allowed: true })
        ],
        webSocketEvents: [frame("ws-1", "wss://app.test/socket", "session:update")],
        evidenceAnnotations: [{ evidenceId: "cap-1", kind: "capture", tags: ["auth"], comment: "login session", updatedAt: "" }],
        replayTabState: replayState,
        findings: [finding("finding-1")],
        workflows: [workflow],
        plugins: [plugin],
        savedFilters: [{ id: "filter-1", name: "Denied sessions", query: "status:403 path:/api", surface: "traffic", createdAt: "", updatedAt: "" }],
        projectNotes: [
          {
            id: "note-1",
            title: "Session credentials",
            body: "Operator note for login triage.",
            createdAt: "2026-05-25T00:00:00.000Z",
            updatedAt: "2026-05-25T00:00:00.000Z"
          }
        ],
        savedViews: [
          {
            id: "view-1",
            name: "Session triage",
            view: "traffic",
            description: "Jump back to the session filter.",
            state: { trafficQuery: "path:/api/session", selectedCaptureId: "cap-1" },
            createdAt: "2026-05-25T00:00:00.000Z",
            updatedAt: "2026-05-25T00:00:00.000Z"
          }
        ]
      },
      { query: "session", limit: 20 }
    );

    expect(result.ok).toBe(true);
    expect(result.results.map((item) => item.kind)).toEqual(
      expect.arrayContaining(["capture", "websocket", "replay", "finding", "saved-filter", "note", "saved-view"])
    );
    expect(result.results.find((item) => item.refId === "cap-out")).toBeUndefined();
    expect(result.results.find((item) => item.kind === "capture")?.target).toEqual({ view: "traffic", id: "cap-1" });
    expect(result.results.find((item) => item.kind === "note")?.target).toEqual({ view: "notes", id: "note-1" });
    expect(result.results.find((item) => item.kind === "saved-view")?.source).toBe("traffic");
  });

  it("filters by kind, host, status, severity, and source", () => {
    expect(
      searchGlobal({ allowlist: ["https://app.test"], captures: [capture("cap-1", "https://app.test/admin", { status: 403 })] }, {
        query: "kind:capture host:app.test status:403 source:browser",
        limit: 10
      }).results
    ).toHaveLength(1);

    expect(
      searchGlobal({ findings: [finding("finding-1")] }, { query: "kind:finding severity:low status:draft headers", limit: 10 })
        .results[0]?.target.view
    ).toBe("findings");
  });

  it("indexes advanced signals, plugin metadata, and replay collection items", () => {
    const advancedSummary: AdvancedTestingSummary = {
      graphql: {
        operations: [
          {
            id: "gql-1",
            operationName: "UpdateProfile",
            operationType: "mutation",
            transport: "http",
            host: "app.test",
            path: "/graphql",
            variables: ["id"],
            batched: false,
            introspection: false,
            evidence: {
              id: "cap-1",
              kind: "capture",
              label: "POST /graphql",
              url: "https://app.test/graphql",
              host: "app.test",
              createdAt: "2026-05-25T00:00:00.000Z"
            }
          }
        ],
        groups: [
          {
            id: "graphql-app-test-graphql-mutation",
            host: "app.test",
            path: "/graphql",
            operationType: "mutation",
            operationNames: ["UpdateProfile"],
            count: 1,
            variableNames: ["id"],
            introspectionCount: 0,
            batchedCount: 0
          }
        ],
        variableTemplates: [
          {
            id: "variables-gql-1",
            operationId: "gql-1",
            operationName: "UpdateProfile",
            variablesJson: JSON.stringify({ id: "{{id}}" }, null, 2)
          }
        ],
        hosts: ["app.test"],
        operationCount: 1,
        queryCount: 0,
        mutationCount: 1,
        subscriptionCount: 0,
        batchedCount: 0,
        introspectionCount: 0
      },
      apiImport: { ok: true, sourceType: "openapi", error: "", drafts: [], replayTemplates: [], sitemapSeeds: [] },
      authMatrix: [
        {
          id: "auth-1",
          method: "GET",
          host: "app.test",
          path: "/admin",
          statuses: { anonymous: "403", cookie: "200" },
          evidenceIds: ["cap-2"],
          verdict: "protected"
        }
      ],
      authComparisons: [
        {
          id: "auth-1-anonymous-cookie",
          method: "GET",
          host: "app.test",
          path: "/admin",
          leftState: "anonymous",
          rightState: "cookie",
          leftStatus: "403",
          rightStatus: "200",
          verdict: "auth-gain",
          evidenceIds: ["cap-2"]
        }
      ],
      parameters: [
        {
          id: "param-1",
          name: "accountId",
          location: "query",
          count: 2,
          hosts: ["app.test"],
          endpoints: ["/api/accounts"],
          examples: [
            {
              id: "cap-3",
              kind: "capture",
              label: "GET /api/accounts",
              url: "https://app.test/api/accounts",
              host: "app.test",
              createdAt: "2026-05-25T00:00:00.000Z"
            }
          ]
        }
      ],
      secretRules: [
        {
          id: "jwt",
          name: "JWT",
          severity: "medium",
          pattern: "jwt",
          enabled: true
        }
      ],
      secrets: [
        {
          id: "secret-1",
          severity: "high",
          pattern: "JWT",
          location: "response-body",
          preview: "eyJ...",
          evidence: {
            id: "cap-4",
            kind: "capture",
            label: "GET /token",
            url: "https://app.test/token",
            host: "app.test",
            createdAt: "2026-05-25T00:00:00.000Z"
          }
        }
      ],
      headerSignals: [
        {
          id: "header-1",
          severity: "medium",
          kind: "cache-poisoning",
          title: "Host header reflected",
          message: "Response reflects host input.",
          evidence: {
            id: "cap-5",
            kind: "capture",
            label: "GET /redirect",
            url: "https://app.test/redirect",
            host: "app.test",
            createdAt: "2026-05-25T00:00:00.000Z"
          },
          details: { header: "Host" }
        }
      ],
      proxyGuidance: [
        {
          id: "cli",
          title: "CLI And API Tooling",
          summary: "Route curl through Radar.",
          checklist: ["Set HTTPS_PROXY"]
        }
      ]
    };

    const result = searchGlobal(
      {
        advancedSummary,
        plugins: [plugin],
        replayCollections: [
          {
            id: "collection-1",
            name: "Admin requests",
            items: [
              {
                id: "item-1",
                name: "Admin cache probe",
                draft: { method: "GET", url: "https://app.test/admin", headers: {}, body: "" },
                tags: ["cache"],
                createdAt: "2026-05-25T00:00:00.000Z",
                updatedAt: "2026-05-25T00:00:00.000Z"
              }
            ],
            createdAt: "2026-05-25T00:00:00.000Z",
            updatedAt: "2026-05-25T00:00:00.000Z"
          }
        ]
      },
      { query: "kind:advanced source:cache-poisoning host:app.test", limit: 10 }
    );

    expect(result.results[0]?.title).toBe("Host header reflected");
    expect(searchGlobal({ advancedSummary }, { query: "UpdateProfile", limit: 10 }).results[0]?.source).toBe("graphql");
    expect(searchGlobal({ advancedSummary }, { query: "accountId", limit: 10 }).results[0]?.source).toBe("parameters");
    expect(searchGlobal({ advancedSummary }, { query: "JWT severity:high", limit: 10 }).results[0]?.source).toBe("secret");
    expect(searchGlobal({ advancedSummary }, { query: "HTTPS_PROXY", limit: 10 }).results[0]?.source).toBe("proxy-guidance");
    expect(searchGlobal({ plugins: [plugin] }, { query: "JWT Tools", limit: 10 }).results[0]?.target.view).toBe("plugins");
    expect(searchGlobal({ replayCollections: [] }, { query: "Admin cache", limit: 1 }).results).toEqual([]);
    expect(
      searchGlobal(
        {
          replayCollections: [
            {
              id: "collection-1",
              name: "Admin requests",
              items: [
                {
                  id: "item-1",
                  name: "Admin cache probe",
                  draft: { method: "GET", url: "https://app.test/admin", headers: {}, body: "" },
                  tags: ["cache"],
                  createdAt: "2026-05-25T00:00:00.000Z",
                  updatedAt: "2026-05-25T00:00:00.000Z"
                }
              ],
              createdAt: "2026-05-25T00:00:00.000Z",
              updatedAt: "2026-05-25T00:00:00.000Z"
            }
          ]
        },
        { query: "Admin cache", limit: 1 }
      ).results[0]?.source
    ).toBe("collection");
  });

  it("keeps tied replay drafts in deterministic source order", () => {
    const timestamp = "2026-05-25T00:00:00.000Z";
    const result = searchGlobal(
      {
        replayTabState: {
          activeTabId: "tab-1",
          tabs: [
            {
              id: "tab-1",
              name: "Pinned draft",
              pinned: true,
              draft: { method: "GET", url: "https://app.test/pinned", headers: {}, body: "" },
              history: [],
              environmentId: "",
              createdAt: timestamp,
              updatedAt: timestamp
            }
          ]
        },
        replayCollections: [
          {
            id: "collection-1",
            name: "Review set",
            items: [
              {
                id: "item-1",
                name: "Collection draft",
                draft: { method: "GET", url: "https://app.test/collection", headers: {}, body: "" },
                tags: [],
                createdAt: timestamp,
                updatedAt: timestamp
              }
            ],
            createdAt: timestamp,
            updatedAt: timestamp
          }
        ]
      },
      { query: "kind:replay", limit: 10 }
    );

    expect(result.results.map((item) => item.title)).toEqual(["Pinned draft", "Review set / Collection draft"]);
  });

  it("reports invalid filters and paginates safe defaults", () => {
    expect(parseGlobalSearchQuery('"unterminated')).toEqual({ ok: false, error: "Unclosed quoted search term." });
    expect(searchGlobal({}, { query: "kind:not-real", limit: 10 })).toMatchObject({
      ok: false,
      error: 'Unknown global search kind "not-real".'
    });
    expect(searchGlobal({}, { query: "host:", limit: 10 })).toMatchObject({
      ok: false,
      error: 'Global search filter "host" needs a value.'
    });

    const result = searchGlobal(
      {
        allowlist: ["https://app.test"],
        captures: [
          capture("cap-1", "https://app.test/one"),
          capture("cap-2", "https://app.test/two"),
          capture("cap-3", "https://app.test/three")
        ]
      },
      { query: "kind:capture", limit: 2, offset: 1 }
    );
    expect(result.results).toHaveLength(2);
    expect(result.total).toBe(3);
  });

  it("indexes workflow runs with result and error text", () => {
    const resultRun = {
      id: "run-1",
      workflowId: "headers",
      workflowName: "Security headers",
      sessionId: "session-1",
      source: "manual" as const,
      mode: "passive" as const,
      status: "completed" as const,
      inputs: { target: "https://app.test" },
      startedAt: "2026-05-25T00:00:00.000Z",
      completedAt: "2026-05-25T00:00:02.000Z",
      stepCount: 1,
      actionCount: 0,
      results: [
        {
          id: "result-1",
          stepId: "step-1",
          stepTitle: "Headers",
          level: "warn" as const,
          title: "Missing CSP",
          message: "Content-Security-Policy is missing.",
          evidence: [],
          details: {},
          createdAt: "2026-05-25T00:00:01.000Z"
        }
      ]
    };
    const errorRun = {
      ...resultRun,
      id: "run-2",
      status: "failed" as const,
      completedAt: undefined,
      results: [],
      error: "Workflow timed out"
    };

    const result = searchGlobal(
      { workflowRuns: [resultRun, errorRun] },
      { query: "kind:workflow-run source:manual CSP", limit: 10 }
    );
    expect(result.results[0]?.target).toEqual({ view: "workflows", id: "headers", secondaryId: "run-1" });
    expect(searchGlobal({ workflowRuns: [errorRun] }, { query: "timed out", limit: 10 }).results[0]?.status).toBe("failed");
  });
});
