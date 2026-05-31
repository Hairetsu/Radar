import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_ALLOWLIST } from "../shared/allowlist.js";
import type { AgentRun } from "../shared/agent-types.js";
import type { CapturedRequest, SslEvent, WebSocketEvent } from "../shared/domain.js";
import { openLocalStore } from "./localStore.js";

describe("localStore", () => {
  let tmpDir = "";

  afterEach(() => {
    if (tmpDir) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = "";
    }
  });

  function makeStore() {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "radar-local-store-"));
    return openLocalStore(tmpDir);
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
});
