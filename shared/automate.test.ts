import { describe, expect, it } from "vitest";
import type { ReplayDraft } from "./domain.js";
import {
  assignmentsForPayload,
  automateErrorResult,
  automateResultFingerprint,
  automateResultFromReplay,
  clusterAutomateResults,
  createAutomateSession,
  createAutomatePayloadSet,
  createAutomatePayloadMarker,
  findAutomatePayloadPositions,
  insertAutomatePayloadMarker,
  materializeAutomateDraft,
  MAX_AUTOMATE_POSITIONS,
  MAX_AUTOMATE_PAYLOAD_SETS,
  evaluateAutomateRules,
  normalizeAutomateLimits,
  normalizeAutomatePayloadSet,
  normalizeAutomatePayloads,
  normalizeAutomatePayloadSets,
  normalizeAutomateSession,
  normalizeAutomateRules,
  redirectLocation,
  replaceAutomatePayloadMarkers,
  summarizeAutomateSession
} from "./automate.js";

const draft: ReplayDraft = {
  method: "POST",
  url: "https://example.test/api/users/{{payload:id}}",
  headers: {
    Authorization: "Bearer {{payload:token}}",
    Accept: "application/json"
  },
  body: "{\"role\":\"{{payload:role}}\"}"
};

describe("automate", () => {
  it("detects payload markers across URL, headers, and body", () => {
    const positions = findAutomatePayloadPositions(draft);

    expect(positions.map((position) => `${position.location}:${position.name}`)).toEqual([
      "url:id",
      "header:token",
      "body:role"
    ]);
    expect(positions[1]).toMatchObject({
      id: "header:Authorization:token:1",
      headerName: "Authorization",
      marker: "{{payload:token}}"
    });
  });

  it("materializes a draft with a payload assignment", () => {
    const positions = findAutomatePayloadPositions(draft);
    const materialized = materializeAutomateDraft(draft, assignmentsForPayload(positions, "admin"));

    expect(materialized.url).toBe("https://example.test/api/users/admin");
    expect(materialized.headers.Authorization).toBe("Bearer admin");
    expect(materialized.body).toBe("{\"role\":\"admin\"}");
  });

  it("leaves unknown markers intact during replacement", () => {
    expect(replaceAutomatePayloadMarkers("a {{payload:known}} {{payload:missing}}", { known: "1" })).toBe(
      "a 1 {{payload:missing}}"
    );
  });

  it("normalizes inline payload lists without losing meaningful whitespace", () => {
    expect(normalizeAutomatePayloads(" admin \n\nuser\r\n  \nroot")).toEqual([" admin ", "user", "root"]);
  });

  it("creates and inserts safe markers without clearing GET bodies", () => {
    const marker = createAutomatePayloadMarker("user id");
    const withBody = insertAutomatePayloadMarker(
      { method: "GET", url: "https://example.test", headers: {}, body: "existing" },
      "body",
      "user id"
    );
    const withHeader = insertAutomatePayloadMarker(withBody, "header", "token", "X Payload");
    const withUrl = insertAutomatePayloadMarker(withHeader, "url", "q");

    expect(marker).toBe("{{payload:user-id}}");
    expect(withBody.body).toBe("existing\n{{payload:user-id}}");
    expect(withHeader.headers["X-Payload"]).toBe("{{payload:token}}");
    expect(withUrl.url).toBe("https://example.test?q={{payload:q}}");
  });

  it("caps detected positions before scanning headers and body", () => {
    const urlMarkers = Array.from({ length: MAX_AUTOMATE_POSITIONS + 4 }, (_, index) => `{{payload:p${index}}}`).join(
      "&"
    );
    const positions = findAutomatePayloadPositions({
      method: "POST",
      url: `https://example.test/search?${urlMarkers}`,
      headers: { "X-Test": "{{payload:header}}" },
      body: "{{payload:body}}"
    });

    expect(positions).toHaveLength(MAX_AUTOMATE_POSITIONS);
    expect(positions.every((position) => position.location === "url")).toBe(true);
  });

  it("handles default marker names and URL query separators", () => {
    const withExistingQuery = insertAutomatePayloadMarker(
      { method: "GET", url: "https://example.test/search?existing=1", headers: {}, body: "" },
      "url",
      ""
    );
    const withTrailingQuery = insertAutomatePayloadMarker(
      { method: "GET", url: "https://example.test/search?", headers: {}, body: "" },
      "url",
      "next"
    );
    const withEmptyUrl = insertAutomatePayloadMarker(
      { method: "GET", url: "", headers: {}, body: "" },
      "url",
      "local"
    );

    expect(createAutomatePayloadMarker("")).toBe("{{payload:payload}}");
    expect(withExistingQuery.url).toBe("https://example.test/search?existing=1&payload={{payload:payload}}");
    expect(withTrailingQuery.url).toBe("https://example.test/search?next={{payload:next}}");
    expect(withEmptyUrl.url).toBe("http://localhost:3000?local={{payload:local}}");
  });

  it("normalizes payload sets, run limits, and malformed rules fail closed", () => {
    const payloadSet = createAutomatePayloadSet({
      name: "  Auth deck  ",
      payloadText: "admin\nuser"
    });
    const sets = normalizeAutomatePayloadSets([payloadSet, { id: payloadSet?.id, name: "duplicate", payloads: ["x"] }]);
    const rules = normalizeAutomateRules([
      { id: "status", name: "Server errors", target: "status", status: 500 },
      { id: "bad-regex", name: "Bad", kind: "extract", target: "regex", pattern: "(" },
      { id: "token", name: "Token", kind: "extract", target: "regex", pattern: "token=(?<token>[a-z0-9]+)" }
    ]);

    expect(payloadSet?.name).toBe("Auth deck");
    expect(sets).toHaveLength(1);
    expect(normalizeAutomateLimits({ count: 999, concurrency: 99, delayMs: -1, timeoutMs: 999999 })).toEqual({
      count: 100,
      concurrency: 5,
      delayMs: 0,
      timeoutMs: 30000
    });
    expect(rules.map((rule) => rule.id)).toEqual(["status", "token"]);
  });

  it("creates sessions, evaluates matches/extracts, and clusters similar responses", () => {
    const positions = findAutomatePayloadPositions(draft);
    const rules = normalizeAutomateRules([
      { id: "status-200", name: "OK", target: "status", status: 200 },
      { id: "extract-token", name: "Token", kind: "extract", target: "regex", pattern: "token=(?<value>[a-z0-9]+)" }
    ]);
    const session = createAutomateSession({
      name: "Roles",
      draft,
      payloads: ["admin", "user"],
      positions,
      limits: { count: 2, concurrency: 1, delayMs: 0, timeoutMs: 1000 },
      rules
    });
    const first = automateResultFromReplay({
      id: "result-1",
      index: 1,
      payload: "admin",
      request: materializeAutomateDraft(draft, assignmentsForPayload(positions, "admin")),
      response: {
        ok: true,
        status: 200,
        statusText: "OK",
        durationMs: 10,
        headers: { "content-type": "text/plain" },
        body: "hello token=abc123",
        bytes: 18
      },
      rules
    });
    const second = automateErrorResult({
      id: "result-2",
      index: 2,
      payload: "user",
      request: materializeAutomateDraft(draft, assignmentsForPayload(positions, "user")),
      error: "outside scope",
      rules
    });
    const clustered = clusterAutomateResults([first, second]);

    expect(session?.payloads).toEqual(["admin", "user"]);
    expect(first.matchedRules.map((rule) => rule.name)).toEqual(["OK", "Token"]);
    expect(first.extracts).toEqual([{ ruleId: "extract-token", name: "Token.value", value: "abc123" }]);
    expect(clustered.clusters).toHaveLength(2);
    expect(clustered.results.every((result) => result.clusterId)).toBe(true);
  });

  it("covers wordlist metadata, invalid inputs, and capped saved payload sets", () => {
    const wordlist = normalizeAutomatePayloadSet({
      id: "wordlist-1",
      name: "",
      source: "wordlist",
      payloads: [],
      wordlistPath: "/tmp/auth.txt",
      createdAt: "not-a-date"
    });
    const manySets = normalizeAutomatePayloadSets(
      Array.from({ length: MAX_AUTOMATE_PAYLOAD_SETS + 3 }, (_, index) => ({
        id: `set-${index}`,
        name: `Set ${index}`,
        payloads: [`p${index}`]
      }))
    );

    expect(normalizeAutomatePayloadSet(null)).toBeNull();
    expect(normalizeAutomatePayloadSets("not-array")).toEqual([]);
    expect(wordlist).toMatchObject({
      name: "Wordlist reference",
      source: "wordlist",
      wordlistPath: "/tmp/auth.txt"
    });
    expect(manySets).toHaveLength(MAX_AUTOMATE_PAYLOAD_SETS);
    expect(normalizeAutomateLimits({ count: "nope", concurrency: Number.NaN, delayMs: "x", timeoutMs: null })).toEqual({
      count: 10,
      concurrency: 1,
      delayMs: 0,
      timeoutMs: 1000
    });
  });

  it("validates rule shapes and evaluates textual, numeric, disabled, and unmatched branches", () => {
    const invalidRules = normalizeAutomateRules([
      { id: "status-zero", target: "status", status: 0 },
      { id: "length-empty", target: "length" },
      { id: "header-empty", target: "header", pattern: "x" },
      { id: "body-empty", target: "body" },
      { id: "extract-status", kind: "extract", target: "status", status: 200 },
      { id: "bad-regex", kind: "extract", target: "regex", pattern: "(" }
    ]);
    const rules = normalizeAutomateRules([
      { id: "disabled", name: "Disabled", enabled: false, target: "body", pattern: "admin" },
      { id: "status", name: "Created", target: "status", pattern: "201" },
      { id: "header", name: "Header", target: "header", headerName: "X-Mode", pattern: "beta" },
      { id: "redirect", name: "Redirect", target: "redirect", pattern: "/login" },
      { id: "length", name: "Length", target: "length", min: 10, max: 30 },
      { id: "latency", name: "Latency", target: "latency", min: 5 },
      { id: "regex", name: "Regex", target: "regex", pattern: "token=[a-z]+" },
      { id: "extract", name: "Extract", kind: "extract", target: "regex", pattern: "sid=([a-z]+)" },
      { id: "miss", name: "Miss", target: "body", pattern: "absent" }
    ]);
    const evaluated = evaluateAutomateRules(
      {
        status: 201,
        redirect: "https://example.test/login",
        length: 18,
        latencyMs: 7,
        headers: { "x-mode": "beta" },
        bodyPreview: "created token=abc sid=xyz"
      },
      rules
    );
    const failedNumeric = evaluateAutomateRules(
      {
        status: 200,
        redirect: "",
        length: 100,
        latencyMs: 1,
        headers: {},
        bodyPreview: "nothing"
      },
      rules
    );

    expect(invalidRules).toEqual([]);
    expect(evaluated.matchedRules.map((rule) => rule.ruleId)).toEqual([
      "status",
      "header",
      "redirect",
      "length",
      "latency",
      "regex",
      "extract"
    ]);
    expect(evaluated.extracts).toEqual([{ ruleId: "extract", name: "Extract", value: "xyz" }]);
    expect(failedNumeric.matchedRules).toEqual([]);
    expect(redirectLocation({ Location: "/next" })).toBe("/next");
    expect(redirectLocation({})).toBe("");
  });

  it("normalizes stored sessions and result metadata defensively", () => {
    const session = normalizeAutomateSession({
      id: "stored",
      name: "",
      status: "unknown",
      draft,
      environmentId: " env ",
      payloadSetId: " set ",
      payloads: ["admin", ""],
      positions: [
        { id: "pos-1", name: "role", location: "header", headerName: "X-Role", occurrence: 2, marker: "", preview: " x " },
        { id: "pos-2", name: "", location: "body", occurrence: "bad" }
      ],
      limits: { count: 1 },
      rules: [{ id: "rule", target: "body", pattern: "error" }],
      results: [
        {
          id: "result",
          index: "2",
          payload: "admin",
          request: draft,
          ok: true,
          status: "200",
          statusText: "OK",
          error: "ignored?",
          redirect: "/next",
          length: 2500,
          latencyMs: 25,
          wordCount: 2,
          headers: { "Content-Type": "text/plain" },
          bodyPreview: "first body",
          matchedRules: [{ ruleId: "", name: "bad" }, { ruleId: "rule", name: "", kind: "extract" }],
          extracts: [{ ruleId: "", name: "bad", value: "bad" }, { ruleId: "rule", name: "", value: "value" }],
          clusterId: "old"
        },
        {
          id: "large",
          index: 3,
          payload: "large",
          request: draft,
          ok: true,
          status: 200,
          statusText: "OK",
          length: 25000,
          latencyMs: 30,
          wordCount: 1,
          headers: {},
          bodyPreview: "large body",
          matchedRules: [],
          extracts: []
        }
      ]
    });
    const fallbackSession = normalizeAutomateSession({
      id: "fallback",
      draft,
      payloads: [],
      positions: [],
      results: []
    });

    expect(session?.status).toBe("ready");
    expect(session?.payloads).toEqual(["admin"]);
    expect(session?.positions.map((position) => position.location)).toEqual(["header", "body"]);
    expect(session?.results[0].matchedRules).toEqual([{ ruleId: "rule", name: "Match", kind: "extract" }]);
    expect(session?.results[0].extracts).toEqual([{ ruleId: "rule", name: "Extract", value: "value" }]);
    expect(session?.clusters.length).toBe(2);
    expect(fallbackSession?.positions).toHaveLength(3);
    expect(summarizeAutomateSession(session!)).toMatchObject({
      status: "ready",
      resultCount: 2,
      clusterCount: 2
    });
  });

  it("fingerprints response size bands and repeated clusters deterministically", () => {
    const baseResult = automateResultFromReplay({
      id: "small",
      index: 1,
      payload: "small",
      request: draft,
      response: {
        ok: true,
        status: 200,
        statusText: "OK",
        durationMs: 2,
        headers: {},
        body: "x".repeat(300),
        bytes: 300
      }
    });
    const mediumResult = { ...baseResult, id: "medium", index: 2, payload: "medium", length: 3000, bodyPreview: "medium 123" };
    const largeResult = { ...baseResult, id: "large", index: 3, payload: "large", length: 30000, bodyPreview: "large abcdef0123456789" };
    const duplicate = { ...baseResult, id: "small-2", index: 4, payload: "small-2" };
    const clustered = clusterAutomateResults([baseResult, mediumResult, largeResult, duplicate]);

    expect(automateResultFingerprint(baseResult)).toContain("small");
    expect(automateResultFingerprint(mediumResult)).toContain("medium");
    expect(automateResultFingerprint(largeResult)).toContain("large");
    expect(clustered.clusters[0].count).toBe(2);
  });
});
