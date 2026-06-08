import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { afterEach, describe, expect, it } from "vitest";
import type { AgentRun } from "../shared/agent-types.js";
import type { CapturedRequest, Finding, WebSocketEvent } from "../shared/domain.js";
import { openLocalStore } from "./localStore.js";

const CAPTURE_COUNT = 900;
const WEBSOCKET_COUNT = 1500;
const FINDING_COUNT = 300;
const AGENT_RUN_COUNT = 60;
const AGENT_TIMELINE_COUNT = 20;
const LARGE_DATASET_BUDGET_MS = 7000;

function timestamp(offsetSeconds: number) {
  return new Date(Date.UTC(2026, 4, 25, 12, 0, offsetSeconds)).toISOString();
}

function capture(index: number): CapturedRequest {
  const createdAt = timestamp(index);
  const id = `cap-${String(index).padStart(4, "0")}`;
  return {
    id,
    startedAt: createdAt,
    method: index % 5 === 0 ? "POST" : "GET",
    url: `https://large.example.test/api/items/${index}?page=${index % 10}`,
    host: "large.example.test",
    path: `/api/items/${index}?page=${index % 10}`,
    requestHeaders: index % 5 === 0 ? { Authorization: "Bearer large-dataset" } : {},
    requestBody: index % 5 === 0 ? "{\"active\":true}" : "",
    status: index % 17 === 0 ? 500 : 200,
    statusText: index % 17 === 0 ? "Server Error" : "OK",
    mimeType: "application/json",
    type: "Fetch",
    responseHeaders: { "content-type": "application/json" },
    responseBody: `{"index":${index}}`,
    durationMs: 20 + (index % 50),
    encodedDataLength: 20,
    allowed: true,
    source: "browser",
    tls: null
  };
}

function webSocketEvent(index: number): WebSocketEvent {
  const createdAt = timestamp(index);
  return {
    id: `ws-${String(index).padStart(4, "0")}`,
    requestId: `request-${Math.floor(index / 10)}`,
    createdAt,
    url: "wss://large.example.test/realtime",
    host: "large.example.test",
    direction: index % 2 === 0 ? "sent" : "received",
    opcode: 1,
    payloadData: `{"index":${index},"channel":"bulk"}`,
    size: 32,
    requestHeaders: {},
    responseHeaders: {},
    initiator: "large-dataset",
    allowed: true
  };
}

function finding(index: number): Finding {
  const createdAt = timestamp(index);
  const id = `finding-${String(index).padStart(4, "0")}`;
  return {
    id,
    title: `Large dataset finding ${index}`,
    severity: index % 7 === 0 ? "high" : "low",
    confidence: "medium",
    status: index % 3 === 0 ? "reviewed" : "draft",
    affectedAssets: ["https://large.example.test"],
    evidence: [
      {
        id: `cap-${String(index % CAPTURE_COUNT).padStart(4, "0")}`,
        kind: "capture",
        label: "GET https://large.example.test/api/items",
        createdAt,
        metadata: { status: "200" }
      }
    ],
    reproductionSteps: "Review the referenced large-dataset capture.",
    impact: "Synthetic large-dataset coverage.",
    remediation: "Keep local store list paths capped and indexed.",
    notes: "",
    owner: "qa",
    retestResult: "",
    source: "manual",
    createdAt,
    updatedAt: createdAt,
    reviewedAt: index % 3 === 0 ? createdAt : undefined
  };
}

function agentRun(index: number, sessionId: string): AgentRun {
  const createdAt = timestamp(index);
  const id = `agent-${String(index).padStart(4, "0")}`;
  return {
    id,
    sessionId,
    createdAt,
    updatedAt: createdAt,
    goal: `Large dataset agent run ${index}`,
    profileId: "passive-map",
    status: "completed",
    policy: {
      maxRuntimeMs: 120000,
      maxSteps: AGENT_TIMELINE_COUNT,
      maxReplay: 0,
      maxWorkflowRequests: 0,
      maxCaptureSample: 50,
      allowRawContext: false
    },
    timeline: Array.from({ length: AGENT_TIMELINE_COUNT }, (_item, timelineIndex) => ({
      id: `${id}-step-${String(timelineIndex).padStart(2, "0")}`,
      createdAt: timestamp(index + timelineIndex),
      note: `Step ${timelineIndex}`
    })),
    findings: [
      {
        id: `${id}-finding`,
        createdAt,
        title: "Large dataset agent observation",
        confidence: "low",
        evidenceRefs: [`capture:cap-${String(index % CAPTURE_COUNT).padStart(4, "0")}`],
        notes: "Synthetic agent finding for timeline persistence.",
        uncertainties: ["Performance regression guard only."]
      }
    ]
  };
}

describe("localStore large datasets", () => {
  let tmpDir = "";

  afterEach(() => {
    if (tmpDir) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = "";
    }
  });

  it("keeps high-volume evidence and agent timeline reads capped and indexed", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "radar-local-store-large-"));
    const store = openLocalStore(tmpDir);
    const context = store.getActiveContext();
    const started = performance.now();

    for (let index = 0; index < CAPTURE_COUNT; index += 1) {
      store.upsertCapture(context.session.id, capture(index));
    }
    for (let index = 0; index < WEBSOCKET_COUNT; index += 1) {
      store.insertWebSocketEvent(context.session.id, webSocketEvent(index));
    }
    for (let index = 0; index < FINDING_COUNT; index += 1) {
      store.upsertFinding(context.session.id, finding(index));
    }
    for (let index = 0; index < AGENT_RUN_COUNT; index += 1) {
      store.upsertAgentRun(context.session.id, agentRun(index, context.session.id));
    }

    const captures = store.listCaptures(context.session.id, 400);
    const frames = store.listWebSocketEvents(context.session.id, 1000);
    const findings = store.listFindings(context.session.id);
    const runs = store.listAgentRuns(context.session.id, 100);
    const latestRun = store.getAgentRun(context.session.id, "agent-0059");
    const elapsed = performance.now() - started;

    expect(captures).toHaveLength(400);
    expect(captures[0]?.id).toBe("cap-0899");
    expect(frames).toHaveLength(1000);
    expect(frames[0]?.id).toBe("ws-1499");
    expect(findings).toHaveLength(FINDING_COUNT);
    expect(findings[0]?.id).toBe("finding-0299");
    expect(runs).toHaveLength(AGENT_RUN_COUNT);
    expect(runs[0]?.id).toBe("agent-0059");
    expect(latestRun?.timeline).toHaveLength(AGENT_TIMELINE_COUNT);
    expect(elapsed).toBeLessThan(LARGE_DATASET_BUDGET_MS);

    store.close();
  });
});
