# Radar design system

Radar should look like the tool it is: a defensive workbench used to inspect dense, sometimes hostile evidence. The interface can have character, but the evidence wins every argument.

## Design rules

- Keep requests, responses, frames, replay results, findings, and audit records selectable and visually dominant.
- Use controlled density inside evidence panes and more space around major regions.
- Show Scope, capture, proxy, browser, AI authority, errors, and active work with text or icons as well as color.
- Keep Manual-First and AI-First on the same visual language and visible workspace state.
- Add texture, shadow, motion, or asymmetry only when the result remains legible under real data.
- Avoid generic dashboard cards, timid palettes, purple gradients on white, and interchangeable marketing layouts.

## Themes

Radar ships six complete themes:

| Theme | Type | Color |
| --- | --- | --- |
| Bureau | Antonio, Saira, JetBrains Mono | Signal orange on warm dark slate. |
| Vellum | Instrument Serif, Hanken Grotesk, DM Mono | Vermillion on sunlit paper. |
| Specter | Unbounded, Sora, Space Mono | Chartreuse and cyan over midnight plum. |
| Aperture | Unbounded, Hanken Grotesk, JetBrains Mono | Cobalt on cool architectural porcelain. |
| Verdigris | Instrument Serif, Saira, DM Mono | Burnished copper over bottle green. |
| Aegis | Antonio, Sora, Space Mono | Glacier blue and brass over command navy. |

`src/styles.css` owns semantic color variables for every theme and maps them into Tailwind's `@theme`. Components use semantic utilities such as `bg-surface`, `text-signal`, and `border-rule`. Do not hard-code a color that only works in one theme.

## Typography

Each theme has a display face, a body face, and a monospace face. Do not introduce Arial, Inter, Roboto, or a system stack into a normal Radar surface.

Use the shared text scale from `text-nano` through `text-mark` and the tracking scale from `tracking-data` through `tracking-banner`. Repeated console labels use `rd-eyebrow`, `rd-label`, `rd-label-sm`, or `rd-banner`.

Editable fields and evidence text start at 13px. Supporting labels stay at least 9px before desktop zoom. Monospace is for data, identifiers, code, timings, and telemetry. Body copy stays in the theme's reading face.

The exact packages, weights, and licenses are listed in [Font assets](FONT_ASSETS.md).

## Composition

The main workspace uses an asymmetric console frame:

- Grouped navigation and a compact Console block.
- Project, browser, and view controls above one active evidence pane.
- Dense grids inside the tool views.
- A full-width mission safety bar when AI-First needs workspace presence.
- A bottom ticker for live system counts.

The AI Operator uses a compact Mission Pulse, a newest-first Operation Stream, an adaptive command deck, Task History, and overlay inspectors. It should feel like an instrument beside the main workbench, not another copy of the workbench.

At narrow desktop widths, controls may become strips, drawers, or overlays. The active evidence and the action needed to continue must remain reachable.

## Surface and color

Each theme commits to one dominant field and one sharp signal color. Status colors keep the same meaning across themes and include text or an icon when the state matters.

Use borders, shadow, subtle grain, and layered transparency to separate operational zones. Do not put decoration over selectable evidence or reduce contrast to make a theme look quieter.

Text selection needs strong contrast in every theme. Warning, permission, and failure surfaces should be identifiable in grayscale.

## Motion

Motion explains arrival, focus, hierarchy, or state change. It does not reward every click.

Shared keyframes live in `src/styles.css`. Page-load reveals use the `radar-reveal` class through the shared helper. Existing high-signal patterns include the radar pulse, live-state pulse, staggered reveal, and burst-control fill.

Streaming views append new records without remounting or flashing old content. Avoid broad transitions on large evidence containers.

Under `prefers-reduced-motion`, remove travel, ambient loops, and decorative transforms. State changes still need an immediate visible result.

## Interaction and accessibility

- Keep the shared theme-aware `:focus-visible` outline.
- Text fields may use their documented border and glow focus state.
- Full-bleed rows and menu items inside clipped panes use the shared inset focus offset.
- Every critical action must be reachable by keyboard and pointer.
- Avoid scroll traps between the shell, view, evidence panes, and AI companion.
- Never encode Scope, permission, failure, or run state through animation or color alone.
- Use `lucide-react` when an icon already expresses the action.
- Keep control labels visible when an icon could be ambiguous.

The automated window, zoom, font, focus, and baseline rules live in [Regression testing](REGRESSION_TESTING.md). The human release record is [UI usability release review](UI_USABILITY_REVIEW.md).

## Implementation boundary

- Keep global tokens, font imports, selection, focus, reduced motion, scrollbars, and reusable keyframes in `src/styles.css`.
- Keep component layout and state styling in Tailwind utilities.
- Use `cn()` and the existing UI or Radar primitives before copying a utility string family.
- Keep shell composition under `src/components/shell/` and view content under `src/components/views/`.
- Add a focused structural, reachability, visual, or font test when a design change affects the operator contract.
- Refresh screenshots when the checked-in image no longer represents the default product state.

See [Code conventions](CODE_CONVENTIONS.md) for component and runtime ownership.
