import { describe, expect, it } from "vitest";
import { DEFAULT_URL, firstUrlFromText, normalizeUrl, originFromUrl } from "./url";

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

  it("extracts explicit and bare urls from natural-language text", () => {
    expect(firstUrlFromText("Inspect https://example.com/login, then review auth")).toBe("https://example.com/login");
    expect(firstUrlFromText("Inspect hairetsu.com for API hardening")).toBe("https://hairetsu.com");
    expect(firstUrlFromText("Try localhost:3000/admin.")).toBe("https://localhost:3000/admin");
    expect(firstUrlFromText("Email ops@example.com for access")).toBe("");
    expect(firstUrlFromText("See https://example.com/path).")).toBe("https://example.com/path");
  });
});
