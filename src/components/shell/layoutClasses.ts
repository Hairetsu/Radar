import { cn } from "../../lib";

export const shellClass =
  "radar-shell relative grid h-full min-h-full cursor-default overflow-hidden [grid-template-columns:224px_minmax(0,1fr)] [grid-template-rows:minmax(0,1fr)_28px] max-[1180px]:min-h-0 max-[1180px]:[grid-template-columns:1fr] max-[1180px]:[grid-template-rows:auto_minmax(0,1fr)_28px]";

/**
 * Page-load reveal. The `radar-reveal` hook exists so reduced-motion can drop
 * the animation without leaving the element stuck at `opacity-0`.
 */
export const revealClass = "radar-reveal opacity-0 animate-[enter_720ms_cubic-bezier(0.2,0.74,0.19,1)_forwards]";

/** Mono data cells set tracking explicitly so they stay dense and scannable. */
export const monoMuted = "font-mono text-meta tracking-data text-muted";

export const ellipsisMono = cn(monoMuted, "min-w-0 overflow-hidden text-ellipsis whitespace-nowrap");

/**
 * Tab strips scroll rather than clip: the themes use different mono
 * faces, and Space Mono in particular is wide enough to overflow the pane.
 */
const tabScrollClass = "overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

/**
 * Full-bleed rows and tabs live inside overflow-hidden panes, so the global
 * focus outline has to sit inside the element instead of around it — otherwise
 * the pane clips its left and right edges away.
 */
const insetFocusClass = "focus-visible:[outline-offset:-2px]";

/** Strip holding tabs only. */
export const detailTabRowClass = cn("flex min-w-0 items-stretch border-b border-rule", tabScrollClass);

/** Strip holding tabs on the left and pinned actions on the right. */
export const detailTabSplitRowClass = "flex min-w-0 items-stretch border-b border-rule";

export const detailTabScrollClass = cn("flex min-w-0 flex-1 items-stretch", tabScrollClass);

export const detailTabClass = (active: boolean) =>
  cn(
    "inline-flex h-[38px] shrink-0 items-center gap-2 border-0 border-r border-rule bg-transparent px-2.5 font-mono text-label font-medium uppercase tracking-key text-muted transition",
    "hover:bg-signal/5 hover:text-bone",
    insetFocusClass,
    active && "-mb-px border-b border-signal bg-signal/10 text-signal"
  );

/**
 * Payload transforms sit with the field they rewrite rather than in one strip
 * above the whole request, so the target of each tool stays obvious.
 */
export const transformRowClass = "flex flex-wrap gap-1 px-5 pb-2";

export const transformToolClass = "h-7 px-2 text-micro text-muted hover:text-signal";

/** Icon-only evidence action pinned beside a tab strip. */
export const detailActionClass = cn(
  "inline-flex h-[38px] w-[38px] shrink-0 items-center justify-center border-0 border-l border-rule bg-transparent px-0 text-muted transition hover:bg-signal/5 hover:text-signal disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted",
  insetFocusClass
);

export const trafficRowClass = (selected: boolean, focused: boolean) =>
  cn(
    "radar-traffic-row relative grid h-[42px] w-full items-center gap-2 border-0 border-b border-rule bg-transparent px-3.5 py-2 text-left text-copy transition",
    "justify-stretch normal-case",
    "before:absolute before:bottom-0 before:left-0 before:top-0 before:w-0 before:bg-signal before:transition-all before:content-['']",
    "hover:bg-[var(--theme-row-hover)] hover:text-bone hover:before:w-[3px]",
    insetFocusClass,
    selected && "bg-[var(--theme-row-active)] text-bone before:w-[3px]",
    focused && "ring-1 ring-inset ring-signal/35"
  );

export const websocketRowClass = (selected: boolean, focused: boolean) =>
  cn(
    "relative grid h-[52px] w-full items-center gap-2 border-0 border-b border-rule bg-transparent px-3.5 py-2 text-left text-copy transition",
    "justify-stretch normal-case [grid-template-columns:88px_minmax(120px,0.9fr)_minmax(160px,1.4fr)_72px_72px]",
    "before:absolute before:bottom-0 before:left-0 before:top-0 before:w-0 before:bg-steel before:transition-all before:content-['']",
    "hover:bg-steel/5 hover:text-bone hover:before:w-[3px]",
    insetFocusClass,
    focused && "ring-1 ring-inset ring-steel/30",
    selected && "bg-steel/[0.08] text-bone before:w-[3px]"
  );

export const interceptRowClass = (selected: boolean) =>
  cn(
    "relative grid h-[58px] w-full items-center gap-2 border-0 border-b border-rule bg-transparent px-3.5 py-2 text-left text-copy transition",
    "justify-stretch normal-case [grid-template-columns:76px_minmax(120px,0.8fr)_minmax(180px,1.4fr)_92px]",
    "before:absolute before:bottom-0 before:left-0 before:top-0 before:w-0 before:bg-rust before:transition-all before:content-['']",
    "hover:bg-rust/5 hover:text-bone hover:before:w-[3px]",
    insetFocusClass,
    selected && "bg-rust/[0.08] text-bone before:w-[3px]"
  );

export const requestMenuActionClass = cn(
  "flex h-9 w-full items-center gap-2.5 border-0 bg-transparent px-3 text-left rd-label text-muted transition hover:bg-signal/10 hover:text-bone focus-visible:bg-signal/10 focus-visible:text-bone disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-transparent disabled:hover:text-muted [&_svg]:text-signal",
  insetFocusClass
);

export const requestMenuDangerClass =
  "hover:bg-rust/10 hover:text-rust focus-visible:bg-rust/10 focus-visible:text-rust [&_svg]:text-rust";

export const modeButtonClass = (active: boolean) =>
  cn(
    "h-8 border px-3 rd-label",
    active
      ? "border-signal/60 bg-signal/10 text-signal hover:bg-signal/15"
      : "border-rule bg-surface/60 text-muted hover:bg-signal/5 hover:text-bone"
  );

export const sidebarViewButtonClass = (active: boolean) =>
  cn(
    "group relative h-auto w-full justify-start gap-1.5 overflow-hidden border border-transparent bg-transparent px-1.5 py-0.5 text-left font-sans normal-case tracking-[0] text-copy",
    "before:absolute before:bottom-2 before:left-0 before:top-2 before:w-0 before:bg-signal before:transition-all before:duration-300 before:content-['']",
    "hover:border-signal/30 hover:bg-signal/[0.06] hover:text-bone hover:before:w-[3px] hover:[&_.nav-num]:text-signal",
    insetFocusClass,
    active &&
      "border-signal/45 bg-signal/[0.09] text-bone shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_14px_34px_-26px_color-mix(in_srgb,var(--color-signal)_70%,transparent)] before:w-[3px] [&_.nav-icon]:border-signal/50 [&_.nav-icon]:bg-signal/10 [&_.nav-icon]:text-signal [&_.nav-num]:text-signal"
  );
