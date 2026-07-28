import { useCallback, useRef, type MutableRefObject } from "react";
import type { GlobalSearchResult, ReplayTabState, SavedView } from "../../types";
import type { WorkView } from "./viewMeta";

interface GlobalSearchNavigationPorts {
  setGlobalSearchOpen: (open: boolean) => void;
  applySavedView: (view: SavedView) => void;
  setProjectArtifactsOpen: (open: boolean) => void;
  selectProjectNote: (id: string) => void;
  setNotice: (message: string) => void;
  setWebSocketSearch: (query: string) => void;
  setTrafficSearch: (query: string) => void;
  setActiveView: (view: WorkView) => void;
  setSelectedId: (id: string) => void;
  setSelectedIds: (ids: string[]) => void;
  selectionAnchorRef: MutableRefObject<string>;
  selectReplayTab: (id: string) => void | Promise<void>;
  setSelectedFindingId: (id: string) => void;
  setSelectedWorkflowId: (id: string) => void;
  setSelectedWorkflowRunId: (id: string) => void;
}

export function useGlobalSearchNavigation(
  savedViews: SavedView[],
  replayTabState: ReplayTabState,
  ports: GlobalSearchNavigationPorts
) {
  const portsRef = useRef(ports);
  portsRef.current = ports;
  const savedViewsRef = useRef(savedViews);
  savedViewsRef.current = savedViews;
  const replayTabStateRef = useRef(replayTabState);
  replayTabStateRef.current = replayTabState;

  return useCallback((result: GlobalSearchResult) => {
    const target = result.target;
    const currentPorts = portsRef.current;
    currentPorts.setGlobalSearchOpen(false);

    if (result.kind === "saved-view") {
      const view = savedViewsRef.current.find((item) => item.id === result.refId);
      if (view) {
        currentPorts.applySavedView(view);
        return;
      }
    }

    if (target.view === "notes") {
      currentPorts.setProjectArtifactsOpen(true);
      if (target.id) {
        currentPorts.selectProjectNote(target.id);
      }
      currentPorts.setNotice(`Opened ${result.kind}: ${result.title}`);
      return;
    }

    if (target.query) {
      if (target.view === "websocket") {
        currentPorts.setWebSocketSearch(target.query);
      } else {
        currentPorts.setTrafficSearch(target.query);
      }
    }

    if (target.view === "traffic") {
      currentPorts.setActiveView("traffic");
      if (target.id) {
        currentPorts.setSelectedId(target.id);
        currentPorts.setSelectedIds([target.id]);
        currentPorts.selectionAnchorRef.current = target.id;
      }
    } else if (target.view === "websocket") {
      currentPorts.setActiveView("websocket");
    } else if (target.view === "repeater") {
      currentPorts.setActiveView("repeater");
      if (
        target.id &&
        replayTabStateRef.current.tabs.some((tab) => tab.id === target.id)
      ) {
        void currentPorts.selectReplayTab(target.id);
      }
    } else if (target.view === "findings") {
      currentPorts.setActiveView("findings");
      if (target.id) {
        currentPorts.setSelectedFindingId(target.id);
      }
    } else if (target.view === "workflows") {
      currentPorts.setActiveView("workflows");
      if (target.id) {
        currentPorts.setSelectedWorkflowId(target.id);
      }
      if (target.secondaryId) {
        currentPorts.setSelectedWorkflowRunId(target.secondaryId);
      }
    } else if (
      target.view === "plugins" ||
      target.view === "advanced" ||
      target.view === "sitemap" ||
      target.view === "scope" ||
      target.view === "intercept" ||
      target.view === "automate" ||
      target.view === "ssl"
    ) {
      currentPorts.setActiveView(target.view);
    }

    currentPorts.setNotice(`Opened ${result.kind}: ${result.title}`);
  }, []);
}
