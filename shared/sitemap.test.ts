import { describe, expect, it } from "vitest";
import type { CapturedRequest } from "./domain.js";
import { buildSitemap, sitemapQueryForNode } from "./sitemap.js";

const capture = (overrides: Partial<CapturedRequest> = {}): CapturedRequest => ({
  id: overrides.id || "cap-1",
  startedAt: overrides.startedAt || "2026-01-01T00:00:00.000Z",
  method: overrides.method || "GET",
  url: overrides.url || "https://allowed.test/api/users",
  host: overrides.host || "allowed.test",
  path: overrides.path || "/api/users",
  requestHeaders: {},
  requestBody: "",
  status: overrides.status ?? 200,
  statusText: "OK",
  mimeType: "application/json",
  type: "fetch",
  responseHeaders: {},
  responseBody: "",
  durationMs: 12,
  allowed: true,
  source: "browser",
  ...overrides
});

describe("buildSitemap", () => {
  it("groups hosts, paths, and endpoints", () => {
    const tree = buildSitemap([
      capture({ id: "a", method: "GET", path: "/api/users" }),
      capture({ id: "b", method: "POST", path: "/api/users", status: 401 })
    ]);
    expect(tree.roots).toHaveLength(1);
    const host = tree.nodes[tree.roots[0]!];
    expect(host.requestCount).toBe(2);
    expect(host.childIds.length).toBeGreaterThan(0);
    const endpointNodes = Object.values(tree.nodes).filter((node) => node.kind === "endpoint");
    expect(endpointNodes).toHaveLength(2);
  });

  it("tracks first and last seen timestamps", () => {
    const tree = buildSitemap([
      capture({ id: "a", startedAt: "2026-01-01T00:00:00.000Z" }),
      capture({ id: "b", startedAt: "2026-01-03T00:00:00.000Z", method: "POST" })
    ]);
    const host = tree.nodes[tree.roots[0]!];
    expect(host.firstSeenAt).toBe("2026-01-01T00:00:00.000Z");
    expect(host.lastSeenAt).toBe("2026-01-03T00:00:00.000Z");
  });

  it("uses unknown status family when status is missing", () => {
    const tree = buildSitemap([capture({ status: null })]);
    const host = tree.nodes[tree.roots[0]!];
    expect(host.statusFamilies).toContain("unknown");
  });
});

describe("sitemapQueryForNode", () => {
  it("builds traffic queries for host, path, and endpoint nodes", () => {
    const tree = buildSitemap([capture({ method: "DELETE", path: "/admin" })]);
    const host = tree.nodes[tree.roots[0]!];
    expect(sitemapQueryForNode(host)).toBe("host:allowed.test");
    const pathNode = tree.nodes[host.childIds[0]!];
    expect(sitemapQueryForNode(pathNode)).toBe("host:allowed.test path:/admin");
    const endpointNode = tree.nodes[pathNode.childIds[0]!];
    expect(sitemapQueryForNode(endpointNode)).toBe("host:allowed.test path:/admin method:DELETE");
  });
});
