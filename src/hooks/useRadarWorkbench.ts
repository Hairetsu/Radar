import { useMemo, useState } from "react";
import { parseHeaders } from "../lib";
import { AGENT_RUN_PROFILES } from "../../shared/agentProfiles.js";
import { TRAFFIC_QUERY_EXAMPLES } from "../../shared/trafficQuery.js";
import { WORKFLOW_STEP_TEMPLATES } from "../../shared/workflows.js";
import { useAiConnectionSummary } from "./useAiConnectionSummary";
import { useTheme } from "./useTheme";
import {
  createWorkbenchHydrationPorts,
  useAgentDomain,
  useAutomateDomain,
  useBrowserDomain,
  useFindingsDomain,
  useGlobalSearchDomain,
  useInterceptDomain,
  usePluginsDomain,
  useRepeaterDomain,
  useScopeDomain,
  useSessionOrchestrator,
  useSslProxyDomain,
  useTrafficDomain,
  useWebSocketDomain,
  useWorkbenchShell,
  useWorkbenchCrossDomainActions,
  useWorkbenchKeyboardShortcuts,
  useWorkbenchProjectFeatures,
  useWorkflowsDomain
} from "./workbench";
export type { WorkView } from "./workbench/viewMeta";
export { WORK_VIEWS, viewMeta } from "./workbench/viewMeta";
export { TRAFFIC_SORT_FIELDS } from "./workbench/useTrafficDomain";
export type { TrafficSortField, TrafficSortDirection } from "./workbench/useTrafficDomain";

export type RadarWorkbench = ReturnType<typeof useRadarWorkbench>;

export function useRadarWorkbench() {
  const shellDomain = useWorkbenchShell();
  const scopeDomain = useScopeDomain({ setNotice: shellDomain.setNotice });
  const pluginsDomain = usePluginsDomain({ setNotice: shellDomain.setNotice });
  const interceptDomain = useInterceptDomain({ setNotice: shellDomain.setNotice });
  const sslProxyDomain = useSslProxyDomain({ setNotice: shellDomain.setNotice });

  const {
    activeView,
    setActiveView,
    setNotice,
    appMode,
    setAiPaletteOpen
  } = shellDomain;

  const { targets, targetText, setTargetText } = scopeDomain;

  const {
    setInterceptState,
    setInterceptSelectedId,
    setInterceptDraft,
    setInterceptHeadersText,
    setInterceptResponseStatus,
    setInterceptResponseStatusText,
    hydrateInterceptDraft,
    hydrateClientOverrideDraft,
    interceptDraftItemRef,
    setInterceptPane,
    setClientOverrides
  } = interceptDomain;

  const findingsDomain = useFindingsDomain({
    setNotice: shellDomain.setNotice,
    setActiveView: shellDomain.setActiveView
  });

  const {
    evidenceAnnotations,
    setFindings,
    setSelectedFindingId
  } = findingsDomain;

  const webSocketDomain = useWebSocketDomain({
    setNotice: shellDomain.setNotice,
    setActiveView: shellDomain.setActiveView,
    targets,
    evidenceAnnotations
  });

  const { webSocketSearch, setWebSocketSearch } = webSocketDomain;

  const trafficDomain = useTrafficDomain({
    setNotice: shellDomain.setNotice,
    setActiveView: shellDomain.setActiveView,
    targets,
    evidenceAnnotations
  });

  const {
    setTrafficMethodFilter,
    setTrafficTypeFilter,
    setTrafficSearch,
    trafficSearchRef,
    setSelectedId,
    setSelectedIds,
    selectionAnchorRef
  } = trafficDomain;

  const repeaterDomain = useRepeaterDomain({
    setNotice: shellDomain.setNotice,
    setActiveView: shellDomain.setActiveView
  });

  const {
    draft,
    setDraft,
    headersText,
    setHeadersText,
    setReplayTabState,
    setLastResponse,
    setLastBurst
  } = repeaterDomain;

  const browserDomain = useBrowserDomain({ setNotice });
  const { address, setAddress } = browserDomain;
  const globalSearchDomain = useGlobalSearchDomain();
  const {
    globalSearchOpen,
    setGlobalSearchOpen,
    openGlobalSearch
  } = globalSearchDomain;
  const workflowsDomain = useWorkflowsDomain({
    setNotice: shellDomain.setNotice,
    setActiveView: shellDomain.setActiveView,
    setFindings,
    setSelectedFindingId
  });

  const { setSelectedWorkflowId, setAiPreparedWorkflowDraft } =
    workflowsDomain;

  const [activeDetail, setActiveDetail] = useState<"request" | "response">("request");

  const automateBaseDraft = useMemo(() => {
    try {
      return { ...draft, headers: parseHeaders(headersText) };
    } catch {
      return draft;
    }
  }, [draft, headersText]);

  const automateDomain = useAutomateDomain({
    setNotice: shellDomain.setNotice,
    setActiveView: shellDomain.setActiveView,
    setDraft,
    setHeadersText,
    setLastResponse: repeaterDomain.setLastResponse,
    setLastBurst: repeaterDomain.setLastBurst,
    setReplayTabState: repeaterDomain.setReplayTabState,
    automateBaseDraft,
    activeReplayTabEnvironmentId: repeaterDomain.activeReplayTab?.environmentId
  });

  const {
    setActiveAutomateSessionId,
    setAutomatePayloadText,
    setAutomateRulesText,
    setAutomateSessionName,
    setAutomateResultFilter
  } = automateDomain;

  const agentDomain = useAgentDomain({
    address,
    setAddress,
    setNotice,
    setActiveView,
    setDraft,
    setHeadersText,
    setLastResponse,
    setLastBurst,
    setSelectedId,
    setSelectedIds,
    selectionAnchorRef,
    setInterceptState,
    setInterceptSelectedId,
    interceptDraftItemRef,
    setInterceptDraft,
    setInterceptHeadersText,
    setInterceptResponseStatus,
    setInterceptResponseStatusText,
    hydrateInterceptDraft,
    setInterceptPane,
    setClientOverrides,
    hydrateClientOverrideDraft,
    setTrafficSearch,
    setReplayTabState,
    setAutomatePayloadText,
    setAutomateRulesText,
    setAutomateSessionName,
    setActiveAutomateSessionId,
    setAutomateResultFilter,
    setAiPreparedWorkflowDraft,
    setSelectedWorkflowId,
    targetText,
    setTargetText,
    appMode
  });
  const hydration = createWorkbenchHydrationPorts({
    scope: scopeDomain,
    traffic: trafficDomain,
    sslProxy: sslProxyDomain,
    webSocket: webSocketDomain,
    browser: browserDomain,
    intercept: interceptDomain,
    agent: agentDomain,
    findings: findingsDomain,
    workflows: workflowsDomain,
    plugins: pluginsDomain,
    repeater: repeaterDomain,
    automate: automateDomain
  });
  const sessionDomain = useSessionOrchestrator({ setNotice, hydration });
  const projectFeatures = useWorkbenchProjectFeatures({
    shell: shellDomain,
    scope: scopeDomain,
    traffic: trafficDomain,
    webSocket: webSocketDomain,
    repeater: repeaterDomain,
    findings: findingsDomain,
    workflows: workflowsDomain,
    automate: automateDomain,
    browser: browserDomain,
    session: sessionDomain,
    globalSearch: globalSearchDomain
  });
  const {
    savedFilters: savedFiltersDomain,
    sitemap: sitemapDomain,
    artifacts: projectArtifactsDomain,
    advanced: advancedDomain,
    identity: identityDomain,
    openGlobalSearchResult
  } = projectFeatures;
  const ai = useAiConnectionSummary();
  const appearance = useTheme();
  const crossDomainActions = useWorkbenchCrossDomainActions({
    shell: shellDomain,
    repeater: repeaterDomain,
    findings: findingsDomain,
    automate: automateDomain,
    agent: agentDomain,
    intercept: interceptDomain
  });

  useWorkbenchKeyboardShortcuts({
    activeView,
    globalSearchOpen,
    openGlobalSearch,
    closeGlobalSearch: () => setGlobalSearchOpen(false),
    toggleAiPalette: () => setAiPaletteOpen((open) => !open),
    trafficSearchInputRef: trafficSearchRef,
    trafficSearch: trafficDomain.trafficSearch,
    webSocketSearch,
    trafficMethodFilter: trafficDomain.trafficMethodFilter,
    trafficTypeFilter: trafficDomain.trafficTypeFilter,
    clearTrafficSearch: () => setTrafficSearch(""),
    clearWebSocketSearch: () => setWebSocketSearch(""),
    clearTrafficMethodFilter: () => setTrafficMethodFilter("all"),
    clearTrafficTypeFilter: () => setTrafficTypeFilter("all")
  });

  return {
    ...shellDomain,
    ...scopeDomain,
    ...pluginsDomain,
    ...interceptDomain,
    ...sslProxyDomain,
    ...webSocketDomain,
    ...trafficDomain,
    ...repeaterDomain,
    ...findingsDomain,
    ...workflowsDomain,
    ...automateDomain,
    ...browserDomain,
    ...globalSearchDomain,
    ...sessionDomain,
    ...savedFiltersDomain,
    ...projectArtifactsDomain,
    ...advancedDomain,
    ...identityDomain,
    ...sitemapDomain,
    ...agentDomain,
    ...crossDomainActions,
    openGlobalSearchResult,
    workflowStepTemplates: WORKFLOW_STEP_TEMPLATES,
    trafficQueryExamples: TRAFFIC_QUERY_EXAMPLES,
    agentProfiles: AGENT_RUN_PROFILES,
    activeDetail,
    setActiveDetail,
    ai,
    appearance,
  };
}
