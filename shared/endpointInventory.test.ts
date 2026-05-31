import { describe, expect, it } from "vitest";
import type { CapturedRequest } from "./domain.js";
import { buildEndpointInventory, endpointInventoryForNode } from "./endpointInventory.js";
import { buildSitemap } from "./sitemap.js";

const capture = (overrides: Partial<CapturedRequest> = {}): CapturedRequest => ({
  id: overrides.id || "cap-1",
  startedAt: overrides.startedAt || "2026-01-02T00:00:00.000Z",
  method: "POST",
  url: "https://allowed.test/api?token=abc",
  host: "allowed.test",
  path: "/api",
  requestHeaders: { Authorization: "Bearer secret", Cookie: "sid=1" },
  requestBody: '{"role":"admin"}',
  status: 401,
  statusText: "Unauthorized",
  mimeType: "application/json",
  type: "fetch",
  responseHeaders: {},
  responseBody: "{}",
  durationMs: 10,
  allowed: true,
  source: "browser",
  ...overrides
});

describe("buildEndpointInventory", () => {
  it("collects query params, body keys, and auth signals", () => {
    const inventory = buildEndpointInventory([
      capture(),
      capture({
        id: "cap-2",
        startedAt: "2026-01-01T00:00:00.000Z",
        url: "https://allowed.test/form",
        requestBody: "user=alice&role=viewer",
        mimeType: "application/x-www-form-urlencoded",
        status: 200
      })
    ]);
    expect(inventory.queryParams).toContain("token");
    expect(inventory.bodyKeys).toContain("role");
    expect(inventory.formFields).toContain("user");
    expect(inventory.authSignals).toContain("authorization:bearer");
    expect(inventory.authSignals).toContain("cookie:present");
    expect(inventory.authSignals).toContain("status:401");
    expect(inventory.examples[0]?.captureId).toBe("cap-1");
  });

  it("ignores invalid urls and non-object json", () => {
    const inventory = buildEndpointInventory([
      capture({ url: "not-a-url", requestBody: "[1,2,3]" })
    ]);
    expect(inventory.queryParams).toEqual([]);
    expect(inventory.bodyKeys).toEqual([]);
  });
});

describe("endpointInventoryForNode", () => {
  it("scopes inventory to sitemap node captures", () => {
    const captures = [
      capture({ id: "a", path: "/api/users" }),
      capture({ id: "b", path: "/api/other", requestBody: '{"other":true}' })
    ];
    const tree = buildSitemap(captures);
    const endpointId = Object.keys(tree.nodes).find((id) => tree.nodes[id]?.kind === "endpoint" && tree.nodes[id]?.path === "/api/users");
    const node = endpointId ? tree.nodes[endpointId] : null;
    expect(node).toBeTruthy();
    if (!node) {
      return;
    }
    const inventory = endpointInventoryForNode(node, captures);
    expect(inventory.bodyKeys).toContain("role");
    expect(inventory.bodyKeys).not.toContain("other");
  });
});
