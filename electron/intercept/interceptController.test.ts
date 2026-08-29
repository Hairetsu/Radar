import type { CompletedRequest } from "mockttp";
import { describe, expect, it, vi } from "vitest";
import type {
  CapturedRequest,
  ClientOverride,
  InterceptRule,
  MatchReplaceRule
} from "../../shared/domain.js";
import { createInterceptController } from "./interceptController.js";

function proxyRequest(id = "request-1", url = "https://target.example/api") {
  return {
    id,
    method: "POST",
    url,
    headers: { "content-type": "application/json" },
    body: { getText: async () => "{\"role\":\"user\"}" },
    protocol: "https",
    destination: { hostname: "target.example" },
    timingEvents: { startTime: Date.now() }
  } as unknown as CompletedRequest;
}

function createController() {
  const captures = new Map<string, CapturedRequest>();
  const saveInterceptRules = vi.fn((rules: InterceptRule[]) => rules);
  const saveMatchReplaceRules = vi.fn((rules: MatchReplaceRule[]) => rules);
  const saveClientOverrides = vi.fn((overrides: ClientOverride[]) => overrides);
  const controller = createInterceptController({
    currentSessionId: () => "session-1",
    allowlist: () => ["https://target.example"],
    captureById: (captureId) => captures.get(captureId),
    rememberCapture: (capture) => captures.set(capture.id, capture),
    bindCaptureToCurrentSession: vi.fn(),
    bindCaptureToSession: (capture) => capture,
    saveInterceptRules,
    saveMatchReplaceRules,
    saveClientOverrides
  });
  return { controller, captures, saveInterceptRules, saveMatchReplaceRules, saveClientOverrides };
}

async function queuedRequest(controller: ReturnType<typeof createInterceptController>) {
  controller.configure({ requestEnabled: true });
  const pendingResult = controller.queueRequest(proxyRequest());
  await Promise.resolve();
  await Promise.resolve();
  const item = controller.state().queue[0];
  if (!item) throw new Error("Expected request to enter the intercept queue.");
  return { item, pendingResult };
}

describe("intercept controller", () => {
  it("queues scoped requests and forwards normalized operator edits", async () => {
    const { controller, captures } = createController();
    const { item, pendingResult } = await queuedRequest(controller);

    controller.forward(item.id, {
      method: "PUT",
      url: "https://target.example/edited",
      headers: { "x-edit": "true" },
      body: "updated"
    });

    await expect(pendingResult).resolves.toEqual({
      method: "PUT",
      url: "https://target.example/edited",
      headers: { "x-edit": "true" },
      body: "updated"
    });
    expect(controller.state().queue).toEqual([]);
    expect(captures.get("request-1")).toEqual(
      expect.objectContaining({
        method: "PUT",
        path: "/edited",
        intercept: [expect.objectContaining({ resolution: "edited", edited: true })]
      })
    );
  });

  it("keeps out-of-scope edits queued and resolves an explicit drop fail closed", async () => {
    const { controller, captures } = createController();
    const { item, pendingResult } = await queuedRequest(controller);

    expect(() =>
      controller.forward(item.id, {
        method: "GET",
        url: "https://outside.example/",
        headers: {},
        body: ""
      })
    ).toThrow("out of scope");
    expect(controller.state().queue).toHaveLength(1);

    controller.drop(item.id);
    await expect(pendingResult).resolves.toEqual({ response: "close" });
    expect(captures.get("request-1")).toEqual(
      expect.objectContaining({ status: 0, statusText: "Dropped by Radar intercept" })
    );
  });

  it("normalizes and persists rule families behind controller methods", () => {
    const { controller, saveInterceptRules, saveMatchReplaceRules } = createController();
    const rules = controller.setRules([{ name: "API posts", stage: "request", method: "post" }]);
    const rewrites = controller.setMatchReplaceRules([
      { name: "Role", stage: "request", target: "body", match: "user", replace: "admin" }
    ]);

    expect(rules[0]).toEqual(expect.objectContaining({ method: "POST", enabled: true }));
    expect(rewrites[0]).toEqual(expect.objectContaining({ target: "body", match: "user" }));
    expect(saveInterceptRules).toHaveBeenCalledWith(rules);
    expect(saveMatchReplaceRules).toHaveBeenCalledWith(rewrites);
  });

  it("applies a client file override to an in-scope response without pausing", async () => {
    const { controller, captures, saveClientOverrides } = createController();
    const overrides = controller.setClientOverrides([
      {
        name: "app.js",
        host: "target.example",
        path: "/app.js",
        body: "window.validate = () => true;"
      }
    ]);
    expect(saveClientOverrides).toHaveBeenCalledWith(overrides);

    const result = await controller.queueResponse(
      {
        id: "script-1",
        statusCode: 200,
        statusMessage: "OK",
        headers: { etag: "abc", "content-type": "application/javascript" },
        body: { getText: async () => "window.validate = () => false;" }
      },
      proxyRequest("script-1", "https://target.example/app.js")
    );

    expect(result).toEqual(
      expect.objectContaining({
        body: "window.validate = () => true;",
        headers: expect.objectContaining({ "Cache-Control": "no-store" })
      })
    );
    expect(captures.get("script-1")?.rewrites?.[0]?.detail).toBe("client-file: target.example/app.js");
  });

  it("does not rewrite an out-of-scope client file", async () => {
    const { controller } = createController();
    controller.setClientOverrides([
      { name: "app.js", host: "outside.example", path: "/app.js", body: "stolen" }
    ]);
    await expect(
      controller.queueResponse(
        {
          id: "script-2",
          statusCode: 200,
          headers: {},
          body: { getText: async () => "original" }
        },
        proxyRequest("script-2", "https://outside.example/app.js")
      )
    ).resolves.toBeUndefined();
  });
});
