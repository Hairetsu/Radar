import type { AutomateDomain } from "./useAutomateDomain";
import type { BrowserDomain } from "./useBrowserDomain";
import type { FindingsDomain } from "./useFindingsDomain";
import type { GlobalSearchDomain } from "./useGlobalSearchDomain";
import type { RepeaterDomain } from "./useRepeaterDomain";
import type { ScopeDomain } from "./useScopeDomain";
import type { ProjectSessionDomain } from "./useProjectSessionDomain";
import type { TrafficDomain } from "./useTrafficDomain";
import type { WebSocketDomain } from "./useWebSocketDomain";
import type { WorkbenchShellDomain } from "./useWorkbenchShell";
import type { WorkflowsDomain } from "./useWorkflowsDomain";
import { useAdvancedDomain } from "./useAdvancedDomain";
import { useGlobalSearchNavigation } from "./useGlobalSearchNavigation";
import { useIdentityDomain } from "./useIdentityDomain";
import { useProjectArtifactsDomain } from "./useProjectArtifactsDomain";
import { useSavedFiltersDomain } from "./useSavedFiltersDomain";
import { useSitemapDomain } from "./useSitemapDomain";

export function useWorkbenchProjectFeatures({
  shell,
  scope,
  traffic,
  webSocket,
  repeater,
  findings,
  workflows,
  automate,
  browser,
  session,
  globalSearch
}: {
  shell: WorkbenchShellDomain;
  scope: ScopeDomain;
  traffic: TrafficDomain;
  webSocket: WebSocketDomain;
  repeater: RepeaterDomain;
  findings: FindingsDomain;
  workflows: WorkflowsDomain;
  automate: AutomateDomain;
  browser: BrowserDomain;
  session: ProjectSessionDomain;
  globalSearch: GlobalSearchDomain;
}) {
  const { localContext } = session;
  const savedFilters = useSavedFiltersDomain(
    `${localContext?.profile.id || ""}:${
      localContext?.session.id || ""
    }`,
    {
      setNotice: shell.setNotice,
      setActiveView: shell.setActiveView,
      setTrafficSearch: traffic.setTrafficSearch,
      setWebSocketSearch: webSocket.setWebSocketSearch
    }
  );
  const sitemap = useSitemapDomain(
    traffic.scopedTrafficCaptures,
    scope.targets,
    localContext,
    {
      setNotice: shell.setNotice,
      setActiveView: shell.setActiveView,
      setTrafficSearch: traffic.setTrafficSearch
    }
  );
  const artifacts = useProjectArtifactsDomain(
    `${localContext?.profile.id || ""}:${
      localContext?.session.id || ""
    }`,
    {
      activeView: shell.activeView,
      trafficQuery: traffic.trafficSearch,
      webSocketQuery: webSocket.webSocketSearch,
      trafficMethodFilter: traffic.trafficMethodFilter,
      trafficTypeFilter: traffic.trafficTypeFilter,
      selectedCaptureId: traffic.selectedId,
      selectedFindingId: findings.selectedFindingId,
      selectedWorkflowId: workflows.selectedWorkflowId,
      selectedWorkflowRunId: workflows.selectedWorkflowRunId,
      replayTabState: repeater.replayTabState,
      sitemapNodeId: sitemap.selectedSitemapNodeId,
      diffBaselineSessionId: sitemap.diffBaselineSessionId,
      automateSessionId: automate.activeAutomateSessionId
    },
    {
      setNotice: shell.setNotice,
      setActiveView: shell.setActiveView,
      setTrafficSearch: traffic.setTrafficSearch,
      setWebSocketSearch: webSocket.setWebSocketSearch,
      setTrafficMethodFilter: traffic.setTrafficMethodFilter,
      setTrafficTypeFilter: traffic.setTrafficTypeFilter,
      setSelectedId: traffic.setSelectedId,
      setSelectedIds: traffic.setSelectedIds,
      selectionAnchorRef: traffic.selectionAnchorRef,
      setSelectedFindingId: findings.setSelectedFindingId,
      setSelectedWorkflowId: workflows.setSelectedWorkflowId,
      setSelectedWorkflowRunId:
        workflows.setSelectedWorkflowRunId,
      setSelectedSitemapNodeId: sitemap.setSelectedSitemapNodeId,
      setDiffBaselineSessionId: sitemap.setDiffBaselineSessionId,
      setActiveAutomateSessionId:
        automate.setActiveAutomateSessionId,
      selectReplayTab: repeater.selectReplayTab,
      applyLocalContext: session.applyLocalContext
    }
  );
  const openGlobalSearchResult = useGlobalSearchNavigation(
    artifacts.savedViews,
    repeater.replayTabState,
    {
      setGlobalSearchOpen: globalSearch.setGlobalSearchOpen,
      applySavedView: artifacts.applySavedView,
      setProjectArtifactsOpen: artifacts.setProjectArtifactsOpen,
      selectProjectNote: artifacts.selectProjectNote,
      setNotice: shell.setNotice,
      setWebSocketSearch: webSocket.setWebSocketSearch,
      setTrafficSearch: traffic.setTrafficSearch,
      setActiveView: shell.setActiveView,
      setSelectedId: traffic.setSelectedId,
      setSelectedIds: traffic.setSelectedIds,
      selectionAnchorRef: traffic.selectionAnchorRef,
      selectReplayTab: repeater.selectReplayTab,
      setSelectedFindingId: findings.setSelectedFindingId,
      setSelectedWorkflowId: workflows.setSelectedWorkflowId,
      setSelectedWorkflowRunId:
        workflows.setSelectedWorkflowRunId
    }
  );
  const advanced = useAdvancedDomain(
    traffic.scopedTrafficCaptures,
    webSocket.scopedWebSocketEvents,
    scope.targets,
    {
      replayCollections: repeater.replayCollections,
      saveReplayCollections: repeater.saveReplayCollections,
      setDraft: repeater.setDraft,
      setHeadersText: repeater.setHeadersText,
      setLastResponse: repeater.setLastResponse,
      setLastBurst: repeater.setLastBurst,
      setActiveView: shell.setActiveView,
      setNotice: shell.setNotice,
      setAiPreparedWorkflowDraft:
        workflows.setAiPreparedWorkflowDraft,
      setSelectedWorkflowId: workflows.setSelectedWorkflowId
    }
  );
  const identity = useIdentityDomain(Boolean(localContext), {
    setNotice: shell.setNotice,
    setBrowserState: browser.setBrowserState,
    setCaptures: traffic.setCaptures
  });

  return {
    savedFilters,
    sitemap,
    artifacts,
    advanced,
    identity,
    openGlobalSearchResult
  };
}
