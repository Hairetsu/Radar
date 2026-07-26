import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { normalizeInterceptRules } from "../../../shared/interceptRules.js";
import { normalizeMatchReplaceRules } from "../../../shared/matchReplace.js";
import { formatHeaders, parseHeaders } from "../../lib";
import type {
  InterceptQueueItem,
  InterceptResponseDraft,
  InterceptRule,
  InterceptState,
  MatchReplaceRule,
  ReplayDraft
} from "../../types";
import type { NoticePort } from "./ports";

const emptyDraft: ReplayDraft = {
  method: "GET",
  url: "",
  headers: {},
  body: ""
};

const defaultInterceptState: InterceptState = {
  config: {
    requestEnabled: false,
    responseEnabled: false
  },
  queue: []
};

function interceptDraftFromItem(item: InterceptQueueItem): ReplayDraft {
  return {
    method: item.method,
    url: item.url,
    headers: item.headers,
    body: item.body
  };
}

function interceptResponseFromItem(item: InterceptQueueItem): InterceptResponseDraft {
  return {
    status: item.status || 200,
    statusText: item.statusText || "",
    headers: item.headers,
    body: item.body
  };
}

export type InterceptDomain = ReturnType<typeof useInterceptDomain>;

export function useInterceptDomain(ports: NoticePort) {
  const [interceptState, setInterceptState] = useState<InterceptState>(defaultInterceptState);
  const [interceptSelectedId, setInterceptSelectedId] = useState("");
  const [interceptDraft, setInterceptDraft] = useState<ReplayDraft>(emptyDraft);
  const [interceptHeadersText, setInterceptHeadersText] = useState(formatHeaders(emptyDraft.headers));
  const [interceptResponseStatus, setInterceptResponseStatus] = useState(200);
  const [interceptResponseStatusText, setInterceptResponseStatusText] = useState("");
  const [interceptRules, setInterceptRules] = useState<InterceptRule[]>([]);
  const [interceptRulesText, setInterceptRulesText] = useState("[]");
  const [matchReplaceRules, setMatchReplaceRules] = useState<MatchReplaceRule[]>([]);
  const [matchReplaceRulesText, setMatchReplaceRulesText] = useState("[]");
  const interceptDraftItemRef = useRef("");

  const selectedInterceptItem = useMemo(
    () => interceptState.queue.find((item) => item.id === interceptSelectedId) || interceptState.queue[0] || null,
    [interceptSelectedId, interceptState.queue]
  );

  const hydrateInterceptDraft = useCallback((item: InterceptQueueItem) => {
    const nextDraft = interceptDraftFromItem(item);
    const nextResponse = interceptResponseFromItem(item);
    setInterceptSelectedId(item.id);
    setInterceptDraft(nextDraft);
    setInterceptHeadersText(formatHeaders(nextDraft.headers));
    setInterceptResponseStatus(nextResponse.status);
    setInterceptResponseStatusText(nextResponse.statusText);
    interceptDraftItemRef.current = item.id;
  }, []);

  const selectInterceptItem = useCallback(
    (itemId: string) => {
      const item = interceptState.queue.find((entry) => entry.id === itemId);
      if (item) {
        hydrateInterceptDraft(item);
      }
    },
    [hydrateInterceptDraft, interceptState.queue]
  );

  const setRequestInterceptEnabled = useCallback(async (enabled: boolean) => {
    if (!window.radar?.setInterceptConfig) {
      ports.setNotice("Run in Electron to control interception.");
      return;
    }
    const state = await window.radar.setInterceptConfig({ requestEnabled: enabled });
    setInterceptState(state);
    ports.setNotice(enabled ? "Request interception enabled" : "Request interception disabled");
  }, [ports]);

  const setResponseInterceptEnabled = useCallback(async (enabled: boolean) => {
    if (!window.radar?.setInterceptConfig) {
      ports.setNotice("Run in Electron to control interception.");
      return;
    }
    const state = await window.radar.setInterceptConfig({ responseEnabled: enabled });
    setInterceptState(state);
    ports.setNotice(enabled ? "Response interception enabled" : "Response interception disabled");
  }, [ports]);

  const forwardIntercept = useCallback(async () => {
    if (!window.radar?.forwardIntercept || !interceptSelectedId) {
      return;
    }
    try {
      const selectedItem = interceptState.queue.find((item) => item.id === interceptSelectedId);
      const headers = parseHeaders(interceptHeadersText);
      const payload =
        selectedItem?.stage === "response"
          ? {
              id: interceptSelectedId,
              response: {
                status: interceptResponseStatus,
                statusText: interceptResponseStatusText,
                headers,
                body: interceptDraft.body
              }
            }
          : {
              id: interceptSelectedId,
              draft: { ...interceptDraft, headers }
            };
      const state = await window.radar.forwardIntercept(payload);
      setInterceptState(state);
      interceptDraftItemRef.current = "";
      ports.setNotice(`Queued ${selectedItem?.stage || "item"} forwarded`);
    } catch (error) {
      ports.setNotice(error instanceof Error ? error.message : "Forward failed");
    }
  }, [
    interceptDraft,
    interceptHeadersText,
    interceptResponseStatus,
    interceptResponseStatusText,
    interceptSelectedId,
    interceptState.queue,
    ports
  ]);

  const dropIntercept = useCallback(async () => {
    if (!window.radar?.dropIntercept || !interceptSelectedId) {
      return;
    }
    try {
      const state = await window.radar.dropIntercept(interceptSelectedId);
      setInterceptState(state);
      interceptDraftItemRef.current = "";
      ports.setNotice("Queued item dropped");
    } catch (error) {
      ports.setNotice(error instanceof Error ? error.message : "Drop failed");
    }
  }, [interceptSelectedId, ports]);

  const resumeAllIntercepts = useCallback(async () => {
    if (!window.radar?.resumeAllIntercepts) {
      return;
    }
    const state = await window.radar.resumeAllIntercepts();
    setInterceptState(state);
    interceptDraftItemRef.current = "";
    ports.setNotice("Queued requests resumed");
  }, [ports]);

  const saveInterceptRules = useCallback(async () => {
    if (!window.radar?.setInterceptRules) {
      ports.setNotice("Run in Electron to save intercept rules.");
      return;
    }
    try {
      const parsed: unknown = JSON.parse(interceptRulesText || "[]");
      if (!Array.isArray(parsed)) {
        throw new Error("Intercept rules must be a JSON array.");
      }
      const saved = await window.radar.setInterceptRules(normalizeInterceptRules(parsed));
      setInterceptRules(saved);
      setInterceptRulesText(JSON.stringify(saved, null, 2));
      ports.setNotice(`Saved ${saved.length} intercept rule${saved.length === 1 ? "" : "s"}`);
    } catch (error) {
      ports.setNotice(error instanceof Error ? error.message : "Intercept rules were not valid JSON");
    }
  }, [interceptRulesText, ports]);

  const saveMatchReplaceRules = useCallback(async () => {
    if (!window.radar?.setMatchReplaceRules) {
      ports.setNotice("Run in Electron to save match/replace rules.");
      return;
    }
    try {
      const parsed: unknown = JSON.parse(matchReplaceRulesText || "[]");
      if (!Array.isArray(parsed)) {
        throw new Error("Match/replace rules must be a JSON array.");
      }
      const saved = await window.radar.setMatchReplaceRules(normalizeMatchReplaceRules(parsed));
      setMatchReplaceRules(saved);
      setMatchReplaceRulesText(JSON.stringify(saved, null, 2));
      ports.setNotice(`Saved ${saved.length} rewrite rule${saved.length === 1 ? "" : "s"}`);
    } catch (error) {
      ports.setNotice(error instanceof Error ? error.message : "Match/replace rules were not valid JSON");
    }
  }, [matchReplaceRulesText, ports]);

  useEffect(() => {
    if (!selectedInterceptItem) {
      if (interceptDraftItemRef.current) {
        interceptDraftItemRef.current = "";
      }
      return;
    }
    if (interceptDraftItemRef.current !== selectedInterceptItem.id) {
      hydrateInterceptDraft(selectedInterceptItem);
    }
  }, [hydrateInterceptDraft, selectedInterceptItem]);

  return {
    interceptState,
    setInterceptState,
    interceptSelectedId,
    setInterceptSelectedId,
    interceptDraft,
    setInterceptDraft,
    interceptHeadersText,
    setInterceptHeadersText,
    interceptResponseStatus,
    setInterceptResponseStatus,
    interceptResponseStatusText,
    setInterceptResponseStatusText,
    interceptRules,
    setInterceptRules,
    interceptRulesText,
    setInterceptRulesText,
    matchReplaceRules,
    setMatchReplaceRules,
    matchReplaceRulesText,
    setMatchReplaceRulesText,
    selectedInterceptItem,
    hydrateInterceptDraft,
    selectInterceptItem,
    setRequestInterceptEnabled,
    setResponseInterceptEnabled,
    forwardIntercept,
    dropIntercept,
    resumeAllIntercepts,
    saveInterceptRules,
    saveMatchReplaceRules,
    interceptDraftItemRef
  };
}
