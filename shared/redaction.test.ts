import { describe, expect, it } from "vitest";
import { redactSensitiveHeaders, redactSensitiveText } from "./redaction";

describe("shared redaction", () => {
  it("redacts credential headers while retaining non-sensitive metadata", () => {
    expect(redactSensitiveHeaders({ Authorization: "Bearer secret", Cookie: "sid=secret", Accept: "application/json" })).toEqual({
      Authorization: "[REDACTED]",
      Cookie: "[REDACTED]",
      Accept: "application/json"
    });
  });

  it("redacts token-shaped body values", () => {
    expect(redactSensitiveText('{"apiKey":"fixture-secret","sessionToken":"token-value"}')).not.toContain("fixture-secret");
    expect(redactSensitiveText("Bearer fixture-token")).toBe("[REDACTED]");
  });
});
