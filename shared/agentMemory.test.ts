import { describe, expect, it } from "vitest";
import {
  deleteAgentRunMemoryEntry,
  normalizeAgentRunMemory,
  normalizeAgentRunMemoryList,
  summarizeAgentRunMemory,
  upsertAgentRunMemoryEntry
} from "./agentMemory.js";

describe("agentMemory", () => {
  it("normalizes valid memory and rejects empty entries", () => {
    expect(normalizeAgentRunMemory({ title: "", notes: "" }, "memory-1")).toBeNull();
    const memory = normalizeAgentRunMemory(
      {
        id: "memory-1",
        kind: "dismissed-lead",
        status: "dismissed",
        title: "Login csrf appears protected",
        notes: "Reviewed capture:login and dismissed the lead.",
        evidenceRefs: ["capture:login", ""],
        retestState: "unknown"
      },
      "fallback",
      "2026-05-25T00:00:00.000Z"
    );
    expect(memory).toEqual(
      expect.objectContaining({
        id: "memory-1",
        kind: "dismissed-lead",
        status: "dismissed",
        retestState: "not-started",
        evidenceRefs: ["capture:login"]
      })
    );
  });

  it("upserts, deletes, and summarizes memory entries", () => {
    const first = normalizeAgentRunMemory(
      { id: "memory-1", title: "Hypothesis", notes: "Check headers.", evidenceRefs: ["capture:1"] },
      "memory-1"
    );
    const second = normalizeAgentRunMemory({ id: "memory-2", title: "Retest", notes: "Retest after fix." }, "memory-2");
    expect(first && second).toBeTruthy();
    const upserted = upsertAgentRunMemoryEntry([first!, second!], { ...first!, title: "Updated hypothesis" });
    expect(upserted[0]?.title).toBe("Updated hypothesis");
    expect(deleteAgentRunMemoryEntry(upserted, "memory-2")).toHaveLength(1);
    expect(summarizeAgentRunMemory(normalizeAgentRunMemoryList(upserted), 1)).toEqual([
      expect.objectContaining({ id: upserted[0]?.id, evidenceRefs: upserted[0]?.evidenceRefs })
    ]);
  });
});
