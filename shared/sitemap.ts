import type { CapturedRequest } from "./domain.js";

export type SitemapNodeKind = "host" | "path" | "endpoint";

export type SitemapNode = {
  id: string;
  kind: SitemapNodeKind;
  host: string;
  path: string;
  methods: string[];
  statusFamilies: string[];
  mimeTypes: string[];
  requestCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
  captureIds: string[];
  childIds: string[];
};

export type SitemapTree = {
  roots: string[];
  nodes: Record<string, SitemapNode>;
};

function statusFamily(status: number | null | undefined) {
  if (status === null || status === undefined || !Number.isFinite(status)) {
    return "unknown";
  }
  return `${Math.floor(Math.round(status) / 100)}xx`;
}

function uniqueSorted(values: string[]) {
  return [...new Set(values.filter(Boolean))].sort((left, right) => left.localeCompare(right));
}

function endpointKey(capture: CapturedRequest) {
  return `${capture.host.toLowerCase()}|${capture.path}|${capture.method.toUpperCase()}`;
}

export function buildSitemap(captures: CapturedRequest[]): SitemapTree {
  const nodes: Record<string, SitemapNode> = {};
  const hostChildren = new Map<string, Set<string>>();
  const pathChildren = new Map<string, Set<string>>();

  for (const capture of captures) {
    const hostId = `host:${capture.host.toLowerCase()}`;
    const pathId = `path:${capture.host.toLowerCase()}|${capture.path}`;
    const endpointId = `endpoint:${endpointKey(capture)}`;
    const family = statusFamily(capture.status);
    const seenAt = capture.startedAt;

    if (!nodes[hostId]) {
      nodes[hostId] = {
        id: hostId,
        kind: "host",
        host: capture.host,
        path: "",
        methods: [],
        statusFamilies: [],
        mimeTypes: [],
        requestCount: 0,
        firstSeenAt: seenAt,
        lastSeenAt: seenAt,
        captureIds: [],
        childIds: []
      };
      hostChildren.set(hostId, new Set());
    }
    if (!nodes[pathId]) {
      nodes[pathId] = {
        id: pathId,
        kind: "path",
        host: capture.host,
        path: capture.path,
        methods: [],
        statusFamilies: [],
        mimeTypes: [],
        requestCount: 0,
        firstSeenAt: seenAt,
        lastSeenAt: seenAt,
        captureIds: [],
        childIds: []
      };
      pathChildren.set(pathId, new Set());
      hostChildren.get(hostId)?.add(pathId);
    }
    if (!nodes[endpointId]) {
      nodes[endpointId] = {
        id: endpointId,
        kind: "endpoint",
        host: capture.host,
        path: capture.path,
        methods: [capture.method.toUpperCase()],
        statusFamilies: [family],
        mimeTypes: [capture.mimeType],
        requestCount: 0,
        firstSeenAt: seenAt,
        lastSeenAt: seenAt,
        captureIds: [],
        childIds: []
      };
      pathChildren.get(pathId)?.add(endpointId);
    }

    for (const nodeId of [hostId, pathId, endpointId]) {
      const node = nodes[nodeId];
      node.requestCount += 1;
      node.firstSeenAt = node.firstSeenAt <= seenAt ? node.firstSeenAt : seenAt;
      node.lastSeenAt = node.lastSeenAt >= seenAt ? node.lastSeenAt : seenAt;
      if (!node.captureIds.includes(capture.id)) {
        node.captureIds.push(capture.id);
      }
      node.methods = uniqueSorted([...node.methods, capture.method.toUpperCase()]);
      node.statusFamilies = uniqueSorted([...node.statusFamilies, family]);
      node.mimeTypes = uniqueSorted([...node.mimeTypes, capture.mimeType]);
    }
  }

  for (const [hostId, childSet] of hostChildren.entries()) {
    nodes[hostId].childIds = [...childSet].sort((left, right) => nodes[left].path.localeCompare(nodes[right].path));
  }
  for (const [pathId, childSet] of pathChildren.entries()) {
    nodes[pathId].childIds = [...childSet].sort((left, right) =>
      nodes[left].methods.join(",").localeCompare(nodes[right].methods.join(","))
    );
  }

  return {
    roots: [...hostChildren.keys()].sort((left, right) => nodes[left].host.localeCompare(nodes[right].host)),
    nodes
  };
}

export function sitemapQueryForNode(node: SitemapNode) {
  if (node.kind === "host") {
    return `host:${node.host}`;
  }
  if (node.kind === "path") {
    return `host:${node.host} path:${node.path}`;
  }
  const method = node.methods[0] || "GET";
  return `host:${node.host} path:${node.path} method:${method}`;
}
