import { describe, expect, it } from "vitest";
const {
  DEFAULT_ALLOWLIST,
  isLocalHost,
  wildcardToRegExp,
  ruleAllows,
  isAllowedTarget,
  shouldTrustLocalCertificate
} = require("./allowlist.cjs");

describe("allowlist", () => {
  it("detects local hostnames", () => {
    expect(isLocalHost("localhost")).toBe(true);
    expect(isLocalHost("::1")).toBe(true);
    expect(isLocalHost("127.0.0.1")).toBe(true);
    expect(isLocalHost("example.com")).toBe(false);
  });

  it("matches wildcard rules", () => {
    const url = new URL("http://localhost:3000/api");
    expect(ruleAllows(url, "http://localhost:*")).toBe(true);
    expect(ruleAllows(url, "https://localhost:*")).toBe(false);
  });

  it("matches local rule keyword", () => {
    const url = new URL("http://127.0.0.1:8080");
    expect(ruleAllows(url, "local")).toBe(true);
  });

  it("matches origin and hostname fallback rules", () => {
    const url = new URL("https://api.example.com/v1");
    expect(ruleAllows(url, "https://api.example.com")).toBe(true);
    expect(ruleAllows(url, "api.example.com")).toBe(true);
  });

  it("allows default local targets", () => {
    expect(isAllowedTarget("http://localhost:3000")).toBe(true);
    expect(isAllowedTarget("http://127.0.0.1:8080")).toBe(true);
  });

  it("blocks unknown external targets with default allowlist", () => {
    expect(isAllowedTarget("https://evil.example")).toBe(false);
    expect(isAllowedTarget("ftp://localhost")).toBe(false);
    expect(isAllowedTarget("not-a-url")).toBe(false);
  });

  it("respects custom rules", () => {
    expect(isAllowedTarget("https://allowed.test", ["https://allowed.test"])).toBe(true);
    expect(isAllowedTarget("https://blocked.test", ["https://allowed.test"])).toBe(false);
  });

  it("trusts local https certificates only", () => {
    expect(shouldTrustLocalCertificate("https://localhost:8443")).toBe(true);
    expect(shouldTrustLocalCertificate("http://localhost:8443")).toBe(false);
    expect(shouldTrustLocalCertificate("https://example.com")).toBe(false);
  });

  it("exports default allowlist", () => {
    expect(DEFAULT_ALLOWLIST.length).toBeGreaterThan(0);
    expect(wildcardToRegExp("http://localhost:*").test("http://localhost:3000")).toBe(true);
  });

  it("rejects empty rules", () => {
    const url = new URL("http://localhost:3000");
    expect(ruleAllows(url, "")).toBe(false);
    expect(ruleAllows(url, "   ")).toBe(false);
  });

  it("returns false for invalid certificate urls", () => {
    expect(shouldTrustLocalCertificate("not-a-url")).toBe(false);
  });
});
