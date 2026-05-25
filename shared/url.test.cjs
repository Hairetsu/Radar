import { describe, expect, it } from "vitest";
const { normalizeUrl, originFromUrl, DEFAULT_URL } = require("./url.cjs");

describe("url", () => {
  it("returns default for empty input", () => {
    expect(normalizeUrl("")).toBe(DEFAULT_URL);
    expect(normalizeUrl("   ")).toBe(DEFAULT_URL);
  });

  it("preserves explicit http/https schemes", () => {
    expect(normalizeUrl("http://example.com")).toBe("http://example.com");
    expect(normalizeUrl("https://example.com/path")).toBe("https://example.com/path");
  });

  it("adds https when scheme is missing", () => {
    expect(normalizeUrl("example.com")).toBe("https://example.com");
    expect(normalizeUrl("localhost:3000")).toBe("https://localhost:3000");
  });

  it("extracts origin from normalized url", () => {
    expect(originFromUrl("example.com")).toBe("https://example.com");
    expect(originFromUrl("http://localhost:3000/foo")).toBe("http://localhost:3000");
    expect(originFromUrl("not a url at all!!!")).toBe("");
  });
});
