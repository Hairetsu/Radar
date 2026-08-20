import { describe, expect, it } from "vitest";
import {
  validateDocumentPath,
  validateFeedUrl,
  validateInvoiceId,
  validateLogin,
  validateProfile,
  validateShipmentQuery,
  validateSupportMessage
} from "./formValidation";

describe("Harborline form validation", () => {
  it("accepts the normal portal workflows", () => {
    expect(validateLogin({ username: "operator", password: "harbor-2026" })).toEqual({ kind: "valid" });
    expect(validateShipmentQuery("Orion Machine Works")).toEqual({ kind: "valid" });
    expect(validateInvoiceId("INV-1007")).toEqual({ kind: "valid" });
    expect(validateDocumentPath("quarterly/manifest.txt")).toEqual({ kind: "valid" });
    expect(validateFeedUrl("https://status.example.test/feed")).toEqual({ kind: "valid" });
    expect(validateSupportMessage("Container arrived with a broken seal.")).toEqual({ kind: "valid" });
    expect(validateProfile({ displayName: "Mira Chen", jobTitle: "Dispatch coordinator" })).toEqual({
      kind: "valid"
    });
  });

  it("blocks SQL-shaped values in login and shipment forms", () => {
    expect(validateLogin({ username: "' OR '1'='1' --", password: "wrong-password" }).kind).toBe("invalid");
    expect(validateShipmentQuery("' OR '1'='1' --").kind).toBe("invalid");
  });

  it("blocks objects and files that the portal did not list", () => {
    expect(validateInvoiceId("INV-1008")).toEqual({
      kind: "invalid",
      message: "That invoice is not assigned to your account."
    });
    expect(validateDocumentPath("../../../../etc/passwd").kind).toBe("invalid");
  });

  it("blocks internal feed destinations and markup", () => {
    expect(validateFeedUrl("http://169.254.169.254/latest/meta-data/").kind).toBe("invalid");
    expect(validateFeedUrl("http://metadata.internal/latest").kind).toBe("invalid");
    expect(validateSupportMessage("<img src=x onerror=alert(1)>").kind).toBe("invalid");
  });

  it("blocks unexpected profile syntax without exposing privileged fields", () => {
    expect(validateProfile({ displayName: "Mira Chen", jobTitle: "<script>admin</script>" }).kind).toBe(
      "invalid"
    );
  });
});
