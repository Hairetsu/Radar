import { Palette, X } from "lucide-react";
import { useEffect } from "react";
import { Button } from "./ui/button";
import { THEME_OPTIONS, themeOption, type ThemeId } from "../lib/theme";
import { cn } from "../lib/utils";
import { revealClass } from "./shell/layoutClasses";
import { useRestoreFocus } from "../hooks/useRestoreFocus";

type AppearanceSettingsPanelProps = {
  open: boolean;
  onClose: () => void;
  themeId: ThemeId;
  onThemeChange: (themeId: ThemeId) => void;
};

export function AppearanceSettingsPanel({ open, onClose, themeId, onThemeChange }: AppearanceSettingsPanelProps) {
  useRestoreFocus(open);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, open]);

  if (!open) {
    return null;
  }

  const active = themeOption(themeId);

  return (
    <div
      className="theme-modal-backdrop fixed inset-0 z-40 flex items-start justify-center px-4 py-10 backdrop-blur-md"
      onClick={onClose}
      data-testid="appearanceSettingsBackdrop"
      data-component="appearanceSettingsBackdrop"
    >
      <div
        className="theme-modal-surface grid max-h-[calc(100vh-5rem)] w-full max-w-5xl gap-5 overflow-y-auto border border-rule p-5 font-mono shadow-bureau"
        onClick={(event) => event.stopPropagation()}
        data-testid="appearanceSettingsPanel"
        data-component="appearanceSettingsPanel"
      >
        <header className="flex items-start justify-between gap-4 border-b border-rule pb-4">
          <div>
            <span className="mb-1.5 inline-flex items-center gap-2 font-mono text-label font-semibold uppercase tracking-banner text-signal">
              <Palette size={12} strokeWidth={1.8} /> Surface
            </span>
            <h3 className="font-display text-hero uppercase tracking-key text-bone">Appearance</h3>
            <p className="mt-1 text-label uppercase tracking-eyebrow text-muted">
              Active · {active.label} — {active.mood}
            </p>
          </div>
          <Button type="button" variant="icon" size="icon" onClick={onClose} aria-label="Close appearance settings">
            <X size={15} strokeWidth={1.8} />
          </Button>
        </header>

        <div className="grid gap-3 sm:grid-cols-2" data-testid="themeOptions" data-component="themeOptions">
          {THEME_OPTIONS.map((option, index) => {
            const selected = option.id === themeId;
            return (
              <button
                key={option.id}
                type="button"
                className={cn(
                  "theme-card group relative grid min-h-40 w-full content-between gap-3 overflow-hidden border p-4 text-left transition duration-300",
                  revealClass,
                  selected
                    ? "border-signal bg-signal/[0.08] shadow-[0_0_0_1px_color-mix(in_srgb,var(--color-signal)_35%,transparent)]"
                    : "border-rule bg-surface/40 hover:border-signal/40 hover:bg-signal/[0.04]"
                )}
                style={{ animationDelay: `${120 + index * 90}ms` }}
                onClick={() => onThemeChange(option.id)}
                data-testid={`themeOption-${option.id}`}
                data-component={`themeOption-${option.id}`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <strong className="block font-display text-head uppercase tracking-data text-bone [font-stretch:75%]">
                      {option.label}
                    </strong>
                    <span className="mt-1 block text-label uppercase tracking-eyebrow text-signal">{option.mood}</span>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    {selected && <span className="rd-banner text-signal">Active</span>}
                    <div className="flex gap-1.5">
                      {option.swatch.map((color) => (
                        <span
                          key={color}
                          className="h-8 w-5 border border-rule/80 shadow-[inset_0_1px_0_color-mix(in_srgb,var(--color-bone)_15%,transparent)]"
                          style={{ background: color }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
                <p className="max-w-xl text-meta leading-[1.7] tracking-data text-muted">{option.description}</p>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
