import { useMemo, useRef, useState, type CSSProperties, type FormEvent, type MouseEvent } from "react";
import { Bot, FileText, Search, X } from "lucide-react";
import {
  cn,
  contextMenuPosition,
  elapsed,
  formatCapturedRequest,
  globalSearchKindLabel,
  originFromUrl,
  REQUEST_EXPORT_LABELS,
  type RequestExportFormat
} from "./lib";
import { AiSettingsPanel } from "./ai/AiSettingsPanel";
import { CommandPalette } from "./ai/CommandPalette";
import { AiFirstChrome } from "./components/shell/AiFirstChrome";
import { useAiOperationsDrawerLocalState } from "./components/shell/AiOperationsDrawer";
import { PanelHeader } from "./components/shell/PanelHeader";
import { Sidebar } from "./components/shell/Sidebar";
import { TelemetryTicker } from "./components/shell/TelemetryTicker";
import { WorkspaceHeader } from "./components/shell/WorkspaceHeader";
import { ProjectArtifactsOverlay } from "./components/shell/ProjectArtifactsOverlay";
import { RequestContextMenu, type RequestMenuState } from "./components/shell/RequestContextMenu";
import { shellClass, revealClass } from "./components/shell/layoutClasses";
import { AdvancedView, AdvancedViewActions } from "./components/views/AdvancedView";
import { AutomateView, AutomateViewActions } from "./components/views/AutomateView";
import { FindingsView, FindingsViewActions } from "./components/views/FindingsView";
import { InterceptView, InterceptViewActions } from "./components/views/InterceptView";
import { PluginsView, PluginsViewActions } from "./components/views/PluginsView";
import { RepeaterView, RepeaterViewActions } from "./components/views/RepeaterView";
import { ScopeView, ScopeViewActions } from "./components/views/ScopeView";
import { SitemapView } from "./components/views/SitemapView";
import { SslView } from "./components/views/SslView";
import { TrafficView, TrafficViewActions } from "./components/views/TrafficView";
import { WebSocketView, WebSocketViewActions } from "./components/views/WebSocketView";
import { WorkflowsView, WorkflowsViewActions } from "./components/views/WorkflowsView";
import { AppearanceSettingsPanel } from "./components/AppearanceSettingsPanel";
import { NewSessionDialog } from "./components/NewSessionDialog";
import { ProfileSessionPanel } from "./components/ProfileSessionPanel";
import { EmptyState, StatusBadge } from "./components/radar/primitives";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { useRadarWorkbench, type RadarWorkbench } from "./hooks/useRadarWorkbench";
import type {
  CapturedRequest,
  FindingTemplateId,
  GlobalSearchResult,
  LocalSessionSummary,
  WebSocketEvent
} from "./types";

export function App() {
  const workbench: RadarWorkbench = useRadarWorkbench();

  const aiDrawer = useAiOperationsDrawerLocalState();

  const [requestMenu, setRequestMenu] = useState<RequestMenuState | null>(null);
  const [findingTemplateId, setFindingTemplateId] = useState("headers" as FindingTemplateId);
  const [identityLabOpen, setIdentityLabOpen] = useState(false);
  const [selectedWebSocketId, setSelectedWebSocketId] = useState("");
  const [selectedWebSocketIds, setSelectedWebSocketIds] = useState<string[]>([]);
  const webSocketSelectionAnchorRef = useRef("");
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

  const requestMenuCapture = requestMenu
    ? workbench.captures.find((capture: CapturedRequest) => capture.id === requestMenu.captureId) || null
    : null;
  const requestMenuOrigin = requestMenuCapture ? originFromUrl(requestMenuCapture.url) : "";
  const requestMenuOriginInScope = Boolean(requestMenuOrigin && workbench.targets.includes(requestMenuOrigin));

  const onOpenRequestMenu = (event: MouseEvent<HTMLElement>, capture: CapturedRequest | null = workbench.selected) => {
    if (!capture) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const nextPosition = contextMenuPosition(event);
    workbench.selectTrafficCapture(capture.id);
    setRequestMenu({ ...nextPosition, captureId: capture.id });
  };

  const copyRequestExport = async (format: RequestExportFormat) => {
    if (!requestMenuCapture) {
      return;
    }
    try {
      await window.navigator.clipboard.writeText(formatCapturedRequest(requestMenuCapture, format));
      workbench.setNotice(`Request copied as ${REQUEST_EXPORT_LABELS[format]}`);
    } catch {
      workbench.setNotice("Copy failed");
    } finally {
      setRequestMenu(null);
    }
  };

  const copyRequestUrl = async () => {
    if (!requestMenuCapture) {
      return;
    }
    try {
      await window.navigator.clipboard.writeText(requestMenuCapture.url);
      workbench.setNotice("Request URL copied");
    } catch {
      workbench.setNotice("Copy failed");
    } finally {
      setRequestMenu(null);
    }
  };

  const cloneMenuRequest = () => {
    if (requestMenuCapture) {
      workbench.cloneToRepeater(requestMenuCapture);
    }
    setRequestMenu(null);
  };

  const addMenuRequestToScope = async () => {
    if (requestMenuCapture) {
      await workbench.addTarget(requestMenuCapture.url);
    }
    setRequestMenu(null);
  };

  const deleteMenuRequest = async () => {
    if (requestMenuCapture) {
      await workbench.deleteCapture(requestMenuCapture.id);
    }
    setRequestMenu(null);
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

  const submitGlobalSearch = (event: FormEvent) => {
    event.preventDefault();
    void workbench.runGlobalSearch(workbench.globalSearchQuery);
  };

  const submitProjectNote = (event: FormEvent) => {
    event.preventDefault();
    void workbench.saveProjectNote();
  };

  const submitSavedView = (event: FormEvent) => {
    event.preventDefault();
    void workbench.saveCurrentView();
  };

  const openGlobalSearchResult = (result: GlobalSearchResult) => {
    if (result.target.view === "websocket" && result.target.id) {
      setSelectedWebSocketId(result.target.id);
      setSelectedWebSocketIds([result.target.id]);
      webSocketSelectionAnchorRef.current = result.target.id;
    }
    workbench.openGlobalSearchResult(result);
  };

  const selectedWebSocketEvent =
    workbench.webSocketEvents.find((event: WebSocketEvent) => event.id === selectedWebSocketId) || null;

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

        {workbench.globalSearchOpen && (
          <div
            className="fixed inset-0 z-30 grid place-items-start bg-ink/76 px-4 py-[8vh] backdrop-blur-sm"
            data-testid="globalSearchOverlay"
            data-component="globalSearchOverlay"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) {
                workbench.setGlobalSearchOpen(false);
              }
            }}
          >
            <section className="mx-auto w-full max-w-3xl border border-signal/45 bg-surface shadow-[0_32px_120px_-72px_var(--color-signal)]">
              <form
                className="flex items-center gap-3 border-b border-rule radar-form-gradient p-3"
                onSubmit={submitGlobalSearch}
              >
                <Search className="shrink-0 text-signal" size={17} strokeWidth={1.8} />
                <Input
                  autoFocus
                  value={workbench.globalSearchQuery}
                  onChange={(event) => {
                    workbench.setGlobalSearchQuery(event.target.value);
                    void workbench.runGlobalSearch(event.target.value);
                  }}
                  placeholder='Search evidence, findings, replays... try kind:capture host:api status:403 "set-cookie"'
                  className="h-10 border-0 bg-transparent px-0 text-lead"
                  data-testid="globalSearchInput"
                  data-component="globalSearchInput"
                />
                <Button type="submit" variant="solid" size="compact" data-testid="runGlobalSearch">
                  Search
                </Button>
                <Button
                  type="button"
                  variant="icon"
                  size="icon"
                  onClick={() => workbench.setGlobalSearchOpen(false)}
                  aria-label="Close global search"
                  data-testid="closeGlobalSearch"
                >
                  <X size={15} strokeWidth={1.8} />
                </Button>
              </form>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rule px-3 py-2">
                <span className="rd-eyebrow text-muted">
                  {workbench.globalSearchPending
                    ? "Searching local project"
                    : workbench.globalSearchResult?.ok
                      ? `${workbench.globalSearchResult.total} result${workbench.globalSearchResult.total === 1 ? "" : "s"}`
                      : "Global project search"}
                </span>
                <span className="rd-label text-muted">
                  Filters: kind, host, path, status, severity, source
                </span>
              </div>
              <div className="max-h-[58vh] overflow-auto p-2">
                {workbench.globalSearchError && (
                  <div className="border border-rust/45 bg-rust/10 p-3 text-lead text-bone" data-testid="globalSearchError">
                    {workbench.globalSearchError}
                  </div>
                )}
                {!workbench.globalSearchError && !workbench.globalSearchResult?.results.length && (
                  <EmptyState>
                    {workbench.globalSearchQuery.trim()
                      ? "No local project results matched that query."
                      : "Type to search captures, frames, replays, findings, workflows, plugins, Advanced signals, and filters."}
                  </EmptyState>
                )}
                {!workbench.globalSearchError &&
                  workbench.globalSearchResult?.results.map((result: GlobalSearchResult) => (
                    <button
                      key={result.id}
                      type="button"
                      className="mb-2 block w-full border border-rule bg-ink/28 p-3 text-left transition hover:border-signal/45 hover:bg-signal/[0.06]"
                      onClick={() => openGlobalSearchResult(result)}
                      data-testid={`globalSearchResult-${result.kind}`}
                      data-component="globalSearchResult"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <span className="mb-1 block rd-eyebrow text-signal">
                            {globalSearchKindLabel(result.kind)}
                            {result.host ? ` // ${result.host}` : ""}
                          </span>
                          <strong className="block overflow-hidden text-ellipsis whitespace-nowrap font-display text-lead uppercase tracking-data text-bone [font-stretch:75%]">
                            {result.title}
                          </strong>
                        </div>
                        <StatusBadge>{result.status || result.severity || result.source || "open"}</StatusBadge>
                      </div>
                      <p className="mt-1 overflow-hidden text-ellipsis whitespace-nowrap font-mono text-label text-muted">
                        {result.subtitle}
                      </p>
                      <p className="mt-2 line-clamp-2 text-body leading-relaxed text-copy">{result.detail}</p>
                      {result.matches[0] && (
                        <p className="mt-2 border-l border-signal/40 pl-2 font-mono text-label leading-relaxed text-muted">
                          {result.matches[0].label}: {result.matches[0].snippet}
                        </p>
                      )}
                    </button>
                  ))}
              </div>
            </section>
          </div>
        )}

        {workbench.projectArtifactsOpen && (
          <ProjectArtifactsOverlay
            workbench={workbench}
            submitProjectNote={submitProjectNote}
            submitSavedView={submitSavedView}
          />
        )}

        <section
          className={cn(
            revealClass,
            "relative mt-3 grid min-h-0 min-w-0 flex-1 overflow-hidden border border-rule/80 shadow-[0_24px_70px_-52px_rgba(0,0,0,0.9)] [animation-delay:220ms] [grid-template-rows:auto_minmax(0,1fr)] max-[1180px]:min-h-[620px] max-[1180px]:overflow-visible",
            workbench.appMode === "ai-first" && "[grid-template-rows:auto_auto_minmax(0,1fr)]",
            "radar-workspace max-[900px]:animate-none max-[900px]:opacity-100"
          )}
          style={{ "--ai-drawer-inset": `${aiDrawerInset}px` } as CSSProperties}
        >
          <div className="radar-ai-inset relative flex items-center justify-between gap-4 border-b border-rule radar-panel-gradient px-4 pb-3 pt-3 after:absolute after:bottom-[-1px] after:left-4 after:right-4 after:h-px after:bg-[linear-gradient(90deg,var(--color-signal),transparent_50%)] after:content-[''] max-[640px]:flex-col max-[640px]:items-start max-[640px]:px-4">
            <PanelHeader meta={workbench.meta} />
            <div className="flex flex-wrap items-center gap-2 pb-1">
              <Button
                variant="outline"
                type="button"
                onClick={workbench.openGlobalSearch}
                title="Global search (⌘P)"
                data-testid="openGlobalSearch"
                data-component="openGlobalSearch"
              >
                <Search size={14} strokeWidth={1.7} />
                Search
              </Button>
              <Button
                variant="outline"
                type="button"
                onClick={() => workbench.setProjectArtifactsOpen(true)}
                title="Project notes and saved views"
                data-testid="openProjectArtifacts"
                data-component="openProjectArtifacts"
              >
                <FileText size={14} strokeWidth={1.7} />
                Notes
              </Button>
              <Button
                variant="outline"
                type="button"
                onClick={() => workbench.setAiPaletteOpen(true)}
                title="Command palette (⌘K)"
                data-testid="openAiPalette"
                data-component="openAiPalette"
              >
                <Bot size={14} strokeWidth={1.7} />
                AI
              </Button>
              {workbench.activeView === "traffic" && (
                <TrafficViewActions
                  openNewSessionDialog={workbench.openNewSessionDialog}
                  clearCaptures={workbench.clearCaptures}
                />
              )}
              {workbench.activeView === "websocket" && (
                <WebSocketViewActions
                  clearWebSocketEvents={workbench.clearWebSocketEvents}
                  onClearSelection={() => {
                    setSelectedWebSocketId("");
                    setSelectedWebSocketIds([]);
                    webSocketSelectionAnchorRef.current = "";
                  }}
                />
              )}
              {workbench.activeView === "intercept" && (
                <InterceptViewActions
                  interceptState={workbench.interceptState}
                  setRequestInterceptEnabled={workbench.setRequestInterceptEnabled}
                  setResponseInterceptEnabled={workbench.setResponseInterceptEnabled}
                  resumeAllIntercepts={workbench.resumeAllIntercepts}
                />
              )}
              {workbench.activeView === "repeater" && (
                <RepeaterViewActions
                  addTarget={workbench.addTarget}
                  draft={workbench.draft}
                />
              )}
              {workbench.activeView === "automate" && (
                <AutomateViewActions
                  automatePositions={workbench.automatePositions}
                  automatePayloads={workbench.automatePayloads}
                  startAutomateSession={workbench.startAutomateSession}
                />
              )}
              {workbench.activeView === "findings" && (
                <FindingsViewActions
                  findingTemplates={workbench.findingTemplates}
                  selected={workbench.selected}
                  createFindingFromCapture={workbench.createFindingFromCapture}
                  findingTemplateId={findingTemplateId}
                  setFindingTemplateId={setFindingTemplateId}
                  onBuildReport={buildFindingReport}
                />
              )}
              {workbench.activeView === "workflows" && (
                <WorkflowsViewActions
                  selectedWorkflow={workbench.selectedWorkflow}
                  onSaveWorkflow={saveWorkflowEditor}
                  onRunWorkflow={runSelectedWorkflow}
                />
              )}
              {workbench.activeView === "plugins" && (
                <PluginsViewActions
                  pluginInstallPath={workbench.pluginInstallPath}
                  previewPluginInstall={workbench.previewPluginInstall}
                  installPlugin={workbench.installPlugin}
                />
              )}
              {workbench.activeView === "advanced" && (
                <AdvancedViewActions
                  identityLabOpen={identityLabOpen}
                  setIdentityLabOpen={setIdentityLabOpen}
                  setAdvancedImportText={workbench.setAdvancedImportText}
                  advancedImportText={workbench.advancedImportText}
                />
              )}
              {workbench.activeView === "scope" && (
                <ScopeViewActions saveTargets={workbench.saveTargets} />
              )}
              {workbench.activeView === "repeater" && workbench.notice && (
                <span
                  className="max-w-[340px] overflow-hidden text-ellipsis whitespace-nowrap font-mono text-meta tracking-data text-danger"
                  role="status"
                  data-testid="replayNotice"
                >
                  {workbench.notice}
                </span>
              )}
              {workbench.activeView === "ssl" && (
                <span className="max-w-[340px] overflow-hidden text-ellipsis whitespace-nowrap font-mono text-meta tracking-data text-muted">
                  {workbench.notice}
                </span>
              )}
            </div>
          </div>

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
            {workbench.activeView === "traffic" && (
              <TrafficView
                {...workbench}
                findingTemplateId={findingTemplateId}
                onOpenRequestMenu={onOpenRequestMenu}
              />
            )}
            {workbench.activeView === "websocket" && (
              <WebSocketView
                {...workbench}
                findingTemplateId={findingTemplateId}
                selectedWebSocketId={selectedWebSocketId}
                setSelectedWebSocketId={setSelectedWebSocketId}
                selectedWebSocketIds={selectedWebSocketIds}
                setSelectedWebSocketIds={setSelectedWebSocketIds}
                selectionAnchorRef={webSocketSelectionAnchorRef}
              />
            )}
            {workbench.activeView === "intercept" && (
              <InterceptView {...workbench} />
            )}
            {workbench.activeView === "repeater" && (
              <RepeaterView {...workbench} />
            )}
            {workbench.activeView === "automate" && (
              <AutomateView {...workbench} />
            )}
            {workbench.activeView === "findings" && (
              <FindingsView
                {...workbench}
                findingTemplateId={findingTemplateId}
                setFindingTemplateId={setFindingTemplateId}
                selectedWebSocketEvent={selectedWebSocketEvent}
                buildReportRef={findingsBuildReportRef}
              />
            )}
            {workbench.activeView === "workflows" && (
              <WorkflowsView {...workbench} workflowActionsRef={workflowActionsRef} />
            )}
            {workbench.activeView === "plugins" && (
              <PluginsView {...workbench} />
            )}
            {workbench.activeView === "advanced" && (
              <AdvancedView
                {...workbench}
                identityLabOpen={identityLabOpen}
              />
            )}
            {workbench.activeView === "sitemap" && (
              <SitemapView {...workbench} />
            )}
            {workbench.activeView === "scope" && (
              <ScopeView {...workbench} />
            )}
            {workbench.activeView === "ssl" && (
              <SslView {...workbench} />
            )}
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

      <AppearanceSettingsPanel
        open={workbench.appearance.settingsOpen}
        onClose={() => workbench.appearance.setSettingsOpen(false)}
        themeId={workbench.appearance.themeId}
        onThemeChange={workbench.appearance.setTheme}
      />

      <NewSessionDialog
        open={workbench.newSessionOpen}
        name={workbench.newSessionName}
        onNameChange={workbench.setNewSessionName}
        onClose={() => workbench.setNewSessionOpen(false)}
        onCreate={workbench.confirmNewSession}
      />

      <ProfileSessionPanel
        open={workbench.profileSessionOpen}
        onClose={() => workbench.setProfileSessionOpen(false)}
        context={workbench.localContext}
        profiles={workbench.profiles}
        sessions={workbench.sessions}
        profileName={workbench.profileName}
        onProfileNameChange={workbench.setProfileName}
        sessionName={workbench.sessionName}
        onSessionNameChange={workbench.setSessionName}
        onCreateProfile={workbench.createLocalProfile}
        onSaveProfile={workbench.saveLocalProfile}
        onLoadProfile={workbench.loadLocalProfile}
        onCreateSession={workbench.createLocalSession}
        onSaveSession={workbench.saveLocalSession}
        onLoadSession={workbench.loadLocalSession}
        onSeedDemoProject={workbench.seedDemoProject}
      />

      <AiSettingsPanel
        open={workbench.ai.settingsOpen}
        onClose={() => workbench.ai.setSettingsOpen(false)}
        settings={workbench.ai.settings}
        onSettingsChange={workbench.ai.setSettings}
        models={workbench.ai.models}
        modelsLoading={workbench.ai.modelsLoading}
        connected={workbench.ai.connected}
        checking={workbench.ai.checking}
        message={workbench.ai.message}
        error={workbench.ai.error}
        onSave={() => workbench.ai.saveSettings()}
        onProbe={() => workbench.ai.probe()}
        onConnectPreset={(presetId) => workbench.ai.connectPreset(presetId)}
        onCursorLogin={() => workbench.ai.loginCursor()}
        saving={workbench.ai.saving}
        probing={workbench.ai.probing}
        connecting={workbench.ai.connecting}
        cursorLoggingIn={workbench.ai.cursorLoggingIn}
      />

      <CommandPalette
        open={workbench.aiPaletteOpen}
        view={workbench.activeView}
        onClose={() => workbench.setAiPaletteOpen(false)}
        captureIds={workbench.selectedIds}
        captures={workbench.scopedTrafficCaptures}
        webSocketEventIds={selectedWebSocketIds}
        webSocketEvents={workbench.webSocketEvents}
        targets={workbench.targets}
        browserUrl={workbench.browserState.url || workbench.address}
        draft={workbench.draft}
        lastResponse={workbench.lastResponse}
        sslEvents={workbench.sslEvents}
        proxyRunning={workbench.proxyState.running}
        proxyUrl={workbench.proxyState.proxyUrl}
        caCertPath={workbench.proxyState.caCertPath}
        canRun={workbench.ai.canRun}
        onOpenSettings={() => workbench.ai.setSettingsOpen(true)}
        onApplyDraft={workbench.applyAiDraft}
        onPrepareNavigate={workbench.prepareAiNavigate}
        onNotice={workbench.setNotice}
      />

      <RequestContextMenu
        requestMenu={requestMenu}
        requestMenuCapture={requestMenuCapture}
        requestMenuOriginInScope={requestMenuOriginInScope}
        onClose={() => setRequestMenu(null)}
        onCopyExport={copyRequestExport}
        onCopyUrl={copyRequestUrl}
        onCloneToRepeater={cloneMenuRequest}
        onAddToScope={addMenuRequestToScope}
        onDelete={deleteMenuRequest}
      />
    </main>
  );
}
