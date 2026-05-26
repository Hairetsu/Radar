import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_ALLOWLIST } from "../shared/allowlist.js";
import type { CapturedRequest, SslEvent } from "../shared/domain.js";
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
