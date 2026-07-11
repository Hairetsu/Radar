import { describe, expect, it } from "vitest";
import type { CapturedRequest } from "./domain.js";
import {
  MAX_CAUSAL_ACTION_DURATION_MS,
  MAX_CAUSAL_WINDOW_MS,
  buildCausalEvidenceChains,
  normalizeCausalAction,
  sanitizeCausalDomSnapshot,
  type CausalAction,
  type CausalCapturedRequest
} from "./causalEvidence.js";

const START = "2026-07-10T12:00:00.000Z";

function timestamp(offsetMs: number) {
  return new Date(Date.parse(START) + offsetMs).toISOString();
}

function action(overrides: Partial<CausalAction> = {}): CausalAction {
  return {
    id: overrides.id || "action-1",
    runId: overrides.runId || "run-1",
    identityId: overrides.identityId || "user-a",
    activationId: overrides.activationId || "activation-a-1",
    navigationId: overrides.navigationId || "nav-1",
    sequenceRunId: overrides.sequenceRunId || "sequence-1",
    experimentId: overrides.experimentId || "experiment-1",
    kind: overrides.kind || "click",
    startedAt: overrides.startedAt || START,
    finishedAt: overrides.finishedAt || timestamp(500),
    url: overrides.url || "https://target.test/invoices",
    target: overrides.target || { selector: "#open", role: "button", name: "Open invoice" },
    inputs: overrides.inputs || []
  };
}

function capture(overrides: Partial<CausalCapturedRequest> = {}): CausalCapturedRequest {
  const base: CapturedRequest = {
    id: overrides.id || "capture-1",
    startedAt: overrides.startedAt || timestamp(100),
    method: overrides.method || "GET",
    url: overrides.url || "https://target.test/api/invoices/817",
    host: overrides.host || "target.test",
    path: overrides.path || "/api/invoices/817",
    requestHeaders: overrides.requestHeaders || {},
    requestBody: overrides.requestBody || "",
    status: overrides.status ?? 200,
    statusText: overrides.statusText || "OK",
    mimeType: overrides.mimeType || "application/json",
    type: overrides.type || "fetch",
    responseHeaders: overrides.responseHeaders || { "content-type": "application/json" },
    responseBody: overrides.responseBody ?? '{"invoice":817}',
    durationMs: overrides.durationMs ?? 10,
    allowed: overrides.allowed ?? true,
    source: overrides.source || "browser",
    agentRunId: overrides.agentRunId || "run-1",
    navigationId: overrides.navigationId,
    frameUrl: overrides.frameUrl,
    initiator: overrides.initiator
  };
  return {
    ...base,
    ...(overrides.actionId ? { actionId: overrides.actionId } : {}),
    ...(overrides.identityId ? { identityId: overrides.identityId } : { identityId: "user-a" }),
    ...(overrides.activationId ? { activationId: overrides.activationId } : { activationId: "activation-a-1" }),
    ...(overrides.sequenceRunId ? { sequenceRunId: overrides.sequenceRunId } : { sequenceRunId: "sequence-1" }),
    ...(overrides.experimentId ? { experimentId: overrides.experimentId } : { experimentId: "experiment-1" })
  };
}

describe("buildCausalEvidenceChains", () => {
  it("builds exact, correlated, and inferred fanout under one action", () => {
    const domSnapshot = sanitizeCausalDomSnapshot({
      id: "dom-after",
      actionId: "action-1",
      runId: "run-1",
      identityId: "user-a",
      activationId: "activation-a-1",
      navigationId: "nav-1",
      sequenceRunId: "sequence-1",
      experimentId: "experiment-1",
      phase: "after",
      capturedAt: timestamp(400),
      url: "https://target.test/invoices/817",
      summary: "Invoice 817 is visible."
    });
    expect(domSnapshot).not.toBeNull();
    const graph = buildCausalEvidenceChains({
      actions: [action()],
      captures: [
        capture({ id: "exact", actionId: "action-1", startedAt: timestamp(100) }),
        capture({ id: "script", navigationId: "nav-1", startedAt: timestamp(200) }),
        capture({ id: "image", navigationId: "nav-1", startedAt: timestamp(300), type: "image" }),
        capture({ id: "inferred", navigationId: undefined, startedAt: timestamp(350) })
      ],
      domSnapshots: [domSnapshot!]
    });

    expect(graph.chains).toHaveLength(1);
    expect(graph.chains[0].captures.map((link) => [link.capture.id, link.classification])).toEqual([
      ["exact", "exact"],
      ["script", "correlated"],
      ["image", "correlated"],
      ["inferred", "inferred"]
    ]);
    expect(graph.chains[0].domSnapshots).toEqual([
      expect.objectContaining({
        classification: "exact",
        actionId: "action-1",
        snapshot: expect.objectContaining({ id: "dom-after" })
      })
    ]);
    expect(graph.unmatchedCaptures).toEqual([]);
  });

  it("rejects false linkage across identity and run boundaries", () => {
    const graph = buildCausalEvidenceChains({
      actions: [action()],
      captures: [
        capture({ id: "wrong-identity", navigationId: "nav-1", identityId: "user-b" }),
        capture({ id: "wrong-run", navigationId: "nav-1", agentRunId: "run-2" })
      ]
    });

    expect(graph.chains[0].captures).toEqual([]);
    expect(graph.unmatchedCaptures.map((link) => [link.capture.id, link.reason])).toEqual([
      ["wrong-identity", "boundary-mismatch"],
      ["wrong-run", "boundary-mismatch"]
    ]);
  });

  it("preserves unmatched background traffic", () => {
    const background = capture({
      id: "background",
      navigationId: "nav-background",
      url: "https://telemetry.target.test/collect",
      host: "telemetry.target.test",
      path: "/collect",
      initiator: "script"
    });
    const graph = buildCausalEvidenceChains({ actions: [action()], captures: [background] });

    expect(graph.chains[0].captures).toEqual([]);
    expect(graph.unmatchedCaptures).toHaveLength(1);
    expect(graph.unmatchedCaptures[0]).toMatchObject({
      classification: "unmatched",
      reason: "unknown-navigation",
      capture: { id: "background", initiator: "script" }
    });
  });

  it("clamps correlation windows and action durations", () => {
    const longAction = action({ finishedAt: timestamp(MAX_CAUSAL_ACTION_DURATION_MS * 4) });
    const graph = buildCausalEvidenceChains({
      actions: [longAction],
      captures: [
        capture({ id: "inside", navigationId: "nav-1", startedAt: timestamp(MAX_CAUSAL_ACTION_DURATION_MS + MAX_CAUSAL_WINDOW_MS) }),
        capture({ id: "outside", navigationId: "nav-1", startedAt: timestamp(MAX_CAUSAL_ACTION_DURATION_MS + MAX_CAUSAL_WINDOW_MS + 1) }),
        capture({ id: "before", navigationId: "nav-1", startedAt: timestamp(-1) })
      ],
      beforeMs: -50,
      afterMs: MAX_CAUSAL_WINDOW_MS * 10
    });

    expect(graph.window).toEqual({
      beforeMs: 0,
      afterMs: MAX_CAUSAL_WINDOW_MS,
      maxActionDurationMs: MAX_CAUSAL_ACTION_DURATION_MS
    });
    expect(graph.chains[0].captures.map((link) => link.capture.id)).toEqual(["inside"]);
    expect(graph.unmatchedCaptures.map((link) => [link.capture.id, link.reason])).toEqual([
      ["before", "outside-window"],
      ["outside", "outside-window"]
    ]);
  });

  it("orders actions, linked captures, and unmatched captures deterministically", () => {
    const graph = buildCausalEvidenceChains({
      actions: [
        action({ id: "action-b", navigationId: "nav-b", startedAt: timestamp(2_000), finishedAt: timestamp(2_100) }),
        action({ id: "action-a", navigationId: "nav-a", startedAt: timestamp(1_000), finishedAt: timestamp(1_100) })
      ],
      captures: [
        capture({ id: "linked-z", actionId: "action-a", startedAt: timestamp(1_200) }),
        capture({ id: "unmatched-z", navigationId: "unknown-z", startedAt: timestamp(4_000) }),
        capture({ id: "linked-a", actionId: "action-a", startedAt: timestamp(1_200) }),
        capture({ id: "unmatched-a", navigationId: "unknown-a", startedAt: timestamp(3_000) })
      ]
    });

    expect(graph.chains.map((chain) => chain.action.id)).toEqual(["action-a", "action-b"]);
    expect(graph.chains[0].captures.map((link) => link.capture.id)).toEqual(["linked-a", "linked-z"]);
    expect(graph.unmatchedCaptures.map((link) => link.capture.id)).toEqual(["unmatched-a", "unmatched-z"]);
  });
});

describe("causal evidence normalization", () => {
  it("redacts DOM secrets and hashes value-like input content", () => {
    const normalizedAction = normalizeCausalAction({
      id: "action-secret",
      runId: "run-1",
      identityId: "user-a",
      activationId: "activation-a-1",
      navigationId: "nav-1",
      sequenceRunId: "sequence-1",
      experimentId: "experiment-1",
      kind: "submit",
      startedAt: START,
      finishedAt: timestamp(MAX_CAUSAL_ACTION_DURATION_MS * 2),
      url: "https://target.test/login?username=alice&token=top-secret",
      target: { selector: 'input[value="hunter2"]', role: "textbox", name: "Password: hunter2" },
      inputs: [
        { name: "password", type: "password", selector: "#password", value: "hunter2" },
        { name: "api_key", type: "text", selector: "#key", value: "sk-live-secret" }
      ]
    });
    const snapshot = sanitizeCausalDomSnapshot({
      id: "dom-secret",
      actionId: "action-secret",
      runId: "run-1",
      identityId: "user-a",
      activationId: "activation-a-1",
      navigationId: "nav-1",
      sequenceRunId: "sequence-1",
      experimentId: "experiment-1",
      phase: "after",
      capturedAt: timestamp(200),
      url: "https://target.test/account?session=raw-session-id",
      title: "Account token=title-secret",
      summary: "password=hunter2 Authorization: Bearer eyJabcdef.abcdef123.abcdef456 cookie=session-secret",
      inputs: [{ name: "session_token", type: "hidden", value: "dom-secret-value" }]
    });

    expect(normalizedAction).not.toBeNull();
    expect(snapshot).not.toBeNull();
    const serialized = JSON.stringify({ normalizedAction, snapshot });
    for (const secret of [
      "hunter2",
      "top-secret",
      "sk-live-secret",
      "raw-session-id",
      "title-secret",
      "session-secret",
      "dom-secret-value"
    ]) {
      expect(serialized).not.toContain(secret);
    }
    expect(normalizedAction?.inputs[0].valueHash).toMatch(/^h1:[0-9a-f]{16}$/);
    expect(snapshot?.inputs[0].valueHash).toMatch(/^h1:[0-9a-f]{16}$/);
    expect(normalizedAction?.finishedAt).toBe(timestamp(MAX_CAUSAL_ACTION_DURATION_MS));
    expect(snapshot?.summary).toContain("[redacted]");
  });
});
