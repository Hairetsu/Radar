import type { ComponentProps, FormEvent } from "react";
import { AiSettingsPanel } from "../../ai/AiSettingsPanel";
import { CommandPalette } from "../../ai/CommandPalette";
import type { RadarWorkbench } from "../../hooks/useRadarWorkbench";
import type { GlobalSearchResult } from "../../types";
import { AppearanceSettingsPanel } from "../AppearanceSettingsPanel";
import { NewSessionDialog } from "../NewSessionDialog";
import { ProfileSessionPanel } from "../ProfileSessionPanel";
import { GlobalSearchOverlay } from "./GlobalSearchOverlay";
import { ProjectArtifactsOverlay } from "./ProjectArtifactsOverlay";
import { RequestContextMenu } from "./RequestContextMenu";

interface WorkbenchOverlaysProps {
  workbench: RadarWorkbench;
  selectedWebSocketIds: string[];
  onOpenGlobalSearchResult: (result: GlobalSearchResult) => void;
  requestContextMenuProps: ComponentProps<typeof RequestContextMenu>;
}

export function WorkbenchOverlays({
  workbench,
  selectedWebSocketIds,
  onOpenGlobalSearchResult,
  requestContextMenuProps
}: WorkbenchOverlaysProps) {
  const submitProjectNote = (event: FormEvent) => {
    event.preventDefault();
    void workbench.saveProjectNote();
  };

  const submitSavedView = (event: FormEvent) => {
    event.preventDefault();
    void workbench.saveCurrentView();
  };

  return (
    <>
      {workbench.globalSearchOpen && (
        <GlobalSearchOverlay
          workbench={workbench}
          onOpenResult={onOpenGlobalSearchResult}
        />
      )}

      {workbench.projectArtifactsOpen && (
        <ProjectArtifactsOverlay
          workbench={workbench}
          submitProjectNote={submitProjectNote}
          submitSavedView={submitSavedView}
        />
      )}

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

      <RequestContextMenu {...requestContextMenuProps} />
    </>
  );
}
