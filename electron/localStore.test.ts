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
