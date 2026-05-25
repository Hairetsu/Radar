import { describe, expect, it } from "vitest";
const { toCaptureEntry, proxyRequestToCapture } = require("./capture.cjs");

describe("capture", () => {
  it("builds a capture entry from a request", () => {
    const entry = toCaptureEntry("req-1", {
      method: "GET",
      url: "http://localhost:3000/api?q=1",
      headers: { Accept: "application/json" },
      postData: ""
    });

    expect(entry.id).toBe("req-1");
    expect(entry.host).toBe("localhost:3000");
    expect(entry.path).toBe("/api?q=1");
    expect(entry.allowed).toBe(true);
    expect(entry.source).toBe("browser");
  });

  it("marks external urls as not allowed by default", () => {
    const entry = toCaptureEntry("req-2", {
      method: "GET",
      url: "https://external.example",
      headers: {},
      postData: ""
    });
    expect(entry.allowed).toBe(false);
  });

  it("builds proxy capture with tls metadata", () => {
    const entry = proxyRequestToCapture(
      {
        id: "p-1",
        method: "GET",
        url: "https://localhost:8443/secure",
        headers: {},
        protocol: "https",
        destination: { hostname: "localhost" },
        timingEvents: { startTime: Date.now() }
      },
      "body"
    );

    expect(entry.source).toBe("proxy");
    expect(entry.tls?.issuer).toBe("Radar Local Proxy CA");
  });

  it("handles invalid capture urls", () => {
    const entry = toCaptureEntry("req-3", { method: "GET", url: "not-a-valid-url", headers: {}, postData: "" });
    expect(entry.path).toBe("/");
    expect(entry.host).toBe("not-a-valid-url");
  });
});
