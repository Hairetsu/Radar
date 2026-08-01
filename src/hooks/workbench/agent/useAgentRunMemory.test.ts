// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentRun, AgentRunMemoryEntry } from "../../../types";
import { useAgentRunMemory } from "./useAgentRunMemory";

const NOW = "2026-07-31T00:00:00.000Z";

function runWithMemoryProposal(): AgentRun {
  return {
    id: "run-1",
    sessionId: "session-1",
    createdAt: NOW,
    updatedAt: NOW,
    goal: "Inspect the target",
    profileId: "browser-assessment",
    status: "paused",
    policy: {
      maxRuntimeMs: 300_000,
      maxSteps: 40,
      maxReplay: 3,
      maxWorkflowRequests: 3,
      maxCaptureSample: 100,
      allowRawContext: false
    },
    timeline: [
      {
        id: "proposal-1",
        createdAt: NOW,
        toolResult: {
          tool: "proposeRunMemory",
          ok: true,
          data: {
            memory: {
              id: "memory-1",
              createdAt: NOW,
              updatedAt: NOW,
              kind: "hypothesis",
              status: "proposed",
              title: "Check tenant boundary",
              notes: "Compare the same resource under another identity.",
              evidenceRefs: ["capture:1"]
            },
            note: "Review this memory"
          }
        }
      }
    ],
    findings: []
  };
}

describe("agent run memory hook", () => {
  const setNotice = vi.fn();
  const saved: AgentRunMemoryEntry[] = [];

  beforeEach(() => {
    setNotice.mockReset();
    saved.length = 0;
    const radar = window.radar;
    if (!radar) throw new Error("Radar API stub is unavailable");
    window.radar = {
      ...radar,
      saveAgentRunMemory: vi.fn(async (entry) => {
        saved.push(entry);
        return entry;
      }),
      deleteAgentRunMemory: vi.fn(async (id) => ({
        ok: true,
        memory: saved.filter((entry) => entry.id !== id)
      }))
    };
  });

  it("confirms, dismisses, creates, filters, and deletes project memory", async () => {
    const portsRef = { current: { setNotice } };
    const { result } = renderHook(() => useAgentRunMemory(runWithMemoryProposal(), portsRef));

    await act(async () => {
      await result.current.confirmAgentRunMemoryFromTimeline("proposal-1");
      await result.current.dismissAgentRunMemoryFromTimeline("proposal-1");
      await result.current.createAgentRunMemory({ title: "Retest later", notes: "Repeat after remediation." });
    });
    expect(saved.map((entry) => entry.status)).toEqual(["confirmed", "dismissed", "confirmed"]);
    expect(setNotice).toHaveBeenCalledWith(expect.stringContaining("Run memory saved"));

    act(() => {
      result.current.setAgentRunMemory(saved);
      result.current.setAgentRunMemorySearch("tenant");
    });
    expect(result.current.filteredAgentRunMemory).toHaveLength(2);

    await act(async () => {
      await result.current.deleteAgentRunMemory("memory-1");
    });
    expect(result.current.agentRunMemory.every((entry) => entry.id !== "memory-1")).toBe(true);
    expect(setNotice).toHaveBeenCalledWith("Run memory deleted");
  });

  it("ignores unrelated timeline entries and reports unavailable bridge methods", async () => {
    const portsRef = { current: { setNotice } };
    window.radar = undefined;
    const { result } = renderHook(() => useAgentRunMemory({ ...runWithMemoryProposal(), timeline: [] }, portsRef));

    await act(async () => {
      expect(await result.current.confirmAgentRunMemoryFromTimeline("missing")).toBeNull();
      expect(await result.current.dismissAgentRunMemoryFromTimeline("missing")).toBeNull();
      expect(await result.current.createAgentRunMemory({ title: "Manual", notes: "Bridge unavailable" })).toBeNull();
      expect(await result.current.deleteAgentRunMemory("missing")).toBeNull();
    });

    expect(setNotice).toHaveBeenCalledWith("Run in Electron to save run memory.");
    expect(setNotice).toHaveBeenCalledWith("Run in Electron to delete run memory.");
  });
});
