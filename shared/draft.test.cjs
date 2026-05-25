import { describe, expect, it } from "vitest";
const { normalizeDraft, MAX_REPLAY_BODY } = require("./draft.cjs");

describe("draft", () => {
  it("normalizes method and strips hop-by-hop headers", () => {
    const draft = normalizeDraft({
      method: "post",
      url: "http://localhost:3000",
      headers: {
        Host: "localhost",
        "Content-Length": "10",
        Accept: "application/json"
      },
      body: '{"a":1}'
    });

    expect(draft.method).toBe("POST");
    expect(draft.headers).toEqual({ Accept: "application/json" });
    expect(draft.body).toBe('{"a":1}');
  });

  it("clears body for GET and HEAD", () => {
    expect(normalizeDraft({ method: "GET", body: "ignored" }).body).toBe("");
    expect(normalizeDraft({ method: "HEAD", body: "ignored" }).body).toBe("");
  });

  it("caps replay body size", () => {
    const huge = "z".repeat(MAX_REPLAY_BODY + 100);
    expect(normalizeDraft({ method: "POST", body: huge }).body.length).toBe(MAX_REPLAY_BODY);
  });
});
