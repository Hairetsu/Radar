// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import type { InterceptQueueItem, InterceptState, ReplayDraft, WorkflowDefinition } from "../../../types";
import type { AgentTimelineIntent } from "./agentTimelineIntents";
import {
  applyAgentTimelineIntent,
  type AgentTimelineProjectionPorts
} from "./useAgentTimelineProjection";

const draft: ReplayDraft = {
  method: "GET",
  url: "https://target.example/account",
  headers: { accept: "application/json" },
  body: ""
};

const interceptItem: InterceptQueueItem = {
  ...draft,
  id: "intercept-1",
  captureId: "capture-1",
  stage: "request",
  queuedAt: "2026-07-31T00:00:00.000Z",
  host: "target.example",
  path: "/account",
  allowed: true,
  source: "proxy",
  note: "Paused for review",
  status: 200,
  statusText: "OK"
};

const workflow: WorkflowDefinition = {
  id: "workflow-1",
  name: "Header review",
  description: "Review response headers",
  mode: "passive",
  builtIn: false,
  inputs: [],
  scope: { requireInScope: true, allowActive: false, maxRequests: 1, timeoutMs: 5_000, delayMs: 0, maxResults: 10 },
  steps: [],
  createdAt: "2026-07-31T00:00:00.000Z",
  updatedAt: "2026-07-31T00:00:00.000Z"
};

function createPorts() {
  let interceptState: InterceptState = {
    config: { requestEnabled: true, responseEnabled: false },
    queue: []
  };
  const ports: AgentTimelineProjectionPorts = {
    setNotice: vi.fn(),
    setActiveView: vi.fn(),
    setDraft: vi.fn(),
    setHeadersText: vi.fn(),
    setLastResponse: vi.fn(),
    setLastBurst: vi.fn(),
    setSelectedId: vi.fn(),
    setSelectedIds: vi.fn(),
    selectionAnchorRef: { current: "" },
    setInterceptState: (update) => {
      interceptState = typeof update === "function" ? update(interceptState) : update;
    },
    setInterceptSelectedId: vi.fn(),
    interceptDraftItemRef: { current: "" },
    setInterceptDraft: vi.fn(),
    setInterceptHeadersText: vi.fn(),
    setInterceptResponseStatus: vi.fn(),
    setInterceptResponseStatusText: vi.fn(),
    hydrateInterceptDraft: vi.fn(),
    setTrafficSearch: vi.fn(),
    setReplayTabState: vi.fn(),
    setAutomatePayloadText: vi.fn(),
    setAutomateRulesText: vi.fn(),
    setAutomateSessionName: vi.fn(),
    setActiveAutomateSessionId: vi.fn(),
    setAutomateResultFilter: vi.fn(),
    setAiPreparedWorkflowDraft: vi.fn(),
    setSelectedWorkflowId: vi.fn()
  };
  return { ports, interceptState: () => interceptState };
}

function applyAll(intents: AgentTimelineIntent[], ports: AgentTimelineProjectionPorts) {
  for (const intent of intents) {
    applyAgentTimelineIntent(intent, ports);
  }
}

describe("agent timeline projection", () => {
  it("applies view, replay, capture, query, and sitemap intents", () => {
    const { ports } = createPorts();
    const response = {
      ok: true,
      status: 200,
      statusText: "OK",
      durationMs: 14,
      headers: {},
      body: "done",
      bytes: 4
    };

    applyAll(
      [
        { type: "show-view", view: "traffic" },
        { type: "load-replay-draft", draft },
        { type: "set-replay-response", response },
        { type: "select-capture", captureId: "capture-1" },
        { type: "prepare-traffic-query", data: { query: "status:500", reason: "Inspect errors" } },
        { type: "show-sitemap" }
      ],
      ports
    );

    expect(ports.setDraft).toHaveBeenCalledWith(draft);
    expect(ports.setHeadersText).toHaveBeenCalledWith(JSON.stringify(draft.headers, null, 2));
    expect(ports.setLastResponse).toHaveBeenCalledWith(response);
    expect(ports.setSelectedIds).toHaveBeenCalledWith(["capture-1"]);
    expect(ports.selectionAnchorRef.current).toBe("capture-1");
    expect(ports.setTrafficSearch).toHaveBeenCalledWith("status:500");
    expect(ports.setActiveView).toHaveBeenLastCalledWith("sitemap");
  });

  it("applies intercept queue and both request and response edit drafts", () => {
    const { ports, interceptState } = createPorts();
    applyAgentTimelineIntent({ type: "set-intercept-queue", queue: [interceptItem] }, ports);
    applyAgentTimelineIntent(
      {
        type: "prepare-intercept-edit",
        data: {
          item: interceptItem,
          response: { status: 403, statusText: "Forbidden", headers: { "content-type": "text/plain" }, body: "denied" },
          note: "Review denial"
        }
      },
      ports
    );
    applyAgentTimelineIntent(
      {
        type: "prepare-intercept-edit",
        data: { item: { ...interceptItem, id: "intercept-2" }, draft, note: "Review request" }
      },
      ports
    );

    expect(interceptState().queue).toHaveLength(2);
    expect(ports.hydrateInterceptDraft).toHaveBeenCalledWith(interceptItem);
    expect(ports.setInterceptResponseStatus).toHaveBeenCalledWith(403);
    expect(ports.setInterceptResponseStatus).toHaveBeenCalledWith(200);
    expect(ports.interceptDraftItemRef.current).toBe("intercept-2");
  });

  it("applies prepared Automate and Workflow drafts plus analysis notices", () => {
    const { ports } = createPorts();
    applyAll(
      [
        {
          type: "prepare-automate-draft",
          data: {
            draft,
            payloads: ["one", "two"],
            rules: [],
            name: "Draft run",
            environmentId: "",
            note: "Automate draft ready"
          }
        },
        { type: "prepare-workflow-draft", data: { workflow, note: "Workflow ready" } },
        { type: "notice", message: "Memory proposed" },
        {
          type: "show-automate-analysis",
          data: {
            sessionId: "session-1",
            status: "completed",
            resultCount: 3,
            failures: 0,
            matches: 1,
            clusters: [],
            outlierResultIds: ["result-3"]
          }
        },
        {
          type: "show-replay-comparison",
          data: {
            statusChanged: true,
            statusBefore: 200,
            statusAfter: 403,
            latencyDeltaMs: 2,
            bodyLengthDelta: -4,
            identical: false
          }
        },
        {
          type: "show-replay-comparison",
          data: {
            statusChanged: false,
            statusBefore: 200,
            statusAfter: 200,
            latencyDeltaMs: 0,
            bodyLengthDelta: 0,
            identical: true
          }
        }
      ],
      ports
    );

    expect(ports.setAutomatePayloadText).toHaveBeenCalledWith("one\ntwo");
    expect(ports.setAiPreparedWorkflowDraft).toHaveBeenCalledWith(workflow);
    expect(ports.setAutomateResultFilter).toHaveBeenCalledWith("outliers");
    expect(ports.setNotice).toHaveBeenCalledWith("Compared replay results: no differences");
  });

  it("hydrates the prepared replay tab from visible application state", async () => {
    const { ports } = createPorts();
    const radar = window.radar;
    if (!radar) throw new Error("Radar API stub is unavailable");
    window.radar = {
      ...radar,
      getReplayTabState: vi.fn().mockResolvedValue({
        activeTabId: "tab-1",
        tabs: [
          {
            id: "tab-1",
            name: "Prepared",
            pinned: false,
            draft: { ...draft, headers: { authorization: "Bearer visible" } },
            history: [],
            environmentId: "",
            createdAt: "2026-07-31T00:00:00.000Z",
            updatedAt: "2026-07-31T00:00:00.000Z"
          }
        ]
      })
    };

    applyAgentTimelineIntent(
      {
        type: "prepare-replay-tab",
        data: { tabId: "tab-1", name: "Prepared", draft, environmentId: "", note: "Replay ready" }
      },
      ports
    );
    await Promise.resolve();

    expect(ports.setReplayTabState).toHaveBeenCalled();
    expect(ports.setHeadersText).toHaveBeenCalledWith(JSON.stringify({ authorization: "Bearer visible" }, null, 2));
    expect(ports.setActiveView).toHaveBeenCalledWith("repeater");
  });
});
