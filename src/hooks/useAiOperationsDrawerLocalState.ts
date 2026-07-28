import { useState } from "react";

export type AiOperationsDrawerLocalState = {
  aiDrawerOpen: boolean;
  setAiDrawerOpen: (open: boolean) => void;
  aiDrawerWidth: number;
  setAiDrawerWidth: (width: number) => void;
  agentMemoryTitle: string;
  setAgentMemoryTitle: (title: string) => void;
  agentMemoryNotes: string;
  setAgentMemoryNotes: (notes: string) => void;
};

export function useAiOperationsDrawerLocalState(
  initialOpen = true
): AiOperationsDrawerLocalState {
  const [aiDrawerOpen, setAiDrawerOpen] = useState(initialOpen);
  const [aiDrawerWidth, setAiDrawerWidth] = useState(620);
  const [agentMemoryTitle, setAgentMemoryTitle] = useState("");
  const [agentMemoryNotes, setAgentMemoryNotes] = useState("");

  return {
    aiDrawerOpen,
    setAiDrawerOpen,
    aiDrawerWidth,
    setAiDrawerWidth,
    agentMemoryTitle,
    setAgentMemoryTitle,
    agentMemoryNotes,
    setAgentMemoryNotes
  };
}
