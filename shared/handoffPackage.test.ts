import { describe, expect, it } from "vitest";
import type { CapturedRequest, Finding, LocalProfile, LocalSession, LocalWorkspace, WebSocketEvent } from "./domain.js";
import { buildHandoffPackage } from "./handoffPackage.js";

const profile: LocalProfile = {
  id: "profile-1",
  name: "Client Project",
  createdAt: "2026-05-25T00:00:00.000Z",
  updatedAt: "2026-05-25T00:00:00.000Z"
};

const workspace: LocalWorkspace = {
  id: "workspace-1",
  profileId: profile.id,
  name: "Workspace",
  createdAt: "2026-05-25T00:00:00.000Z",
  updatedAt: "2026-05-25T00:00:00.000Z"
};

const session: LocalSession = {
  id: "session-1",
  workspaceId: workspace.id,
  name: "Review",
  startedAt: "2026-05-25T00:00:00.000Z",
  updatedAt: "2026-05-25T00:00:00.000Z"
};

const capture = (id: string): CapturedRequest => ({
  id,
  startedAt: "2026-05-25T00:00:00.000Z",
  method: "GET",
  url: `https://app.test/${id}`,
  host: "app.test",
  path: `/${id}`,
  requestHeaders: { Authorization: "Bearer secret" },
  requestBody: "secret",
  status: 200,
  statusText: "OK",
  mimeType: "text/plain",
  type: "fetch",
  responseHeaders: {},
  responseBody: "ok",
  durationMs: 10,
  allowed: true,
  source: "browser"
});

const frame: WebSocketEvent = {
  id: "ws-1",
  requestId: "request-ws-1",
  createdAt: "2026-05-25T00:00:00.000Z",
  url: "wss://app.test/socket",
  host: "app.test",
  direction: "received",
  payloadData: "secret",
  size: 6,
  allowed: true
};

const finding = (status: Finding["status"]): Finding => ({
  id: `finding-${status}`,
  title: `${status} finding`,
  severity: "high",
  confidence: "high",
  status,
  component: "",
  affectedAssets: ["https://app.test"],
  evidence: [
    { id: "cap-1", kind: "capture", label: "GET /cap-1", createdAt: "2026-05-25T00:00:00.000Z", metadata: {} },
    { id: "ws-1", kind: "websocket", label: "socket frame", createdAt: "2026-05-25T00:00:00.000Z", metadata: {} }
  ],
  reproductionSteps: "Reproduce safely.",
  impact: "Impact.",
  remediation: "Fix.",
  notes: "",
  owner: "",
  assignee: "",
  retestResult: "",
  source: "manual",
  createdAt: "2026-05-25T00:00:00.000Z",
  updatedAt: "2026-05-25T00:00:00.000Z"
});

function input() {
  return {
    profile,
    workspace,
    session,
    targets: ["https://app.test"],
    captures: [capture("cap-1"), capture("cap-2")],
    webSocketEvents: [frame],
    findings: [finding("draft"), finding("reviewed")],
    workflows: [
      {
        id: "workflow-1",
        name: "Headers",
        description: "Header checks",
        mode: "passive" as const,
        builtIn: false,
        inputs: [],
        scope: { requireInScope: true, allowActive: false, maxRequests: 0, timeoutMs: 1000, delayMs: 0, maxResults: 10 },
        steps: [{ id: "step-1", title: "Headers", kind: "security-headers" as const, config: {} }],
        createdAt: "2026-05-25T00:00:00.000Z",
        updatedAt: "2026-05-25T00:00:00.000Z"
      }
    ],
    replayCollections: [
      {
        id: "collection-1",
        name: "Replay set",
        items: [],
        createdAt: "2026-05-25T00:00:00.000Z",
        updatedAt: "2026-05-25T00:00:00.000Z"
      }
    ],
    projectNotes: [
      {
        id: "note-1",
        title: "Handoff note",
        body: "Review auth state.",
        createdAt: "2026-05-25T00:00:00.000Z",
        updatedAt: "2026-05-25T00:00:00.000Z"
      }
    ]
  };
}

describe("handoff package", () => {
  it("packages reviewed findings and referenced evidence by default", () => {
    const preview = buildHandoffPackage(input(), { redaction: "redacted-evidence", title: "Auth Handoff" });
    expect(preview.ok).toBe(true);
    expect(preview.package?.findings.map((item) => item.status)).toEqual(["reviewed"]);
    expect(preview.package?.captures.map((item) => item.id)).toEqual(["cap-1"]);
    expect(preview.package?.webSocketEvents.map((item) => item.id)).toEqual(["ws-1"]);
    expect(preview.package?.captures[0]?.requestHeaders.Authorization).toBe("[redacted]");
    expect(preview.package?.summaryMarkdown).toContain("# Auth Handoff");
    expect(preview.stats).toMatchObject({ findings: 1, captures: 1, webSocketEvents: 1 });
  });

  it("supports draft inclusion and optional project artifacts", () => {
    const preview = buildHandoffPackage(input(), {
      redaction: "metadata-only",
      includeDraftFindings: true,
      includeProjectNotes: false,
      includeReplayCollections: false,
      includeWorkflows: false
    });
    expect(preview.package?.findings).toHaveLength(2);
    expect(preview.package?.projectNotes).toEqual([]);
    expect(preview.package?.replayCollections).toEqual([]);
    expect(preview.package?.workflows).toEqual([]);
    expect(preview.package?.captures[0]?.requestBody).toBe("");
  });

  it("warns for raw evidence and empty reviewed handoffs", () => {
    const raw = buildHandoffPackage(input(), { redaction: "raw-evidence" });
    expect(raw.package?.captures[0]?.requestHeaders.Authorization).toBe("Bearer secret");
    expect(raw.warnings[0]).toMatch(/Raw evidence export/);

    const empty = input();
    empty.findings = [finding("draft")];
    const preview = buildHandoffPackage(empty, { redaction: "redacted-evidence" });
    expect(preview.warnings).toEqual(expect.arrayContaining(["No reviewed findings matched this handoff package."]));
    expect(preview.stats.findings).toBe(0);
  });
});
