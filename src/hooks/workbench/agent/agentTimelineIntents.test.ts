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
});
