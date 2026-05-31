import { describe, expect, it } from "vitest";
import { jwtDecode, jsonFormat, parseCookieHeader, urlDecode, urlEncode, base64Encode, base64Decode } from "./requestTransforms.js";

describe("requestTransforms", () => {
  it("formats json", () => {
    expect(jsonFormat('{"a":1}')).toEqual({ ok: true, value: '{\n  "a": 1\n}' });
  });

  it("decodes jwt segments", () => {
    const token = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signature";
    const decoded = jwtDecode(token);
    expect(decoded.ok).toBe(true);
    expect(decoded.payload).toContain("1234567890");
  });

  it("parses cookie headers", () => {
    const parsed = parseCookieHeader("session=abc; Path=/; HttpOnly");
    expect(parsed.ok).toBe(true);
    expect(parsed.value).toContain("session");
  });

  it("reports malformed json and jwt failures", () => {
    expect(jsonFormat("{bad").ok).toBe(false);
    expect(jwtDecode("bad-token").ok).toBe(false);
    expect(parseCookieHeader("").ok).toBe(false);
    expect(urlEncode("hello world").ok).toBe(true);
    expect(urlDecode(encodeURIComponent("hello world")).ok).toBe(true);
    expect(base64Encode("ping").value.length).toBeGreaterThan(0);
    expect(base64Decode(base64Encode("ping").value).value).toBe("ping");
  });
});
