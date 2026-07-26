import { Bot, Palette, Settings2, UserRound } from "lucide-react";
import { Button } from "../ui/button";
import { cn } from "../../lib";
import type { AppMode } from "../../types";
import { modeButtonClass } from "./layoutClasses";

export type ConsoleControlsProps = {
  appMode: AppMode;
  setAppMode: (mode: AppMode) => void;
  aiConnected: boolean;
  aiChecking: boolean;
  aiStatusLabel: string;
  onOpenAiSettings: () => void;
  onOpenProfileSessionPanel: () => void;
  onOpenAppearanceSettings: () => void;
};

/**
 * App-global controls: operating mode, AI connection, project and appearance.
 * These belong to the persistent rail rather than the workspace header, which
 * tracks the current target instead.
 */
export function ConsoleControls({
  appMode,
  setAppMode,
  aiConnected,
  aiChecking,
  aiStatusLabel,
  onOpenAiSettings,
  onOpenProfileSessionPanel,
  onOpenAppearanceSettings
}: ConsoleControlsProps) {
  return (
    <div className="grid gap-1.5" data-component="consoleControls">
      <span className="rd-eyebrow text-muted max-[1180px]:hidden">Console</span>

      <div
        className="grid grid-cols-2 overflow-hidden border border-rule bg-ink/35"
        data-testid="appModeToggle"
        data-component="appModeToggle"
      >
        <Button
          type="button"
          variant="ghost"
          className={cn(modeButtonClass(appMode === "manual-first"), "justify-center")}
          onClick={() => setAppMode("manual-first")}
          data-testid="manualFirstMode"
          data-component="appModeButton"
        >
          Manual
        </Button>
        <Button
          type="button"
          variant="ghost"
          className={cn(modeButtonClass(appMode === "ai-first"), "justify-center border-l")}
          onClick={() => setAppMode("ai-first")}
          data-testid="aiFirstMode"
          data-component="appModeButton"
        >
          AI-First
        </Button>
      </div>

      <Button
        type="button"
        variant="ghost"
        className={cn(
          "h-8 w-full justify-start gap-2 border px-2.5 rd-label transition",
          aiConnected
            ? "border-jade/40 bg-jade/10 text-jade hover:bg-jade/15"
            : aiChecking
              ? "border-sand/35 bg-sand/10 text-sand hover:bg-sand/15"
              : "border-rule bg-surface/60 text-muted hover:bg-signal/5 hover:text-bone"
        )}
        onClick={onOpenAiSettings}
        title="AI connection settings"
        data-testid="aiConnectionIndicator"
        data-component="aiConnectionIndicator"
      >
        <span
          className={cn(
            "h-1.5 w-1.5 shrink-0 rounded-full",
            aiConnected
              ? "bg-jade text-jade radar-status-live"
              : aiChecking
                ? "animate-pulse bg-sand"
                : "bg-muted"
          )}
        />
        <Bot size={11} strokeWidth={1.8} />
        <strong className="font-semibold tracking-data">ai {aiStatusLabel}</strong>
      </Button>

      <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-1.5">
        <Button
          type="button"
          variant="outline"
          size="compact"
          className="min-w-0 justify-start"
          onClick={onOpenProfileSessionPanel}
          title="Projects and sessions"
          data-testid="openProfileSessionPanel"
          data-component="openProfileSessionPanel"
        >
          <UserRound size={14} strokeWidth={1.7} />
          Projects
        </Button>
        <Button
          type="button"
          variant="outline"
          size="compact"
          className="w-[30px] px-0"
          onClick={onOpenAppearanceSettings}
          title="Appearance settings"
          aria-label="Appearance settings"
          data-testid="openAppearanceSettings"
          data-component="openAppearanceSettings"
        >
          <Palette size={14} strokeWidth={1.7} />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="compact"
          className="w-[30px] px-0"
          onClick={onOpenAiSettings}
          title="AI connection settings"
          aria-label="AI connection settings"
          data-testid="openAiSettings"
          data-component="openAiSettings"
        >
          <Settings2 size={14} strokeWidth={1.7} />
        </Button>
      </div>
    </div>
  );
}
