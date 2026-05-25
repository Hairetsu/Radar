import { describe, expect, it, vi } from "vitest";
const { extractJson, normalizeOutput, complete } = require("./providers.cjs");

describe("providers", () => {
  it("extracts JSON from fenced blocks", () => {
    const parsed = extractJson('Here you go:\n```json\n{"summary":"ok"}\n```');
    expect(parsed.summary).toBe("ok");
  });

  it("extracts bare JSON objects", () => {
    expect(extractJson('prefix {"a":1} suffix')).toEqual({ a: 1 });
  });

  it("throws when JSON is missing", () => {
    expect(() => extractJson("no json here")).toThrow("Model response did not contain JSON.");
  });

  it("normalizes capture_summary output", () => {
    const output = normalizeOutput("capture_summary", {
      summary: "Test",
      observations: [1],
      uncertainties: ["maybe"]
    });
    expect(output.task).toBe("capture_summary");
    expect(output.data.summary).toBe("Test");
    expect(output.data.observations).toEqual(["1"]);
  });

  it("normalizes repeater_drafts output", () => {
    const output = normalizeOutput("repeater_drafts", {
      drafts: [{ label: "A", rationale: "B", draft: { method: "post", url: "http://localhost", headers: { A: 1 }, body: "x" } }]
    });
    expect(output.data.drafts[0].draft.method).toBe("post");
    expect(output.data.drafts[0].draft.headers).toEqual({ A: "1" });
  });

  it("normalizes scope_checklist output", () => {
    const output = normalizeOutput("scope_checklist", { items: [{ title: "T", steps: [1] }] });
    expect(output.data.items[0].steps).toEqual(["1"]);
  });

  it("normalizes report_notes output", () => {
    const output = normalizeOutput("report_notes", { notes: "N", evidenceRefs: ["cap-1"], uncertainties: [] });
    expect(output.data.evidenceRefs).toEqual(["cap-1"]);
  });

  it("normalizes browser_helper output", () => {
    const output = normalizeOutput("browser_helper", {
      steps: [{ label: "Go", action: "navigate", url: "http://localhost" }]
    });
    expect(output.data.steps[0].action).toBe("navigate");
  });

  it("rejects unknown tasks", () => {
    expect(() => normalizeOutput("unknown", {})).toThrow("Unknown AI task");
  });

  it("requires api key for complete", async () => {
    await expect(
      complete({ settings: { provider: "openai", model: "gpt-4o-mini", apiKey: "", baseUrl: "" }, system: "s", user: "u" })
    ).rejects.toThrow("AI API key is not configured.");
  });

  it("calls openai-compatible endpoint", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '{"summary":"ok","observations":[],"uncertainties":[]}' } }] })
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await complete({
      settings: { provider: "openai-compatible", model: "local", apiKey: "key", baseUrl: "http://127.0.0.1:11434/v1" },
      system: "sys",
      user: "ctx"
    });

    expect(result.parsed.summary).toBe("ok");
    expect(fetchMock.mock.calls[0][0]).toBe("http://127.0.0.1:11434/v1/chat/completions");
    vi.unstubAllGlobals();
  });

  it("calls anthropic endpoint", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        content: [{ type: "text", text: '{"summary":"anthropic","observations":[],"uncertainties":[]}' }]
      })
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await complete({
      settings: { provider: "anthropic", model: "claude", apiKey: "key", baseUrl: "" },
      system: "sys",
      user: "ctx"
    });

    expect(result.parsed.summary).toBe("anthropic");
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.anthropic.com/v1/messages");
    vi.unstubAllGlobals();
  });

  it("surfaces openai HTTP errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 401, text: async () => "unauthorized" }))
    );

    await expect(
      complete({
        settings: { provider: "openai", model: "gpt-4o-mini", apiKey: "bad", baseUrl: "" },
        system: "s",
        user: "u"
      })
    ).rejects.toThrow("unauthorized");
    vi.unstubAllGlobals();
  });

  it("surfaces empty openai responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({ choices: [] }) }))
    );

    await expect(
      complete({
        settings: { provider: "openai", model: "gpt-4o-mini", apiKey: "key", baseUrl: "" },
        system: "s",
        user: "u"
      })
    ).rejects.toThrow("Empty model response.");
    vi.unstubAllGlobals();
  });

  it("surfaces anthropic HTTP errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 403, text: async () => "forbidden" }))
    );

    await expect(
      complete({
        settings: { provider: "anthropic", model: "claude", apiKey: "bad", baseUrl: "" },
        system: "s",
        user: "u"
      })
    ).rejects.toThrow("forbidden");
    vi.unstubAllGlobals();
  });

  it("surfaces empty anthropic responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({ content: [] }) }))
    );

    await expect(
      complete({
        settings: { provider: "anthropic", model: "claude", apiKey: "key", baseUrl: "" },
        system: "s",
        user: "u"
      })
    ).rejects.toThrow("Empty model response.");
    vi.unstubAllGlobals();
  });
});
