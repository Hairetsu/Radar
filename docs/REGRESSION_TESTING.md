# Regression testing

Radar's regression suite drives production Electron code through Playwright. Each case owns an isolated application process, SQLite database, proxy, browser ports, AI settings, and artifact directory.

The executable files under `tests/regression/` are the coverage catalog. Stable IDs such as `REG-REP-001` and `REG-UI-025` identify workflows in reports. Do not maintain a second hand-written catalog of cases.

## Run the suite

Build and run the default Electron workflows:

```bash
pnpm test:regression:build
```

After a successful build, iterate without rebuilding:

```bash
pnpm test:regression
```

Run the installed-browser and native platform cases on a suitable host:

```bash
RADAR_REGRESSION_PLATFORM=1 pnpm test:regression:build
```

Run scheduled longevity and high-volume cases:

```bash
RADAR_REGRESSION_SOAK=1 pnpm test:regression:build
```

Standard Playwright filters still work:

```bash
pnpm test:regression --grep "@security"
pnpm test:regression --grep "REG-REP"
pnpm test:regression --workers=4
pnpm test:regression --repeat-each=5
pnpm test:regression --trace=on
```

Open the latest HTML report with:

```bash
pnpm test:regression:report
```

## Run the UI gate

Build and run the blocking font, layout, focus, zoom, and usability cases:

```bash
pnpm test:regression:ui:build
```

Run the scheduled full theme, window, and screenshot matrix:

```bash
pnpm test:regression:ui:full
```

Update reviewed pull-request baselines only after you inspect expected, actual, and diff images:

```bash
pnpm test:regression:ui:update
```

Update the complete scheduled matrix with:

```bash
pnpm test:regression:ui:update:full
```

Both update commands set the repository's explicit update guard. CI never writes baselines.

Complete [UI usability release review](UI_USABILITY_REVIEW.md), then run its gate:

```bash
RADAR_UI_HUMAN_REVIEW=1 pnpm test:regression:ui
```

## UI contract

The main workspace defaults to `1480 x 940` and cannot resize below `1120 x 760`. The AI Operator defaults to `1040 x 840` and cannot resize below `760 x 640`.

The blocking matrix proves:

- Every required local font loads and resolves on its declared role.
- Bureau, Vellum, Specter, Aperture, Verdigris, and Aegis preserve hierarchy and selection contrast.
- Critical controls remain reachable at the minimum window sizes.
- The main workspace and AI Operator retain internal scroll paths instead of clipping evidence or safety controls.
- Keyboard search, settings, view navigation, menus, and focus restoration work.
- Primary workflows remain usable at 80 and 90 percent zoom.
- Evidence review remains usable at 125 and 150 percent text enlargement.
- The scheduled matrix records the advisory 75 and 200 percent boundaries.
- Empty, demo, dense, and stress-copy states do not hide or overlap critical work.

Structural and semantic assertions are the main gate. Pixel comparisons detect changes in hierarchy, spacing, typography, and clipping. The human review covers fatigue, ambiguity, balance, and any other judgment that a screenshot threshold cannot settle.

## Baseline policy

Linux ARM64 on the pinned `ubuntu-24.04-arm` runner is the canonical pixel host. Other platforms run native font and structural checks and report canonical pixel cases as explicit skips.

When a baseline changes:

1. Run the failing case without updating snapshots.
2. Inspect the expected, actual, and diff image.
3. Confirm that the underlying layout and font metrics are intentional.
4. Run the matching workflow manually when the change affects interaction.
5. Update only the needed baseline.
6. Review the new image in Git before commit.

Do not update a baseline to silence clipping, fallback fonts, hidden focus, unreadable contrast, or a stale screenshot seed.

## Parallel application instances

Every standard case gets:

- A temporary Electron `userData` directory and SQLite database.
- Worker-specific proxy and Chrome debugging ports.
- An isolated project, session, browser profile, AI settings file, and artifact folder.
- A measured renderer-ready startup sample.
- Teardown that stops the proxy, closes child windows, and removes temporary state.

The harness identifies native windows by renderer URL and immutable preload role. `openAiOperatorWindow(page, section)` opens or focuses the singleton companion and returns its Playwright `Page`. Select the matching native `BrowserWindow` before changing bounds or zoom. Do not assume `context.pages()[0]` is still the workspace after the companion opens.

Playwright runs independent cases in parallel. Use `--workers=N` to limit concurrency. CI uses two workers by default.

Global setup resolves the Electron executable once before workers start. Electron downloads its binary lazily, so a single owner prevents first-run executable races.

Harness-only environment variables include:

- `RADAR_REGRESSION_USER_DATA_DIR`
- `RADAR_REGRESSION_ARTIFACT_DIR`
- `RADAR_REGRESSION_PROXY_PORT`
- `RADAR_REGRESSION_DEBUG_PORT`

Normal Radar launches ignore these controls.

## Deterministic fixtures

The default suite does not need an external target or a live AI account. It owns loopback fixtures for:

- HTTP authentication, redirects, queries, forms, JSON, delays, status classes, large bodies, GraphQL, and API definitions.
- HTTPS with a short-lived certificate signed by the isolated test CA.
- WebSocket handshake, greeting, echo, replay, close, and failure behavior.
- An OpenAI-compatible provider with a request ledger for redaction and scripted AI decisions.
- Valid, malformed, oversized, migrated, bundled, reported, wordlist, and plugin files.

Any case that sends traffic must use a suite-owned `127.0.0.1` target in saved Scope. Fixture ledgers prove expected sends, missing sends, duplicates, and caps.

## Ubuntu container

Build and run the complete lint, unit, production, and Electron gate:

```bash
docker build --file docker/Dockerfile.ubuntu --tag radar-test:ubuntu .
mkdir -p artifacts/regression
docker run --rm --init --shm-size=1g \
  --mount type=bind,source="$(pwd)/artifacts/regression",target=/workspace/artifacts/regression \
  radar-test:ubuntu
```

The image supports `linux/amd64` and `linux/arm64` and runs Electron under Xvfb. To reproduce the canonical screenshot host, build and run with `--platform linux/arm64`. Emulation is slower than a native ARM64 runner.

The first image build needs network access for the base image, Node, pnpm dependencies, Electron, and Chromium. The maintained loopback gates can run offline after those inputs are baked into the image.

## Windows container

Switch Docker to Windows containers, then run:

```powershell
docker build --file docker/Dockerfile.windows --tag radar-test:windows .
docker run --rm radar-test:windows
```

The default command runs lint, unit tests, the production build, a Windows x64 NSIS package build, and the Electron workflow suite with one worker. The image requires a compatible Windows host and may need Hyper-V isolation.

Windows containers do not provide an interactive desktop. Run the native display and managed-browser smoke on a Windows host or VM:

```powershell
pnpm build
$env:RADAR_REGRESSION_PLATFORM = "1"
pnpm exec playwright test tests/regression/ui-fonts.spec.ts tests/regression/ui-keyboard.spec.ts tests/regression/ui-layout.spec.ts --grep "REG-UI-(001|002|003|005|015|022|025)" --workers=1
```

One Docker daemon cannot build Linux and Windows images at the same time. Switch modes or use separate matching runners.

## Read the artifacts

Every run writes under `artifacts/regression/`:

| Artifact | Contents |
| --- | --- |
| `summary.md` | Totals, matrices, blockers, changes, slow cases, startup data, skips, and failure links. |
| `summary.json` | Stable IDs, outcomes, durations, tags, files, and startup samples. |
| `html/index.html` | Interactive Playwright report. |
| `results.json` | Complete machine-readable result data. |
| `results/` | Retained screenshots, video, traces, and error context. |
| `ui-summary.md` and `ui-summary.json` | UI environment, blockers, selected gates, and evidence counts. |
| `font-audit.json` | Expected, resolved, loaded, fallback, and external-resource font evidence. |
| `layout-metrics.json` | Window, renderer, zoom, type-size, scroll, and violation data. |
| `visual/` | Expected, actual, and diff images from visual cases. |

A failed or flaky `@security` case blocks release. Failed or flaky `@ui-critical`, `@font`, or blocking `@usability` cases also block release. Platform, full-matrix, human-review, and soak skips stay visible instead of counting as success.

The reporter scans stable IDs from every `tests/regression/*.spec.ts` file. A narrowed `--grep` run therefore reports unselected cases honestly.

## Add a regression case

Add or update a stable case when a user workflow or safety boundary changes.

- Drive visible controls and assert a visible or durable result.
- Use direct Electron evaluation only for process invariants that cannot be proved through the operator surface.
- Keep network traffic on an owned loopback fixture.
- Give the case a stable ID and the right security, UI, platform, or soak tags.
- Save evidence that tells a maintainer what failed without exposing secrets.
- Update the manual QA checklist when the release walkthrough changes.
