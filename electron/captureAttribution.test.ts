import { describe, expect, it } from "vitest";
import type { CapturedRequest } from "../shared/domain.js";
import { applyCaptureAttribution } from "./captureAttribution.js";

function capture(overrides: Partial<CapturedRequest> = {}): CapturedRequest {
  return {
    id: "request-1",
    startedAt: "2026-07-10T12:00:00.000Z",
    method: "GET",
    url: "https://allowed.test/account",
    host: "allowed.test",
    path: "/account",
    requestHeaders: {},
    requestBody: "",
    status: null,
    statusText: "",
    mimeType: "",
    type: "Fetch",
    responseHeaders: {},
    responseBody: "",
    durationMs: null,
    allowed: true,
    source: "browser",
    ...overrides
  };
}

describe("capture attribution", () => {
  it("stamps a new request with the active causal context", () => {
    expect(
      applyCaptureAttribution(capture(), undefined, {
        agentRunId: "run-1",
        navigationId: "nav-1",
        actionId: "action-1",
        identityId: "identity-user-a",
        activationId: "activation-1",
        sequenceRunId: "sequence-1",
        experimentId: "experiment-1"
      })
    ).toMatchObject({
      agentRunId: "run-1",
      navigationId: "nav-1",
      actionId: "action-1",
      identityId: "identity-user-a",
      activationId: "activation-1",
      sequenceRunId: "sequence-1",
      experimentId: "experiment-1"
    });
  });

  it("retains request-time lineage when a late response arrives under another action", () => {
    const existing = capture({ actionId: "action-original", identityId: "identity-user-a", status: null });
    const response = capture({ status: 200, responseBody: "{\"ok\":true}" });

    const attributed = applyCaptureAttribution(response, existing, {
      actionId: "action-later",
      identityId: "identity-admin"
    });

    expect(attributed.actionId).toBe("action-original");
    expect(attributed.identityId).toBe("identity-user-a");
    expect(attributed.status).toBe(200);
  });

  it("never overwrites lineage supplied by the capture producer", () => {
    const attributed = applyCaptureAttribution(
      capture({ actionId: "producer-action", identityId: "producer-identity" }),
      capture({ actionId: "existing-action", identityId: "existing-identity" }),
      { actionId: "active-action", identityId: "active-identity" }
    );

    expect(attributed.actionId).toBe("producer-action");
    expect(attributed.identityId).toBe("producer-identity");
  });
});
