import { describe, expect, it } from "vitest";
const { formatHeaders, parseHeaders, safeJsonHeaders } = require("./headers.cjs");

describe("headers", () => {
  it("formats headers as pretty JSON", () => {
    expect(formatHeaders({ Accept: "text/html" })).toBe('{\n  "Accept": "text/html"\n}');
  });

  it("parses valid header JSON", () => {
    expect(parseHeaders('{"X-Test": 123}')).toEqual({ "X-Test": "123" });
    expect(parseHeaders("")).toEqual({});
  });

  it("rejects non-object header JSON", () => {
    expect(() => parseHeaders("[]")).toThrow("Headers must be a JSON object.");
    expect(() => parseHeaders('"string"')).toThrow("Headers must be a JSON object.");
  });

  it("coerces header values to strings", () => {
    expect(safeJsonHeaders({ A: ["one", "two"], B: 42 })).toEqual({ A: "one, two", B: "42" });
  });
});
