import { describe, expect, it } from "vitest";
import type { PluginApiRequest } from "./domain.js";
import { createRadarPluginSdk } from "./pluginSdk.js";

describe("plugin SDK", () => {
  it("wraps typed SDK methods into plugin API requests", async () => {
    const requests: PluginApiRequest[] = [];
    const sdk = createRadarPluginSdk("jwt-helper", {
      request: async (request) => {
        requests.push(request);
        return { ok: true, action: request.action, data: [] };
      }
    });

    await sdk.listCaptures("method:POST");
    await sdk.listFrames();
    await sdk.listWorkflows();

    expect(requests.map((request) => request.action)).toEqual(["captures:list", "frames:list", "workflows:list"]);
    expect(requests[0]).toEqual({ pluginId: "jwt-helper", action: "captures:list", input: { query: "method:POST" } });
  });

  it("throws when the local plugin API denies an action", async () => {
    const sdk = createRadarPluginSdk("jwt-helper", {
      request: async (request) => ({ ok: false, action: request.action, data: null, error: "Permission denied" })
    });

    await expect(sdk.sendReplay({ method: "GET", url: "https://example.test", headers: {}, body: "" })).rejects.toThrow(
      /Permission denied/
    );
  });

  it("requires a plugin id", () => {
    expect(() => createRadarPluginSdk("", { request: async (request) => ({ ok: true, action: request.action, data: null }) })).toThrow(
      /Plugin id/
    );
  });
});
