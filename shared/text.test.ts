import { describe, expect, it } from "vitest";
import { truncateText, statusTone, elapsed, bodyPreview, tlsLine, MAX_CAPTURED_BODY } from "./text";

describe("text", () => {
  it("truncates long text", () => {
    const long = "x".repeat(MAX_CAPTURED_BODY + 10);
    expect(truncateText(long)).toContain("[truncated]");
    expect(truncateText("short")).toBe("short");
    expect(truncateText("")).toBe("");
  });

  it("maps status codes to tones", () => {
    expect(statusTone(null)).toBe("ghost");
    expect(statusTone(200)).toBe("good");
    expect(statusTone(301)).toBe("move");
    expect(statusTone(404)).toBe("warn");
    expect(statusTone(500)).toBe("danger");
  });

  it("formats elapsed time", () => {
    expect(elapsed(42)).toBe("42ms");
    expect(elapsed(null)).toBe("—");
  });

  it("previews body with cap", () => {
    const long = "a".repeat(6000);
    expect(bodyPreview(long)).toContain("[preview truncated]");
    expect(bodyPreview("ok")).toBe("ok");
  });

  it("formats tls line", () => {
    expect(tlsLine(null)).toBe("TLS: none");
    expect(
      tlsLine({
        id: "x",
        startedAt: "",
        method: "GET",
        url: "",
        host: "",
        path: "",
        requestHeaders: {},
        requestBody: "",
        status: null,
        statusText: "",
        mimeType: "",
        type: "",
        responseHeaders: {},
        responseBody: "",
        durationMs: null,
        allowed: true,
        source: "browser",
        tls: { protocol: "TLS 1.3", subjectName: "localhost", issuer: "Radar CA", validFrom: 0, validTo: 0 }
      })
    ).toContain("TLS 1.3");
  });

  it("formats tls line with missing fields", () => {
    expect(
      tlsLine({
        id: "x",
        startedAt: "",
        method: "GET",
        url: "",
        host: "",
        path: "",
        requestHeaders: {},
        requestBody: "",
        status: null,
        statusText: "",
        mimeType: "",
        type: "",
        responseHeaders: {},
        responseBody: "",
        durationMs: null,
        allowed: true,
        source: "browser",
        tls: { protocol: "", subjectName: "", issuer: "", validFrom: 0, validTo: 0 }
      })
    ).toContain("unknown");
  });
});
