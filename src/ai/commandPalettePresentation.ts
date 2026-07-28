import { cn } from "../lib/utils";

export const taskButtonClass = (active: boolean) =>
  cn(
    "grid h-auto w-full content-center justify-start justify-items-start gap-1 border border-rule radar-card px-3 py-2 text-left rd-label text-muted transition-colors",
    "hover:border-signal/45 hover:bg-signal/[0.08]",
    active && "border-signal/45 bg-signal/[0.1]"
  );

export const palettePanelClass = "grid gap-3";

export const paletteMetaClass =
  "flex flex-wrap gap-3 rd-eyebrow text-dim";

export const capturePickerRowClass = (checked: boolean) =>
  cn(
    "grid w-full cursor-pointer items-center gap-2 border-0 border-b border-rule/70 bg-transparent px-2 py-2 text-left rd-label text-muted transition last:border-b-0",
    "[grid-template-columns:auto_64px_minmax(0,1fr)]",
    "hover:bg-signal/[0.06] hover:text-bone",
    checked && "bg-signal/[0.08] text-bone"
  );

export const packetPickerRowClass = (checked: boolean) =>
  cn(
    "grid w-full cursor-pointer items-center gap-2 border-0 border-b border-rule/70 bg-transparent px-2 py-2 text-left rd-label text-muted transition last:border-b-0",
    "[grid-template-columns:auto_78px_minmax(0,1fr)]",
    "hover:bg-steel/[0.07] hover:text-bone",
    checked && "bg-steel/[0.09] text-bone"
  );
