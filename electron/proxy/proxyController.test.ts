import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { CompletedRequest } from "mockttp";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CapturedRequest } from "../../shared/domain.js";

const proxyMocks = vi.hoisted(() => {
  const callbacks = new Map<string, unknown>();
  const passThrough = vi.fn(async () => undefined);
  const server = {
    port: 43_123,
    start: vi.fn(async () => undefined),
    stop: vi.fn(async () => undefined),
    on: vi.fn(async (event: string, callback: unknown) => {
      callbacks.set(event, callback);
    }),
    forAnyWebSocket: vi.fn(() => ({ thenPassThrough: passThrough })),
    forAnyRequest: vi.fn(() => ({
      waitForRequestBody: () => ({ thenPassThrough: passThrough })
    }))
  };
  return { callbacks, server, passThrough };
});

vi.mock("mockttp", () => ({
  generateCACertificate: vi.fn(async () => ({ cert: "test certificate", key: "test key" })),
  generateSPKIFingerprint: vi.fn(async () => "test-fingerprint"),
  getLocal: vi.fn(() => proxyMocks.server)
}));

import { createProxyController } from "./proxyController.js";

const temporaryDirectories: string[] = [];

afterEach(() => {
  proxyMocks.callbacks.clear();
  vi.clearAllMocks();
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

function requestFixture() {
  return {
    id: "request-1",
    method: "GET",
    url: "https://target.example/api",
    headers: {},
    body: { getText: async () => "request body" },
    protocol: "https",
    destination: { hostname: "target.example" },
    timingEvents: { startTime: 1_000 }
  } as unknown as CompletedRequest;
}

describe("proxy controller", () => {
  it("owns CA, proxy state, and capture event wiring", async () => {
    const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), "radar-proxy-controller-"));
    temporaryDirectories.push(userDataPath);
    const captures = new Map<string, CapturedRequest>();
    const rememberSslEvent = vi.fn();
    const controller = createProxyController({
      userDataPath,
      regressionMode: true,
      defaultPort: 8_088,
      currentSessionId: () => "session-1",
      allowlist: () => ["https://target.example"],
      captureById: (captureId) => captures.get(captureId),
      bindCaptureToCurrentSession: vi.fn(),
      bindCaptureToSession: (capture) => capture,
      rememberCapture: (capture) => captures.set(capture.id, capture),
      rememberSslEvent,
      rememberWebSocketRequest: vi.fn(),
      rememberWebSocketAccepted: vi.fn(),
      rememberWebSocketMessage: vi.fn(),
      rememberWebSocketClose: vi.fn(),
      queueInterceptRequest: vi.fn(async () => undefined),
      queueInterceptResponse: vi.fn(async () => undefined)
    });

    const ca = await controller.ensureCa();
    expect(ca).toEqual(
      expect.objectContaining({
        caFingerprint: "test-fingerprint",
        caCertPath: expect.stringContaining("radar-ca.pem")
      })
    );
    expect(fs.readFileSync(ca.caKeyPath, "utf8")).toBe("test key");

    await controller.start();
    expect(controller.state()).toEqual(
      expect.objectContaining({ running: true, port: 43_123, proxyUrl: "http://127.0.0.1:43123" })
    );

    const onRequest = proxyMocks.callbacks.get("request") as (
      request: CompletedRequest
    ) => Promise<void>;
    await onRequest(requestFixture());
    expect(captures.get("request-1")).toEqual(
      expect.objectContaining({ url: "https://target.example/api", requestBody: "request body" })
    );

    const onResponse = proxyMocks.callbacks.get("response") as (
      response: Record<string, unknown>
    ) => Promise<void>;
    await onResponse({
      id: "request-1",
      statusCode: 201,
      statusMessage: "Created",
      headers: { "content-type": "application/json" },
      body: { getText: async () => "{\"ok\":true}" },
      timingEvents: { startTimestamp: 10, responseSentTimestamp: 25 }
    });
    expect(captures.get("request-1")).toEqual(
      expect.objectContaining({ status: 201, responseBody: "{\"ok\":true}", durationMs: 15 })
    );

    const onTlsError = proxyMocks.callbacks.get("tls-client-error") as (
      event: Record<string, string>
    ) => Promise<void>;
    await onTlsError({ remoteIpAddress: "127.0.0.1", failureCause: "unknown-ca" });
    expect(rememberSslEvent).toHaveBeenCalledWith(
      expect.objectContaining({ error: "unknown-ca", trusted: false })
    );

    await controller.stop();
    expect(controller.state().running).toBe(false);
    expect(proxyMocks.server.stop).toHaveBeenCalledOnce();
  });
});
