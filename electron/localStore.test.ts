import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_ALLOWLIST } from "../shared/allowlist.js";
import type { AgentRun } from "../shared/agent-types.js";
import type {
  AutomatePayloadSet,
  AutomateSession,
  CapturedRequest,
  Finding,
  InstalledPlugin,
  SslEvent,
  WebSocketEvent,
  WorkflowDefinition,
  WorkflowRun
} from "../shared/domain.js";
import { LOCAL_STORE_SCHEMA_VERSION, openLocalStore } from "./localStore.js";

describe("localStore", () => {
  let tmpDir = "";

  type MigrationMetadata = {
    metaVersion: string;
    migrations: Array<{ version: number; name: string }>;
  };

  afterEach(() => {
    if (tmpDir) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = "";
    }
  });

  function makeTempDir() {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "radar-local-store-"));
    return tmpDir;
  }

  function databasePath() {
    return path.join(tmpDir, "radar-local.sqlite");
  }

  function makeStore() {
    makeTempDir();
    return openLocalStore(tmpDir);
  }

  function readMigrationMetadata(): MigrationMetadata {
    const db = new DatabaseSync(databasePath());
    try {
      const meta = db
        .prepare("SELECT value FROM meta WHERE key = ?")
        .get("schema_version") as { value: string } | undefined;
      const rows = db
        .prepare("SELECT version, name FROM schema_migrations ORDER BY version ASC")
        .all() as Array<{ version: number; name: string }>;
      return {
        metaVersion: meta?.value || "",
        migrations: rows.map((row) => ({
          version: Number(row.version),
          name: row.name
        }))
      };
    } finally {
      db.close();
    }
  }

  function execRawDatabase(sql: string) {
    const db = new DatabaseSync(databasePath());
    try {
      db.exec(sql);
    } finally {
      db.close();
    }
  }

  function crashFinding(): Finding {
    return {
      id: "finding-crash",
      title: "Crash-safe finding",
      severity: "medium",
      confidence: "high",
      status: "draft",
      affectedAssets: ["https://example.test"],
      evidence: [
        {
          id: "cap-crash",
          kind: "capture",
          label: "GET https://example.test/",
          createdAt: "2026-05-25T12:00:00.000Z",
          metadata: { status: "200" }
        }
      ],
      reproductionSteps: "Trigger a failing parent session update.",
      impact: "A partial write would leave a finding without a matching session timestamp.",
      remediation: "Keep finding writes transactional.",
      notes: "",
      owner: "",
      retestResult: "",
      source: "manual",
      createdAt: "2026-05-25T12:00:00.000Z",
      updatedAt: "2026-05-25T12:00:00.000Z"
    };
  }

  function crashWorkflowRun(sessionId: string): WorkflowRun {
    return {
      id: "workflow-run-crash",
      workflowId: "workflow-crash",
      workflowName: "Crash-safe workflow",
      sessionId,
      source: "manual",
      mode: "passive",
      status: "completed",
      inputs: {},
      startedAt: "2026-05-25T12:00:00.000Z",
      completedAt: "2026-05-25T12:00:01.000Z",
      stepCount: 1,
      actionCount: 0,
      results: []
    };
  }

  function crashAgentRun(sessionId: string): AgentRun {
    return {
      id: "agent-crash",
      sessionId,
      createdAt: "2026-05-25T12:00:00.000Z",
      updatedAt: "2026-05-25T12:00:01.000Z",
      goal: "Crash-safe timeline",
      status: "completed",
      policy: {
        maxRuntimeMs: 120000,
        maxSteps: 4,
        maxReplay: 0,
        maxCaptureSample: 10,
        allowRawContext: false
      },
      timeline: [{ id: "agent-crash-step", createdAt: "2026-05-25T12:00:00.000Z", note: "Persist atomically." }],
      findings: []
    };
  }

  function crashPlugin(): InstalledPlugin {
    return {
      id: "crash-plugin",
      manifest: {
        schemaVersion: 1,
        id: "crash-plugin",
        name: "Crash Plugin",
        version: "1.0.0",
        description: "Exercises plugin registry rollback.",
        author: "Radar",
        sdkVersion: "0.1",
        minRadarVersion: "",
        entry: "dist/index.js",
        permissions: ["captures:read"],
        panels: []
      },
      sourcePath: "/tmp/crash-plugin",
      grantedPermissions: [],
      status: "pending",
      warnings: [],
      installedAt: "2026-05-25T12:00:00.000Z",
      updatedAt: "2026-05-25T12:00:00.000Z"
    };
  }

  function createLegacyLocalStore() {
    makeTempDir();
    const db = new DatabaseSync(databasePath());
    const createdAt = "2026-05-25T12:00:00.000Z";
    const profileId = "profile-legacy";
    const workspaceId = "workspace-legacy";
    const sessionId = "session-legacy";
    const captureId = "cap-legacy";
    db.exec(`
      PRAGMA foreign_keys = ON;

      CREATE TABLE meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE profiles (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE workspaces (
        id TEXT PRIMARY KEY,
        profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE sessions (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        started_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE workspace_targets (
        workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        position INTEGER NOT NULL,
        target TEXT NOT NULL,
        PRIMARY KEY (workspace_id, target)
      );

      CREATE TABLE captures (
        session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        id TEXT NOT NULL,
        started_at TEXT NOT NULL,
        method TEXT NOT NULL,
        url TEXT NOT NULL,
        host TEXT NOT NULL,
        path TEXT NOT NULL,
        request_headers_json TEXT NOT NULL,
        request_body TEXT NOT NULL,
        status INTEGER,
        status_text TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        resource_type TEXT NOT NULL,
        response_headers_json TEXT NOT NULL,
        response_body TEXT NOT NULL,
        duration_ms INTEGER,
        encoded_data_length INTEGER,
        allowed INTEGER NOT NULL,
        source TEXT NOT NULL CHECK (source IN ('browser', 'repeater', 'proxy')),
        tls_json TEXT,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (session_id, id)
      );
    `);
    db.prepare("INSERT INTO meta (key, value) VALUES (?, ?)").run("schema_version", "12");
    db.prepare("INSERT INTO meta (key, value) VALUES (?, ?)").run("active_profile_id", profileId);
    db.prepare("INSERT INTO meta (key, value) VALUES (?, ?)").run("active_workspace_id", workspaceId);
    db.prepare("INSERT INTO meta (key, value) VALUES (?, ?)").run("active_session_id", sessionId);
    db.prepare("INSERT INTO profiles (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)").run(
      profileId,
      "Legacy Operator",
      createdAt,
      createdAt
    );
    db.prepare(
      "INSERT INTO workspaces (id, profile_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
    ).run(workspaceId, profileId, "Legacy Workspace", createdAt, createdAt);
    db.prepare(
      "INSERT INTO sessions (id, workspace_id, name, started_at, updated_at) VALUES (?, ?, ?, ?, ?)"
    ).run(sessionId, workspaceId, "Legacy Session", createdAt, createdAt);
    db.prepare("INSERT INTO workspace_targets (workspace_id, position, target) VALUES (?, ?, ?)").run(
      workspaceId,
      0,
      "https://legacy.example"
    );
    db.prepare(`
      INSERT INTO captures (
        session_id, id, started_at, method, url, host, path,
        request_headers_json, request_body, status, status_text, mime_type, resource_type,
        response_headers_json, response_body, duration_ms, encoded_data_length, allowed,
        source, tls_json, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      sessionId,
      captureId,
      createdAt,
      "GET",
      "https://legacy.example/api",
      "legacy.example",
      "/api",
      "{\"Accept\":\"application/json\"}",
      "",
      200,
      "OK",
      "application/json",
      "Fetch",
      "{\"content-type\":\"application/json\"}",
      "{\"ok\":true}",
      31,
      11,
      1,
      "browser",
      null,
      createdAt
    );
    db.close();
    return { profileId, workspaceId, sessionId, captureId };
  }

  function createNewerLocalStore() {
    makeTempDir();
    const db = new DatabaseSync(databasePath());
    db.exec(`
      CREATE TABLE schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL
      );
    `);
    db.prepare("INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)").run(
      LOCAL_STORE_SCHEMA_VERSION + 1,
      "future-schema",
      "2026-05-25T12:00:00.000Z"
    );
    db.close();
  }

  it("bootstraps a local profile, workspace, session, and default targets", () => {
    const store = makeStore();
    const context = store.getActiveContext();

    expect(context.profile.name).toBe("Local Operator");
    expect(context.workspace.profileId).toBe(context.profile.id);
    expect(context.session.workspaceId).toBe(context.workspace.id);
    expect(store.getTargets(context.workspace.id)).toEqual(DEFAULT_ALLOWLIST);

    store.close();
  });

  it("records the current schema migration on fresh stores", () => {
    const store = makeStore();
    store.getActiveContext();
    store.close();

    expect(readMigrationMetadata()).toEqual({
      metaVersion: String(LOCAL_STORE_SCHEMA_VERSION),
      migrations: [{ version: LOCAL_STORE_SCHEMA_VERSION, name: "current-workbench-schema" }]
    });
  });

  it("migrates legacy stores without losing active context or captures", () => {
    const legacy = createLegacyLocalStore();
    const store = openLocalStore(tmpDir);
    const context = store.getActiveContext();

    expect(context.profile.id).toBe(legacy.profileId);
    expect(context.workspace.id).toBe(legacy.workspaceId);
    expect(context.session.id).toBe(legacy.sessionId);
    expect(store.getTargets(legacy.workspaceId)).toEqual(["https://legacy.example"]);
    expect(store.listCaptures(legacy.sessionId, 10)).toEqual([
      {
        id: legacy.captureId,
        startedAt: "2026-05-25T12:00:00.000Z",
        method: "GET",
        url: "https://legacy.example/api",
        host: "legacy.example",
        path: "/api",
        requestHeaders: { Accept: "application/json" },
        requestBody: "",
        status: 200,
        statusText: "OK",
        mimeType: "application/json",
        type: "Fetch",
        responseHeaders: { "content-type": "application/json" },
        responseBody: "{\"ok\":true}",
        durationMs: 31,
        encodedDataLength: 11,
        allowed: true,
        source: "browser",
        tls: null
      }
    ]);
    store.close();

    expect(readMigrationMetadata()).toEqual({
      metaVersion: String(LOCAL_STORE_SCHEMA_VERSION),
      migrations: [{ version: LOCAL_STORE_SCHEMA_VERSION, name: "current-workbench-schema" }]
    });
  });

  it("does not duplicate migration records when reopening current stores", () => {
    const store = makeStore();
    store.getActiveContext();
    store.close();

    const reopened = openLocalStore(tmpDir);
    reopened.getActiveContext();
    reopened.close();

    expect(readMigrationMetadata().migrations).toEqual([
      { version: LOCAL_STORE_SCHEMA_VERSION, name: "current-workbench-schema" }
    ]);
  });

  it("rejects stores created by a newer unsupported schema", () => {
    createNewerLocalStore();

    expect(() => openLocalStore(tmpDir)).toThrow(
      `Local store schema version ${LOCAL_STORE_SCHEMA_VERSION + 1} is newer than this Radar build supports`
    );
  });

  it("rolls back new sessions when active-session metadata cannot be written", () => {
    const store = makeStore();
    const context = store.getActiveContext();
    const existingSessions = store.listSessions(context.profile.id);
    store.close();
    execRawDatabase(`
      CREATE TRIGGER fail_active_session_meta
      BEFORE INSERT ON meta
      WHEN NEW.key = 'active_session_id'
      BEGIN
        SELECT RAISE(FAIL, 'blocked active session meta');
      END;
    `);

    const reopened = openLocalStore(tmpDir);
    expect(() => reopened.createSession(context.workspace.id, "Crash session")).toThrow(/blocked active session meta/);
    expect(reopened.listSessions(context.profile.id)).toEqual(existingSessions);
    reopened.close();
  });

  it("rolls back session-scoped records when session metadata cannot be updated", () => {
    const store = makeStore();
    const context = store.getActiveContext();
    store.close();
    execRawDatabase(`
      CREATE TRIGGER fail_session_touch
      BEFORE UPDATE ON sessions
      BEGIN
        SELECT RAISE(FAIL, 'blocked session touch');
      END;
    `);

    const reopened = openLocalStore(tmpDir);
    expect(() => reopened.upsertFinding(context.session.id, crashFinding())).toThrow(/blocked session touch/);
    expect(() => reopened.upsertWorkflowRun(context.session.id, crashWorkflowRun(context.session.id))).toThrow(
      /blocked session touch/
    );
    expect(() => reopened.upsertAgentRun(context.session.id, crashAgentRun(context.session.id))).toThrow(
      /blocked session touch/
    );

    expect(reopened.listFindings(context.session.id)).toEqual([]);
    expect(reopened.listWorkflowRuns(context.session.id)).toEqual([]);
    expect(reopened.listAgentRuns(context.session.id)).toEqual([]);
    reopened.close();
  });

  it("rolls back plugin records when workspace metadata cannot be updated", () => {
    const store = makeStore();
    const context = store.getActiveContext();
    store.close();
    execRawDatabase(`
      CREATE TRIGGER fail_workspace_touch
      BEFORE UPDATE ON workspaces
      BEGIN
        SELECT RAISE(FAIL, 'blocked workspace touch');
      END;
    `);

    const reopened = openLocalStore(tmpDir);
    expect(() => reopened.upsertPlugin(context.workspace.id, crashPlugin())).toThrow(/blocked workspace touch/);
    expect(reopened.listPlugins(context.workspace.id)).toEqual([]);
    reopened.close();
  });

  it("persists targets and captures across store instances", () => {
    const store = makeStore();
    const context = store.getActiveContext();
    const capture: CapturedRequest = {
      id: "cap-1",
      startedAt: "2026-05-25T12:00:00.000Z",
      method: "GET",
      url: "https://example.com/api",
      host: "example.com",
      path: "/api",
      requestHeaders: { Accept: "application/json" },
      requestBody: "",
      status: 200,
      statusText: "OK",
      mimeType: "application/json",
      type: "Fetch",
      responseHeaders: { "content-type": "application/json" },
      responseBody: "{\"ok\":true}",
      durationMs: 42,
      encodedDataLength: 11,
      allowed: false,
      source: "browser",
      agentRunId: "agent-1",
      navigationId: "nav-1",
      frameUrl: "https://example.com/dashboard",
      initiator: "script",
      tls: {
        protocol: "TLS 1.3",
        issuer: "Example CA",
        subjectName: "example.com",
        validFrom: 1,
        validTo: 2
      }
    };

    store.setTargets(context.workspace.id, ["https://example.com"]);
    store.upsertCapture(context.session.id, capture);
    store.close();

    const reopened = openLocalStore(tmpDir);
    const reopenedContext = reopened.getActiveContext();

    expect(reopenedContext.session.id).toBe(context.session.id);
    expect(reopened.getTargets(context.workspace.id)).toEqual(["https://example.com"]);
    expect(reopened.listCaptures(context.session.id, 10)).toEqual([capture]);

    reopened.close();
  });

  it("persists intercept metadata with captured requests", () => {
    const store = makeStore();
    const context = store.getActiveContext();
    const capture: CapturedRequest = {
      id: "cap-intercept-1",
      startedAt: "2026-05-25T12:00:00.000Z",
      method: "POST",
      url: "https://example.com/login",
      host: "example.com",
      path: "/login",
      requestHeaders: { "Content-Type": "application/json" },
      requestBody: "{\"role\":\"admin\"}",
      status: 200,
      statusText: "OK",
      mimeType: "application/json",
      type: "Fetch",
      responseHeaders: {},
      responseBody: "{\"ok\":true}",
      durationMs: 80,
      allowed: true,
      source: "proxy",
      tls: null,
      intercept: [
        {
          stage: "request",
          queuedAt: "2026-05-25T12:00:00.000Z",
          resolvedAt: "2026-05-25T12:00:05.000Z",
          resolution: "edited",
          edited: true,
          note: "Operator edited and forwarded the queued request."
        }
      ]
    };

    store.upsertCapture(context.session.id, capture);
    store.close();

    const reopened = openLocalStore(tmpDir);
    expect(reopened.listCaptures(context.session.id, 10)).toEqual([capture]);
    reopened.close();
  });

  it("persists intercept rules per workspace", () => {
    const store = makeStore();
    const context = store.getActiveContext();
    const rules = [
      {
        id: "rule-login",
        name: "Login JSON",
        enabled: true,
        stage: "request" as const,
        method: "POST",
        path: "/login",
        createdAt: "2026-05-25T12:00:00.000Z",
        updatedAt: "2026-05-25T12:00:00.000Z"
      }
    ];

    store.setInterceptRules(context.workspace.id, rules);
    store.close();

    const reopened = openLocalStore(tmpDir);
    expect(reopened.listInterceptRules(context.workspace.id)).toEqual(rules);
    reopened.close();
  });

  it("persists match and replace rules plus rewrite metadata", () => {
    const store = makeStore();
    const context = store.getActiveContext();
    const rules = [
      {
        id: "rewrite-token",
        name: "Swap Token",
        enabled: true,
        stage: "request" as const,
        target: "header" as const,
        headerName: "authorization",
        match: "old-token",
        replace: "new-token",
        createdAt: "2026-05-25T12:00:00.000Z",
        updatedAt: "2026-05-25T12:00:00.000Z"
      }
    ];
    const capture: CapturedRequest = {
      id: "cap-rewrite-1",
      startedAt: "2026-05-25T12:00:00.000Z",
      method: "POST",
      url: "https://example.com/login",
      host: "example.com",
      path: "/login",
      requestHeaders: { Authorization: "Bearer new-token" },
      requestBody: "{\"role\":\"user\"}",
      status: 200,
      statusText: "OK",
      mimeType: "application/json",
      type: "Fetch",
      responseHeaders: {},
      responseBody: "{\"ok\":true}",
      durationMs: 80,
      allowed: true,
      source: "proxy",
      tls: null,
      rewrites: [
        {
          ruleId: "rewrite-token",
          name: "Swap Token",
          stage: "request",
          target: "header",
          detail: "authorization: old-token"
        }
      ]
    };

    store.setMatchReplaceRules(context.workspace.id, rules);
    store.upsertCapture(context.session.id, capture);
    store.close();

    const reopened = openLocalStore(tmpDir);
    expect(reopened.listMatchReplaceRules(context.workspace.id)).toEqual(rules);
    expect(reopened.listCaptures(context.session.id, 10)).toEqual([capture]);
    reopened.close();
  });

  it("persists proxy profile notes per workspace", () => {
    const store = makeStore();
    const context = store.getActiveContext();

    expect(store.listProxyProfiles(context.workspace.id).map((profile) => profile.id)).toEqual([
      "radar-browser",
      "external-browser",
      "cli",
      "mobile-device"
    ]);

    store.saveProxyProfile(context.workspace.id, {
      id: "cli",
      notes: "export HTTPS_PROXY=http://127.0.0.1:8088"
    });
    store.close();

    const reopened = openLocalStore(tmpDir);
    expect(reopened.listProxyProfiles(context.workspace.id)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "cli",
          notes: "export HTTPS_PROXY=http://127.0.0.1:8088"
        })
      ])
    );
    reopened.close();
  });

  it("persists automate payload sets per workspace and sessions per local session", () => {
    const store = makeStore();
    const context = store.getActiveContext();
    const payloadSet: AutomatePayloadSet = {
      id: "payload-auth",
      name: "Auth payloads",
      source: "inline",
      payloads: ["admin", "user"],
      createdAt: "2026-05-25T12:00:00.000Z",
      updatedAt: "2026-05-25T12:00:00.000Z"
    };
    const automateSession: AutomateSession = {
      id: "automate-auth",
      name: "Auth run",
      createdAt: "2026-05-25T12:00:00.000Z",
      updatedAt: "2026-05-25T12:00:01.000Z",
      status: "completed",
      draft: { method: "GET", url: "https://example.com/api?role={{payload:role}}", headers: {}, body: "" },
      environmentId: "",
      payloadSetId: payloadSet.id,
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
      results: [],
      clusters: []
    };

    store.setAutomatePayloadSets(context.workspace.id, [payloadSet]);
    store.upsertAutomateSession(context.session.id, automateSession);
    store.close();

    const reopened = openLocalStore(tmpDir);
    expect(reopened.listAutomatePayloadSets(context.workspace.id)).toEqual([payloadSet]);
    expect(reopened.listAutomateSessions(context.session.id)).toEqual([automateSession]);
    expect(reopened.getAutomateSession(context.session.id, automateSession.id)).toEqual(automateSession);
    reopened.close();
  });

  it("persists findings per local session", () => {
    const store = makeStore();
    const context = store.getActiveContext();
    const finding: Finding = {
      id: "finding-1",
      title: "Missing security headers",
      templateId: "headers",
      severity: "low",
      confidence: "high",
      status: "reviewed",
      affectedAssets: ["https://example.test"],
      evidence: [
        {
          id: "cap-1",
          kind: "capture",
          label: "GET https://example.test/",
          createdAt: "2026-05-25T12:00:00.000Z",
          metadata: { status: "200" }
        }
      ],
      reproductionSteps: "Request the landing page.",
      impact: "Browser hardening is reduced.",
      remediation: "Add HSTS and frame protections.",
      notes: "Reviewed manually.",
      owner: "web team",
      retestResult: "",
      source: "manual",
      createdAt: "2026-05-25T12:00:00.000Z",
      updatedAt: "2026-05-25T12:00:01.000Z",
      reviewedAt: "2026-05-25T12:00:01.000Z"
    };

    store.upsertFinding(context.session.id, finding);
    store.close();

    const reopened = openLocalStore(tmpDir);
    expect(reopened.listFindings(context.session.id)).toEqual([finding]);
    reopened.deleteFinding(context.session.id, finding.id);
    expect(reopened.listFindings(context.session.id)).toEqual([]);
    reopened.close();
  });

  it("persists workflow definitions per workspace and runs per session", () => {
    const store = makeStore();
    const context = store.getActiveContext();
    const workflow: WorkflowDefinition = {
      id: "workflow-security-headers",
      name: "Security Headers",
      description: "Check response hardening headers.",
      mode: "passive",
      builtIn: false,
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
      createdAt: "2026-05-25T12:00:00.000Z",
      updatedAt: "2026-05-25T12:00:00.000Z"
    };
    const run: WorkflowRun = {
      id: "workflow-run-1",
      workflowId: workflow.id,
      workflowName: workflow.name,
      sessionId: context.session.id,
      source: "manual",
      mode: "passive",
      status: "completed",
      inputs: {},
      startedAt: "2026-05-25T12:01:00.000Z",
      completedAt: "2026-05-25T12:01:01.000Z",
      stepCount: 1,
      actionCount: 0,
      results: [
        {
          id: "workflow-result-1",
          stepId: "headers",
          stepTitle: "Headers",
          level: "warn",
          title: "Missing security headers",
          message: "Missing HSTS.",
          evidence: [],
          details: {},
          createdAt: "2026-05-25T12:01:00.000Z"
        }
      ]
    };

    store.setWorkflowDefinitions(context.workspace.id, [workflow]);
    store.upsertWorkflowRun(context.session.id, run);
    store.close();

    const reopened = openLocalStore(tmpDir);
    expect(reopened.listWorkflowDefinitions(context.workspace.id)).toEqual([workflow]);
    expect(reopened.listWorkflowRuns(context.session.id)).toEqual([run]);
    reopened.deleteWorkflowDefinition(context.workspace.id, workflow.id);
    expect(reopened.listWorkflowDefinitions(context.workspace.id)).toEqual([]);
    reopened.close();
  });

  it("persists plugin registry records per workspace", () => {
    const store = makeStore();
    const context = store.getActiveContext();
    const plugin: InstalledPlugin = {
      id: "jwt-helper",
      manifest: {
        schemaVersion: 1,
        id: "jwt-helper",
        name: "JWT Helper",
        version: "1.0.0",
        description: "Decode token-shaped values.",
        author: "Radar",
        sdkVersion: "0.1",
        minRadarVersion: "",
        entry: "dist/index.js",
        permissions: ["captures:read", "ui:panel"],
        panels: [{ id: "token-panel", title: "Token Panel", entry: "panel.html" }]
      },
      sourcePath: "/tmp/jwt-helper",
      grantedPermissions: [],
      status: "pending",
      warnings: [],
      installedAt: "2026-05-25T12:00:00.000Z",
      updatedAt: "2026-05-25T12:00:00.000Z"
    };

    store.upsertPlugin(context.workspace.id, plugin);
    const approved = store.approvePlugin(context.workspace.id, plugin.id, ["captures:read", "files:read"]);
    expect(approved.status).toBe("approved");
    expect(approved.grantedPermissions).toEqual(["captures:read"]);

    store.setPluginStatus(context.workspace.id, plugin.id, "disabled");
    store.close();

    const reopened = openLocalStore(tmpDir);
    expect(reopened.listPlugins(context.workspace.id)).toEqual([
      expect.objectContaining({
        id: "jwt-helper",
        status: "disabled",
        grantedPermissions: ["captures:read"]
      })
    ]);
    expect(reopened.deletePlugin(context.workspace.id, plugin.id)).toEqual([]);
    reopened.close();
  });

  it("creates, saves, and loads profiles with isolated workspace targets", () => {
    const store = makeStore();
    const first = store.getActiveContext();
    store.setTargets(first.workspace.id, ["https://first.test"]);

    const second = store.createProfileContext("Second Operator");
    store.setTargets(second.workspace.id, ["https://second.test"]);
    const savedProfile = store.updateProfile(second.profile.id, "Client Alpha");

    expect(savedProfile.name).toBe("Client Alpha");
    expect(store.listProfiles().map((profile) => profile.id)).toEqual(
      expect.arrayContaining([first.profile.id, second.profile.id])
    );
    expect(store.getActiveContext().profile.id).toBe(second.profile.id);
    expect(store.getTargets(second.workspace.id)).toEqual(["https://second.test"]);

    const loadedFirst = store.loadProfile(first.profile.id);

    expect(loadedFirst.profile.id).toBe(first.profile.id);
    expect(loadedFirst.session.id).toBe(first.session.id);
    expect(store.getActiveContext().profile.id).toBe(first.profile.id);
    expect(store.getTargets(loadedFirst.workspace.id)).toEqual(["https://first.test"]);

    store.close();
  });

  it("lists, saves, and loads sessions without deleting previous session data", () => {
    const store = makeStore();
    const context = store.getActiveContext();
    const capture: CapturedRequest = {
      id: "cap-session-1",
      startedAt: "2026-05-25T12:00:00.000Z",
      method: "GET",
      url: "https://example.com/session",
      host: "example.com",
      path: "/session",
      requestHeaders: {},
      requestBody: "",
      status: 200,
      statusText: "OK",
      mimeType: "text/plain",
      type: "Fetch",
      responseHeaders: {},
      responseBody: "ok",
      durationMs: 24,
      allowed: true,
      source: "browser",
      tls: null
    };
    const event: SslEvent = {
      id: "ssl-session-1",
      url: "https://example.com",
      error: "certificate-error",
      trusted: false,
      createdAt: "2026-05-25T12:00:00.000Z"
    };

    store.upsertCapture(context.session.id, capture);
    store.insertSslEvent(context.session.id, event);
    const nextSession = store.createSession(context.workspace.id, "Retest");
    const savedSession = store.updateSession(nextSession.id, "Retest Named");

    expect(savedSession.name).toBe("Retest Named");
    expect(store.listSessions(context.profile.id)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: context.session.id, captureCount: 1, sslEventCount: 1 }),
        expect.objectContaining({ id: nextSession.id, name: "Retest Named", captureCount: 0, sslEventCount: 0 })
      ])
    );

    const loaded = store.loadSession(context.session.id);

    expect(loaded.session.id).toBe(context.session.id);
    expect(store.getActiveContext().session.id).toBe(context.session.id);
    expect(store.listCaptures(context.session.id, 10)).toEqual([capture]);
    expect(store.listSslEvents(context.session.id, 10)).toEqual([event]);

    store.close();
  });

  it("deletes a single capture from a session", () => {
    const store = makeStore();
    const context = store.getActiveContext();
    const first: CapturedRequest = {
      id: "cap-delete-1",
      startedAt: "2026-05-25T12:00:00.000Z",
      method: "GET",
      url: "https://example.com/one",
      host: "example.com",
      path: "/one",
      requestHeaders: {},
      requestBody: "",
      status: 200,
      statusText: "OK",
      mimeType: "text/plain",
      type: "Fetch",
      responseHeaders: {},
      responseBody: "one",
      durationMs: 12,
      allowed: true,
      source: "browser",
      tls: null
    };
    const second = { ...first, id: "cap-delete-2", url: "https://example.com/two", path: "/two", responseBody: "two" };

    store.upsertCapture(context.session.id, first);
    store.upsertCapture(context.session.id, second);
    store.deleteCapture(context.session.id, first.id);

    expect(store.listCaptures(context.session.id, 10)).toEqual([second]);

    store.close();
  });

  it("persists ai models per provider", () => {
    const store = makeStore();
    const saved = store.saveAiModels("cursor-local", [
      { id: "auto", label: "auto" },
      { id: "gpt-5", label: "gpt-5" }
    ]);

    expect(saved).toEqual([
      { id: "auto", label: "auto" },
      { id: "gpt-5", label: "gpt-5" }
    ]);
    store.close();

    const reopened = openLocalStore(tmpDir);
    expect(reopened.listAiModels("cursor-local")).toEqual(saved);
    expect(reopened.listAiModels("codex-local")).toEqual([]);
    reopened.close();
  });

  it("returns an empty list for blank providers", () => {
    const store = makeStore();
    expect(store.saveAiModels("   ", [{ id: "auto", label: "auto" }])).toEqual([]);
    expect(store.listAiModels("")).toEqual([]);
    store.close();
  });

  it("skips blank model ids when saving", () => {
    const store = makeStore();
    const saved = store.saveAiModels("cursor-local", [
      { id: "[36m[39m", label: "ignored" },
      { id: "auto", label: "auto" }
    ]);

    expect(saved).toEqual([{ id: "auto", label: "auto" }]);
    store.close();
  });

  it("sanitizes ansi codes when reading stored models", () => {
    const store = makeStore();
    store.saveAiModels("cursor-local", [{ id: "[36mauto[39m", label: "[36mauto[39m" }]);
    store.close();

    const reopened = openLocalStore(tmpDir);
    expect(reopened.listAiModels("cursor-local")).toEqual([{ id: "auto", label: "auto" }]);
    reopened.close();
  });

  it("persists and clears websocket events per session", () => {
    const store = makeStore();
    const context = store.getActiveContext();
    const event: WebSocketEvent = {
      id: "ws-1",
      requestId: "request-1",
      createdAt: "2026-05-25T12:00:00.000Z",
      url: "wss://example.com/realtime",
      host: "example.com",
      direction: "received",
      opcode: 1,
      payloadData: "{\"event\":\"ready\"}",
      size: 17,
      status: 101,
      statusText: "Switching Protocols",
      requestHeaders: { Upgrade: "websocket" },
      responseHeaders: { Connection: "Upgrade" },
      initiator: "script",
      allowed: true
    };

    store.insertWebSocketEvent(context.session.id, event);
    expect(store.listWebSocketEvents(context.session.id, 10)).toEqual([event]);

    store.clearWebSocketEvents(context.session.id);
    expect(store.listWebSocketEvents(context.session.id, 10)).toEqual([]);

    store.close();
  });

  it("persists agent runs with timeline and findings", () => {
    const store = makeStore();
    const context = store.getActiveContext();
    const run: AgentRun = {
      id: "agent-1",
      sessionId: context.session.id,
      createdAt: "2026-05-25T00:00:00.000Z",
      updatedAt: "2026-05-25T00:00:01.000Z",
      goal: "Inspect target",
      status: "completed",
      policy: {
        maxRuntimeMs: 120000,
        maxSteps: 8,
        maxReplay: 1,
        maxCaptureSample: 20,
        allowRawContext: false
      },
      timeline: [{ id: "step-1", createdAt: "2026-05-25T00:00:00.000Z", note: "Run started." }],
      findings: [
        {
          id: "finding-1",
          createdAt: "2026-05-25T00:00:01.000Z",
          title: "Missing HSTS",
          confidence: "low",
          evidenceRefs: ["capture:cap-1"],
          notes: "Sampled HTTPS response did not include HSTS.",
          uncertainties: ["Review manually."]
        }
      ]
    };

    store.upsertAgentRun(context.session.id, run);
    store.close();

    const reopened = openLocalStore(tmpDir);
    expect(reopened.getAgentRun(context.session.id, run.id)).toEqual(run);
    expect(reopened.listAgentRuns(context.session.id)).toEqual([run]);
    reopened.close();
  });

  it("creates a fresh active session without deleting previous session data", () => {
    const store = makeStore();
    const context = store.getActiveContext();
    const event: SslEvent = {
      id: "ssl-1",
      url: "https://example.com",
      error: "certificate-error",
      trusted: false,
      subjectName: "example.com",
      issuerName: "Example CA",
      createdAt: "2026-05-25T12:00:00.000Z"
    };

    store.insertSslEvent(context.session.id, event);
    const nextSession = store.createSession(context.workspace.id, "Retest");

    expect(nextSession.id).not.toBe(context.session.id);
    expect(store.getActiveContext().session.id).toBe(nextSession.id);
    expect(store.listSslEvents(context.session.id, 10)).toEqual([event]);
    expect(store.listSslEvents(nextSession.id, 10)).toEqual([]);

    store.close();
  });

  it("persists repeater tabs, environments, and collections per workspace", () => {
    const store = makeStore();
    const context = store.getActiveContext();
    const tabState = store.getReplayTabState(context.workspace.id);
    store.setReplayTabState(context.workspace.id, {
      ...tabState,
      tabs: tabState.tabs.map((tab, index) =>
        index === 0 ? { ...tab, name: "Auth tab", draft: { ...tab.draft, url: "https://example.test/login" } } : tab
      )
    });
    store.setReplayEnvironments(context.workspace.id, [
      {
        id: "env-1",
        name: "Staging",
        variables: { token: "abc" },
        createdAt: "2026-05-25T12:00:00.000Z",
        updatedAt: "2026-05-25T12:00:00.000Z"
      }
    ]);
    store.setReplayCollections(context.workspace.id, [
      {
        id: "collection-1",
        name: "Auth",
        items: [
          {
            id: "item-1",
            name: "Login",
            draft: { method: "POST", url: "https://example.test/login", headers: {}, body: "{}" },
            tags: [],
            createdAt: "2026-05-25T12:00:00.000Z",
            updatedAt: "2026-05-25T12:00:00.000Z"
          }
        ],
        createdAt: "2026-05-25T12:00:00.000Z",
        updatedAt: "2026-05-25T12:00:00.000Z"
      }
    ]);

    store.close();
    const reopened = openLocalStore(tmpDir);
    expect(reopened.getReplayTabState(context.workspace.id).tabs[0].name).toBe("Auth tab");
    expect(reopened.listReplayEnvironments(context.workspace.id)[0]?.name).toBe("Staging");
    expect(reopened.listReplayCollections(context.workspace.id)[0]?.items[0]?.name).toBe("Login");
    reopened.close();
  });
});
