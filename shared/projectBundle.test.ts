import { describe, expect, it } from "vitest";
import type { CapturedRequest, Finding, LocalProfile, LocalSession, LocalWorkspace, WebSocketEvent } from "./domain.js";
import {
  buildProjectBundle,
  MAX_BUNDLE_BYTES,
  parseProjectBundleJson,
  type ProjectBundleInput,
  previewProjectBundleImport,
  serializeProjectBundle
} from "./projectBundle.js";

const profile: LocalProfile = {
  id: "project-1",
  name: "Client Project",
  createdAt: "2026-05-25T00:00:00.000Z",
  updatedAt: "2026-05-25T00:00:00.000Z"
};

const workspace: LocalWorkspace = {
  id: "workspace-1",
  profileId: profile.id,
  name: "Client Workspace",
  createdAt: "2026-05-25T00:00:00.000Z",
  updatedAt: "2026-05-25T00:00:00.000Z"
};

const session: LocalSession = {
  id: "session-1",
  workspaceId: workspace.id,
  name: "Review Session",
  startedAt: "2026-05-25T00:00:00.000Z",
  updatedAt: "2026-05-25T00:00:00.000Z"
};

const capture: CapturedRequest = {
  id: "cap-1",
  startedAt: "2026-05-25T00:00:00.000Z",
  method: "GET",
  url: "https://app.test/api/session",
  host: "app.test",
  path: "/api/session",
  requestHeaders: { Authorization: "Bearer secret", Accept: "application/json" },
  requestBody: "{\"token\":\"secret\"}",
  status: 200,
  statusText: "OK",
  mimeType: "application/json",
  type: "fetch",
  responseHeaders: { "set-cookie": "sid=secret", "content-type": "application/json" },
  responseBody: "{\"ok\":true}",
  durationMs: 12,
  allowed: true,
  source: "browser"
};

const frame: WebSocketEvent = {
  id: "ws-1",
  requestId: "request-ws-1",
  createdAt: "2026-05-25T00:00:01.000Z",
  url: "wss://app.test/socket",
  host: "app.test",
  direction: "received",
  payloadData: "{\"token\":\"secret\"}",
  size: 18,
  requestHeaders: { Cookie: "sid=secret" },
  responseHeaders: {},
  allowed: true
};

const finding = (status: Finding["status"]): Finding => ({
  id: `finding-${status}`,
  title: "Session weakness",
  severity: "medium",
  confidence: "high",
  status,
  component: "",
  affectedAssets: ["https://app.test"],
  evidence: [{ id: "cap-1", kind: "capture", label: "GET /api/session", createdAt: capture.startedAt, metadata: {} }],
  reproductionSteps: "Replay the captured request.",
  impact: "Session controls are weak.",
  remediation: "Harden session controls.",
  notes: "",
  owner: "",
  assignee: "",
  retestResult: "",
  source: "manual",
  createdAt: "2026-05-25T00:00:00.000Z",
  updatedAt: "2026-05-25T00:00:00.000Z"
});

function bundleInput(): ProjectBundleInput {
  return {
    profile,
    workspace,
    targets: ["https://app.test"],
    savedFilters: [],
    projectNotes: [
      {
        id: "note-1",
        title: "Auth handoff",
        body: "Review session refresh.",
        createdAt: "2026-05-25T00:00:00.000Z",
        updatedAt: "2026-05-25T00:00:00.000Z"
      }
    ],
    savedViews: [
      {
        id: "view-1",
        name: "Session traffic",
        view: "traffic" as const,
        description: "Session request filter.",
        state: { trafficQuery: "path:/api/session" },
        createdAt: "2026-05-25T00:00:00.000Z",
        updatedAt: "2026-05-25T00:00:00.000Z"
      }
    ],
    workflows: [],
    replayCollections: [],
    plugins: [],
    sessions: [
      {
        session,
        captures: [capture],
        webSocketEvents: [frame],
        evidenceAnnotations: [],
        findings: [finding("draft"), finding("reviewed")],
        workflowRuns: []
      }
    ]
  };
}

describe("project bundle", () => {
  it("builds redacted evidence bundles without raw secrets", () => {
    const preview = buildProjectBundle(bundleInput(), { redaction: "redacted-evidence" });
    expect(preview.ok).toBe(true);
    const exportedCapture = preview.bundle?.sessions[0]?.captures[0];
    const exportedFrame = preview.bundle?.sessions[0]?.webSocketEvents[0];

    expect(exportedCapture?.requestHeaders.Authorization).toBe("[redacted]");
    expect(exportedCapture?.responseHeaders["set-cookie"]).toBe("[redacted]");
    expect(exportedCapture?.requestBody).toContain("[redacted body");
    expect(exportedFrame?.requestHeaders?.Cookie).toBe("[redacted]");
    expect(exportedFrame?.payloadData).toContain("[redacted payload");
    expect(preview.stats.captures).toBe(1);
  });

  it("supports metadata-only, reviewed-findings, and raw evidence profiles", () => {
    const metadata = buildProjectBundle(bundleInput(), { redaction: "metadata-only" });
    expect(metadata.bundle?.sessions[0]?.captures[0]?.requestHeaders).toEqual({});
    expect(metadata.bundle?.sessions[0]?.captures[0]?.responseBody).toBe("");

    const reviewed = buildProjectBundle(bundleInput(), { redaction: "reviewed-findings" });
    expect(reviewed.bundle?.sessions[0]?.findings.map((item) => item.status)).toEqual(["reviewed"]);
    expect(reviewed.bundle?.sessions[0]?.captures.map((item) => item.id)).toEqual(["cap-1"]);

    const raw = buildProjectBundle(bundleInput(), { redaction: "raw-evidence" });
    expect(raw.bundle?.sessions[0]?.captures[0]?.requestHeaders.Authorization).toBe("Bearer secret");
    expect(raw.warnings[0]).toMatch(/Raw evidence export/);
  });

  it("parses bundles and rejects unknown schemas", () => {
    const bundle = buildProjectBundle(bundleInput(), { redaction: "metadata-only" }).bundle;
    expect(bundle).not.toBeNull();
    const parsed = parseProjectBundleJson(serializeProjectBundle(bundle!));
    expect(parsed.ok).toBe(true);
    expect(parsed.ok ? parsed.bundle.stats.projectNotes : 0).toBe(1);

    expect(parseProjectBundleJson("{")).toEqual({ ok: false, error: "Project bundle JSON could not be parsed." });
    expect(parseProjectBundleJson(JSON.stringify({ format: "wrong", schemaVersion: 1 }))).toMatchObject({
      ok: false,
      error: "Project bundle format or schema version was not recognized."
    });
  });

  it("previews import conflicts and keeps proposed scope inactive", () => {
    const bundle = buildProjectBundle(bundleInput(), { redaction: "metadata-only" }).bundle!;
    const preview = previewProjectBundleImport({
      bundle,
      activeTargets: ["https://current.test"],
      existingCaptures: [{ ...capture }],
      existingFindings: [finding("reviewed")],
      existingProjectNotes: [bundle.projectNotes[0]],
      existingSavedViews: [bundle.savedViews[0]]
    });

    expect(preview.ok).toBe(true);
    expect(preview.inactiveTargets).toEqual(["https://app.test"]);
    expect(preview.conflicts).toEqual(
      expect.arrayContaining([
        { kind: "capture", id: "cap-1", action: "skip" },
        { kind: "finding", id: "finding-reviewed", action: "skip" },
        { kind: "note", id: "note-1", action: "skip" },
        { kind: "saved-view", id: "view-1", action: "skip" }
      ])
    );
  });

  it("covers optional plugin metadata, collection exclusion, and oversize rejection", () => {
    const input = bundleInput();
    input.plugins = [
      {
        id: "jwt-helper",
        manifest: {
          schemaVersion: 1,
          id: "jwt-helper",
          name: "JWT Helper",
          version: "1.0.0",
          description: "Token helper",
          author: "Radar",
          sdkVersion: "0.1",
          minRadarVersion: "",
          entry: "index.js",
          permissions: ["captures:read"],
          panels: []
        },
        sourcePath: "/tmp/plugin",
        grantedPermissions: ["captures:read"],
        status: "approved",
        trustLevel: "first-party",
        compatibilityWarnings: [],
        warnings: [],
        installedAt: "2026-05-25T00:00:00.000Z",
        updatedAt: "2026-05-25T00:00:00.000Z"
      }
    ];
    input.replayCollections = [
      {
        id: "collection-1",
        name: "Session replays",
        items: [],
        createdAt: "2026-05-25T00:00:00.000Z",
        updatedAt: "2026-05-25T00:00:00.000Z"
      }
    ];

    const excluded = buildProjectBundle(input, { redaction: "metadata-only", includeReplayCollections: false });
    expect(excluded.bundle?.plugins).toEqual([]);
    expect(excluded.bundle?.replayCollections).toEqual([]);
    expect(excluded.warnings).toEqual(expect.arrayContaining(["Plugin records are excluded from this bundle."]));

    const included = buildProjectBundle(input, {
      redaction: "metadata-only",
      includePlugins: true,
      includeReplayCollections: true
    });
    expect(included.bundle?.plugins[0]).toMatchObject({
      sourcePath: "",
      grantedPermissions: [],
      status: "pending"
    });
    expect(included.bundle?.plugins[0]?.warnings[0]).toMatch(/Imported as metadata only/);
    expect(included.bundle?.replayCollections).toHaveLength(1);

    expect(parseProjectBundleJson("x".repeat(MAX_BUNDLE_BYTES + 1))).toEqual({
      ok: false,
      error: "Project bundle is too large."
    });
  });

  it("rejects invalid import previews and reports frame/workflow conflicts", () => {
    expect(
      previewProjectBundleImport({
        bundle: { format: "wrong", schemaVersion: 1 } as never,
        activeTargets: []
      })
    ).toMatchObject({
      ok: false,
      error: "Project bundle format or schema version was not recognized."
    });

    const input = bundleInput();
    input.workflows = [
      {
        id: "workflow-1",
        name: "Headers",
        description: "Header review",
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
      }
    ];
    const bundle = buildProjectBundle(input, { redaction: "metadata-only" }).bundle!;
    const preview = previewProjectBundleImport({
      bundle,
      activeTargets: ["https://app.test"],
      existingWebSocketEvents: [frame],
      existingWorkflows: input.workflows
    });

    expect(preview.inactiveTargets).toEqual([]);
    expect(preview.conflicts).toEqual(
      expect.arrayContaining([
        { kind: "websocket", id: "ws-1", action: "skip" },
        { kind: "workflow", id: "workflow-1", action: "skip" }
      ])
    );
  });
});
