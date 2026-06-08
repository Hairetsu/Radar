import type {
  AgentRunMemoryEntry,
  AgentRunMemoryKind,
  AgentRunMemoryRetestState,
  AgentRunMemoryStatus
} from "./agent-types.js";

export const MAX_AGENT_RUN_MEMORY = 120;
const MAX_TITLE = 160;
const MAX_NOTES = 4000;
const MAX_EVIDENCE_REFS = 24;

const memoryKinds: AgentRunMemoryKind[] = ["hypothesis", "dismissed-lead", "retest-note"];
const memoryStatuses: AgentRunMemoryStatus[] = [
  "proposed",
  "confirmed",
  "dismissed",
  "retest-pending",
  "retest-passed",
  "retest-failed"
];
const retestStates: AgentRunMemoryRetestState[] = ["not-started", "pending", "passed", "failed"];

function nowIso() {
  return new Date().toISOString();
}

function cleanLine(value: unknown, fallback = "") {
  const text = String(value || "").trim().replace(/\s+/g, " ");
  return (text || fallback).slice(0, MAX_TITLE);
}

function cleanText(value: unknown, max = MAX_NOTES) {
  return String(value || "").trim().slice(0, max);
}

function objectValue(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function normalizeEnum<T extends string>(value: unknown, allowed: T[], fallback: T): T {
  const text = String(value || "").trim();
  return allowed.includes(text as T) ? (text as T) : fallback;
}

export function normalizeAgentRunMemory(input: unknown, fallbackId: string, timestamp = nowIso()): AgentRunMemoryEntry | null {
  const value = objectValue(input);
  const title = cleanLine(value.title);
  const notes = cleanText(value.notes);
  if (!title || !notes) {
    return null;
  }
  const evidenceRefs = (Array.isArray(value.evidenceRefs) ? value.evidenceRefs : [])
    .map((entry) => cleanLine(entry, ""))
    .filter(Boolean)
    .slice(0, MAX_EVIDENCE_REFS);
  return {
    id: cleanLine(value.id, fallbackId),
    createdAt: cleanLine(value.createdAt, timestamp),
    updatedAt: cleanLine(value.updatedAt, timestamp),
    kind: normalizeEnum(value.kind, memoryKinds, "hypothesis"),
    status: normalizeEnum(value.status, memoryStatuses, "proposed"),
    title,
    notes,
    sourceRunId: cleanLine(value.sourceRunId, "") || undefined,
    evidenceRefs,
    dismissedReason: cleanText(value.dismissedReason, 1000) || undefined,
    retestState: value.retestState ? normalizeEnum(value.retestState, retestStates, "not-started") : undefined
  };
}

export function normalizeAgentRunMemoryList(input: unknown): AgentRunMemoryEntry[] {
  const entries = Array.isArray(input) ? input : [];
  return entries
    .map((entry, index) => normalizeAgentRunMemory(entry, `memory-${index + 1}`))
    .filter((entry): entry is AgentRunMemoryEntry => Boolean(entry))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, MAX_AGENT_RUN_MEMORY);
}

export function upsertAgentRunMemoryEntry(entries: AgentRunMemoryEntry[], entry: AgentRunMemoryEntry) {
  const normalized = normalizeAgentRunMemory({ ...entry, updatedAt: nowIso() }, entry.id);
  if (!normalized) {
    return normalizeAgentRunMemoryList(entries);
  }
  return normalizeAgentRunMemoryList([normalized, ...entries.filter((item) => item.id !== normalized.id)]);
}

export function deleteAgentRunMemoryEntry(entries: AgentRunMemoryEntry[], entryId: string) {
  return normalizeAgentRunMemoryList(entries.filter((entry) => entry.id !== entryId));
}

export function summarizeAgentRunMemory(entries: AgentRunMemoryEntry[], limit = 12) {
  return normalizeAgentRunMemoryList(entries)
    .slice(0, Math.max(1, Math.min(Math.round(limit), 30)))
    .map((entry) => ({
      id: entry.id,
      kind: entry.kind,
      status: entry.status,
      title: entry.title,
      updatedAt: entry.updatedAt,
      evidenceRefs: entry.evidenceRefs
    }));
}
