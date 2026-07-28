import {
  useEffect,
  useRef,
  type FormEvent,
  type PointerEvent as ReactPointerEvent
} from "react";
import { getAgentBudgetExhaustion } from "../../shared/agentProfiles.js";
import type {
  AgentRun,
  AgentRunMemoryEntry,
  CapturedRequest
} from "../types";
import { clampAiDrawerWidth } from "../lib";

export function useAiOperationsDrawerController({
  drawerWidth,
  onDrawerWidthChange,
  activeAgentRun,
  startAgentRun,
  agentMemoryTitle,
  agentMemoryNotes,
  selectedCapture,
  createAgentRunMemory,
  onAgentMemoryTitleChange,
  onAgentMemoryNotesChange,
  setNotice
}: {
  drawerWidth: number;
  onDrawerWidthChange: (width: number) => void;
  activeAgentRun: AgentRun | null;
  startAgentRun: () => void | Promise<void>;
  agentMemoryTitle: string;
  agentMemoryNotes: string;
  selectedCapture: CapturedRequest | null;
  createAgentRunMemory: (input: {
    title: string;
    notes: string;
    evidenceRefs: string[];
  }) => Promise<AgentRunMemoryEntry | null>;
  onAgentMemoryTitleChange: (title: string) => void;
  onAgentMemoryNotesChange: (notes: string) => void;
  setNotice: (notice: string) => void;
}) {
  const resizeRef = useRef<{
    startX: number;
    startWidth: number;
  } | null>(null);

  useEffect(() => {
    const resizeDrawer = (event: globalThis.PointerEvent) => {
      const resize = resizeRef.current;
      if (!resize) {
        return;
      }
      const nextWidth =
        resize.startWidth + resize.startX - event.clientX;
      onDrawerWidthChange(
        clampAiDrawerWidth(nextWidth, window.innerWidth)
      );
    };
    const stopResizingDrawer = () => {
      resizeRef.current = null;
    };
    window.addEventListener("pointermove", resizeDrawer);
    window.addEventListener("pointerup", stopResizingDrawer);
    return () => {
      window.removeEventListener("pointermove", resizeDrawer);
      window.removeEventListener("pointerup", stopResizingDrawer);
    };
  }, [onDrawerWidthChange]);

  const beginResize = (
    event: ReactPointerEvent<globalThis.HTMLDivElement>
  ) => {
    event.preventDefault();
    resizeRef.current = {
      startX: event.clientX,
      startWidth: drawerWidth
    };
  };
  const submitGoal = (event: FormEvent) => {
    event.preventDefault();
    void startAgentRun();
  };
  const submitMemory = (event: FormEvent) => {
    event.preventDefault();
    if (!agentMemoryTitle.trim() || !agentMemoryNotes.trim()) {
      setNotice("Run memory needs a title and notes.");
      return;
    }
    void createAgentRunMemory({
      title: agentMemoryTitle,
      notes: agentMemoryNotes,
      evidenceRefs: selectedCapture
        ? [`capture:${selectedCapture.id}`]
        : []
    }).then((saved) => {
      if (saved) {
        onAgentMemoryTitleChange("");
        onAgentMemoryNotesChange("");
      }
    });
  };

  return {
    activeAgentBudgetExhaustion:
      getAgentBudgetExhaustion(activeAgentRun),
    beginResize,
    submitGoal,
    submitMemory
  };
}
