import { useRef, useState } from "react";
import type { GlobalSearchResult } from "../types";
import type { RadarWorkbench } from "./useRadarWorkbench";

export function useWebSocketSelection(workbench: RadarWorkbench) {
  const [selectedWebSocketId, setSelectedWebSocketId] = useState("");
  const [selectedWebSocketIds, setSelectedWebSocketIds] = useState<string[]>([]);
  const selectionAnchorRef = useRef("");

  const clear = () => {
    setSelectedWebSocketId("");
    setSelectedWebSocketIds([]);
    selectionAnchorRef.current = "";
  };

  const openGlobalSearchResult = (result: GlobalSearchResult) => {
    if (result.target.view === "websocket" && result.target.id) {
      setSelectedWebSocketId(result.target.id);
      setSelectedWebSocketIds([result.target.id]);
      selectionAnchorRef.current = result.target.id;
    }
    workbench.openGlobalSearchResult(result);
  };

  const selectedWebSocketEvent =
    workbench.webSocketEvents.find((event) => event.id === selectedWebSocketId) || null;

  return {
    selectedWebSocketId,
    setSelectedWebSocketId,
    selectedWebSocketIds,
    setSelectedWebSocketIds,
    selectionAnchorRef,
    clear,
    selectedWebSocketEvent,
    openGlobalSearchResult
  };
}
