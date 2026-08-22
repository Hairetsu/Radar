import { describe, expect, it } from "vitest";
import type { AgentTimelineEntry } from "../../../../shared/agent-types.js";
import type { CapturedRequest } from "../../../../shared/domain.js";
import { agentTimelineIntents } from "./agentTimelineIntents";

function timelineEntry(
  id: string,
  value: Omit<AgentTimelineEntry, "id" | "createdAt">
): AgentTimelineEntry {
  return { id, createdAt: "2026-07-31T00:00:00.000Z", ...value };
}

function capture(id: string, allowed: boolean): CapturedRequest {
  return {
    id,
    startedAt: "2026-07-31T00:00:00.000Z",
    method: "GET",
    url: `https://${id}.example/`,
    host: `${id}.example`,
    path: "/",
    requestHeaders: {},
    requestBody: "",
    status: 200,
    statusText: "OK",
    mimeType: "text/plain",
    type: "Document",
    responseHeaders: {},
    responseBody: "",
    durationMs: 10,
    allowed,
    source: "browser"
  };
}

describe("agent timeline intents", () => {
  it("projects visible tool calls and successful results in timeline order", () => {
    const draft = { method: "GET", url: "https://target.example/", headers: {}, body: "" };
    const intents = agentTimelineIntents([
      timelineEntry("view", {
        phase: "tool-call",
        toolCall: { tool: "showView", input: { view: "traffic", reason: "Inspect evidence" } }
      }),
      timelineEntry("replay-call", {
        phase: "tool-call",
        toolCall: { tool: "sendReplay", input: { draft } }
      }),
      timelineEntry("replay-result", {
        phase: "tool-result",
        toolResult: {
          tool: "sendReplay",
          ok: true,
          data: {
            ok: true,
            status: 200,
            statusText: "OK",
            durationMs: 12,
            headers: {},
            body: "done",
            bytes: 4
          }
        }
      })
    ]);

    expect(intents).toEqual([
      { type: "show-view", view: "traffic" },
      { type: "load-replay-draft", draft },
      { type: "set-replay-response", response: expect.objectContaining({ status: 200 }) }
    ]);
  });

  it("selects the first allowed capture and ignores failed tool results", () => {
    const intents = agentTimelineIntents([
      timelineEntry("captures", {
        toolResult: {
          tool: "getCaptures",
          ok: true,
          data: { captures: [capture("blocked", false), capture("allowed", true)] }
        }
      }),
      timelineEntry("failed", {
        toolResult: { tool: "getInterceptQueue", ok: false, error: "unavailable" }
      })
    ]);

    expect(intents).toEqual([{ type: "select-capture", captureId: "allowed" }]);
  });

  it("turns preparation and analysis results into small renderer intents", () => {
    const intents = agentTimelineIntents([
      timelineEntry("query", {
        toolResult: {
          tool: "prepareTrafficQuery",
          ok: true,
          data: { query: "status:500", reason: "Review server errors" }
        }
      }),
      timelineEntry("comparison", {
        toolResult: {
          tool: "compareReplayResults",
          ok: true,
          data: {
            statusChanged: true,
            statusBefore: 200,
            statusAfter: 403,
            latencyDeltaMs: 4,
            bodyLengthDelta: -10,
            identical: false
          }
        }
      })
    ]);

    expect(intents).toEqual([
      {
        type: "prepare-traffic-query",
        data: { query: "status:500", reason: "Review server errors" }
      },
      { type: "show-replay-comparison", data: expect.objectContaining({ statusAfter: 403 }) }
    ]);
  });

  it("opens Repeater when an experiment runs", () => {
    const intents = agentTimelineIntents([
      timelineEntry("experiment-call", {
        phase: "tool-call",
        toolCall: {
          tool: "runReplayExperiment",
          input: {
            captureId: "capture-1",
            family: "injection-signal",
            hypothesis: "Boolean pair on q",
            location: { kind: "replace-query", name: "q", value: "'" }
          }
        }
      }),
      timelineEntry("experiment-result", {
        phase: "tool-result",
        toolResult: {
          tool: "runReplayExperiment",
          ok: true,
          data: {
            experimentId: "exp-1",
            family: "injection-signal",
            hypothesis: "Boolean pair on q",
            sourceCaptureId: "capture-1",
            tabId: "tab-1",
            endpointImpact: "read-only",
            classification: "supported",
            rationale: "Syntax and Boolean pair diverged",
            requestCost: 3,
            baselineHistoryId: "hist-0",
            variants: [
              {
                mutation: {
                  mutation: { kind: "replace-query", name: "q", value: "'" },
                  originalValueHash: "hash",
                  payload: "'",
                  payloadSource: "family-template"
                },
                draft: { method: "GET", url: "https://target.example/?q=%27", headers: {}, body: "" },
                result: {
                  ok: true,
                  status: 500,
                  statusText: "Error",
                  durationMs: 12,
                  headers: {},
                  body: "syntax",
                  bytes: 6
                },
                historyId: "hist-1",
                comparison: {
                  statusChanged: true,
                  statusBefore: 200,
                  statusAfter: 500,
                  latencyDeltaMs: 2,
                  bodyLengthBefore: 2,
                  bodyLengthAfter: 6,
                  bodyLengthDelta: 4,
                  headerDiffs: [],
                  bodyTextDiff: [],
                  jsonDiffs: [],
                  identical: false
                }
              }
            ]
          }
        }
      })
    ]);

    expect(intents).toEqual([
      { type: "show-view", view: "repeater" },
      { type: "show-view", view: "repeater" },
      { type: "notice", message: "supported: Syntax and Boolean pair diverged" },
      { type: "set-replay-response", response: expect.objectContaining({ status: 500 }) }
    ]);
  });
});
