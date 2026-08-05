# Radar Design System

Radar should feel like a purpose-built defensive security workbench: dense, legible, alert, and unmistakably operator-facing. Visual decisions should improve evidence review and control clarity before they add decoration.

## Design Principles

- **Evidence first:** request, response, frame, replay, and finding content must remain readable, selectable, and visually dominant over surrounding chrome.
- **Controlled density:** compact navigation and data-rich panels are appropriate, but hierarchy, spacing, and contrast must keep the interface scannable.
- **Visible state:** scope, capture, proxy, browser, AI mode, permissions, and active operations should never depend on hidden state or color alone.
- **Specific character:** Radar is not a generic SaaS dashboard. Typography, telemetry, borders, texture, and motion should reinforce the defensive workbench context.
- **Shared manual and AI surfaces:** AI-First operates the same visible workspace, evidence model, controls, and status language used in Manual-First.

## Themes

Radar ships three deliberately different themes:

- **Bureau:** Antonio, Saira, and JetBrains Mono with signal orange on warm dark slate.
- **Vellum:** Instrument Serif, Hanken Grotesk, and DM Mono with vermillion ink on sunlit paper.
- **Specter:** Unbounded, Sora, and Space Mono with chartreuse acid over midnight plum.

Theme tokens live in `src/styles.css` as CSS variables and feed Tailwind's `@theme`. Components should use the semantic tokens instead of hard-coded theme colors so all three themes preserve the same information hierarchy.

## Typography

Each theme pairs a characterful display face with a refined body face and a dedicated monospace face. Avoid introducing generic UI stacks such as Arial, Inter, Roboto, or system defaults.

Radar's shared type and tracking scale runs from `text-nano` through `text-mark` and from `tracking-data` through `tracking-banner`. Use `rd-eyebrow`, `rd-label`, and `rd-banner` for recurring chrome roles instead of recreating letter spacing ad hoc.

Editable fields and evidence text start at 13px. Dense supporting labels must remain at least 9px before desktop zoom. Monospace is for data, identifiers, code, timing, and telemetry—not every sentence in the application.

## Composition

The workspace uses asymmetric, console-like composition:

- grouped navigation with a compact app-global Console block;
- a classification banner and project/browser controls above the active evidence surface;
- dense grids and restrained display numerals inside tools;
- a full-width AI mission safety bar that does not steal workspace width;
<<<<<<< Updated upstream
- a separate full-window AI Operator with a pinned Thoughtstream, newest-first event feed, fixed composer, and overlay drawers;
=======
- a separate full-window AI Operator with a pinned Thoughtstream, newest-first event feed, adaptive bottom command deck, and overlay drawers;
>>>>>>> Stashed changes
- a bottom telemetry ticker for live system counts.

Prefer useful negative space around major regions and controlled density inside evidence regions. Decorative layers may add atmosphere, but must not obscure selection, truncate critical state, or reduce contrast.

## Color And Surface

Commit to each theme's dominant field and sharp signal color. Status colors must preserve meaning across themes and include text or icon support when state matters.

Use borders, shadows, subtle texture, and layered transparency to separate operational zones. Avoid generic purple-on-white gradients, interchangeable card grids, and effects that compete with captured evidence.

## Motion

Shared keyframes belong in `src/styles.css`; component-specific state transitions should primarily use Tailwind utilities. Motion should explain arrival, focus, hierarchy, or state change.

Current patterns include staggered page-load reveal, the dual-ring radar pulse, live-status pulses, and the burst-control signal fill. Streaming feeds append and introduce new entries without remounting or flashing the existing surface.

Respect `prefers-reduced-motion`: remove travel, ambient loops, and nonessential transforms while keeping state changes immediately legible. Avoid applying broad transitions to large evidence containers because frequent data updates can produce distracting full-panel flashes.

## Interaction And Accessibility

- Use the theme-aware `:focus-visible` outline for controls and rows.
- Text fields combine the shared focus outline with a restrained border shift and glow.
- Text selection must remain high contrast in every theme.
- Keyboard reachability, scroll reachability, desktop zoom, and minimum text sizes are release contracts.
- Use `lucide-react` icons for recognizable actions and status markers when an appropriate icon exists.
- Never encode permission, failure, scope, or run state through animation or color alone.

The automated visual and human-usability requirements are documented in [UI, Typography, and Human-Usability Regression Specification](UI_VISUAL_REGRESSION_SPEC.md), [Font Assets](FONT_ASSETS.md), and [UI Usability Release Review](UI_USABILITY_REVIEW.md).

## Implementation Boundaries

- Keep global tokens, font faces, selection rules, accessibility media queries, and reusable keyframes in `src/styles.css`.
- Style components primarily with Tailwind utilities and existing primitives in `src/components/ui/` and `src/components/radar/`.
- Keep shell composition in `src/components/shell/`; do not duplicate app chrome inside views.
- Keep renderer presentation separate from Electron main-process behavior and shared contracts.
- Add or update focused visual, reachability, or structural tests when a design change affects operator interaction.

For engineering patterns and repository ownership boundaries, see [Code Conventions](CODE_CONVENTIONS.md). For the complete operator workflow, see the [User Guide](USER_GUIDE.md).
