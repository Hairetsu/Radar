import { describe, expect, it } from "vitest";
import type { CapturedRequest, WebSocketEvent } from "./domain.js";
import {
  analyzeGraphQl,
  analyzeHeaderBehavior,
  buildAdvancedTestingSummary,
  buildAuthMatrix,
  compareAuthMatrixRows,
  DEFAULT_SENSITIVE_DATA_RULES,
  detectSensitiveData,
  discoverParameters,
  parseApiImport,
  workflowDraftFromApiImport,
  workflowDraftFromAuthMatrixRow,
  workflowDraftFromGraphQlOperation,
  workflowDraftFromHeaderSignal,
  workflowDraftFromParameter,
  workflowDraftFromSecret
} from "./advancedTesting.js";

function capture(patch: Partial<CapturedRequest>): CapturedRequest {
  return {
    id: patch.id || "cap-1",
    startedAt: patch.startedAt || "2026-01-01T00:00:00.000Z",
    method: patch.method || "GET",
    url: patch.url || "https://api.example.test/v1/users?id=1",
    host: patch.host || "api.example.test",
    path: patch.path || "/v1/users",
    requestHeaders: patch.requestHeaders || {},
    requestBody: patch.requestBody || "",
    status: patch.status === undefined ? 200 : patch.status,
    statusText: patch.statusText || "OK",
    mimeType: patch.mimeType || "application/json",
    type: patch.type || "fetch",
    responseHeaders: patch.responseHeaders || {},
    responseBody: patch.responseBody || "",
    durationMs: patch.durationMs === undefined ? 42 : patch.durationMs,
    allowed: patch.allowed === undefined ? true : patch.allowed,
    source: patch.source || "browser"
  };
}

function frame(patch: Partial<WebSocketEvent>): WebSocketEvent {
  return {
    id: patch.id || "ws-1",
    requestId: patch.requestId || "socket-1",
    createdAt: patch.createdAt || "2026-01-01T00:00:00.000Z",
    url: patch.url || "wss://api.example.test/graphql",
    host: patch.host || "api.example.test",
    direction: patch.direction || "sent",
    payloadData: patch.payloadData || "",
    size: patch.size || 0,
    allowed: patch.allowed === undefined ? true : patch.allowed
  };
}

describe("advanced testing analyzers", () => {
  it("extracts GraphQL operations from HTTP and WebSocket evidence", () => {
    const graphql = analyzeGraphQl(
      [
        capture({
          id: "cap-graphql",
          method: "POST",
          url: "https://api.example.test/graphql",
          path: "/graphql",
          requestHeaders: { "Content-Type": "application/json" },
          requestBody: JSON.stringify({
            operationName: "ListUsers",
            query: "query ListUsers($role: String) { users(role: $role) { id } }",
            variables: { role: "admin" }
          })
        })
      ],
      [
        frame({
          id: "ws-graphql",
          payloadData: JSON.stringify({
            payload: {
              query: "subscription WatchUsers { users { id } }",
              variables: {}
            }
          })
        })
      ]
    );

    expect(graphql.operationCount).toBe(2);
    expect(graphql.queryCount).toBe(1);
    expect(graphql.subscriptionCount).toBe(1);
    expect(graphql.operations[0].variables).toEqual(["role"]);
    expect(graphql.groups.map((group) => group.operationType)).toEqual(expect.arrayContaining(["query", "subscription"]));
    expect(graphql.variableTemplates[0]).toEqual(
      expect.objectContaining({
        operationName: "ListUsers",
        variablesJson: JSON.stringify({ role: "{{role}}" }, null, 2)
      })
    );
  });

  it("handles batched introspection and unnamed GraphQL operations", () => {
    const graphql = analyzeGraphQl([
      capture({
        id: "cap-batch",
        method: "POST",
        url: "https://api.example.test/graphql",
        requestBody: JSON.stringify([
          { query: "{ __schema { types { name } }" },
          { query: "mutation { updateUser(id: 1) { id } }", variables: { id: 1 } },
          { notQuery: true }
        ]),
        responseBody: "{\"data\":{\"__schema\":{}}}"
      }),
      capture({
        id: "not-graphql",
        url: "https://api.example.test/rest",
        requestBody: "not json"
      })
    ]);

    expect(graphql.operationCount).toBe(2);
    expect(graphql.mutationCount).toBe(1);
    expect(graphql.batchedCount).toBe(2);
    expect(graphql.introspectionCount).toBe(2);
    expect(graphql.operations[0].operationName).toBe("operation-1");
  });

  it("previews OpenAPI and Postman imports without sending traffic", () => {
    const openApi = parseApiImport(
      JSON.stringify({
        openapi: "3.0.0",
        info: { title: "Example API" },
        servers: [{ url: "https://api.example.test" }],
        paths: {
          "/users/{id}": {
            get: { operationId: "getUser", tags: ["users"] },
            post: {
              operationId: "updateUser",
              requestBody: { content: { "application/json": {} } }
            }
          }
        }
      })
    );

    expect(openApi.ok).toBe(true);
    expect(openApi.sourceType).toBe("openapi");
    expect(openApi.replayTemplates).toHaveLength(2);
    expect(openApi.sitemapSeeds).toContain("GET /users/{id}");

    const postman = parseApiImport(
      JSON.stringify({
        info: { name: "Collection", schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json" },
        item: [
          {
            name: "Create user",
            request: {
              method: "POST",
              url: "https://api.example.test/users",
              header: [{ key: "Content-Type", value: "application/json" }],
              body: { raw: "{\"name\":\"test\"}" }
            }
          }
        ]
      })
    );

    expect(postman.ok).toBe(true);
    expect(postman.sourceType).toBe("postman");
    expect(postman.drafts[0].method).toBe("POST");
    expect(parseApiImport("{").ok).toBe(false);
  });

  it("handles import edge cases without creating traffic", () => {
    const swagger = parseApiImport(
      JSON.stringify({
        swagger: "2.0",
        host: "legacy.example.test",
        basePath: "/api",
        schemes: ["http"],
        paths: {
          "/status": {
            parameters: [],
            get: { operationId: "status" }
          }
        }
      })
    );
    expect(swagger.ok).toBe(true);
    expect(swagger.drafts[0].url).toBe("http://legacy.example.test/api/status");

    const fallback = parseApiImport(
      JSON.stringify({
        openapi: "3.0.0",
        paths: {
          "/relative": {
            get: {}
          }
        }
      }),
      "https://fallback.example.test"
    );
    expect(fallback.drafts[0].url).toBe("https://fallback.example.test/relative");

    const postmanObjectUrl = parseApiImport(
      JSON.stringify({
        info: { name: "Nested" },
        item: [
          {
            name: "Folder",
            item: [
              {
                name: "By id",
                request: {
                  method: "GET",
                  url: { protocol: "https", host: ["api", "example", "test"], path: ["users", "{{id}}"] },
                  header: [{ key: "", value: "" }]
                }
              }
            ]
          }
        ]
      })
    );
    expect(postmanObjectUrl.ok).toBe(true);
    expect(postmanObjectUrl.drafts[0].path).toBe("/users/%7B%7Bid%7D%7D");
    expect(postmanObjectUrl.drafts[0].tags).toEqual(["By id", "Folder"]);
    expect(parseApiImport(JSON.stringify({ item: [] })).error).toBe("No request operations were found in the import document.");
    expect(parseApiImport(JSON.stringify({ hello: "world" })).ok).toBe(false);
  });

  it("builds auth matrix rows across anonymous and authenticated evidence", () => {
    const rows = buildAuthMatrix([
      capture({ id: "anon", method: "GET", status: 403, requestHeaders: {} }),
      capture({ id: "auth", method: "GET", status: 200, requestHeaders: { Authorization: "Bearer token" } })
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0].verdict).toBe("protected");
    expect(rows[0].statuses.anonymous).toBe("403");
    expect(rows[0].statuses.bearer).toBe("200");
    expect(compareAuthMatrixRows(rows)[0]).toEqual(
      expect.objectContaining({
        leftState: "anonymous",
        rightState: "bearer",
        verdict: "auth-gain"
      })
    );
  });

  it("classifies public, observed, mixed, and ambiguous auth matrix rows", () => {
    const rows = buildAuthMatrix([
      capture({ id: "public-anon", method: "GET", url: "https://api.example.test/public", path: "/public", status: 200 }),
      capture({
        id: "public-cookie",
        method: "GET",
        url: "https://api.example.test/public",
        path: "/public",
        status: 200,
        requestHeaders: { Cookie: "sid=1" }
      }),
      capture({
        id: "mixed-only",
        method: "GET",
        url: "https://api.example.test/profile/123",
        path: "/profile/123",
        status: null,
        requestHeaders: { Authorization: "Token abc" }
      }),
      capture({
        id: "amb-anon",
        method: "GET",
        url: "https://api.example.test/echo",
        path: "/echo",
        status: 500
      }),
      capture({
        id: "amb-basic",
        method: "GET",
        url: "https://api.example.test/echo",
        path: "/echo",
        status: 500,
        requestHeaders: { Authorization: "Basic abc" }
      }),
      capture({
        id: "mixed-bucket",
        method: "GET",
        url: "https://api.example.test/mixed",
        path: "/mixed",
        status: 200,
        requestHeaders: { Authorization: "Bearer abc", Cookie: "sid=1" }
      })
    ]);

    const byPath = new Map(rows.map((row) => [row.path, row]));
    expect(byPath.get("/public")?.verdict).toBe("public");
    expect(byPath.get("/profile/123")?.verdict).toBe("observed");
    expect(byPath.get("/echo")?.verdict).toBe("ambiguous");
    expect(byPath.get("/mixed")?.statuses.mixed).toBe("200");
  });

  it("discovers parameters across query, JSON, cookies, headers, and WebSocket payloads", () => {
    const parameters = discoverParameters(
      [
        capture({
          method: "POST",
          url: "https://api.example.test/users?page=2",
        requestHeaders: {
          Cookie: "sid=abc; theme=dark",
          Authorization: "Bearer token",
          "Content-Type": "application/json"
        },
          requestBody: JSON.stringify({ user: { email: "a@example.test" }, role: "admin", items: [{ id: 1 }], "": "blank" })
        })
      ],
      [frame({ payloadData: JSON.stringify({ action: "update", payload: { id: 1 } }) })]
    );

    expect(parameters.map((parameter) => `${parameter.location}:${parameter.name}`)).toEqual(
      expect.arrayContaining([
        "query:page",
        "json:user.email",
        "json:items.id",
        "cookie:sid",
        "header:Authorization",
        "websocket-json:payload.id"
      ])
    );
  });

  it("discovers form and multipart parameters and de-duplicates examples", () => {
    const parameters = discoverParameters([
      capture({
        id: "form",
        method: "POST",
        url: "https://api.example.test/form",
        requestHeaders: { "Content-Type": "application/x-www-form-urlencoded" },
        requestBody: "role=admin&enabled=true"
      }),
      capture({
        id: "multipart",
        method: "POST",
        url: "https://api.example.test/upload",
        requestHeaders: { "Content-Type": "multipart/form-data" },
        requestBody: "Content-Disposition: form-data; name=\"avatar\"\n\nfile"
      })
    ]);

    expect(parameters.map((parameter) => `${parameter.location}:${parameter.name}`)).toEqual(
      expect.arrayContaining(["form:role", "form:enabled", "multipart:avatar"])
    );
  });

  it("detects local-only secret-shaped response content and masks previews", () => {
    const findings = detectSensitiveData([
      capture({
        responseBody: "leaked token eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.DummySig123"
      })
    ]);

    expect(findings[0].pattern).toBe("JWT");
    expect(findings[0].preview).not.toContain("eyJzdWIiOiIxMjM0NTY3ODkwIn0");
    expect(DEFAULT_SENSITIVE_DATA_RULES.some((rule) => rule.name === "JWT")).toBe(true);
  });

  it("detects response-header and WebSocket secret patterns", () => {
    const findings = detectSensitiveData(
      [
        capture({
          responseHeaders: {
            "X-Api-Key": "api_key = shortsecret123456789"
          },
          responseBody: "-----BEGIN PRIVATE KEY-----"
        })
      ],
      [
        frame({
          payloadData: JSON.stringify({
            key: "AKIAABCDEFGHIJKLMNOP"
          })
        })
      ]
    );

    expect(findings.map((finding) => finding.location)).toEqual(
      expect.arrayContaining(["response-body", "response-header", "websocket-payload"])
    );
    expect(findings.map((finding) => finding.pattern)).toEqual(
      expect.arrayContaining(["Private key", "AWS access key", "Secret assignment"])
    );
  });

  it("caps repeated secret matches per text source", () => {
    const keys = Array.from({ length: 10 }, (_, index) => `AKIA${String(index).padStart(16, "A")}`).join(" ");
    const findings = detectSensitiveData([capture({ responseBody: keys })]);

    expect(findings.filter((finding) => finding.pattern === "AWS access key")).toHaveLength(6);
  });

  it("flags cache and header behavior signals", () => {
    const signals = analyzeHeaderBehavior([
      capture({
        requestHeaders: { Authorization: "Bearer token", Origin: "https://app.example.test" },
        responseHeaders: {
          "Cache-Control": "public, max-age=3600",
          "Access-Control-Allow-Origin": "https://app.example.test"
        }
      })
    ]);

    expect(signals.map((signal) => signal.kind)).toEqual(expect.arrayContaining(["cache-poisoning", "cors-vary"]));
  });

  it("flags host override reflections and cross-host redirects", () => {
    const signals = analyzeHeaderBehavior([
      capture({
        url: "https://api.example.test/login",
        host: "api.example.test",
        requestHeaders: { "X-Forwarded-Host": "evil.example.test" },
        responseHeaders: { Location: "https://evil.example.test/callback" },
        responseBody: "Continue at evil.example.test"
      }),
      capture({
        url: "https://api.example.test/redirect",
        host: "api.example.test",
        responseHeaders: { Location: "https://other.example.test/path", "Cache-Control": "no-store" }
      })
    ]);

    expect(signals.map((signal) => signal.kind)).toEqual(expect.arrayContaining(["host-header", "redirect"]));
  });

  it("builds a combined summary with local proxy guidance", () => {
    const summary = buildAdvancedTestingSummary([capture({})], [], "");

    expect(summary.proxyGuidance.map((item) => item.id)).toEqual(["mobile-device", "thick-client", "cli"]);
    expect(summary.apiImport.ok).toBe(true);
    expect(summary.authComparisons).toEqual([]);
    expect(summary.secretRules.length).toBeGreaterThan(0);
  });

  it("builds workflow drafts from imported APIs and advanced local signals", () => {
    const importResult = parseApiImport(
      JSON.stringify({
        openapi: "3.0.0",
        servers: [{ url: "https://api.example.test" }],
        paths: { "/users": { get: { operationId: "listUsers" } } }
      })
    );
    const graphql = analyzeGraphQl([
      capture({
        id: "graphql-workflow",
        method: "POST",
        url: "https://api.example.test/graphql",
        requestHeaders: { "Content-Type": "application/json" },
        requestBody: JSON.stringify({ query: "mutation UpdateUser($id: ID) { updateUser(id: $id) { id } }", variables: { id: "1" } })
      })
    ]);
    const authRows = buildAuthMatrix([
      capture({ id: "anon-workflow", status: 401, requestHeaders: {} }),
      capture({ id: "auth-workflow", status: 200, requestHeaders: { Authorization: "Bearer token" } })
    ]);
    const parameter = discoverParameters([capture({ url: "https://api.example.test/v1/users?role=admin" })])[0];
    const headerSignal = analyzeHeaderBehavior([
      capture({
        requestHeaders: { Authorization: "Bearer token" },
        responseHeaders: { "Cache-Control": "public, max-age=3600" }
      })
    ])[0];
    const secret = detectSensitiveData([
      capture({ responseBody: "token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.signaturepart123" })
    ])[0];

    expect(workflowDraftFromApiImport(importResult)?.steps.map((step) => step.kind)).toEqual(
      expect.arrayContaining(["security-headers", "cors-policy", "cache-control", "metadata-exposure"])
    );
    expect(workflowDraftFromGraphQlOperation(graphql.operations[0]).name).toContain("GraphQL");
    expect(workflowDraftFromAuthMatrixRow(authRows[0]).mode).toBe("active");
    expect(workflowDraftFromParameter(parameter).steps[0].config.parameter).toBe("role");
    expect(workflowDraftFromHeaderSignal(headerSignal).steps[0].kind).toBe("cache-control");
    expect(workflowDraftFromSecret(secret).steps[0].config.pattern).toBe("JWT");
    expect(workflowDraftFromApiImport(parseApiImport("{"))).toBeNull();
  });
});
