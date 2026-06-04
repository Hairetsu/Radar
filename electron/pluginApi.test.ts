import { describe, expect, it, vi } from "vitest";
import type {
  CapturedRequest,
  Finding,
  InstalledPlugin,
  ReplayDraft,
  ReplayResult,
  WebSocketEvent,
  WorkflowDefinition,
  WorkflowRun
} from "../shared/domain.js";
import { runPluginApiAction, type PluginApiDependencies } from "./pluginApi.js";

const approvedPlugin: InstalledPlugin = {
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
    permissions: ["captures:read", "frames:read", "replay:prepare", "replay:send", "findings:write", "workflows:read"],
    panels: []
  },
  sourcePath: "/tmp/jwt-helper",
  grantedPermissions: ["captures:read", "frames:read", "replay:prepare", "replay:send", "findings:write", "workflows:read"],
  status: "approved",
  warnings: [],
  installedAt: "2026-05-25T12:00:00.000Z",
  updatedAt: "2026-05-25T12:00:00.000Z"
};

const capture: CapturedRequest = {
  id: "cap-1",
  startedAt: "2026-05-25T12:00:00.000Z",
  method: "POST",
  url: "https://example.test/api",
  host: "example.test",
  path: "/api",
  requestHeaders: {},
  requestBody: "",
  status: 200,
  statusText: "OK",
  mimeType: "application/json",
  type: "fetch",
  responseHeaders: {},
  responseBody: "{\"ok\":true}",
  durationMs: 10,
  allowed: true,
  source: "proxy"
};

const frame: WebSocketEvent = {
  id: "ws-1",
  requestId: "req-1",
  createdAt: "2026-05-25T12:00:00.000Z",
  url: "wss://example.test/socket",
  host: "example.test",
  direction: "received",
  payloadData: "pong",
  size: 4,
  allowed: true
};

function deps(plugin: InstalledPlugin | null = approvedPlugin): PluginApiDependencies {
  const replayResult: ReplayResult = {
    ok: true,
    status: 200,
    statusText: "OK",
    durationMs: 11,
    headers: {},
    body: "",
    bytes: 0
  };
  return {
    getPlugin: () => plugin,
    allowlist: () => ["https://example.test"],
    listCaptures: () => [capture, { ...capture, id: "cap-2", url: "https://outside.test/api", host: "outside.test", allowed: false }],
    listWebSocketEvents: () => [frame, { ...frame, id: "ws-2", url: "wss://outside.test/socket", host: "outside.test", allowed: false }],
    saveFinding: vi.fn((finding: Finding) => finding),
    listWorkflows: () => [],
    saveWorkflow: vi.fn((workflow: WorkflowDefinition) => workflow),
    runWorkflow: vi.fn(async () => ({ id: "run-1" }) as WorkflowRun),
    sendReplay: vi.fn(async () => replayResult)
  };
}

describe("plugin API executor", () => {
  it("denies missing, pending, or ungranted plugin actions", async () => {
    await expect(runPluginApiAction({ pluginId: "missing", action: "captures:list", input: {} }, deps(null))).resolves.toMatchObject({
      ok: false,
      error: "Plugin was not installed."
    });
    await expect(
      runPluginApiAction(
        { pluginId: "jwt-helper", action: "replay:send", input: { draft: { method: "GET", url: "https://example.test", headers: {}, body: "" } } },
        deps({ ...approvedPlugin, grantedPermissions: ["captures:read"] })
      )
    ).resolves.toMatchObject({ ok: false, error: "Plugin is not approved for replay:send." });
  });

  it("filters captures and frames to saved scope before query matching", async () => {
    const captureResult = await runPluginApiAction({ pluginId: "jwt-helper", action: "captures:list", input: { query: "method:POST" } }, deps());
    expect(captureResult.ok).toBe(true);
    expect(captureResult.data).toEqual([capture]);

    const frameResult = await runPluginApiAction({ pluginId: "jwt-helper", action: "frames:list", input: { query: "payload:pong" } }, deps());
    expect(frameResult.ok).toBe(true);
    expect(frameResult.data).toEqual([frame]);
  });

  it("enforces replay scope for prepare and send actions", async () => {
    const blockedDraft: ReplayDraft = { method: "GET", url: "https://outside.test", headers: {}, body: "" };
    await expect(
      runPluginApiAction({ pluginId: "jwt-helper", action: "replay:prepare", input: { draft: blockedDraft } }, deps())
    ).resolves.toMatchObject({ ok: false, error: "Replay draft URL is outside the current scope allowlist." });

    const allowedDraft: ReplayDraft = { method: "GET", url: "https://example.test", headers: {}, body: "" };
    await expect(
      runPluginApiAction({ pluginId: "jwt-helper", action: "replay:send", input: { draft: allowedDraft } }, deps())
    ).resolves.toMatchObject({ ok: true, data: expect.objectContaining({ status: 200 }) });
  });

  it("creates draft findings only through normalized evidence-backed records", async () => {
    const finding: Partial<Finding> = {
      id: "finding-1",
      title: "Token review",
      severity: "low",
      confidence: "medium",
      status: "reviewed",
      affectedAssets: ["https://example.test"],
      evidence: [{ id: capture.id, kind: "capture", label: "POST /api", createdAt: capture.startedAt, metadata: {} }],
      reproductionSteps: "Replay the request.",
      impact: "Review required.",
      remediation: "",
      notes: "",
      owner: "",
      retestResult: "",
      source: "manual",
      createdAt: "2026-05-25T12:00:00.000Z",
      updatedAt: "2026-05-25T12:00:00.000Z"
    };
    const result = await runPluginApiAction({ pluginId: "jwt-helper", action: "findings:create", input: { finding } }, deps());
    expect(result.ok).toBe(true);
    expect(result.data).toEqual(expect.objectContaining({ status: "draft", source: "manual" }));

    await expect(
      runPluginApiAction({ pluginId: "jwt-helper", action: "findings:create", input: { finding: { ...finding, evidence: [] } } }, deps())
    ).resolves.toMatchObject({ ok: false, error: "Plugin finding needs a title and at least one evidence reference." });
  });
});
