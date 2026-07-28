import { Command, Loader2, Sparkles } from "lucide-react";
import { FieldLabel } from "../components/radar/primitives";
import { Button } from "../components/ui/button";
import { paletteMetaClass, palettePanelClass } from "./commandPalettePresentation";
import type { useCommandPaletteController } from "./useCommandPaletteController";

type CommandPaletteController = ReturnType<
  typeof useCommandPaletteController
>;

export function CommandPaletteRunPanel({
  canRun,
  onOpenSettings,
  targets,
  browserUrl,
  controller
}: {
  canRun: boolean;
  onOpenSettings: () => void;
  targets: string[];
  browserUrl: string;
  controller: CommandPaletteController;
}) {
  const {
    error,
    activeKey,
    actionPending,
    previewMutation,
    runMutation
  } = controller;
  return (
    <section className={palettePanelClass}>
      <FieldLabel className="px-0 pt-0">Run</FieldLabel>
      {!canRun && (
        <p className="border border-rust/30 bg-rust/5 px-3 py-2 font-mono text-micro uppercase leading-[1.6] tracking-label text-rust">
          AI is not connected.{" "}
          <button
            type="button"
            className="text-signal underline-offset-2 hover:underline"
            onClick={onOpenSettings}
            data-testid="aiOpenSettingsFromPalette"
            data-component="aiOpenSettingsFromPalette"
          >
            Open connection settings
          </button>
        </p>
      )}

      <div className={paletteMetaClass}>
        <span>Scope: {targets.length} origins</span>
        <span>Browser: {browserUrl || "—"}</span>
        <span>Skill: {activeKey}</span>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => previewMutation.run()}
          disabled={actionPending}
          data-testid="aiPreviewContext"
          data-component="aiPreviewContext"
        >
          {previewMutation.isPending ? (
            <Loader2
              size={14}
              className="animate-[spin_0.9s_linear_infinite]"
            />
          ) : (
            <Sparkles size={14} />
          )}
          Preview context
        </Button>
        <Button
          type="button"
          variant="solid"
          onClick={() => runMutation.run()}
          disabled={actionPending}
          data-testid="aiRunTask"
          data-component="aiRunTask"
        >
          {runMutation.isPending ? (
            <Loader2
              size={14}
              className="animate-[spin_0.9s_linear_infinite]"
            />
          ) : (
            <Command size={14} />
          )}
          Run task
        </Button>
      </div>

      {error && <p className="rd-label text-rust">{error}</p>}
    </section>
  );
}
