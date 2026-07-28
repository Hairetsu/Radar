import { useMemo, useRef, useState, type CSSProperties, type FormEvent } from "react";
import {
  cn,
  elapsed,
} from "./lib";
import { AiFirstChrome } from "./components/shell/AiFirstChrome";
import { Sidebar } from "./components/shell/Sidebar";
import { TelemetryTicker } from "./components/shell/TelemetryTicker";
import { WorkspaceHeader } from "./components/shell/WorkspaceHeader";
import { shellClass, revealClass } from "./components/shell/layoutClasses";
import { WorkbenchViewRouter } from "./components/shell/WorkbenchViewRouter";
import { WorkbenchActionBar } from "./components/shell/WorkbenchActionBar";
import { WorkbenchOverlays } from "./components/shell/WorkbenchOverlays";
import { useRadarWorkbench, type RadarWorkbench } from "./hooks/useRadarWorkbench";
import { useAiOperationsDrawerLocalState } from "./hooks/useAiOperationsDrawerLocalState";
import { useRequestContextMenu } from "./hooks/useRequestContextMenu";
import { useWebSocketSelection } from "./hooks/useWebSocketSelection";
import type {
  FindingTemplateId,
  LocalSessionSummary
} from "./types";

export function App() {
  const workbench: RadarWorkbench = useRadarWorkbench();

  const aiDrawer = useAiOperationsDrawerLocalState();

  const requestContextMenu = useRequestContextMenu(workbench);
  const [findingTemplateId, setFindingTemplateId] = useState("headers" as FindingTemplateId);
  const [identityLabOpen, setIdentityLabOpen] = useState(false);
  const webSocketSelection = useWebSocketSelection(workbench);
  const findingsBuildReportRef = useRef<(() => void) | null>(null);
  const workflowActionsRef = useRef<{ save: () => void; run: () => void } | null>(null);

  const activeSession = workbench.localContext?.session || null;
  const activeSessionListed = activeSession
    ? workbench.sessions.some((session: LocalSessionSummary) => session.id === activeSession.id)
    : false;

  const sidebarViewStats = useMemo(() => ({
    traffic: `${workbench.trafficCaptures.length}/${workbench.scopedTrafficCaptures.length} in scope`,
    websocket: `${workbench.filteredWebSocketEvents.length}/${workbench.webSocketEvents.length} frames`,
    intercept: workbench.interceptState.config.requestEnabled
      ? `${workbench.interceptState.queue.length} queued`
      : "requests off",
    repeater: workbench.lastResponse ? `${workbench.lastResponse.status} ${elapsed(workbench.lastResponse.durationMs)}` : "manual replay",
    automate: workbench.activeAutomateSession
      ? `${workbench.activeAutomateSession.results.length}/${workbench.activeAutomateSession.payloads.length} ${workbench.activeAutomateSession.status}`
      : `${workbench.automatePositions.length} positions`,
    findings: `${workbench.findings.length} findings`,
    workflows: `${workbench.workflowRuns.length} runs`,
    plugins: `${workbench.approvedPlugins.length}/${workbench.plugins.length} approved`,
    advanced: `${workbench.identityProfiles.length} ids · ${workbench.advancedSummary.parameters.length} params`,
    sitemap: `${workbench.sitemap.roots.length} hosts`,
    scope: `${workbench.targets.length} targets`,
    ssl: workbench.proxyState.running ? "proxy engaged" : `${workbench.sslEvents.length} tls events`
  }), [workbench.trafficCaptures.length, workbench.scopedTrafficCaptures.length, workbench.filteredWebSocketEvents.length, workbench.webSocketEvents.length, workbench.interceptState.config.requestEnabled, workbench.interceptState.queue.length, workbench.lastResponse, workbench.activeAutomateSession, workbench.automatePositions.length, workbench.findings.length, workbench.workflowRuns.length, workbench.approvedPlugins.length, workbench.plugins.length, workbench.identityProfiles.length, workbench.advancedSummary.parameters.length, workbench.sitemap.roots.length, workbench.targets.length, workbench.proxyState.running, workbench.sslEvents.length]);

  const handleNavigate = (event: FormEvent) => {
    event.preventDefault();
    if (workbench.address.trim()) {
      if (workbench.browserState.open) {
        void workbench.navigateBrowser();
      } else {
        void workbench.openBrowser();
      }
    }
  };

  const buildFindingReport = () => {
    findingsBuildReportRef.current?.();
  };

  const saveWorkflowEditor = () => {
    workflowActionsRef.current?.save();
  };

  const runSelectedWorkflow = () => {
    workflowActionsRef.current?.run();
  };


  // Space reserved for the docked AI-First drawer, so evidence stays visible
  // beside it rather than behind it. The drawer sits 8px from the panel edge.
  const aiDrawerInset =
    workbench.appMode === "ai-first" && aiDrawer.aiDrawerOpen ? aiDrawer.aiDrawerWidth + 16 : 0;

  return (
    <main className={shellClass} data-testid="radarShell" data-component="radarShell">
      <div className="pointer-events-none fixed z-0 animate-[drift_28s_ease-in-out_infinite_alternate] radar-drift [inset:-10vmax]" />

      <Sidebar
        activeView={workbench.activeView}
        setActiveView={workbench.setActiveView}
        sessions={workbench.sessions}
        loadLocalSession={workbench.loadLocalSession}
        browserState={workbench.browserState}
        notice={workbench.notice}
        activeSession={activeSession}
        activeSessionListed={activeSessionListed}
        sidebarViewStats={sidebarViewStats}
        consoleControls={{
          appMode: workbench.appMode,
          setAppMode: workbench.setAppMode,
          aiConnected: workbench.ai.connected,
          aiChecking: workbench.ai.checking,
          aiStatusLabel: workbench.ai.connected ? "ready" : workbench.ai.checking ? "checking" : "offline",
          onOpenAiSettings: () => workbench.ai.setSettingsOpen(true),
          onOpenProfileSessionPanel: () => workbench.setProfileSessionOpen(true),
          onOpenAppearanceSettings: () => workbench.appearance.setSettingsOpen(true)
        }}
      />

      <section className="relative z-[2] flex min-h-0 min-w-0 flex-col overflow-hidden px-3.5 py-3 [grid-column:2/3] [grid-row:1/2] max-[1180px]:overflow-visible max-[1180px]:[grid-column:1/2] max-[1180px]:[grid-row:2/3] max-[640px]:px-3">
        <WorkspaceHeader
          localContext={workbench.localContext}
          clock={workbench.clock}
          utc={workbench.utc}
          profileName={workbench.localContext?.profile.name || "Field"}
          browserState={workbench.browserState}
          address={workbench.address}
          setAddress={workbench.setAddress}
          onNavigate={handleNavigate}
          onBrowserBack={workbench.browserBack}
          onBrowserForward={workbench.browserForward}
          onBrowserReload={workbench.browserReload}
        />

        <section
          className={cn(
            revealClass,
            "relative mt-3 grid min-h-0 min-w-0 flex-1 overflow-hidden border border-rule/80 shadow-[0_24px_70px_-52px_rgba(0,0,0,0.9)] [animation-delay:220ms] [grid-template-rows:auto_minmax(0,1fr)] max-[1180px]:min-h-[620px] max-[1180px]:overflow-visible",
            workbench.appMode === "ai-first" && "[grid-template-rows:auto_auto_minmax(0,1fr)]",
            "radar-workspace max-[900px]:animate-none max-[900px]:opacity-100"
          )}
          style={{ "--ai-drawer-inset": `${aiDrawerInset}px` } as CSSProperties}
        >
          <WorkbenchActionBar
            workbench={workbench}
            findingTemplateId={findingTemplateId}
            setFindingTemplateId={setFindingTemplateId}
            identityLabOpen={identityLabOpen}
            setIdentityLabOpen={setIdentityLabOpen}
            onClearWebSocketSelection={webSocketSelection.clear}
            onBuildFindingReport={buildFindingReport}
            onSaveWorkflow={saveWorkflowEditor}
            onRunWorkflow={runSelectedWorkflow}
          />

          <AiFirstChrome
            appMode={workbench.appMode}
            agentRuns={workbench.agentRuns}
            activeAgentRun={workbench.activeAgentRun}
            pauseAgentRun={workbench.pauseAgentRun}
            resumeAgentRun={workbench.resumeAgentRun}
            stopAgentRun={workbench.stopAgentRun}
            drawerProps={{
              agentGoal: workbench.agentGoal,
              setAgentGoal: workbench.setAgentGoal,
              agentProfileId: workbench.agentProfileId,
              setAgentProfileId: workbench.setAgentProfileId,
              agentProfiles: workbench.agentProfiles,
              selectedAgentRunProfile: workbench.selectedAgentRunProfile,
              agentTutorialMode: workbench.agentTutorialMode,
              setAgentTutorialMode: workbench.setAgentTutorialMode,
              agentRuns: workbench.agentRuns,
              activeAgentRun: workbench.activeAgentRun,
              setSelectedAgentRunId: workbench.setSelectedAgentRunId,
              activeAgentBudgetLabels: workbench.activeAgentBudgetLabels,
              agentRunMemory: workbench.agentRunMemory,
              filteredAgentRunMemory: workbench.filteredAgentRunMemory,
              agentRunMemorySearch: workbench.agentRunMemorySearch,
              setAgentRunMemorySearch: workbench.setAgentRunMemorySearch,
              selectedCapture: workbench.selected,
              startAgentRun: workbench.startAgentRun,
              pauseAgentRun: workbench.pauseAgentRun,
              resumeAgentRun: workbench.resumeAgentRun,
              stopAgentRun: workbench.stopAgentRun,
              continueAgentRun: workbench.continueAgentRun,
              steerAgentMission: workbench.steerAgentMission,
              updateAgentCapabilities: workbench.updateAgentCapabilities,
              confirmAgentRunMemoryFromTimeline: async (entryId: string) => { await workbench.confirmAgentRunMemoryFromTimeline(entryId); },
              dismissAgentRunMemoryFromTimeline: async (entryId: string) => { await workbench.dismissAgentRunMemoryFromTimeline(entryId); },
              recoverAgentRun: workbench.recoverAgentRun,
              createAgentRunMemory: workbench.createAgentRunMemory,
              deleteAgentRunMemory: async (entryId: string) => { await workbench.deleteAgentRunMemory(entryId); },
              setNotice: workbench.setNotice
            }}
            drawer={aiDrawer}
          />

          <div className="radar-ai-inset relative grid min-h-0 overflow-hidden [grid-template-rows:minmax(0,1fr)]">
            <WorkbenchViewRouter
              workbench={workbench}
              findingTemplateId={findingTemplateId}
              setFindingTemplateId={setFindingTemplateId}
              identityLabOpen={identityLabOpen}
              selectedWebSocketId={webSocketSelection.selectedWebSocketId}
              setSelectedWebSocketId={webSocketSelection.setSelectedWebSocketId}
              selectedWebSocketIds={webSocketSelection.selectedWebSocketIds}
              setSelectedWebSocketIds={webSocketSelection.setSelectedWebSocketIds}
              webSocketSelectionAnchorRef={webSocketSelection.selectionAnchorRef}
              selectedWebSocketEvent={webSocketSelection.selectedWebSocketEvent}
              findingsBuildReportRef={findingsBuildReportRef}
              workflowActionsRef={workflowActionsRef}
              onOpenRequestMenu={requestContextMenu.open}
            />
          </div>
        </section>
      </section>

      <TelemetryTicker
        utc={workbench.utc}
        meta={{ num: workbench.meta.num, label: workbench.meta.label }}
        captureCount={workbench.captures.length}
        sslEventCount={workbench.sslEvents.length}
        proxyRunning={workbench.proxyState.running}
      />

      <WorkbenchOverlays
        workbench={workbench}
        selectedWebSocketIds={webSocketSelection.selectedWebSocketIds}
        onOpenGlobalSearchResult={webSocketSelection.openGlobalSearchResult}
        requestContextMenuProps={requestContextMenu.menuProps}
      />
    </main>
  );
}
