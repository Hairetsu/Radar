import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_ALLOWLIST } from "../shared/allowlist.js";
import type { AgentRun } from "../shared/agent-types.js";
import { createAgentMission } from "../shared/agentMission.js";
import {
  authorizeAgentCapability,
  createAgentCapabilityState,
  grantAgentCapabilityLease,
  proposeAgentCapabilityLease
} from "../shared/agentCapabilities.js";
import {
  MAX_IDENTITY_PROFILES,
  type IdentityActivationRecord,
  type IdentityProfile
} from "../shared/identityProfiles.js";
import type {
  AutomatePayloadSet,
  AutomateSession,
  CapturedRequest,
  Finding,
  InstalledPlugin,
  ProjectNote,
  SavedView,
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

  function identityProfile(
    workspaceId: string,
    id: string,
    overrides: Partial<IdentityProfile> = {}
  ): IdentityProfile {
    return {
      id,
      workspaceId,
      label: `Identity ${id}`,
      kind: "user",
      roleLabel: "member",
      tenantLabel: "tenant-a",
      origin: "https://example.test",
      notes: "Metadata only.",
      isolation: "dedicated-profile",
      health: "unknown",
      refreshMode: "manual",
      jarRevision: 0,
      containerId: `container-${id}`,
      createdAt: "2026-07-10T12:00:00.000Z",
      updatedAt: "2026-07-10T12:00:00.000Z",
      ...overrides
    };
  }

  function identityActivation(
    sessionId: string,
    workspaceId: string,
    identityId: string,
    overrides: Partial<IdentityActivationRecord> = {}
  ): IdentityActivationRecord {
    return {
      id: `activation-${identityId}`,
      sessionId,
      workspaceId,
      identityId,
      startedAt: "2026-07-10T12:05:00.000Z",
      status: "starting",
      browserInstanceId: `browser-${identityId}`,
      ...overrides
    };
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
      profileId: "passive-map",
      status: "completed",
      policy: {
        maxRuntimeMs: 120000,
        maxSteps: 4,
        maxReplay: 0,
        maxWorkflowRequests: 0,
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
      trustLevel: "first-party",
      compatibilityWarnings: [],
      warnings: [],
      installedAt: "2026-05-25T12:00:00.000Z",
      updatedAt: "2026-05-25T12:00:00.000Z"
    };
  }

  function crashProjectNote(): ProjectNote {
    return {
      id: "note-crash",
      title: "Crash-safe note",
      body: "A partial project note write should roll back.",
      createdAt: "2026-05-25T12:00:00.000Z",
      updatedAt: "2026-05-25T12:00:00.000Z"
    };
  }

  function crashSavedView(): SavedView {
    return {
      id: "view-crash",
      name: "Crash-safe view",
      view: "traffic",
      description: "A partial saved view write should roll back.",
      state: { trafficQuery: "status:500" },
      createdAt: "2026-05-25T12:00:00.000Z",
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

  it("migrates schema 19 with metadata-only identity and activation tables", () => {
    const store = makeStore();
    const context = store.getActiveContext();
    store.close();

    execRawDatabase(`
      DROP TABLE session_identity_activations;
      DROP TABLE workspace_identity_profiles;
      DELETE FROM schema_migrations;
      INSERT INTO schema_migrations (version, name, applied_at)
      VALUES (19, 'capability-leases', '2026-07-10T12:00:00.000Z');
      UPDATE meta SET value = '19' WHERE key = 'schema_version';
    `);

    const reopened = openLocalStore(tmpDir);
    expect(reopened.getActiveContext()).toMatchObject({
      profile: { id: context.profile.id },
      workspace: { id: context.workspace.id },
      session: { id: context.session.id }
    });
    reopened.close();

    const db = new DatabaseSync(databasePath());
    try {
      const tables = db
        .prepare(`
          SELECT name FROM sqlite_master
          WHERE type = 'table' AND name IN ('workspace_identity_profiles', 'session_identity_activations')
          ORDER BY name ASC
        `)
        .all() as Array<{ name: string }>;
      expect(tables.map((row) => row.name)).toEqual([
        "session_identity_activations",
        "workspace_identity_profiles"
      ]);
      const identityColumns = db
        .prepare("PRAGMA table_info(workspace_identity_profiles)")
        .all() as Array<{ name: string }>;
      expect(identityColumns.map((column) => column.name)).toEqual([
        "workspace_id",
        "id",
        "updated_at",
        "archived_at",
        "profile_json"
      ]);
      expect(identityColumns.map((column) => column.name).join(" ")).not.toMatch(
        /cookie|storage|profile_dir|file_path/i
      );
    } finally {
      db.close();
    }

    expect(readMigrationMetadata()).toEqual({
      metaVersion: String(LOCAL_STORE_SCHEMA_VERSION),
      migrations: [
        { version: 19, name: "capability-leases" },
        { version: LOCAL_STORE_SCHEMA_VERSION, name: "current-workbench-schema" }
      ]
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

  it("rolls back workspace-scoped records when workspace metadata cannot be updated", () => {
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
    expect(() => reopened.upsertProjectNote(context.workspace.id, crashProjectNote())).toThrow(/blocked workspace touch/);
    expect(() => reopened.upsertSavedView(context.workspace.id, crashSavedView())).toThrow(/blocked workspace touch/);
    expect(reopened.listPlugins(context.workspace.id)).toEqual([]);
    expect(reopened.listProjectNotes(context.workspace.id)).toEqual([]);
    expect(reopened.listSavedViews(context.workspace.id)).toEqual([]);
    reopened.close();
  });

  it("persists project notes and saved views across store instances", () => {
    const store = makeStore();
    const context = store.getActiveContext();
    const note = store.upsertProjectNote(context.workspace.id, {
      id: "note-1",
      title: "Auth review",
      body: "Remember to retest the session refresh endpoint.",
      createdAt: "2026-05-25T12:00:00.000Z",
      updatedAt: "2026-05-25T12:00:00.000Z"
    });
    const view = store.upsertSavedView(context.workspace.id, {
      id: "view-1",
      name: "Refresh traffic",
      view: "traffic",
      description: "Saved filter and selected request for session refresh.",
      state: { trafficQuery: "path:/api/session", selectedCaptureId: "cap-1" },
      createdAt: "2026-05-25T12:00:00.000Z",
      updatedAt: "2026-05-25T12:00:00.000Z"
    });
    store.close();

    const reopened = openLocalStore(tmpDir);
    expect(reopened.listProjectNotes(context.workspace.id)).toEqual([note]);
    expect(reopened.listSavedViews(context.workspace.id)).toEqual([view]);

    reopened.deleteProjectNote(context.workspace.id, note.id);
    reopened.deleteSavedView(context.workspace.id, view.id);
    expect(reopened.listProjectNotes(context.workspace.id)).toEqual([]);
    expect(reopened.listSavedViews(context.workspace.id)).toEqual([]);
    reopened.close();
  });

  it("persists project-scoped agent run memory across store instances", () => {
    const store = makeStore();
    const context = store.getActiveContext();
    const memory = store.upsertAgentRunMemory(context.workspace.id, {
      id: "memory-1",
      createdAt: "2026-05-25T12:00:00.000Z",
      updatedAt: "2026-05-25T12:00:00.000Z",
      kind: "hypothesis",
      status: "confirmed",
      title: "Header redirect hypothesis",
      notes: "Tested canonical redirect path and keep this for retest.",
      sourceRunId: "agent-1",
      evidenceRefs: ["capture:cap-1"],
      retestState: "pending"
    });
    store.close();

    const reopened = openLocalStore(tmpDir);
    expect(reopened.listAgentRunMemory(context.workspace.id)).toEqual([memory]);
    const dismissed = reopened.upsertAgentRunMemory(context.workspace.id, {
      ...memory,
      status: "dismissed",
      dismissedReason: "Retest showed configured behavior.",
      updatedAt: "2026-05-25T12:01:00.000Z"
    });
    expect(reopened.listAgentRunMemory(context.workspace.id)[0]).toEqual(dismissed);
    expect(reopened.deleteAgentRunMemory(context.workspace.id, memory.id)).toEqual([]);
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
      actionId: "action-1",
      identityId: "identity-user-a",
      activationId: "activation-user-a-1",
      sequenceRunId: "sequence-run-1",
      experimentId: "experiment-1",
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
    expect(reopened.getCapture(context.session.id, capture.id)).toEqual(capture);
    expect(reopened.getCapture(context.session.id, "missing")).toBeNull();

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
      component: "",
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
      assignee: "",
      retestResult: "",
      source: "manual",
      sourceId: undefined,
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

  it("round-trips metadata-only identity profiles and append-only activation lifecycles", () => {
    const store = makeStore();
    const context = store.getActiveContext();
    const profile = identityProfile(context.workspace.id, "identity-user-a");

    expect(store.upsertIdentityProfile(context.workspace.id, profile)).toEqual(profile);
    expect(store.getIdentityProfile(context.workspace.id, profile.id)).toEqual(profile);
    expect(store.listIdentityProfiles(context.workspace.id)).toEqual([profile]);

    const starting = identityActivation(context.session.id, context.workspace.id, profile.id);
    const active: IdentityActivationRecord = {
      ...starting,
      status: "active",
      authFingerprint: "fingerprint-a"
    };
    const ended: IdentityActivationRecord = {
      ...active,
      status: "ended",
      endedAt: "2026-07-10T12:10:00.000Z"
    };
    expect(store.upsertIdentityActivation(context.session.id, starting)).toEqual(starting);
    expect(store.upsertIdentityActivation(context.session.id, active)).toEqual(active);
    expect(store.upsertIdentityActivation(context.session.id, ended)).toEqual(ended);
    expect(store.listIdentityActivations(context.session.id)).toEqual([ended]);

    const archived = store.archiveIdentityProfile(
      context.workspace.id,
      profile.id,
      "2026-07-10T12:15:00.000Z"
    );
    expect(archived).toMatchObject({
      id: profile.id,
      archivedAt: "2026-07-10T12:15:00.000Z",
      updatedAt: "2026-07-10T12:15:00.000Z"
    });
    expect(() =>
      store.upsertIdentityActivation(
        context.session.id,
        identityActivation(context.session.id, context.workspace.id, profile.id, {
          id: "activation-after-archive"
        })
      )
    ).toThrow(/Archived identity profile cannot be activated/);
    expect(store.listIdentityProfiles(context.workspace.id)).toEqual([]);
    expect(store.listIdentityProfiles(context.workspace.id, { includeArchived: true })).toEqual([archived]);
    store.close();

    const db = new DatabaseSync(databasePath());
    try {
      const persisted = db
        .prepare("SELECT profile_json FROM workspace_identity_profiles WHERE id = ?")
        .get(profile.id) as { profile_json: string };
      expect(persisted.profile_json).not.toMatch(/cookies|localStorage|sessionStorage|profileDir|filePath/i);
    } finally {
      db.close();
    }

    const reopened = openLocalStore(tmpDir);
    expect(reopened.getIdentityProfile(context.workspace.id, profile.id)).toEqual(archived);
    expect(reopened.listIdentityActivations(context.session.id)).toEqual([ended]);
    reopened.close();
  });

  it("fails closed across workspaces, sessions, identities, and immutable activation fields", () => {
    const store = makeStore();
    const first = store.getActiveContext();
    const firstIdentity = identityProfile(first.workspace.id, "identity-shared-id");
    const alternateIdentity = identityProfile(first.workspace.id, "identity-alternate");
    store.upsertIdentityProfile(first.workspace.id, firstIdentity);
    store.upsertIdentityProfile(first.workspace.id, alternateIdentity);
    const firstActivation = identityActivation(first.session.id, first.workspace.id, firstIdentity.id, {
      id: "activation-global-id"
    });
    store.upsertIdentityActivation(first.session.id, firstActivation);

    const second = store.createProfileContext("Second Identity Project");
    const secondIdentity = identityProfile(second.workspace.id, "identity-second");
    store.upsertIdentityProfile(second.workspace.id, secondIdentity);

    expect(() => store.getIdentityProfile(second.workspace.id, firstIdentity.id)).toThrow(
      /does not belong to workspace/
    );
    expect(() =>
      store.upsertIdentityProfile(
        second.workspace.id,
        identityProfile(second.workspace.id, firstIdentity.id)
      )
    ).toThrow(/already belongs to another workspace/);
    expect(() =>
      store.upsertIdentityActivation(
        second.session.id,
        identityActivation(second.session.id, first.workspace.id, firstIdentity.id)
      )
    ).toThrow(/does not belong to session/);
    expect(() =>
      store.upsertIdentityActivation(
        second.session.id,
        identityActivation(second.session.id, second.workspace.id, "identity-missing")
      )
    ).toThrow(/does not belong to session workspace/);
    expect(() =>
      store.upsertIdentityActivation(
        second.session.id,
        identityActivation(second.session.id, second.workspace.id, secondIdentity.id, {
          id: firstActivation.id
        })
      )
    ).toThrow(/already belongs to another session/);
    expect(() =>
      store.upsertIdentityActivation(first.session.id, {
        ...firstActivation,
        identityId: alternateIdentity.id
      })
    ).toThrow(/immutable fields cannot change/);

    store.close();
  });

  it("enforces the workspace identity profile cap including archived metadata", () => {
    const store = makeStore();
    const context = store.getActiveContext();
    for (let index = 0; index < MAX_IDENTITY_PROFILES; index += 1) {
      store.upsertIdentityProfile(
        context.workspace.id,
        identityProfile(context.workspace.id, `identity-cap-${index}`)
      );
    }
    store.archiveIdentityProfile(
      context.workspace.id,
      "identity-cap-0",
      "2026-07-10T12:20:00.000Z"
    );

    expect(store.listIdentityProfiles(context.workspace.id, { includeArchived: true })).toHaveLength(
      MAX_IDENTITY_PROFILES
    );
    expect(() =>
      store.upsertIdentityProfile(
        context.workspace.id,
        identityProfile(context.workspace.id, "identity-over-cap")
      )
    ).toThrow(/Identity profile limit reached/);
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
      agentRunId: "run-1",
      navigationId: "nav-1",
      actionId: "action-1",
      identityId: "identity-user-a",
      activationId: "activation-user-a-1",
      sequenceRunId: "sequence-run-1",
      experimentId: "experiment-1",
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
    const proposedCapability = proposeAgentCapabilityLease(
      createAgentCapabilityState(),
      {
        name: "Exact navigation",
        riskTier: "navigate",
        tools: ["openBrowser"],
        grants: [{ origin: "https://example.test", method: "GET", pathPrefix: "/", identity: "current" }],
        durationMs: 60000,
        maxUses: 2,
        maxRequests: 2,
        maxConcurrency: 1,
        maxPayloadBytes: 0,
        reason: "Open the scoped target."
      },
      "lease-store",
      "2026-05-25T00:00:00.000Z"
    );
    if (!proposedCapability.ok) throw new Error(proposedCapability.error);
    const grantedCapability = grantAgentCapabilityLease(proposedCapability.state, "lease-store", {
      allowlist: ["https://example.test"],
      allowedTools: ["openBrowser"],
      authFingerprint: "auth-store",
      now: "2026-05-25T00:00:00.000Z"
    });
    if (!grantedCapability.ok) throw new Error(grantedCapability.error);
    const authorizedCapability = authorizeAgentCapability(
      grantedCapability.state,
      {
        tool: "openBrowser",
        url: "https://example.test/",
        method: "GET",
        identity: "current",
        requestCost: 1,
        concurrency: 1,
        payloadBytes: 0,
        allowlist: ["https://example.test"],
        authFingerprint: "auth-store"
      },
      "receipt-store",
      "2026-05-25T00:00:01.000Z"
    );
    if (!authorizedCapability.required) throw new Error("Expected a capability receipt.");
    const run: AgentRun = {
      id: "agent-1",
      sessionId: context.session.id,
      createdAt: "2026-05-25T00:00:00.000Z",
      updatedAt: "2026-05-25T00:00:01.000Z",
      goal: "Inspect target",
      profileId: "header-cookie-review",
      status: "completed",
      policy: {
        maxRuntimeMs: 120000,
        maxSteps: 8,
        maxReplay: 1,
        maxWorkflowRequests: 1,
        maxCaptureSample: 20,
        allowRawContext: false
      },
      checkpoint: {
        startUrl: "https://example.test",
        targetOrigin: "https://example.test",
        stepCount: 4,
        replayCount: 1,
        workflowRequestCount: 0,
        elapsedMs: 3200,
        lastResumedAt: "2026-05-25T00:00:01.000Z"
      },
      mission: createAgentMission("Inspect target", "https://example.test", "2026-05-25T00:00:00.000Z"),
      capabilities: authorizedCapability.state,
      timeline: [{ id: "step-1", createdAt: "2026-05-25T00:00:00.000Z", note: "Run started." }],
      findings: [
        {
          id: "finding-1",
          createdAt: "2026-05-25T00:00:01.000Z",
          title: "Missing HSTS",
          confidence: "low",
          evidenceRefs: ["capture:cap-1"],
          notes: "Sampled HTTPS response did not include HSTS.",
          affectedAssets: ["https://example.test"],
          reproductionNotes: "Inspect capture:cap-1 response headers.",
          severityRationale: "HSTS is absent on an HTTPS response.",
          remediation: "Add Strict-Transport-Security after confirming HTTPS-only operation.",
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

  it("migrates Mission Graph agent runs to deterministic capability-ledger storage", () => {
    const store = makeStore();
    const context = store.getActiveContext();
    const run: AgentRun = {
      id: "agent-legacy-mission",
      sessionId: context.session.id,
      createdAt: "2026-05-25T00:00:00.000Z",
      updatedAt: "2026-05-25T00:00:01.000Z",
      goal: "Inspect https://legacy.example",
      profileId: "passive-map",
      status: "paused",
      policy: {
        maxRuntimeMs: 120000,
        maxSteps: 8,
        maxReplay: 1,
        maxWorkflowRequests: 1,
        maxCaptureSample: 20,
        allowRawContext: false
      },
      checkpoint: {
        startUrl: "https://legacy.example",
        targetOrigin: "https://legacy.example",
        stepCount: 2,
        replayCount: 0,
        workflowRequestCount: 0,
        elapsedMs: 1000,
        lastResumedAt: "2026-05-25T00:00:01.000Z"
      },
      timeline: [],
      findings: []
    };
    store.upsertAgentRun(context.session.id, run);
    store.close();

    execRawDatabase(`
      ALTER TABLE agent_runs DROP COLUMN capabilities_json;
      DELETE FROM schema_migrations;
      INSERT INTO schema_migrations (version, name, applied_at)
      VALUES (${LOCAL_STORE_SCHEMA_VERSION - 1}, 'agent-run-mission-graph', '2026-05-25T00:00:01.000Z');
      UPDATE meta SET value = '${LOCAL_STORE_SCHEMA_VERSION - 1}' WHERE key = 'schema_version';
    `);

    const reopened = openLocalStore(tmpDir);
    const migrated = reopened.getAgentRun(context.session.id, run.id);
    expect(migrated?.mission).toMatchObject({
      version: 1,
      revision: 0,
      goal: run.goal,
      createdAt: run.createdAt,
      objectives: [expect.objectContaining({ id: "obj-primary", status: "active" })],
      coverage: [expect.objectContaining({ dimension: "host", label: "https://legacy.example" })]
    });
    expect(migrated?.capabilities).toEqual(createAgentCapabilityState());
    reopened.close();

    expect(readMigrationMetadata()).toEqual({
      metaVersion: String(LOCAL_STORE_SCHEMA_VERSION),
      migrations: [
        { version: LOCAL_STORE_SCHEMA_VERSION - 1, name: "agent-run-mission-graph" },
        { version: LOCAL_STORE_SCHEMA_VERSION, name: "current-workbench-schema" }
      ]
    });
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

  it("persists plugin audit entries and workflow revision history", () => {
    const store = makeStore();
    const context = store.getActiveContext();
    const workflow: WorkflowDefinition = {
      id: "workflow-history",
      name: "Workflow History",
      description: "Exercises revision persistence.",
      mode: "passive",
      builtIn: false,
      inputs: [],
      scope: {
        requireInScope: true,
        allowActive: false,
        maxRequests: 0,
        timeoutMs: 10000,
        delayMs: 0,
        maxResults: 20
      },
      steps: [{ id: "headers", title: "Headers", kind: "security-headers", config: {} }],
      createdAt: "2026-05-25T12:00:00.000Z",
      updatedAt: "2026-05-25T12:00:00.000Z"
    };

    store.upsertWorkflowDefinition(context.workspace.id, workflow);
    store.upsertWorkflowDefinition(context.workspace.id, {
      ...workflow,
      name: "Workflow History Updated",
      updatedAt: "2026-05-25T12:01:00.000Z"
    });
    store.appendPluginAudit(context.workspace.id, {
      id: "plugin-audit-1",
      pluginId: "crash-plugin",
      pluginName: "Crash Plugin",
      action: "captures:list",
      permission: "captures:read",
      ok: true,
      message: "Plugin API action completed.",
      inputSummary: "{}",
      outputSummary: "[]",
      durationMs: 2,
      createdAt: "2026-05-25T12:02:00.000Z"
    });

    store.close();
    const reopened = openLocalStore(tmpDir);
    const revisions = reopened.listWorkflowRevisions(context.workspace.id, workflow.id);
    expect(revisions.length).toBeGreaterThanOrEqual(2);
    expect(revisions.some((revision) => revision.diff.some((entry) => entry.field === "name"))).toBe(true);
    expect(reopened.listPluginAudit(context.workspace.id)[0]).toMatchObject({
      pluginId: "crash-plugin",
      action: "captures:list",
      ok: true
    });
    reopened.close();
  });

  it("round-trips evidence annotation tag arrays", () => {
    const store = makeStore();
    const context = store.getActiveContext();

    store.saveEvidenceAnnotation(context.session.id, {
      evidenceId: "ws-annotation-1",
      kind: "websocket",
      tags: ["websocket", "review"],
      comment: "Retain structured tags.",
      updatedAt: "2026-05-25T12:00:00.000Z"
    });

    expect(store.listEvidenceAnnotations(context.session.id)).toContainEqual(
      expect.objectContaining({
        evidenceId: "ws-annotation-1",
        tags: ["websocket", "review"]
      })
    );
    store.close();
  });
});
