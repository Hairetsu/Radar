import { useCallback, useEffect, useMemo, useState } from "react";
import { annotationContext } from "../../../shared/evidenceTags.js";
import { filterWebSocketEventsByQuery } from "../../../shared/trafficQuery.js";
import { webSocketFrameToDraft } from "../../../shared/websocketReplay.js";
import { isAllowedTarget } from "../../lib";
import type {
  EvidenceAnnotation,
  WebSocketEvent,
  WebSocketReplayDraft,
  WebSocketReplayResult
} from "../../types";
import type { NavigationPort, NoticePort } from "./ports";

async function loadWebSocketEvents() {
  if (!window.radar?.getWebSocketEvents) {
    return [];
  }
  try {
    return await window.radar.getWebSocketEvents();
  } catch {
    return [];
  }
}

type WebSocketDomainPorts = NoticePort &
  NavigationPort & {
    targets: string[];
    evidenceAnnotations: EvidenceAnnotation[];
  };

export type WebSocketDomain = ReturnType<typeof useWebSocketDomain>;

export function useWebSocketDomain(ports: WebSocketDomainPorts) {
  const [webSocketEvents, setWebSocketEvents] = useState<WebSocketEvent[]>([]);
  const [webSocketSearch, setWebSocketSearch] = useState("");
  const [webSocketQueryError, setWebSocketQueryError] = useState("");
  const [webSocketReplayDraft, setWebSocketReplayDraft] = useState<WebSocketReplayDraft | null>(null);
  const [webSocketReplayResult, setWebSocketReplayResult] = useState<WebSocketReplayResult | null>(null);

  const queryContext = useMemo(() => annotationContext(ports.evidenceAnnotations), [ports.evidenceAnnotations]);

  const scopedWebSocketEvents = useMemo(
    () => webSocketEvents.filter((event) => isAllowedTarget(event.url, ports.targets)),
    [webSocketEvents, ports.targets]
  );

  const webSocketQueryResult = useMemo(
    () => filterWebSocketEventsByQuery(scopedWebSocketEvents, webSocketSearch, queryContext),
    [scopedWebSocketEvents, webSocketSearch, queryContext]
  );

  const filteredWebSocketEvents = useMemo(() => {
    return webSocketQueryResult.ok ? webSocketQueryResult.events : [];
  }, [webSocketQueryResult]);

  useEffect(() => {
    setWebSocketQueryError(webSocketQueryResult.error || "");
  }, [webSocketQueryResult]);

  const loadWebSocketFrameToRepeater = useCallback(
    (event: WebSocketEvent) => {
      const nextDraft = webSocketFrameToDraft(event);
      if (!nextDraft) {
        ports.setNotice("This frame cannot be replayed.");
        return;
      }
      setWebSocketReplayDraft(nextDraft);
      setWebSocketReplayResult(null);
      ports.setActiveView("repeater");
      ports.setNotice("Loaded WebSocket frame in repeater");
    },
    [ports]
  );

  const sendWebSocketReplay = useCallback(async () => {
    if (!window.radar?.sendWebSocketReplay || !webSocketReplayDraft) {
      ports.setNotice("Run in Electron to replay WebSocket frames.");
      return;
    }
    try {
      const result = await window.radar.sendWebSocketReplay(webSocketReplayDraft);
      setWebSocketReplayResult(result);
      setWebSocketEvents(await loadWebSocketEvents());
      ports.setNotice(result.ok ? "WebSocket replay sent" : result.error || "WebSocket replay failed");
    } catch (error) {
      ports.setNotice(error instanceof Error ? error.message : "WebSocket replay failed");
    }
  }, [webSocketReplayDraft, ports]);

  const clearWebSocketEvents = useCallback(async () => {
    await window.radar?.clearWebSocketEvents?.();
    setWebSocketEvents([]);
  }, []);

  return {
    webSocketEvents,
    setWebSocketEvents,
    webSocketSearch,
    setWebSocketSearch,
    webSocketQueryError,
    setWebSocketQueryError,
    webSocketReplayDraft,
    setWebSocketReplayDraft,
    webSocketReplayResult,
    setWebSocketReplayResult,
    scopedWebSocketEvents,
    webSocketQueryResult,
    filteredWebSocketEvents,
    loadWebSocketFrameToRepeater,
    sendWebSocketReplay,
    clearWebSocketEvents
  };
}
