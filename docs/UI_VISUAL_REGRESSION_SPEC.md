# UI, Typography, And Human-Usability Regression Specification

Status: automation complete; 202 Linux baselines are approved on `ubuntu-24.04-arm`; the human review record remains a release gate  
Date: 2026-08-01  
Runner: Playwright Electron using the existing isolated Radar regression harness  
Related contracts: `REGRESSION_SUITE_SPEC.md`, `REGRESSION_TESTING.md`, `MANUAL_QA_CHECKLIST.md`, and the Design section of `README.md`

## Purpose

This specification extends Radar's workflow regression system so a release can answer five additional questions:

1. Is every primary operator workflow usable at the minimum supported window size?
2. Are text, evidence, warnings, and controls legible with the intended theme fonts rather than silent fallbacks?
3. Do the three themes remain visually coherent and readable at common desktop sizes and zoom levels?
4. Can a keyboard or pointer user reach every critical control without clipping, overlap, or hidden scroll traps?
5. Did a UI change alter hierarchy, density, typography, or evidence readability in a way that needs human review?

This suite is not a generic screenshot farm. Structural and semantic assertions are the primary gate. Pixel comparisons provide change detection, and a short release-review protocol covers qualities that automation cannot judge reliably.

## Pre-Implementation Baseline And Gaps

Radar already has a strong foundation:

- every regression case launches the production Electron renderer, preload, main process, and isolated SQLite state;
- the demo provides deterministic dense data for all twelve views;
- failures retain screenshots, video, traces, and error context;
- `REG-APP-004` traverses every view;
- `REG-APP-005` switches all three themes;
- `REG-APP-006`, `REG-APP-007`, and `REG-APP-009` cover overlays, AI-First layout, Escape, and focus;
- the production window declares `minWidth: 1120`, `minHeight: 760`, and defaults to `1480 × 940`;
- the documentation screenshot runner captures a fixed `1480 × 940` fixture surface.

Before this work, the missing contracts were:

- no supported-window or zoom matrix;
- no `toHaveScreenshot` baselines;
- no explicit font-load or fallback detection;
- no automatic horizontal-overflow, clipping, overlap, target-size, or scroll-reachability audit;
- no adversarial long-content fixture;
- no theme token contrast gate;
- no UI-specific release blockers or review report;
- no cross-platform font-rendering smoke run.

The existing `pnpm screenshots` command remains documentation-only. It uses `screenshotPreload.ts` and should not become the regression oracle because it does not exercise the real preload, SQLite store, or Electron operations.

## Supported UI Contract

Radar is a desktop workbench. Phone and tablet layouts are not a supported target for this suite.

### Window profiles

| Profile | BrowserWindow outer size | Zoom | Required cadence | Purpose |
| --- | ---: | ---: | --- | --- |
| `minimum` | 1120 × 760 | 100% | Every pull request | Exact supported minimum; all critical controls must remain reachable. |
| `laptop` | 1366 × 768 | 100% | Every pull request | Common constrained desktop with little vertical room. |
| `default` | 1480 × 940 | 100% | Every pull request | Product default and primary visual baseline. |
| `wide` | 1920 × 1080 | 100% | Every pull request for anchors; nightly for all views | Tests intentional density and excessive stretching. |
| `large` | 2560 × 1440 | 100% | Nightly/release | Ensures readable max widths and stable panel hierarchy. |
| `zoom-90` | 1480 × 940 | 90% | Every pull request | Common slight zoom-out; catches subtle density, alignment, and font-clarity regressions. |
| `zoom-80` | 1480 × 940 | 80% | Every pull request for critical workflows | Strong zoom-out boundary; primary actions, warnings, and evidence must remain visually clear. |
| `zoom-75` | 1920 × 1080 | 75% | Nightly advisory until declared blocking | Extreme density check for hierarchy loss, tiny text, and uncontrolled panel expansion. |
| `zoom-125` | 1480 × 940 | 125% | Every pull request | Normal desktop text enlargement. |
| `zoom-150` | 1920 × 1080 | 150% | Every pull request for critical workflows | High text enlargement without pretending Radar is a mobile app. |
| `zoom-200` | 2560 × 1440 | 200% | Nightly advisory until declared blocking | Identifies severe reflow and reachability problems early. |

Supported-window checks must resize the actual Electron `BrowserWindow`, not only emulate a browser viewport. The helper must wait for both Electron's resize event and stable `window.innerWidth`/`window.innerHeight`, then attach the actual inner and outer dimensions to the test result. Platform title-bar differences are expected.

Pixel baselines are platform-specific. Linux CI on the pinned `ubuntu-24.04-arm` runner is the required visual-diff platform; macOS and Windows perform structural/font smoke runs nightly and may maintain separate approved baselines later.

### Theme and font roles

| Theme | Display role | Sans/body role | Mono/evidence role |
| --- | --- | --- | --- |
| Bureau | Antonio | Saira | JetBrains Mono |
| Vellum | Instrument Serif | Hanken Grotesk | DM Mono |
| Specter | Unbounded | Sora | Space Mono |

Every required role must be present as a loaded `FontFace`, used by a representative element, and available without an internet connection.

### Type-size usability rules

Radar intentionally uses a dense scale. The automated contract should preserve that density without allowing critical information to become unreadable:

- form fields, editable evidence, normal evidence, and primary control labels: at least 13 CSS pixels at 100% zoom;
- supporting labels and metadata: at least 11 CSS pixels;
- compact selectors and dense metadata: at least 12 CSS pixels;
- 9- and 10-pixel `nano`/`micro` text may only be supplementary telemetry, decorative labels, or repeated metadata;
- a warning, error, scope decision, permission decision, evidence value, primary action, or sole accessible label must never rely only on text below 10 CSS pixels;
- multiline body/evidence text must have a computed line-height of at least 1.35 times its font size;
- headings and single-line labels may use tighter line-height when glyphs are not clipped;
- no essential meaning may depend only on uppercase styling, color, or a specialized font being available.
- shared text fields and selectors must use the full width assigned by their grid or flex layout; intrinsic control width must not overlap neighbouring fields.

These are role rules rather than a blanket ban on Radar's dense `text-nano` and `text-micro` tokens.

For zoom-out profiles, record both the computed CSS font size and effective rendered size (`fontSize × zoomFactor`). At 80%:

- evidence values, editable text, and primary action labels must remain at least 9.5 effective pixels;
- scope, capability, permission, destructive-action, warning, and error text must remain at least 10 effective pixels;
- supplementary telemetry may be smaller only when the same meaning is available through a clearer adjacent label or detail;
- a passing geometry check does not override an unreadable visual result.

The 90% and 80% snapshots are specifically reviewed for hierarchy and legibility. Zooming out must not make secondary chrome visually louder than primary evidence or collapse distinct controls into an ambiguous cluster.

### Control and focus rules

- normal pointer targets: at least 32 × 28 CSS pixels;
- icon-only actions: at least 32 × 32 CSS pixels unless they are repeated row affordances with an adjacent larger row target;
- primary toolbar/form controls should retain the existing 38-pixel control height;
- every interactive element has a non-empty accessible name;
- keyboard focus is visibly distinct in all themes;
- focus never lands on a hidden, fully clipped, inert, or covered element;
- opening and closing an overlay returns focus to its trigger;
- Escape closes the topmost dismissible surface only;
- no critical action is pointer-only.

### Contrast and selection rules

Resolve actual theme colors and require:

- normal text contrast of at least 4.5:1;
- large display text contrast of at least 3:1;
- focus indicators, borders that communicate state, and active controls at least 3:1 against adjacent colors;
- selected request/response evidence remains at least 4.5:1 in all themes;
- disabled state remains identifiable without making explanatory text illegible.

Token-pair checks are deterministic. Gradients, translucency, selected rows, and evidence panes also require visual review because a CSS-token calculation cannot fully represent the rendered background.

## Phase 0: Deterministic Font Assets

This phase is required before font or pixel regressions can block a release.

Radar previously imported fonts from `fonts.googleapis.com` in `src/styles.css`. That created three failure modes:

1. offline regression runs silently render fallbacks;
2. Google CSS or font binaries can change independently of Radar;
3. network timing can capture a fallback frame before fonts settle.

Implemented requirements:

- pin the exact Fontsource packages in `package.json` and `pnpm-lock.yaml`, with Vite emitting their WOFF2 files into the production asset directory;
- replace the external Google import with dependency-managed local font CSS;
- retain the current characterful theme pairings and document font licenses/source versions;
- include only weights and styles actually used by Radar;
- make production and regression builds load identical font files;
- fail UI tests if any font, stylesheet, or image request targets a non-loopback external origin;
- wait for `document.fonts.ready` before layout measurements or screenshots;
- enumerate `document.fonts`, asserting the expected family faces have `status === "loaded"`;
- verify representative `.font-display`, body/sans, and `.font-mono` elements resolve to the expected first family for each theme;
- attach a `font-audit.json` containing family, style, weight, source URL, load status, and representative computed style.

The test must not pass merely because `getComputedStyle(...).fontFamily` contains the requested name; that property can name a font that failed to load.

## Test Data States

Every layout test uses one of four named states:

| State | Contents | Purpose |
| --- | --- | --- |
| `empty` | Clean local project/session | Empty-state copy, onboarding controls, and minimum-height behavior. |
| `demo` | Existing seeded walkthrough | Stable representative content across all views. |
| `dense` | Demo plus bounded repeated captures, frames, findings, results, and timeline entries | Scroll containers, sticky headers, row density, and long lists. |
| `stress-copy` | Long but valid names, URLs, headers, errors, labels, evidence IDs, and wrapped bodies | Truncation, wrapping, tooltips/titles, and control reachability. |

`stress-copy` should include:

- 80-character project and session names;
- a long in-scope URL with many query parameters;
- long header names and values;
- a 240-character finding title and affected asset;
- a long workflow and plugin name;
- a multiline error and policy-block message;
- long AI goal, mission node, capability reason, and evidence reference;
- enough content to force vertical scrolling in each dense panel;
- Unicode samples with accented Latin characters, CJK, and emoji so fallback glyph behavior is visible.

The stress state must remain local and deterministic. It is not localization coverage and does not change product language.

## Automation Architecture

### Implemented files

```text
tests/regression/
  ui-fonts.spec.ts
  ui-layout.spec.ts
  ui-visual.spec.ts
  ui-keyboard.spec.ts
  ui-stress-copy.spec.ts
  ui/
    fontAudit.ts
    layoutAudit.ts
    visualStability.ts
    windowProfiles.ts
    uiStates.ts
```

Use the existing `fixtures.ts`, production build, isolated Electron application, demo loader, and reporting paths.

### Window helper

Add a typed helper that:

1. finds the `BrowserWindow` owning the Playwright page;
2. resets zoom to 100%;
3. calls `setSize(width, height)` with the named outer-window profile;
4. applies `webContents.setZoomFactor(zoom)` when requested;
5. waits for two stable animation frames after the final resize event;
6. returns outer bounds, content bounds, `devicePixelRatio`, zoom factor, and renderer viewport;
7. restores the default profile during cleanup.

Do not encode title-bar offsets or assume outer size equals CSS viewport size.

### Font readiness helper

Before measuring or capturing:

1. wait for the shell and requested data state;
2. wait for `document.fonts.ready`;
3. call `document.fonts.load` for each required family/style/weight sample;
4. confirm matching loaded `FontFace` entries exist;
5. wait until representative text boxes remain unchanged for two animation frames;
6. fail on any external resource request.

### Layout audit helper

For each view/profile/theme combination, collect and attach `layout-metrics.json` with:

- document and renderer viewport dimensions;
- global `scrollWidth`, `clientWidth`, `scrollHeight`, and `clientHeight`;
- visible interactive-element rectangles and accessible names;
- critical heading/action rectangles;
- scrollable ancestor and scroll range for each required control;
- computed font family, size, weight, line-height, overflow, and text-overflow;
- computed and effective font size at the active zoom factor;
- active theme and zoom;
- detected clipping, overlap, target-size, offscreen-focus, and unlabelled-control violations.

Required assertions:

- `document.documentElement.scrollWidth <= clientWidth + 1`;
- shell, sidebar, workspace header, action bar, evidence pane, and telemetry bar have non-zero visible rectangles;
- every view's required control manifest can be scrolled into view and clicked or focused;
- fixed overlays remain within the viewport and expose an internal scroll container when their content exceeds available height;
- no primary button or heading uses unintended ellipsis;
- text declared as wrapping has no horizontal clipping;
- text declared as truncating stays on one line and exposes its full value through an accessible name, `title`, or adjacent detail;
- horizontally scrollable evidence/table regions scroll internally rather than widening the document;
- no two unrelated critical controls overlap by more than one CSS pixel;
- visible enabled controls meet target-size and accessible-name rules;
- page focus is visible and intersects the viewport after every Tab step.

Where generic detection is ambiguous, add narrow contracts such as `data-overflow-contract="wrap|truncate|scroll"` or `data-layout-critical`. Do not annotate every element or create test-only production layout behavior.

### Required-control manifest

The suite encodes this manifest as data rather than repeating selectors across tests. A dynamic row selector may satisfy a requirement after the corresponding data state is loaded.

| Surface | Controls/content that must be visible or scroll-reachable |
| --- | --- |
| Persistent shell | `viewSwitch`, `sessionSelector`, `browserAddress`, `openBrowser`, `openGlobalSearch`, `openProjectArtifacts`, `openAiPalette`, `openProfileSessionPanel`, `openAppearanceSettings`, `openAiSettings` |
| HTTP/S | `trafficSearch`, method/type/sort controls, at least one `trafficRow-*`, `trafficDetailText`, request/response tabs, `cloneToRepeater`, annotation controls |
| WebSocket | direction/search controls, at least one `webSocketRow-*`, `webSocketDetailText`, annotation, copy, replay, and finding actions |
| Intercept | `interceptQueue`, rule editors, save controls, draft fields, `forwardIntercept`, `dropIntercept`, and reset action |
| Repeater | tab controls, method/URL/headers/body, environment, `transmitReplay`, burst controls, response/history/diff region, WebSocket replay |
| Automate | marker fields/actions, payload set/text, limits, wordlist, rule editor, session controls, `automateResults`, and result detail |
| Findings | `findingsList`, filters, template/editor fields, evidence, save/delete, merge/retest, report options, warnings, and report preview |
| Workflows | `workflowCatalog`, definition, templates, graph, dry run, revisions, run history, results, validate/save/run/delete actions |
| Plugins | install path/preview/validation, registry, permission actions, panels, API console/result, and audit ledger |
| Advanced | `advancedWorkbench`, import editor/preview, import workflow controls, GraphQL/auth/parameter/secret/header/proxy sections, and Identity Lab toggle |
| Sitemap | host/path tree, endpoint inventory, baseline selector, `runSessionDiff`, and `openSitemapInTraffic` |
| Scope | `scopeTargetList`, `commitTargets`, explanatory scope copy, and AI palette action |
| SSL | CA action/state, start/stop proxy, proxy profile fields/save action, browser/device guidance, and TLS event list |
| Identity Lab | roster, `identityForm`, matrix, comparison state, causal ledger, snapshot warning, and activate/verify/archive actions |
| Project Artifacts | note list/editor, saved views, bundle export/import panels, handoff panel, previews, and close action |
| AI-First | mission dock, goal/profile/tutorial controls, start/pause/resume/continue/stop, budget chips, timeline, recovery, memory, drawer resize/close |

This manifest proves reachability, not merely DOM presence. The test must scroll each item into view, confirm it is not covered, focus it when interactive, and perform a harmless interaction where one exists.

### Visual stability helper

For pixel snapshots:

- emulate `prefers-reduced-motion: reduce`;
- wait for fonts and layout stability;
- disable CSS animations, transitions, blinking carets, and smooth scrolling through an injected test stylesheet;
- freeze fixture time where visible timestamps cannot be masked cleanly;
- mask only volatile IDs, timestamps, and live progress values;
- never mask headings, primary controls, evidence text, warnings, layout boundaries, or typography;
- capture the full Radar window and selected high-risk panels;
- use platform-specific snapshot names that include theme, profile, zoom, state, and surface.

Recommended Linux thresholds after deterministic fonts are in place:

- shell and overlay anchors: `threshold: 0.15`, `maxDiffPixelRatio: 0.001`;
- dense evidence views: `threshold: 0.15`, `maxDiffPixelRatio: 0.003`;
- any structural assertion failure blocks regardless of screenshot tolerance.

Do not increase tolerances to hide unexplained diffs. Update a baseline only after reviewing expected, actual, and diff images.

## Coverage Matrix

### Pull-request structural matrix

Run layout, font, reachability, and focus assertions for:

- all twelve workbench views in Bureau at `minimum`, `laptop`, and `default`;
- shell plus Traffic, Repeater, Automate, Findings, Workflows, Advanced, Identity Lab, Scope, and SSL in all themes at `default`;
- Traffic, Repeater, Findings, Workflows, all primary overlays, and AI-First at `zoom-125`;
- Traffic, Findings, Project Artifacts, global search, and AI-First at `zoom-150`;
- all twelve views in Bureau at `zoom-90`;
- Traffic, Intercept, Repeater, Automate, Findings, Workflows, Scope, Project Artifacts, and AI-First at `zoom-80`;
- `empty` and `demo` state at `minimum`;
- `stress-copy` for the six widest/most scroll-sensitive surfaces.

Reuse one application within a matrix test when only theme/view/window state changes. Reset overlays, scroll positions, zoom, and theme between steps. Do not launch one Electron process per screenshot unless isolation is part of the assertion.

### Pull-request visual anchors

Commit a deliberately small baseline set:

1. shell plus selected Traffic detail in Bureau, Vellum, and Specter at `default`;
2. Automate results at `minimum`;
3. Findings editor/report at `minimum`;
4. Workflows catalog/editor/graph at `laptop`;
5. Project Artifacts overlay at `minimum`;
6. global search overlay at `zoom-125`;
7. AI-First mission dock and drawer at `minimum` and `zoom-125`;
8. Identity Lab matrix/comparison at `default`;
9. long request/response evidence at `zoom-150`;
10. shell/Traffic detail in all three themes at `zoom-90`;
11. Intercept, Findings, and AI-First at `zoom-80`;
12. Appearance panel showing all theme choices.

This is approximately 15–20 screenshots, not every Cartesian combination.

### Nightly/release matrix

When `RADAR_REGRESSION_UI_FULL=1`:

- capture all twelve views in all three themes at `minimum`, `default`, and `wide`;
- run `dense` state at `wide` and `large`;
- run all overlays and AI-First at `minimum`, `zoom-125`, and `zoom-150`;
- run every view at `zoom-90`, critical workflows at `zoom-80`, and advisory hierarchy checks at `zoom-75`;
- run advisory `zoom-200` reachability checks;
- run platform structural/font smoke tests on supported macOS, Windows, and Linux hosts;
- retain all 183 actual images for the entire matrix, even when comparison is Linux-only.

## Implemented Regression Catalog

These IDs are registered in the canonical 189-case catalog. The reporter continues to treat any future catalog-only ID as missing automation.

| ID | Tags | Contract |
| --- | --- | --- |
| `REG-UI-001` | `@ui` `@ui-critical` | Minimum window renders the persistent shell without global horizontal overflow. |
| `REG-UI-002` | `@ui` `@font` `@security` | All production font assets load locally with no external request or silent fallback. |
| `REG-UI-003` | `@ui` `@font` | Every theme resolves the intended display, sans, and mono roles. |
| `REG-UI-004` | `@ui` `@usability` | Essential text respects role-based minimum size and line-height rules. |
| `REG-UI-005` | `@ui` `@usability` | All twelve views pass the minimum-window layout and required-control manifest. |
| `REG-UI-006` | `@ui` | All twelve views pass laptop/default layout checks. |
| `REG-UI-007` | `@ui` | Wide/large layouts retain bounded readable panels instead of stretching indiscriminately. |
| `REG-UI-008` | `@ui` `@usability` | Critical workflows remain reachable at 125% and 150% zoom. |
| `REG-UI-009` | `@ui` `@usability` | Visible critical controls meet target-size and accessible-name rules. |
| `REG-UI-010` | `@ui` `@usability` | Toolbars and primary actions do not clip, overlap, or become unreachable. |
| `REG-UI-011` | `@ui` `@usability` | Dense panels scroll internally and expose their final controls. |
| `REG-UI-012` | `@ui` `@usability` | Primary headings/actions do not truncate; intentional truncation exposes the full value. |
| `REG-UI-013` | `@ui` `@usability` | Search, project, appearance, AI, session, and artifact overlays fit and scroll at supported sizes. |
| `REG-UI-014` | `@ui` `@ai` | AI drawer min/max resize, internal scrolling, mission dock, and evidence pane remain usable. |
| `REG-UI-015` | `@ui` `@usability` | Keyboard traversal never focuses hidden/offscreen controls and shows visible focus. |
| `REG-UI-016` | `@ui` `@usability` | Escape and close actions restore focus to the correct trigger. |
| `REG-UI-017` | `@ui` `@usability` | Theme text, state, focus, and selection token pairs meet contrast thresholds. |
| `REG-UI-018` | `@ui` `@usability` | Request/response evidence remains selectable, copyable, wrapped/scrolled, and legible. |
| `REG-UI-019` | `@ui` | Reduced-motion mode removes nonessential motion without hiding status or controls. |
| `REG-UI-020` | `@ui` `@visual` `@ui-critical` | Pull-request visual anchors match approved platform baselines. |
| `REG-UI-021` | `@ui` `@visual` `@ui-full` | Full view/theme/window snapshot matrix runs nightly. |
| `REG-UI-022` | `@ui` `@platform` `@font` | Supported operating systems load fonts and pass structural checks at native scale. |
| `REG-UI-023` | `@ui` `@usability` | Stress-copy data wraps/truncates safely without hiding critical actions. |
| `REG-UI-024` | `@ui` `@usability` | Human release review records legibility, hierarchy, evidence inspection, and control reachability. |
| `REG-UI-025` | `@ui` `@visual` `@usability` `@ui-critical` | 90% and 80% zoom-out profiles preserve effective text clarity, hierarchy, alignment, and critical-control distinction. |

The reporter maps `UI` to `UI, Typography & Usability`.

## Commands And Cadence

Implemented package scripts:

```json
{
  "test:regression:ui": "playwright test --grep '@ui( |$)' --workers=2",
  "test:regression:ui:build": "pnpm build && pnpm test:regression:ui",
  "test:regression:ui:full": "pnpm build && cross-env RADAR_REGRESSION_UI_FULL=1 playwright test --grep '@ui' --workers=1",
  "test:regression:ui:update": "pnpm build && cross-env UPDATE_RADAR_UI_BASELINES=1 playwright test --grep '@visual' --update-snapshots --workers=1",
  "test:regression:ui:update:full": "pnpm build && cross-env RADAR_REGRESSION_UI_FULL=1 UPDATE_RADAR_UI_BASELINES=1 playwright test --grep '@visual' --update-snapshots --workers=1"
}
```

Cadence:

- pull request: `@ui-critical`, all structural/font cases, and anchor visual snapshots on Linux;
- nightly: full UI matrix plus macOS/Windows/Linux font and structural smoke;
- release candidate: full matrix plus recorded human review;
- documentation-only copy change: structural tests still run; snapshot updates are reviewed normally;
- generated README screenshots: refresh separately with `pnpm screenshots` only when product documentation imagery changed.

## Reporter And Artifacts

Extend the regression reporter with:

- UI blockers: failed/flaky `@ui-critical`, `@font`, or blocking `@usability` cases;
- results grouped by theme, window profile, zoom, and data state;
- a font summary listing expected/loaded/fallback families;
- a layout summary listing overflow, clipping, overlap, target-size, and focus violations;
- visual baseline status and links to expected, actual, and diff images;
- an explicit notice when the full UI matrix or platform matrix was skipped;
- actual renderer/outer dimensions and `devicePixelRatio` for every UI case.

Artifacts under `artifacts/regression/`:

```text
ui-summary.md
ui-summary.json
font-audit.json
layout-metrics.json
visual/
  expected/
  actual/
  diff/
usability-review.md
```

Playwright's normal per-test attachments remain the source of traces, videos, and failure screenshots. Summary files aggregate links rather than copying the same binary repeatedly.

## Baseline Governance

- Baselines are committed and platform-qualified.
- CI never updates baselines automatically.
- Updating snapshots requires both `--update-snapshots` and `UPDATE_RADAR_UI_BASELINES=1`.
- A baseline change must include the expected/actual/diff review in the change description.
- Reviewers verify typography, density, focus, selection, evidence readability, warnings, and primary-action hierarchy—not just that the diff is intentional.
- Baseline churn across unrelated surfaces is a failure signal, not a reason to approve all images in bulk.
- Font-file changes require all theme anchors to be reapproved.
- Tolerance changes require a written reason and should be scoped to one surface.

## Human Release Review

Automation cannot determine whether an operator can understand a dense security workbench quickly. One reviewer must perform the release-candidate pass on a normal desktop monitor and record:

- reviewer, date, commit, OS, display resolution, scale factor, and Radar window profile;
- all three themes at default size;
- Bureau at minimum size and 125% zoom;
- all themes at 90% zoom and critical evidence/actions at 80% zoom;
- one 150% zoom evidence-inspection flow;
- empty and dense project states;
- keyboard-only opening, traversal, and closing of global search and one settings overlay;
- filter/select/read/copy flow in Traffic;
- edit/send/read flow in Repeater without accidental transmission;
- start/inspect/stop flow in AI-First using the deterministic provider;
- readability of scope warnings, capability decisions, intercept actions, report warnings, and raw-context notices;
- whether the active view, selected evidence, primary action, and destructive actions are visually distinguishable within five seconds;
- any fatigue, ambiguity, tiny-text, excessive-truncation, scroll-trap, or hierarchy issue.

The human reviewer does not approve aesthetic taste in the abstract. The gate is operator comprehension, evidence legibility, action reachability, and safe hierarchy.

## Failure Severity

| Severity | Examples | Release effect |
| --- | --- | --- |
| Blocker | Missing production font, unreadable evidence, hidden scope/capability warning, unreachable primary action, global overflow at minimum, focus trapped offscreen, unexplained critical visual diff | Blocks pull request/release. |
| High | Major panel overlap, clipped destructive-action label, unreadable or hierarchy-breaking 80% zoom, broken 125% zoom workflow, contrast failure, unscrollable overlay | Blocks release; normally blocks pull request. |
| Medium | Noncritical metadata truncation without disclosure, isolated target below preferred size, wide-screen overexpansion, noncritical snapshot drift | Must be triaged before release. |
| Advisory | 200% zoom issue, cosmetic difference outside anchors, platform-only antialiasing variation | Recorded backlog; does not block unless it obscures meaning. |

## Implemented Waves

### Wave 0 — font determinism

- Vendor and license the current theme fonts.
- Remove the Google Fonts runtime dependency.
- Implement offline request and loaded-face audits.

### Wave 1 — measurable usability

- Add window/zoom profiles and layout metrics.
- Add all-view required-control manifests.
- Add overflow, scroll reachability, target-size, font-role, and focus assertions.
- Implement `REG-UI-001` through `REG-UI-019`, `REG-UI-023`, and `REG-UI-025`.

### Wave 2 — visual baselines

- Stabilize time, fonts, animation, caret, and fixture state.
- Commit the pull-request anchor baseline.
- Add guarded update commands and reporter links.
- Implement `REG-UI-020`.

### Wave 3 — full matrix and human review

- Add nightly full snapshots and platform smoke.
- Add UI summary artifacts and release blockers.
- Add the human review record template.
- Implement `REG-UI-021`, `REG-UI-022`, and `REG-UI-024`.

## Definition Of Done

The automation is implemented. Release readiness additionally requires:

- all 25 UI IDs remain executable and registered in the canonical regression catalog;
- fonts are local, pinned, licensed, and verified loaded without external traffic;
- every primary view passes minimum/laptop/default structural checks;
- critical workflows pass 125% and 150% zoom checks;
- all views pass 90% zoom checks and critical workflows pass the 80% clarity boundary;
- Linux anchor baselines are approved and stable across three clean repeated runs;
- the full matrix is environment-gated and visible as a skipped gap when not selected;
- UI/font/usability blockers appear in `summary.md` and `summary.json`;
- failure artifacts include font, layout, expected, actual, and diff evidence;
- one release-candidate human review is recorded;
- existing functional, security, persistence, and workflow regression cases remain green;
- `pnpm lint`, `pnpm test:unit`, `pnpm build`, and the selected regression commands pass.
