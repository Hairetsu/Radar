import { describe, expect, it } from "vitest";
import { toCaptureEntry, proxyRequestToCapture } from "./capture";

describe("capture", () => {
  it("builds a capture entry from a request", () => {
    const entry = toCaptureEntry({
      requestId: "req-1",
      request: {
        method: "GET",
        url: "http://localhost:3000/api?q=1",
        headers: { Accept: "application/json" },
        postData: ""
      }
    });

    expect(entry.id).toBe("req-1");
    expect(entry.host).toBe("localhost:3000");
    expect(entry.path).toBe("/api?q=1");
    expect(entry.allowed).toBe(true);
    expect(entry.source).toBe("browser");
  });

  it("marks external urls as not allowed by default", () => {
    const entry = toCaptureEntry({
      requestId: "req-2",
      request: {
        method: "GET",
        url: "https://external.example",
        headers: {},
        postData: ""
      }
    });
    expect(entry.allowed).toBe(false);
  });

  it("builds proxy capture with tls metadata", () => {
    const entry = proxyRequestToCapture({
      req: {
        id: "p-1",
        method: "GET",
        url: "https://localhost:8443/secure",
        headers: {},
        protocol: "https",
        destination: { hostname: "localhost" },
        timingEvents: { startTime: Date.now() }
      },
      bodyText: "body"
    });

    expect(entry.source).toBe("proxy");
    expect(entry.tls?.issuer).toBe("Radar Local Proxy CA");
  });

  it("respects custom allowlist rules", () => {
    const entry = toCaptureEntry({
      requestId: "req-4",
      request: {
        method: "GET",
        url: "https://allowed.test/path",
        headers: {},
        postData: ""
      },
      rules: ["https://allowed.test"]
    });
    expect(entry.allowed).toBe(true);
  });

  it("handles invalid capture urls", () => {
    const entry = toCaptureEntry({
      requestId: "req-3",
      request: { method: "GET", url: "not-a-valid-url", headers: {}, postData: "" }
    });
    expect(entry.path).toBe("/");
    expect(entry.host).toBe("not-a-valid-url");
  });

  it("defaults missing request fields", () => {
    const entry = toCaptureEntry({
      requestId: "req-5",
      request: { headers: {}, postData: "payload" }
    });
    expect(entry.method).toBe("GET");
    expect(entry.url).toBe("");
    expect(entry.requestBody).toBe("payload");
  });

  it("builds proxy capture without tls for http", () => {
    const entry = proxyRequestToCapture({
      req: {
        id: "p-2",
        method: "GET",
        url: "http://localhost:8080/plain",
        headers: {},
        timingEvents: { startTime: 1_700_000_000_000 }
      },
      bodyText: ""
    });

    expect(entry.tls).toBeNull();
    expect(entry.startedAt).toBe(new Date(1_700_000_000_000).toISOString());
  });

  it("builds proxy capture with minimal tls metadata", () => {
    const entry = proxyRequestToCapture({
      req: {
        id: "p-3",
        url: "https://localhost/secure",
        headers: {}
      },
      bodyText: "payload"
    });

    expect(entry.tls?.subjectName).toBe("");
    expect(entry.tls?.protocol).toBe("https");
    expect(entry.requestBody).toBe("payload");
  });
});
