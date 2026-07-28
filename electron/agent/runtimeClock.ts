import { randomUUID } from "node:crypto";
import type { AgentTimelineEntry } from "../../shared/agent-types.js";

export function nowIso() {
  return new Date().toISOString();
}

export function createId(prefix: string) {
  return `${prefix}_${randomUUID()}`;
}

export function timeline(
  note: string,
  extra: Partial<AgentTimelineEntry> = {}
): AgentTimelineEntry {
  return {
    id: createId("step"),
    createdAt: nowIso(),
    note,
    ...extra
  };
}
