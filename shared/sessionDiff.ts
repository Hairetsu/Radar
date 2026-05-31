import type { CapturedRequest } from "./domain.js";

export type SessionEndpointKey = {
  host: string;
  path: string;
  method: string;
};

export type SessionEndpointSnapshot = SessionEndpointKey & {
  statusFamilies: string[];
  mimeTypes: string[];
  captureIds: string[];
  lastSeenAt: string;
  responseShape: string;
};

export type SessionDiffChangeKind = "added" | "removed" | "status-changed" | "header-changed" | "response-changed";

export type SessionDiffEntry = SessionEndpointKey & {
  kind: SessionDiffChangeKind;
  baseline?: SessionEndpointSnapshot;
  comparison?: SessionEndpointSnapshot;
  detail: string;
};

export type SessionDiffResult = {
  baselineCount: number;
  comparisonCount: number;
  entries: SessionDiffEntry[];
};

function endpointKey(capture: CapturedRequest) {
  return `${capture.host.toLowerCase()}|${capture.path}|${capture.method.toUpperCase()}`;
}

function statusFamily(status: number | null | undefined) {
  if (status === null || status === undefined || !Number.isFinite(status)) {
    return "unknown";
  }
  return `${Math.floor(Math.round(status) / 100)}xx`;
}

function responseShape(capture: CapturedRequest) {
  const body = capture.responseBody.trim();
  if (!body) {
    return "empty";
  }
  if (body.startsWith("{") || body.startsWith("[")) {
    return "json";
  }
  if (body.startsWith("<")) {
    return "html";
  }
  return `text:${body.length}`;
}

function snapshotFromCaptures(captures: CapturedRequest[]) {
  const map = new Map<string, SessionEndpointSnapshot>();
  for (const capture of captures) {
    const key = endpointKey(capture);
    const existing = map.get(key);
    const family = statusFamily(capture.status);
    const shape = responseShape(capture);
    if (!existing) {
      map.set(key, {
        host: capture.host,
        path: capture.path,
        method: capture.method.toUpperCase(),
        statusFamilies: [family],
        mimeTypes: [capture.mimeType],
        captureIds: [capture.id],
        lastSeenAt: capture.startedAt,
        responseShape: shape
      });
      continue;
    }
    if (!existing.statusFamilies.includes(family)) {
      existing.statusFamilies.push(family);
    }
    if (!existing.mimeTypes.includes(capture.mimeType)) {
      existing.mimeTypes.push(capture.mimeType);
    }
    if (!existing.captureIds.includes(capture.id)) {
      existing.captureIds.push(capture.id);
    }
    if (capture.startedAt > existing.lastSeenAt) {
      existing.lastSeenAt = capture.startedAt;
      existing.responseShape = shape;
    }
  }
  return map;
}

function headerSignature(capture: CapturedRequest) {
  return Object.keys(capture.responseHeaders)
    .sort((left, right) => left.localeCompare(right))
    .join("|");
}

function latestCaptureByEndpoint(captures: CapturedRequest[]) {
  const map = new Map<string, CapturedRequest>();
  for (const capture of captures) {
    const key = endpointKey(capture);
    const existing = map.get(key);
    if (!existing || capture.startedAt > existing.startedAt) {
      map.set(key, capture);
    }
  }
  return map;
}

export function diffSessionCaptures(baseline: CapturedRequest[], comparison: CapturedRequest[]): SessionDiffResult {
  const baselineMap = snapshotFromCaptures(baseline);
  const comparisonMap = snapshotFromCaptures(comparison);
  const baselineLatest = latestCaptureByEndpoint(baseline);
  const comparisonLatest = latestCaptureByEndpoint(comparison);
  const keys = new Set([...baselineMap.keys(), ...comparisonMap.keys()]);
  const entries: SessionDiffEntry[] = [];

  for (const key of [...keys].sort()) {
    const left = baselineMap.get(key);
    const right = comparisonMap.get(key);
    if (!left && right) {
      entries.push({
        host: right.host,
        path: right.path,
        method: right.method,
        kind: "added",
        comparison: right,
        detail: "Endpoint appeared in comparison session."
      });
      continue;
    }
    if (left && !right) {
      entries.push({
        host: left.host,
        path: left.path,
        method: left.method,
        kind: "removed",
        baseline: left,
        detail: "Endpoint missing from comparison session."
      });
      continue;
    }
    if (!left || !right) {
      continue;
    }
    const leftFamilies = [...left.statusFamilies].sort().join(",");
    const rightFamilies = [...right.statusFamilies].sort().join(",");
    if (leftFamilies !== rightFamilies) {
      entries.push({
        host: left.host,
        path: left.path,
        method: left.method,
        kind: "status-changed",
        baseline: left,
        comparison: right,
        detail: `Status families changed (${leftFamilies} -> ${rightFamilies}).`
      });
    }
    const leftCapture = baselineLatest.get(key);
    const rightCapture = comparisonLatest.get(key);
    if (leftCapture && rightCapture) {
      const leftHeaders = headerSignature(leftCapture);
      const rightHeaders = headerSignature(rightCapture);
      if (leftHeaders !== rightHeaders) {
        entries.push({
          host: left.host,
          path: left.path,
          method: left.method,
          kind: "header-changed",
          baseline: left,
          comparison: right,
          detail: "Response headers changed."
        });
      }
      if (left.responseShape !== right.responseShape) {
        entries.push({
          host: left.host,
          path: left.path,
          method: left.method,
          kind: "response-changed",
          baseline: left,
          comparison: right,
          detail: `Response shape changed (${left.responseShape} -> ${right.responseShape}).`
        });
      }
    }
  }

  return {
    baselineCount: baselineMap.size,
    comparisonCount: comparisonMap.size,
    entries
  };
}
