import { describe, expect, it } from "vitest";
import type { CapturedRequest } from "./domain";
import {
  applyClientOverrides,
  clientOverrideFromCapture,
  isOverridableClientCapture,
  normalizeClientOverrides,
  relaxClientValidation
} from "./clientOverrides";

const capture: CapturedRequest = {
  id: "cap-form",
  startedAt: "2026-05-25T00:00:00.000Z",
  method: "GET",
  url: "http://127.0.0.1:3000/src/formValidation.ts",
  host: "127.0.0.1:3000",
  path: "/src/formValidation.ts",
  requestHeaders: {},
  requestBody: "",
  status: 200,
  statusText: "OK",
  mimeType: "text/javascript",
  type: "Script",
  responseHeaders: {
    ETag: "abc",
    "Cache-Control": "max-age=3600",
    "Content-Length": "240"
  },
  responseBody: `export function validateShipmentQuery(query: string) {
  if (!/^[a-zA-Z0-9 .,&-]+$/.test(query)) {
    return invalid("Use letters, numbers, spaces, periods, commas, ampersands, or hyphens.");
  }
  return valid();
}`,
  durationMs: 8,
  allowed: true,
  source: "proxy",
  tls: null
};

describe("client overrides", () => {
  it("recognizes HTML, JS, and CSS captures and rejects binary assets", () => {
    expect(isOverridableClientCapture(capture)).toBe(true);
    expect(
      isOverridableClientCapture({
        ...capture,
        url: "http://127.0.0.1:3000/index.html",
        path: "/index.html",
        mimeType: "text/html"
      })
    ).toBe(true);
    expect(
      isOverridableClientCapture({
        ...capture,
        url: "http://127.0.0.1:3000/logo.png",
        path: "/logo.png",
        mimeType: "image/png"
      })
    ).toBe(false);
  });

  it("builds, normalizes, and de-duplicates overrides from a capture", () => {
    const created = clientOverrideFromCapture(capture, "now");
    expect(created).toEqual(
      expect.objectContaining({
        name: "formValidation.ts",
        host: "127.0.0.1:3000",
        path: "/src/formValidation.ts",
        captureId: "cap-form",
        enabled: true
      })
    );
    expect(
      normalizeClientOverrides(
        [
          created,
          { name: "formValidation.ts", host: "127.0.0.1:3000", path: "/src/formValidation.ts", body: "updated" },
          { name: "missing-host", path: "/app.js" }
        ],
        "later"
      )
    ).toEqual([
      expect.objectContaining({
        body: "updated",
        updatedAt: "later"
      })
    ]);
    expect(normalizeClientOverrides("bad")).toEqual([]);
  });

  it("relaxes HTML constraints and Harborline validator returns", () => {
    const html = relaxClientValidation(
      `<form><input required maxlength="32" pattern="[A-Za-z]+" /></form>`
    );
    expect(html.changes).toEqual([
      "Removed HTML required, pattern, and length attributes",
      "Added noValidate to forms"
    ]);
    expect(html.body).toContain("<form noValidate>");
    expect(html.body).not.toContain("required");
    expect(html.body).not.toContain("maxlength");

    const js = relaxClientValidation(capture.responseBody);
    expect(js.changes).toContain("Passed client validator returns");
    expect(js.body).toContain("return valid()");
    expect(js.body).not.toContain("return invalid(");

    const jsx = relaxClientValidation(`<input maxLength={60} minLength={2} />`);
    expect(jsx.body).not.toMatch(/maxLength|minLength/);
  });

  it("replaces an in-scope response body and busts cache headers", () => {
    const rules = normalizeClientOverrides([
      {
        id: "client-form",
        name: "formValidation.ts",
        host: "127.0.0.1:3000",
        path: "/src/formValidation.ts",
        body: "export function validateShipmentQuery() { return valid(); }"
      }
    ]);
    const result = applyClientOverrides(rules, capture);
    expect(result.changed).toBe(true);
    expect(result.capture.responseBody).toContain("return valid()");
    expect(result.capture.responseHeaders["Cache-Control"]).toBe("no-store");
    expect(result.capture.responseHeaders.ETag).toBeUndefined();
    expect(result.hits[0]?.detail).toBe("client-file: 127.0.0.1:3000/src/formValidation.ts");
  });

  it("skips disabled, mismatched, and out-of-scope overrides", () => {
    const rules = normalizeClientOverrides([
      {
        name: "other",
        host: "127.0.0.1:3000",
        path: "/src/other.ts",
        body: "nope"
      },
      {
        name: "disabled",
        enabled: false,
        host: "127.0.0.1:3000",
        path: "/src/formValidation.ts",
        body: "disabled"
      }
    ]);
    expect(applyClientOverrides(rules, capture).changed).toBe(false);
    expect(applyClientOverrides(rules, { ...capture, allowed: false }).changed).toBe(false);
  });
});
