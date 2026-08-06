# Regression Testing

Radar's regression suite uses Playwright's Electron support to run complete operator workflows against the production workspace and AI Operator renderers, their role-specific preload bridges, Electron main process, SQLite store, proxy, bounded AI runtime, and UI/font/usability matrix. The stable 192-case catalog and expected proof for every workflow are defined in [REGRESSION_SUITE_SPEC.md](REGRESSION_SUITE_SPEC.md).

The implemented viewport, typography, visual-diff, keyboard, and human-usability extension is documented in [UI_VISUAL_REGRESSION_SPEC.md](UI_VISUAL_REGRESSION_SPEC.md). `REG-UI-001` through `REG-UI-025` are part of the canonical catalog.

All 192 catalog IDs have executable Playwright registrations. UI runs add two scheduled/release gates (`REG-UI-021` and `REG-UI-024`); Linux is the canonical pixel-baseline host for `REG-UI-020`, while other platforms report it as an explicit skip and still run native font/structure smoke.

## Run The Suite

Build and execute the normal suite:

```bash
pnpm test:regression:build
```

After the first build, iterate without rebuilding:

```bash
pnpm test:regression
```

Run the installed-browser/platform matrix on a suitable host:

```bash
RADAR_REGRESSION_PLATFORM=1 pnpm test:regression:build
```

Run the scheduled longevity and high-volume cases:

```bash
RADAR_REGRESSION_SOAK=1 pnpm test:regression:build
```

Build and run the blocking UI/font/zoom/usability cases with bounded local concurrency:

```bash
pnpm test:regression:ui:build
```

Run the scheduled full screenshot matrix, or explicitly update Linux baselines after reviewing expected/actual/diff evidence:

```bash
pnpm test:regression:ui:full
pnpm test:regression:ui:update
pnpm test:regression:ui:update:full
```

The first update command refreshes the reviewed pull-request anchors; the `:full` variant refreshes the complete gated nightly matrix. Both require the explicit update guard embedded in the package scripts, and CI never updates snapshots. Complete [UI_USABILITY_REVIEW.md](UI_USABILITY_REVIEW.md), then select the release review gate with `RADAR_UI_HUMAN_REVIEW=1 pnpm test:regression:ui`.

GitHub Actions runs the Linux structural/font/zoom suite and approved anchors on every pull request and `develop` push. The canonical pixel runner is pinned to `ubuntu-24.04-arm` so approved snapshots and CI use the same OS and architecture. The scheduled job runs the complete six-theme matrix on Linux and native font/structure smoke on macOS and Windows; each job retains `artifacts/regression/` for 14 days.

Both gates can be enabled together. Standard Playwright flags remain available:

```bash
pnpm test:regression --grep "@security"
pnpm test:regression --grep "REG-REP"
pnpm test:regression --workers=4
pnpm test:regression:build --workers=4
pnpm test:regression --repeat-each=5
pnpm test:regression --trace=on
```

Open the latest interactive report with:

```bash
pnpm test:regression:report
```

## Parallel Application Instances

Every standard Playwright case gets a separate Electron process with:

- A temporary Electron `userData` directory and independent SQLite database.
- Worker-specific proxy and Chrome remote-debugging ports.
- An isolated project, session, browser profile, AI settings store, and artifact directory.
- A measured renderer-ready startup sample.
- Teardown that stops the proxy, closes child windows, and removes temporary state.

The harness distinguishes native surfaces by URL and immutable preload role. `openAiOperatorWindow(page, section)` opens or focuses the singleton companion and returns its Playwright `Page`; window profiles select the matching `BrowserWindow` before resizing or changing zoom. Never assume `context.pages()[0]` is the active surface after the companion opens.

`fullyParallel` is enabled, so independent workflows execute in multiple Radar instances at the same time. Use `--workers=N` to control concurrency. CI defaults to two workers; local Playwright uses the host's normal worker calculation.

Playwright global setup resolves and verifies the Electron executable once before any worker starts. Electron 42 downloads its binary lazily, so keeping that bootstrap single-owner prevents parallel first-run launches from racing on the executable with `ETXTBSY`.

`RADAR_REGRESSION_USER_DATA_DIR`, `RADAR_REGRESSION_ARTIFACT_DIR`, `RADAR_REGRESSION_PROXY_PORT`, and `RADAR_REGRESSION_DEBUG_PORT` are harness-only startup controls. Normal application launches retain Radar's standard paths and ports.

## Real-Use Fixtures

The suite does not depend on external targets or a real AI account. It owns deterministic loopback fixtures for:

- HTTP routes covering authentication, redirects, queries, JSON/forms, status classes, delays, empty bodies, large bodies, GraphQL, and API definitions.
- HTTPS using a short-lived server certificate signed by the isolated regression proxy CA, without changing the system trust store.
- WebSocket handshake, server greeting, echo, close, replay, and failure behavior.
- An OpenAI-compatible provider whose request ledger proves redacted/raw context and scripted AI-First tool decisions.
- Valid, invalid, over-limit, migration, bundle, report, wordlist, and plugin file workflows.

Any test that transmits traffic must use a suite-owned `127.0.0.1` fixture and the saved Radar scope contract. Fixture ledgers assert expected sends, missing sends, duplicates, and caps.

## Reports And Failure Evidence

Every invocation writes to `artifacts/regression/`:

| Artifact | Purpose |
| --- | --- |
| `summary.md` | Release report with totals, tag/surface matrices, security blockers, prior-run changes, slowest workflows, startup distribution, skipped gaps, catalog coverage, and failure links. |
| `summary.json` | Compact stable-ID, outcome, duration, tag, file, and startup data for CI ingestion. |
| `html/index.html` | Interactive workflow report with attempts, steps, and retained attachments. |
| `results.json` | Complete Playwright machine-readable result data. |
| `results/` | Screenshots, videos, traces, and concise error context retained on failure. |
| `ui-summary.md` / `ui-summary.json` | UI environment selection, blockers, full/platform/human gate state, and evidence counts. |
| `font-audit.json` | Aggregated expected, resolved, loaded, fallback, and external-resource font evidence. |
| `layout-metrics.json` | Aggregated renderer/window dimensions, zoom, effective type sizes, scroll paths, and violations. |
| `visual/` | Expected, actual, and diff images copied from Playwright attachments when emitted. |

A failing or flaky `@security` workflow is listed as a release blocker. Failed/flaky `@ui-critical`, `@font`, and blocking `@usability` cases are UI release blockers. Platform, full-matrix, human-review, and soak skips remain visible rather than being counted as implemented success. Catalog coverage is scanned from all `tests/regression/*.spec.ts` files, so a narrowed `--grep` run does not incorrectly report unselected tests as unimplemented.

## Coverage Areas

The catalog exercises application startup, projects/sessions, HTTP/S capture, WebSockets, scope, proxy/TLS, intercept, Repeater, Automate, Findings, Workflows, Plugins, Sitemap, Advanced Testing, file/report flows, Manual-First AI, AI-First planning/recovery/authority, Identity Lab, deterministic local fonts, window/zoom layouts, keyboard focus, visual baselines, stress copy, human usability review, database migrations, corruption resistance, multi-instance isolation, resilience, installed-browser behavior, and soak/high-volume behavior.

Add or update a stable catalog case whenever a user-facing workflow or safety boundary changes. Prefer visible controls and visible/durable outcomes. Direct Electron evaluation is reserved for process-level invariants that cannot be proven through the operator surface.
