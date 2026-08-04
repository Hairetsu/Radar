import { Bot, ExternalLink, Palette, Settings2, UserRound } from "lucide-react";
import { Button } from "../ui/button";
import { cn } from "../../lib";
import type { AppMode } from "../../types";

export type ConsoleControlsProps = {
  appMode: AppMode;
  aiOperatorVisible: boolean;
  aiConnected: boolean;
  aiChecking: boolean;
  aiStatusLabel: string;
  onOpenAiSettings: () => void;
  onOpenProfileSessionPanel: () => void;
  onOpenAppearanceSettings: () => void;
  onOpenAiOperator: () => void;
};

/**
 * App-global controls: operating mode, AI connection, project and appearance.
 * These belong to the persistent rail rather than the workspace header, which
 * tracks the current target instead.
 */
export function ConsoleControls({
  appMode,
  aiOperatorVisible,
  aiConnected,
  aiChecking,
  aiStatusLabel,
  onOpenAiSettings,
  onOpenProfileSessionPanel,
  onOpenAppearanceSettings,
  onOpenAiOperator
}: ConsoleControlsProps) {
  return (
    <div className="grid gap-1.5" data-component="consoleControls">
      <span className="rd-eyebrow text-muted max-[1180px]:hidden">Console</span>

      <Button
        type="button"
        variant={appMode === "ai-first" ? "solid" : "outline"}
        className="h-8 w-full min-w-0 justify-between gap-2 px-2 text-label tracking-key"
        onClick={onOpenAiOperator}
        data-testid="openAiOperatorSidebar"
        data-component="openAiOperator"
      >
        <span className="flex min-w-0 items-center gap-1.5">
          <Bot size={12} strokeWidth={1.8} />
          <span className="truncate">{appMode === "ai-first" ? "AI-First" : "AI Operator"}</span>
        </span>
        <span className="flex shrink-0 items-center gap-1 font-mono text-nano tracking-data">
          <span className={cn("h-1.5 w-1.5 rounded-full", aiOperatorVisible ? "bg-jade" : "bg-current opacity-60")} />
          {aiOperatorVisible ? "open" : "launch"}
          <ExternalLink size={10} />
        </span>
      </Button>

      <Button
        type="button"
        variant="ghost"
        className={cn(
          "h-8 w-full justify-start gap-2 border px-2.5 text-label transition",
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
          className="min-w-0 justify-start text-label"
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
          className="w-8 px-0"
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
          className="w-8 px-0"
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
