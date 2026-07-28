import { useCallback, useEffect, useState } from "react";
import type {
  CapturedRequest,
  WebSocketEvent
} from "../types";

export function useCommandPalettePackets({
  open,
  captureIds,
  captures,
  webSocketEventIds,
  webSocketEvents
}: {
  open: boolean;
  captureIds: string[];
  captures: CapturedRequest[];
  webSocketEventIds: string[];
  webSocketEvents: WebSocketEvent[];
}) {
  const [selectedCaptureIds, setSelectedCaptureIds] = useState<
    string[]
  >([]);
  const [selectedWebSocketEventIds, setSelectedWebSocketEventIds] =
    useState<string[]>([]);
  const toggleCapture = useCallback((captureId: string) => {
    setSelectedCaptureIds((current) =>
      current.includes(captureId)
        ? current.filter((id) => id !== captureId)
        : [...current, captureId]
    );
  }, []);
  const toggleWebSocketEvent = useCallback((eventId: string) => {
    setSelectedWebSocketEventIds((current) =>
      current.includes(eventId)
        ? current.filter((id) => id !== eventId)
        : [...current, eventId]
    );
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }
    setSelectedCaptureIds(captureIds);
    setSelectedWebSocketEventIds(webSocketEventIds);
  }, [captureIds, open, webSocketEventIds]);

  return {
    selectedCaptureIds,
    setSelectedCaptureIds,
    selectedWebSocketEventIds,
    setSelectedWebSocketEventIds,
    toggleCapture,
    toggleWebSocketEvent,
    selectedCount:
      selectedCaptureIds.length + selectedWebSocketEventIds.length,
    totalCount: captures.length + webSocketEvents.length
  };
}
