import { describe, expect, it } from "vitest";
import type { CapturedRequest, WebSocketEvent } from "./domain.js";
import {
  evaluateCaptureQuery,
  evaluateWebSocketQuery,
  filterCapturesByQuery,
  filterWebSocketEventsByQuery,
  parseTrafficQuery
} from "./trafficQuery.js";

const baseCapture = (overrides: Partial<CapturedRequest> = {}): CapturedRequest => ({
  id: "cap-1",
  startedAt: "2026-01-01T00:00:00.000Z",
  method: "GET",
  url: "https://allowed.test/api/users",
  host: "allowed.test",
  path: "/api/users",
  requestHeaders: {},
  requestBody: "",
  status: 200,
  statusText: "OK",
  mimeType: "application/json",
  type: "fetch",
  responseHeaders: { "content-type": "application/json" },
  responseBody: '{"ok":true}',
  durationMs: 12,
  allowed: true,
  source: "browser",
  ...overrides
});

const baseFrame = (overrides: Partial<WebSocketEvent> = {}): WebSocketEvent => ({
  id: "ws-1",
  requestId: "req-1",
  createdAt: "2026-01-01T00:00:00.000Z",
  url: "wss://allowed.test/socket",
  host: "allowed.test",
  direction: "sent",
  payloadData: "ping",
  size: 4,
  allowed: true,
  ...overrides
});

describe("parseTrafficQuery", () => {
  it("returns empty text query for blank input", () => {
    const parsed = parseTrafficQuery("   ");
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.query).toEqual({ type: "term", field: "text", op: "contains", value: "" });
    }
  });

  it("treats plain text as substring mode", () => {
    const parsed = parseTrafficQuery("response-needle");
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.mode).toBe("text");
    }
  });

  it("parses structured field predicates and boolean groups", () => {
    expect(parseTrafficQuery("method:POST path:/api status:401,403").ok).toBe(true);
    expect(parseTrafficQuery("(method:GET OR method:POST) host:allowed.test").ok).toBe(true);
    expect(parseTrafficQuery("NOT method:OPTIONS").ok).toBe(true);
    expect(parseTrafficQuery('path:"/api/v1"').ok).toBe(true);
    expect(parseTrafficQuery("host~allowed").ok).toBe(true);
  });

  it("fails closed on invalid syntax", () => {
    expect(parseTrafficQuery("method:").ok).toBe(false);
    expect(parseTrafficQuery('path:"unclosed').ok).toBe(false);
    expect(parseTrafficQuery("unknownfield:value").ok).toBe(false);
    expect(parseTrafficQuery("(method:GET").ok).toBe(false);
    const trailing = parseTrafficQuery("method:GET extra");
    expect(trailing.ok).toBe(true);
  });
});

describe("filterCapturesByQuery", () => {
  it("filters POST JSON endpoints under /api with 401/403", () => {
    const captures = [
      baseCapture({ id: "match", method: "POST", path: "/api/login", status: 401 }),
      baseCapture({ id: "miss-method", method: "GET", path: "/api/login", status: 401 }),
      baseCapture({ id: "miss-status", method: "POST", path: "/api/login", status: 200 })
    ];
    const result = filterCapturesByQuery(captures, "method:POST path:/api status:401,403 mime:json");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.captures.map((capture) => capture.id)).toEqual(["match"]);
    }
  });

  it("supports header, body, status family, tag, and comment predicates", () => {
    const captures = [
      baseCapture({
        id: "match",
        requestHeaders: { Authorization: "Bearer secret" },
        requestBody: '{"role":"admin"}',
        responseHeaders: { "x-env": "staging" },
        responseBody: "error-detail",
        status: 403
      }),
      baseCapture({ id: "miss", requestBody: '{"role":"user"}', status: 200 })
    ];
    const context = {
      tagsByEvidenceId: { match: ["review"] },
      commentsByEvidenceId: { match: "suspicious login" }
    };
    expect(filterCapturesByQuery(captures, "req.header:authorization").ok).toBe(true);
    expect(filterCapturesByQuery(captures, "resp.header:x-env").ok).toBe(true);
    expect(filterCapturesByQuery(captures, "resp.body:error").ok).toBe(true);
    expect(filterCapturesByQuery(captures, "status:4xx").ok).toBe(true);
    expect(filterCapturesByQuery(captures, "status:403").ok).toBe(true);
    expect(filterCapturesByQuery(captures, "tag:review", context).ok).toBe(true);
    expect(filterCapturesByQuery(captures, "comment:suspicious", context).ok).toBe(true);
    if (filterCapturesByQuery(captures, "tag:review", context).ok) {
      expect(filterCapturesByQuery(captures, "tag:review", context).captures.map((c) => c.id)).toEqual(["match"]);
    }
  });

  it("supports AND OR NOT groups", () => {
    const captures = [
      baseCapture({ id: "a", method: "GET", host: "a.test" }),
      baseCapture({ id: "b", method: "POST", host: "b.test" }),
      baseCapture({ id: "c", method: "DELETE", host: "c.test" })
    ];
    const orResult = filterCapturesByQuery(captures, "method:GET OR method:POST");
    expect(orResult.ok).toBe(true);
    if (orResult.ok) {
      expect(orResult.captures.map((c) => c.id).sort()).toEqual(["a", "b"]);
    }
    const notResult = filterCapturesByQuery(captures, "NOT method:DELETE");
    expect(notResult.ok).toBe(true);
    if (notResult.ok) {
      expect(notResult.captures.map((c) => c.id).sort()).toEqual(["a", "b"]);
    }
  });

  it("returns parse errors without matches", () => {
    const result = filterCapturesByQuery([baseCapture()], "method:");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.captures).toEqual([]);
      expect(result.error).toBeTruthy();
    }
  });

  it("returns all captures for empty query", () => {
    const captures = [baseCapture({ id: "a" }), baseCapture({ id: "b" })];
    const result = filterCapturesByQuery(captures, "");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.captures).toHaveLength(2);
    }
  });

  it("keeps plain text fallback behavior", () => {
    const captures = [
      baseCapture({ id: "match", responseBody: "response-needle" }),
      baseCapture({ id: "miss", responseBody: "ordinary" })
    ];
    const result = filterCapturesByQuery(captures, "response-needle");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.captures.map((capture) => capture.id)).toEqual(["match"]);
    }
  });
});

describe("evaluateCaptureQuery", () => {
  it("matches source, initiator, url, and mime fields", () => {
    const item = baseCapture({
      source: "repeater",
      initiator: "script",
      url: "https://allowed.test/login",
      mimeType: "text/html",
      status: null
    });
    const parsed = parseTrafficQuery("source:repeater initiator:script url:login mime:html");
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(evaluateCaptureQuery(item, parsed.query)).toBe(true);
    }
    const statusParsed = parseTrafficQuery("status:4xx");
    expect(statusParsed.ok).toBe(true);
    if (statusParsed.ok) {
      expect(evaluateCaptureQuery(item, statusParsed.query)).toBe(false);
    }
  });

  it("evaluates specific header value predicates", () => {
    const item = baseCapture({
      requestHeaders: { Authorization: "Bearer abc" },
      responseHeaders: { "Set-Cookie": "sid=1" }
    });
    const reqParsed = parseTrafficQuery("req.header:Authorization:Bearer");
    if (reqParsed.ok) {
      expect(evaluateCaptureQuery(item, reqParsed.query)).toBe(true);
    }
    const respParsed = parseTrafficQuery("resp.header:Set-Cookie:sid");
    if (respParsed.ok) {
      expect(evaluateCaptureQuery(item, respParsed.query)).toBe(true);
    }
  });
});

describe("filterWebSocketEventsByQuery", () => {
  it("filters frames by direction, payload, opcode, and error", () => {
    const events = [
      baseFrame({ id: "match", direction: "sent", payloadData: "ping", opcode: 1 }),
      baseFrame({ id: "miss", direction: "received", payloadData: "pong", error: "broken" })
    ];
    expect(filterWebSocketEventsByQuery(events, "direction:sent payload:ping").ok).toBe(true);
    expect(filterWebSocketEventsByQuery(events, "opcode:1").ok).toBe(true);
    expect(filterWebSocketEventsByQuery(events, "error:broken").ok).toBe(true);
    if (filterWebSocketEventsByQuery(events, "direction:sent payload:ping").ok) {
      expect(filterWebSocketEventsByQuery(events, "direction:sent payload:ping").events.map((e) => e.id)).toEqual(["match"]);
    }
  });

  it("rejects http-only fields on websocket evidence", () => {
    const parsed = parseTrafficQuery("method:GET");
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(evaluateWebSocketQuery(baseFrame(), parsed.query)).toBe(false);
    }
  });

  it("matches websocket tags, comments, headers, and status", () => {
    const frame = baseFrame({
      status: 101,
      opcode: 2,
      error: "reset",
      requestHeaders: { Upgrade: "websocket" },
      responseHeaders: { Connection: "Upgrade" }
    });
    const context = {
      tagsByEvidenceId: { [frame.id]: ["stream"] },
      commentsByEvidenceId: { [frame.id]: "handshake" }
    };
    expect(filterWebSocketEventsByQuery([frame], "tag:stream", context).ok).toBe(true);
    expect(filterWebSocketEventsByQuery([frame], "comment:handshake", context).ok).toBe(true);
    expect(filterWebSocketEventsByQuery([frame], "req.header:Upgrade").ok).toBe(true);
    expect(filterWebSocketEventsByQuery([frame], "status:101").ok).toBe(true);
    expect(filterWebSocketEventsByQuery([frame], "error:reset").ok).toBe(true);
  });

  it("parses escaped quoted values", () => {
    const parsed = parseTrafficQuery('path:"/api/v1"');
    expect(parsed.ok).toBe(true);
  });

  it("returns all events for empty query and errors for invalid query", () => {
    const events = [baseFrame({ id: "a" })];
    expect(filterWebSocketEventsByQuery(events, "").ok).toBe(true);
    expect(filterWebSocketEventsByQuery(events, "method:").ok).toBe(false);
  });
});
