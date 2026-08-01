import { useEffect, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { formatHeaders } from "../../../lib";
import type {
  AgentRun,
  AppMode,
  BurstResult,
  InterceptQueueItem,
  InterceptState,
  ReplayDraft,
  ReplayResult,
  ReplayTabState,
  WorkflowDefinition
} from "../../../types";
import type { WorkView } from "../viewMeta";
import { agentTimelineIntents, type AgentTimelineIntent } from "./agentTimelineIntents";

export interface AgentTimelineProjectionPorts {
  setNotice: (message: string) => void;
  setActiveView: (view: WorkView) => void;
  setDraft: (draft: ReplayDraft) => void;
  setHeadersText: (text: string) => void;
  setLastResponse: (response: ReplayResult | null) => void;
  setLastBurst: (burst: BurstResult | null) => void;
  setSelectedId: (id: string) => void;
  setSelectedIds: (ids: string[]) => void;
  selectionAnchorRef: MutableRefObject<string>;
  setInterceptState: Dispatch<SetStateAction<InterceptState>>;
  setInterceptSelectedId: (id: string) => void;
  interceptDraftItemRef: MutableRefObject<string>;
  setInterceptDraft: (draft: ReplayDraft) => void;
  setInterceptHeadersText: (text: string) => void;
  setInterceptResponseStatus: (status: number) => void;
  setInterceptResponseStatusText: (text: string) => void;
  hydrateInterceptDraft: (item: InterceptQueueItem) => void;
  setTrafficSearch: (search: string) => void;
  setReplayTabState: (state: ReplayTabState) => void;
  setAutomatePayloadText: (text: string) => void;
  setAutomateRulesText: (text: string) => void;
  setAutomateSessionName: (name: string) => void;
  setActiveAutomateSessionId: (id: string) => void;
  setAutomateResultFilter: (filter: string) => void;
  setAiPreparedWorkflowDraft: (draft: WorkflowDefinition | null) => void;
  setSelectedWorkflowId: (id: string) => void;
}

export function applyAgentTimelineIntent(intent: AgentTimelineIntent, ports: AgentTimelineProjectionPorts) {
  switch (intent.type) {
    case "show-view":
      ports.setActiveView(intent.view);
      return;
    case "load-replay-draft":
      ports.setDraft(intent.draft);
      ports.setHeadersText(formatHeaders(intent.draft.headers));
      ports.setLastBurst(null);
      return;
    case "set-replay-response":
      ports.setLastResponse(intent.response);
      return;
    case "select-capture":
      ports.setSelectedId(intent.captureId);
      ports.setSelectedIds([intent.captureId]);
      ports.selectionAnchorRef.current = intent.captureId;
      return;
    case "set-intercept-queue": {
      ports.setActiveView("intercept");
      ports.setInterceptState((current) => ({ ...current, queue: intent.queue }));
      const firstItem = intent.queue[0];
      if (firstItem) ports.hydrateInterceptDraft(firstItem);
      return;
    }
    case "prepare-intercept-edit": {
      const { item, draft: preparedDraft, response, note } = intent.data;
      ports.setActiveView("intercept");
      ports.setInterceptState((current) => ({
        ...current,
        queue: current.queue.some((queued) => queued.id === item.id)
          ? current.queue.map((queued) => (queued.id === item.id ? item : queued))
          : [item, ...current.queue]
      }));
      ports.setInterceptSelectedId(item.id);
      ports.interceptDraftItemRef.current = item.id;
      if (response) {
        ports.setInterceptDraft({ method: item.method, url: item.url, headers: response.headers, body: response.body });
        ports.setInterceptHeadersText(formatHeaders(response.headers));
        ports.setInterceptResponseStatus(response.status);
        ports.setInterceptResponseStatusText(response.statusText);
      } else if (preparedDraft) {
        ports.setInterceptDraft(preparedDraft);
        ports.setInterceptHeadersText(formatHeaders(preparedDraft.headers));
        ports.setInterceptResponseStatus(item.status || 200);
        ports.setInterceptResponseStatusText(item.statusText || "");
      }
      ports.setNotice(note);
      return;
    }
    case "prepare-traffic-query":
      ports.setTrafficSearch(intent.data.query);
      ports.setActiveView("traffic");
      ports.setNotice(intent.data.reason);
      return;
    case "show-sitemap":
      ports.setActiveView("sitemap");
      return;
    case "prepare-replay-tab": {
      const { tabId, draft: preparedDraft, note } = intent.data;
      void window.radar?.getReplayTabState().then((state) => {
        if (!state) return;
        ports.setReplayTabState(state);
        const tab = state.tabs.find((item) => item.id === tabId);
        ports.setHeadersText(formatHeaders(tab?.draft.headers || preparedDraft.headers));
        ports.setLastResponse(null);
        ports.setLastBurst(null);
      });
      ports.setActiveView("repeater");
      ports.setNotice(note);
      return;
    }
    case "prepare-automate-draft":
      ports.setDraft(intent.data.draft);
      ports.setHeadersText(formatHeaders(intent.data.draft.headers));
      ports.setAutomatePayloadText(intent.data.payloads.join("\n"));
      ports.setAutomateRulesText(JSON.stringify(intent.data.rules, null, 2));
      ports.setAutomateSessionName(intent.data.name);
      ports.setLastResponse(null);
      ports.setLastBurst(null);
      ports.setActiveView("automate");
      ports.setNotice(intent.data.note);
      return;
    case "prepare-workflow-draft":
      ports.setAiPreparedWorkflowDraft(intent.data.workflow);
      ports.setSelectedWorkflowId(intent.data.workflow.id);
      ports.setActiveView("workflows");
      ports.setNotice(intent.data.note);
      return;
    case "notice":
      ports.setNotice(intent.message);
      return;
    case "show-automate-analysis":
      ports.setActiveAutomateSessionId(intent.data.sessionId);
      ports.setAutomateResultFilter(intent.data.outlierResultIds.length > 0 ? "outliers" : "matches");
      ports.setActiveView("automate");
      ports.setNotice(`Automate analysis: ${intent.data.resultCount} results, ${intent.data.clusters.length} clusters`);
      return;
    case "show-replay-comparison":
      ports.setActiveView("repeater");
      ports.setNotice(
        intent.data.identical
          ? "Compared replay results: no differences"
          : `Compared replay results: status ${intent.data.statusBefore} → ${intent.data.statusAfter}`
      );
  }
}

export function useAgentTimelineProjection(
  activeAgentRun: AgentRun | null,
  appMode: AppMode,
  portsRef: MutableRefObject<AgentTimelineProjectionPorts>
) {
  const cursorRef = useRef<{ runId: string; entryId: string } | null>(null);

  useEffect(() => {
    if (appMode !== "ai-first" || !activeAgentRun) {
      cursorRef.current = null;
      return;
    }

    const cursor = cursorRef.current;
    const startIndex =
      cursor?.runId === activeAgentRun.id
        ? activeAgentRun.timeline.findIndex((entry) => entry.id === cursor.entryId)
        : -1;
    const nextEntries = activeAgentRun.timeline.slice(startIndex + 1);
    const lastEntry = nextEntries.at(-1);

    if (!lastEntry) {
      return;
    }

    for (const intent of agentTimelineIntents(nextEntries)) {
      applyAgentTimelineIntent(intent, portsRef.current);
    }

    cursorRef.current = { runId: activeAgentRun.id, entryId: lastEntry.id };
  }, [activeAgentRun, appMode, portsRef]);
}
