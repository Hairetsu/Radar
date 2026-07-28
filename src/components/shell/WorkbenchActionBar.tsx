import type { Dispatch, SetStateAction } from "react";
import { Bot, FileText, Search } from "lucide-react";
import type { RadarWorkbench } from "../../hooks/useRadarWorkbench";
import type { FindingTemplateId } from "../../types";
import { AdvancedViewActions } from "../views/AdvancedViewActions";
import { AutomateViewActions } from "../views/AutomateViewActions";
import { FindingsViewActions } from "../views/FindingsViewActions";
import { InterceptViewActions } from "../views/InterceptViewActions";
import { PluginsViewActions } from "../views/PluginsViewActions";
import { RepeaterViewActions } from "../views/RepeaterViewActions";
import { ScopeViewActions } from "../views/ScopeViewActions";
import { TrafficViewActions } from "../views/TrafficViewActions";
import { WebSocketViewActions } from "../views/WebSocketViewActions";
import { WorkflowsViewActions } from "../views/WorkflowsViewActions";
import { Button } from "../ui/button";
import { PanelHeader } from "./PanelHeader";

interface WorkbenchActionBarProps {
  workbench: RadarWorkbench;
  findingTemplateId: FindingTemplateId;
  setFindingTemplateId: Dispatch<SetStateAction<FindingTemplateId>>;
  identityLabOpen: boolean;
  setIdentityLabOpen: Dispatch<SetStateAction<boolean>>;
  onClearWebSocketSelection: () => void;
  onBuildFindingReport: () => void;
  onSaveWorkflow: () => void;
  onRunWorkflow: () => void;
}

export function WorkbenchActionBar({
  workbench,
  findingTemplateId,
  setFindingTemplateId,
  identityLabOpen,
  setIdentityLabOpen,
  onClearWebSocketSelection,
  onBuildFindingReport,
  onSaveWorkflow,
  onRunWorkflow
}: WorkbenchActionBarProps) {
  return (
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
            onClearSelection={onClearWebSocketSelection}
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
          <RepeaterViewActions addTarget={workbench.addTarget} draft={workbench.draft} />
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
            onBuildReport={onBuildFindingReport}
          />
        )}
        {workbench.activeView === "workflows" && (
          <WorkflowsViewActions
            selectedWorkflow={workbench.selectedWorkflow}
            onSaveWorkflow={onSaveWorkflow}
            onRunWorkflow={onRunWorkflow}
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
  );
}
