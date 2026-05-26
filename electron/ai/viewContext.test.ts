import { describe, expect, it } from "vitest";
import { appendViewContext, contextBlockedReason } from "./viewContext.js";

describe("viewContext", () => {
  it("requires captures on traffic view", () => {
    expect(
      contextBlockedReason({
        view: "traffic",
        captures: [],
        viewContext: { view: "traffic" }
      })
    ).toContain("Select at least one capture");
  });

  it("allows scope view with targets only", () => {
    expect(
      contextBlockedReason({
        view: "scope",
        captures: [],
        viewContext: { view: "scope", targets: ["http://localhost:*"] }
      })
    ).toBeUndefined();
  });

  it("requires repeater draft or capture", () => {
    expect(
      contextBlockedReason({
        view: "repeater",
        captures: [],
        viewContext: { view: "repeater" }
      })
    ).toContain("repeater draft");
  });

  it("requires ssl events or tls captures", () => {
    expect(
      contextBlockedReason({
        view: "ssl",
        captures: [],
        viewContext: { view: "ssl", sslEvents: [] }
      })
    ).toContain("SSL events");
  });

  it("rejects scope view with blank targets", () => {
    expect(
      contextBlockedReason({
        view: "scope",
        captures: [],
        viewContext: { view: "scope", targets: ["  ", ""] }
      })
    ).toContain("Add at least one scope target");
  });

  it("allows repeater view with capture only", () => {
    expect(
      contextBlockedReason({
        view: "repeater",
        captures: [
          {
            id: "cap-1",
            startedAt: "",
            method: "GET",
            url: "http://localhost",
            host: "localhost",
            path: "/",
            requestHeaders: {},
            requestBody: "",
            status: 200,
            statusText: "OK",
            mimeType: "",
            type: "Document",
            responseHeaders: {},
            responseBody: "",
            durationMs: 1,
            allowed: true,
            source: "browser"
          }
        ],
        viewContext: { view: "repeater" }
      })
    ).toBeUndefined();
  });

  it("allows repeater view with draft only", () => {
    expect(
      contextBlockedReason({
        view: "repeater",
        captures: [],
        viewContext: { view: "repeater", draft: { method: "GET", url: "http://localhost", headers: {}, body: "" } }
      })
    ).toBeUndefined();
  });

  it("allows ssl view with tls capture", () => {
    expect(
      contextBlockedReason({
        view: "ssl",
        captures: [
          {
            id: "cap-1",
            startedAt: "",
            method: "GET",
            url: "https://localhost",
            host: "localhost",
            path: "/",
            requestHeaders: {},
            requestBody: "",
            status: 200,
            statusText: "OK",
            mimeType: "",
            type: "Document",
            responseHeaders: {},
            responseBody: "",
            durationMs: 1,
            allowed: true,
            source: "browser",
            tls: {
              protocol: "TLS 1.3",
              issuer: "Radar",
              subjectName: "localhost",
              validFrom: 0,
              validTo: 0
            }
          }
        ],
        viewContext: { view: "ssl", sslEvents: [] }
      })
    ).toBeUndefined();
  });

  it("returns base text when no view context is provided", () => {
    expect(appendViewContext("BASE")).toBe("BASE");
  });

  it("appends view-specific context blocks", () => {
    const text = appendViewContext("BASE", {
      view: "repeater",
      draft: { method: "POST", url: "http://localhost/api", headers: { A: "1" }, body: "{}" },
      lastResponse: { status: 500, statusText: "Error", body: "fail" },
      targets: ["http://localhost:*"],
      sslEvents: [
        {
          id: "ssl-1",
          url: "https://localhost",
          error: "bad cert",
          trusted: false,
          createdAt: "2026-05-25T00:00:00.000Z"
        }
      ],
      proxyRunning: true,
      proxyUrl: "http://127.0.0.1:8088",
      caCertPath: "/tmp/ca.pem"
    });

    expect(text).toContain("BASE");
    expect(text).toContain("REPEATER DRAFT");
    expect(text).toContain("LAST REPLAY RESPONSE");
    expect(text).toContain("SCOPE TARGETS");
    expect(text).toContain("SSL EVENTS");
    expect(text).toContain("PROXY STATE");
  });
});
