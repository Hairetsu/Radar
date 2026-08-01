import type { CompletedRequest } from "mockttp";
import { describe, expect, it, vi } from "vitest";
import type {
  CapturedRequest,
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
  const controller = createInterceptController({
    currentSessionId: () => "session-1",
    allowlist: () => ["https://target.example"],
    captureById: (captureId) => captures.get(captureId),
    rememberCapture: (capture) => captures.set(capture.id, capture),
    bindCaptureToCurrentSession: vi.fn(),
    bindCaptureToSession: (capture) => capture,
    saveInterceptRules,
    saveMatchReplaceRules
  });
  return { controller, captures, saveInterceptRules, saveMatchReplaceRules };
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
});
