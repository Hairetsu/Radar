import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  clientOverrideFromCapture,
  isOverridableClientCapture,
  normalizeClientOverrides,
  relaxClientValidation
} from "../../../shared/clientOverrides.js";
import { normalizeInterceptRules } from "../../../shared/interceptRules.js";
import { normalizeMatchReplaceRules } from "../../../shared/matchReplace.js";
import { formatHeaders, parseHeaders } from "../../lib";
import type {
  CapturedRequest,
  ClientOverride,
  InterceptQueueItem,
  InterceptResponseDraft,
  InterceptRule,
  InterceptState,
  MatchReplaceRule,
  ReplayDraft
} from "../../types";
import type { NoticePort } from "./ports";

export type InterceptPane = "queue" | "client-files";

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
  const [clientOverrides, setClientOverrides] = useState<ClientOverride[]>([]);
  const [interceptPane, setInterceptPane] = useState<InterceptPane>("queue");
  const [selectedClientOverrideId, setSelectedClientOverrideId] = useState("");
  const [clientOverrideName, setClientOverrideName] = useState("");
  const [clientOverrideHost, setClientOverrideHost] = useState("");
  const [clientOverridePath, setClientOverridePath] = useState("");
  const [clientOverrideEnabled, setClientOverrideEnabled] = useState(true);
  const [clientOverrideBody, setClientOverrideBody] = useState("");
  const [clientOverrideRelaxApplied, setClientOverrideRelaxApplied] = useState(false);
  const interceptDraftItemRef = useRef("");
  const clientOverrideDraftIdRef = useRef("");

  const selectedInterceptItem = useMemo(
    () => interceptState.queue.find((item) => item.id === interceptSelectedId) || interceptState.queue[0] || null,
    [interceptSelectedId, interceptState.queue]
  );

  const selectedClientOverride = useMemo(
    () =>
      clientOverrides.find((item) => item.id === selectedClientOverrideId) || clientOverrides[0] || null,
    [clientOverrides, selectedClientOverrideId]
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

  const hydrateClientOverrideDraft = useCallback((override: ClientOverride) => {
    setSelectedClientOverrideId(override.id);
    setClientOverrideName(override.name);
    setClientOverrideHost(override.host);
    setClientOverridePath(override.path);
    setClientOverrideEnabled(override.enabled);
    setClientOverrideBody(override.body);
    setClientOverrideRelaxApplied(override.relaxApplied);
    clientOverrideDraftIdRef.current = override.id;
  }, []);

  const selectClientOverride = useCallback(
    (overrideId: string) => {
      const override = clientOverrides.find((item) => item.id === overrideId);
      if (override) {
        hydrateClientOverrideDraft(override);
        setInterceptPane("client-files");
      }
    },
    [clientOverrides, hydrateClientOverrideDraft]
  );

  const persistClientOverrides = useCallback(
    async (next: ClientOverride[]) => {
      if (!window.radar?.setClientOverrides) {
        ports.setNotice("Run in Electron to save client file overrides.");
        return null;
      }
      const saved = await window.radar.setClientOverrides(normalizeClientOverrides(next));
      setClientOverrides(saved);
      return saved;
    },
    [ports]
  );

  const saveSelectedClientOverride = useCallback(async () => {
    if (!selectedClientOverride) {
      ports.setNotice("Select a client file override to save.");
      return;
    }
    try {
      const next = clientOverrides.map((item) =>
        item.id === selectedClientOverride.id
          ? {
              ...item,
              name: clientOverrideName,
              host: clientOverrideHost,
              path: clientOverridePath,
              enabled: clientOverrideEnabled,
              body: clientOverrideBody,
              relaxApplied: clientOverrideRelaxApplied
            }
          : item
      );
      const saved = await persistClientOverrides(next);
      if (!saved) {
        return;
      }
      const current = saved.find((item) => item.host === clientOverrideHost.trim().toLowerCase() && item.path === (clientOverridePath.startsWith("/") ? clientOverridePath : `/${clientOverridePath}`)) || saved.find((item) => item.id === selectedClientOverride.id);
      if (current) {
        hydrateClientOverrideDraft(current);
      }
      ports.setNotice(`Saved client file override. Reload the Radar Browser to apply it.`);
    } catch (error) {
      ports.setNotice(error instanceof Error ? error.message : "Client file override was not saved");
    }
  }, [
    clientOverrideBody,
    clientOverrideEnabled,
    clientOverrideHost,
    clientOverrideName,
    clientOverridePath,
    clientOverrideRelaxApplied,
    clientOverrides,
    hydrateClientOverrideDraft,
    persistClientOverrides,
    ports,
    selectedClientOverride
  ]);

  const deleteSelectedClientOverride = useCallback(async () => {
    if (!selectedClientOverride) {
      return;
    }
    try {
      const saved = await persistClientOverrides(
        clientOverrides.filter((item) => item.id !== selectedClientOverride.id)
      );
      if (!saved) {
        return;
      }
      clientOverrideDraftIdRef.current = "";
      if (saved[0]) {
        hydrateClientOverrideDraft(saved[0]);
      } else {
        setSelectedClientOverrideId("");
        setClientOverrideName("");
        setClientOverrideHost("");
        setClientOverridePath("");
        setClientOverrideEnabled(true);
        setClientOverrideBody("");
        setClientOverrideRelaxApplied(false);
      }
      ports.setNotice("Deleted client file override");
    } catch (error) {
      ports.setNotice(error instanceof Error ? error.message : "Client file override was not deleted");
    }
  }, [clientOverrides, hydrateClientOverrideDraft, persistClientOverrides, ports, selectedClientOverride]);

  const relaxSelectedClientOverride = useCallback(() => {
    if (!selectedClientOverride) {
      ports.setNotice("Select a client file override first.");
      return;
    }
    const relaxed = relaxClientValidation(clientOverrideBody);
    if (relaxed.changes.length === 0) {
      ports.setNotice("No client validation constraints were found in this file.");
      return;
    }
    setClientOverrideBody(relaxed.body);
    setClientOverrideRelaxApplied(true);
    ports.setNotice(relaxed.changes.join(". "));
  }, [clientOverrideBody, ports, selectedClientOverride]);

  const createClientOverrideFromCapture = useCallback(
    async (capture: CapturedRequest | null) => {
      if (!capture) {
        return false;
      }
      if (!isOverridableClientCapture(capture)) {
        ports.setNotice("This capture is not HTML, JavaScript, CSS, or another editable client file.");
        return false;
      }
      const existing = clientOverrides.find(
        (item) => item.host === (capture.host || "").toLowerCase() && item.path === (capture.path || "").split("?")[0]
      ) || clientOverrides.find((item) => item.captureId === capture.id);
      if (existing) {
        hydrateClientOverrideDraft(existing);
        setInterceptPane("client-files");
        ports.setNotice("Opened the existing client file override");
        return true;
      }
      const created = clientOverrideFromCapture(capture);
      if (!created) {
        ports.setNotice("Could not create a client file override from this capture.");
        return false;
      }
      try {
        const saved = await persistClientOverrides([...clientOverrides, created]);
        if (!saved) {
          return false;
        }
        const current =
          saved.find((item) => item.path === created.path && item.host === created.host.toLowerCase()) || created;
        hydrateClientOverrideDraft(current);
        setInterceptPane("client-files");
        ports.setNotice("Client file override saved. Reload the Radar Browser after you edit it.");
        return true;
      } catch (error) {
        ports.setNotice(error instanceof Error ? error.message : "Client file override was not created");
        return false;
      }
    },
    [clientOverrides, hydrateClientOverrideDraft, persistClientOverrides, ports]
  );

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

  useEffect(() => {
    if (!selectedClientOverride) {
      if (clientOverrideDraftIdRef.current) {
        clientOverrideDraftIdRef.current = "";
      }
      return;
    }
    if (clientOverrideDraftIdRef.current !== selectedClientOverride.id) {
      hydrateClientOverrideDraft(selectedClientOverride);
    }
  }, [hydrateClientOverrideDraft, selectedClientOverride]);

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
    clientOverrides,
    setClientOverrides,
    interceptPane,
    setInterceptPane,
    selectedClientOverrideId,
    selectedClientOverride,
    clientOverrideName,
    setClientOverrideName,
    clientOverrideHost,
    setClientOverrideHost,
    clientOverridePath,
    setClientOverridePath,
    clientOverrideEnabled,
    setClientOverrideEnabled,
    clientOverrideBody,
    setClientOverrideBody,
    clientOverrideRelaxApplied,
    selectClientOverride,
    hydrateClientOverrideDraft,
    saveSelectedClientOverride,
    deleteSelectedClientOverride,
    relaxSelectedClientOverride,
    createClientOverrideFromCapture,
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
