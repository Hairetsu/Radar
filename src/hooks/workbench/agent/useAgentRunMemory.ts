import { useCallback, useMemo, useState, type MutableRefObject } from "react";
import { normalizeAgentRunMemory } from "../../../../shared/agentMemory.js";
import type { AgentRun, AgentRunMemoryEntry } from "../../../types";

type NoticePorts = { setNotice: (message: string) => void };

export function useAgentRunMemory(
  activeAgentRun: AgentRun | null,
  portsRef: MutableRefObject<NoticePorts>
) {
  const [agentRunMemory, setAgentRunMemory] = useState<AgentRunMemoryEntry[]>([]);
  const [agentRunMemorySearch, setAgentRunMemorySearch] = useState("");

  const filteredAgentRunMemory = useMemo(() => {
    const query = agentRunMemorySearch.trim().toLowerCase();
    if (!query) {
      return agentRunMemory;
    }
    return agentRunMemory.filter((entry) =>
      [entry.title, entry.notes, entry.kind, entry.status, entry.evidenceRefs.join(" ")]
        .join(" ")
        .toLowerCase()
        .includes(query)
    );
  }, [agentRunMemory, agentRunMemorySearch]);

  const saveAgentRunMemory = useCallback(async (entry: AgentRunMemoryEntry) => {
    if (!window.radar?.saveAgentRunMemory) {
      portsRef.current.setNotice("Run in Electron to save run memory.");
      return null;
    }
    const saved = await window.radar.saveAgentRunMemory(entry);
    setAgentRunMemory((items) => [saved, ...items.filter((item) => item.id !== saved.id)]);
    portsRef.current.setNotice(`Run memory saved: ${saved.title}`);
    return saved;
  }, [portsRef]);

  const confirmAgentRunMemoryFromTimeline = useCallback(
    async (entryId: string) => {
      const memory = activeAgentRun?.timeline.find((entry) => entry.id === entryId)?.toolResult;
      if (!memory?.ok || memory.tool !== "proposeRunMemory") {
        return null;
      }
      return saveAgentRunMemory({ ...memory.data.memory, status: "confirmed", updatedAt: new Date().toISOString() });
    },
    [activeAgentRun, saveAgentRunMemory]
  );

  const dismissAgentRunMemoryFromTimeline = useCallback(
    async (entryId: string) => {
      const memory = activeAgentRun?.timeline.find((entry) => entry.id === entryId)?.toolResult;
      if (!memory?.ok || memory.tool !== "proposeRunMemory") {
        return null;
      }
      return saveAgentRunMemory({
        ...memory.data.memory,
        status: "dismissed",
        dismissedReason: memory.data.memory.dismissedReason || "Dismissed by operator from AI-First console.",
        updatedAt: new Date().toISOString()
      });
    },
    [activeAgentRun, saveAgentRunMemory]
  );

  const createAgentRunMemory = useCallback(
    async (input: { title: string; notes: string; kind?: AgentRunMemoryEntry["kind"]; evidenceRefs?: string[] }) => {
      const now = new Date().toISOString();
      const fallbackId = `memory_${now.replace(/[^0-9]/g, "")}`;
      const memory = normalizeAgentRunMemory(
        {
          id: fallbackId,
          createdAt: now,
          updatedAt: now,
          kind: input.kind || "hypothesis",
          status: "confirmed",
          title: input.title,
          notes: input.notes,
          evidenceRefs: input.evidenceRefs || []
        },
        fallbackId,
        now
      );
      return memory ? saveAgentRunMemory(memory) : null;
    },
    [saveAgentRunMemory]
  );

  const deleteAgentRunMemory = useCallback(async (entryId: string) => {
    if (!window.radar?.deleteAgentRunMemory) {
      portsRef.current.setNotice("Run in Electron to delete run memory.");
      return null;
    }
    const result = await window.radar.deleteAgentRunMemory(entryId);
    setAgentRunMemory(result.memory);
    portsRef.current.setNotice("Run memory deleted");
    return result;
  }, [portsRef]);

  return {
    agentRunMemory,
    setAgentRunMemory,
    filteredAgentRunMemory,
    agentRunMemorySearch,
    setAgentRunMemorySearch,
    confirmAgentRunMemoryFromTimeline,
    dismissAgentRunMemoryFromTimeline,
    createAgentRunMemory,
    deleteAgentRunMemory
  };
}
