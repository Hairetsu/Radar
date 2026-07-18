import { describe, expect, it } from "vitest";
import { normalizeDraft, MAX_REPLAY_BODY } from "./draft";

describe("draft", () => {
  it("normalizes method and strips hop-by-hop headers", () => {
    const draft = normalizeDraft({
      method: "post",
      url: "http://localhost:3000",
      headers: {
        Host: "localhost",
        "Content-Length": "10",
        Connection: "keep-alive",
        "Keep-Alive": "timeout=5",
        "Proxy-Authorization": "Basic fixture-secret",
        TE: "trailers",
        Trailer: "Expires",
        "Transfer-Encoding": "chunked",
        Upgrade: "websocket",
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
