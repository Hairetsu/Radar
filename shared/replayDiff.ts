import type { ReplayHistoryEntry, ReplayResult } from "./domain.js";

export type HeaderDiffEntry = {
  key: string;
  before: string;
  after: string;
  change: "added" | "removed" | "changed" | "same";
};

export type JsonDiffEntry = {
  path: string;
  before: unknown;
  after: unknown;
  change: "added" | "removed" | "changed";
};

export type ReplayDiffSummary = {
  statusChanged: boolean;
  statusBefore: number;
  statusAfter: number;
  latencyDeltaMs: number;
  bodyLengthBefore: number;
  bodyLengthAfter: number;
  bodyLengthDelta: number;
  headerDiffs: HeaderDiffEntry[];
  bodyTextDiff: string[];
  jsonDiffs: JsonDiffEntry[];
  identical: boolean;
};

function headerEntries(headers: Record<string, string>) {
  return Object.entries(headers)
    .map(([key, value]) => [key.toLowerCase(), key, value] as const)
    .sort(([left], [right]) => left.localeCompare(right));
}

export function diffHeaders(before: Record<string, string>, after: Record<string, string>): HeaderDiffEntry[] {
  const beforeMap = new Map(headerEntries(before).map(([lower, key, value]) => [lower, { key, value }]));
  const afterMap = new Map(headerEntries(after).map(([lower, key, value]) => [lower, { key, value }]));
  const keys = new Set([...beforeMap.keys(), ...afterMap.keys()]);
  const diffs: HeaderDiffEntry[] = [];

  for (const lower of [...keys].sort()) {
    const left = beforeMap.get(lower);
    const right = afterMap.get(lower);
    if (left && right) {
      diffs.push({
        key: right.key,
        before: left.value,
        after: right.value,
        change: left.value === right.value ? "same" : "changed"
      });
      continue;
    }
    if (left) {
      diffs.push({ key: left.key, before: left.value, after: "", change: "removed" });
      continue;
    }
    if (right) {
      diffs.push({ key: right.key, before: "", after: right.value, change: "added" });
    }
  }

  return diffs;
}

function lineDiff(before: string, after: string) {
  const beforeLines = before.split("\n");
  const afterLines = after.split("\n");
  const max = Math.max(beforeLines.length, afterLines.length);
  const lines: string[] = [];

  for (let index = 0; index < max; index += 1) {
    const left = beforeLines[index] ?? "";
    const right = afterLines[index] ?? "";
    if (left === right) {
      lines.push(`  ${left}`);
      continue;
    }
    if (left) {
      lines.push(`- ${left}`);
    }
    if (right) {
      lines.push(`+ ${right}`);
    }
  }

  return lines;
}

function flattenJson(value: unknown, prefix = ""): Array<[string, unknown]> {
  if (value === null || typeof value !== "object") {
    return prefix ? [[prefix, value]] : [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => flattenJson(item, prefix ? `${prefix}[${index}]` : `[${index}]`));
  }
  return Object.entries(value as Record<string, unknown>).flatMap(([key, item]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (item !== null && typeof item === "object") {
      return flattenJson(item, path);
    }
    return [[path, item] as [string, unknown]];
  });
}

export function diffJson(before: string, after: string): JsonDiffEntry[] {
  try {
    const left = JSON.parse(before) as unknown;
    const right = JSON.parse(after) as unknown;
    const leftMap = new Map(flattenJson(left));
    const rightMap = new Map(flattenJson(right));
    const paths = new Set([...leftMap.keys(), ...rightMap.keys()]);
    const diffs: JsonDiffEntry[] = [];

    for (const path of [...paths].sort()) {
      if (!leftMap.has(path)) {
        diffs.push({ path, before: undefined, after: rightMap.get(path), change: "added" });
        continue;
      }
      if (!rightMap.has(path)) {
        diffs.push({ path, before: leftMap.get(path), after: undefined, change: "removed" });
        continue;
      }
      const beforeValue = leftMap.get(path);
      const afterValue = rightMap.get(path);
      if (JSON.stringify(beforeValue) !== JSON.stringify(afterValue)) {
        diffs.push({ path, before: beforeValue, after: afterValue, change: "changed" });
      }
    }

    return diffs;
  } catch {
    return [];
  }
}

export function diffReplayResults(before: ReplayResult, after: ReplayResult): ReplayDiffSummary {
  const headerDiffs = diffHeaders(before.headers, after.headers);
  const bodyTextDiff = lineDiff(before.body, after.body);
  const jsonDiffs = diffJson(before.body, after.body);
  const bodyLengthBefore = before.body.length;
  const bodyLengthAfter = after.body.length;
  const identical =
    before.status === after.status &&
    before.body === after.body &&
    headerDiffs.every((entry) => entry.change === "same") &&
    before.durationMs === after.durationMs;

  return {
    statusChanged: before.status !== after.status,
    statusBefore: before.status,
    statusAfter: after.status,
    latencyDeltaMs: after.durationMs - before.durationMs,
    bodyLengthBefore,
    bodyLengthAfter,
    bodyLengthDelta: bodyLengthAfter - bodyLengthBefore,
    headerDiffs,
    bodyTextDiff,
    jsonDiffs,
    identical
  };
}

export function diffReplayHistory(left: ReplayHistoryEntry, right: ReplayHistoryEntry) {
  return diffReplayResults(left.result, right.result);
}
