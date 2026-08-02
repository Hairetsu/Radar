import { Command, X } from "lucide-react";
import { Button } from "../components/ui/button";
import { VIEW_AI_LABELS } from "./types";
import { CommandPaletteOutput } from "./CommandPaletteOutput";
import { CommandPaletteRunPanel } from "./CommandPaletteRunPanel";
import { CommandPaletteSkillsPanel } from "./CommandPaletteSkillsPanel";
import {
  useCommandPaletteController,
  type CommandPaletteControllerInput
} from "./useCommandPaletteController";
import { useRestoreFocus } from "../hooks/useRestoreFocus";

export function CommandPalette({
  open,
  view,
  onClose,
  captureIds,
  captures,
  webSocketEventIds,
  webSocketEvents,
  targets,
  browserUrl,
  draft,
  lastResponse,
  sslEvents,
  proxyRunning,
  proxyUrl,
  caCertPath,
  canRun,
  onOpenSettings,
  onApplyDraft,
  onPrepareNavigate,
  onNotice
}: CommandPaletteControllerInput) {
  useRestoreFocus(open);

  const controller = useCommandPaletteController({
    open,
    view,
    onClose,
    captureIds,
    captures,
    webSocketEventIds,
    webSocketEvents,
    targets,
    browserUrl,
    draft,
    lastResponse,
    sslEvents,
    proxyRunning,
    proxyUrl,
    caCertPath,
    canRun,
    onOpenSettings,
    onApplyDraft,
    onPrepareNavigate,
    onNotice
  });
  const { contextLabel } = controller;

  if (!open) {
    return null;
  }

  return (
    <div
      className="theme-modal-backdrop fixed inset-0 z-40 flex items-start justify-center px-4 py-10 backdrop-blur-md"
      onClick={onClose}
      data-testid="commandPaletteBackdrop"
      data-component="commandPaletteBackdrop"
    >
      <div
        className="theme-modal-surface grid max-h-[calc(100vh-5rem)] w-full max-w-5xl gap-4 overflow-auto border border-rule p-5 font-mono shadow-bureau"
        onClick={(event) => event.stopPropagation()}
        data-testid="commandPalette"
        data-component="commandPalette"
      >
        <header className="flex items-start justify-between gap-4 border-b border-rule pb-4">
          <div>
            <span className="mb-1.5 inline-flex items-center gap-2 font-mono text-label font-semibold uppercase tracking-banner text-signal">
              <Command size={12} strokeWidth={1.8} /> AI Channel · {VIEW_AI_LABELS[view]}
            </span>
            <h3 className="font-display text-hero uppercase tracking-key text-bone">Command Palette</h3>
            <p className="mt-1 text-label uppercase tracking-eyebrow text-muted">{contextLabel}</p>
          </div>
          <Button
            type="button"
            variant="icon"
            size="icon"
            onClick={onClose}
            title="Close"
            data-testid="commandPaletteClose"
            data-component="commandPaletteClose"
          >
            <X size={16} strokeWidth={1.8} />
          </Button>
        </header>

        <div className="grid gap-4 [grid-template-columns:minmax(0,1.1fr)_minmax(0,0.9fr)]">
          <CommandPaletteSkillsPanel
            view={view}
            captures={captures}
            webSocketEvents={webSocketEvents}
            controller={controller}
          />
          <CommandPaletteRunPanel
            canRun={canRun}
            onOpenSettings={onOpenSettings}
            targets={targets}
            browserUrl={browserUrl}
            controller={controller}
          />
        </div>

        <CommandPaletteOutput controller={controller} />
      </div>
    </div>
  );
}
