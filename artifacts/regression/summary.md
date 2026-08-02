# Radar Regression Report

Generated: 2026-08-02T05:06:33.291Z
Overall result: **FAILED**
Workers: 1
Wall time: 185.7s
Aggregate workflow time: 181.5s

## Outcome

| Passed | Failed | Flaky | Skipped | Selected |
| ---: | ---: | ---: | ---: | ---: |
| 20 | 3 | 0 | 2 | 25 |

## Release Signals

- 3 failing workflow(s) need investigation before release.
- No flaky workflows were detected.
- 2 selected workflow(s) were skipped and remain explicit coverage gaps for this run.
- 4 workflow(s) exceeded 10 seconds; review the slowest-workflow table for startup, polling, or IPC latency.
- No security-tagged release blockers were detected.
- 2 critical font/usability result(s) block release.
- The full UI matrix was selected.
- The installed-browser platform matrix was not selected for this invocation.
- Catalog automation: 189/189 stable IDs (100.0%).
- This invocation selected 25/189 catalog IDs.

## Results By Tag

| Tag | Passed | Failed | Flaky | Skipped | Total |
| --- | ---: | ---: | ---: | ---: | ---: |
| @ai | 1 | 0 | 0 | 0 | 1 |
| @font | 3 | 0 | 0 | 0 | 3 |
| @platform | 1 | 0 | 0 | 0 | 1 |
| @security | 1 | 0 | 0 | 0 | 1 |
| @ui | 20 | 3 | 0 | 2 | 25 |
| @ui-critical | 2 | 0 | 0 | 1 | 3 |
| @ui-full | 0 | 1 | 0 | 0 | 1 |
| @usability | 12 | 2 | 0 | 1 | 15 |
| @visual | 1 | 1 | 0 | 1 | 3 |

## Results By Product Surface

| Surface | Passed | Failed | Flaky | Skipped | Total |
| --- | ---: | ---: | ---: | ---: | ---: |
| UI, Typography & Usability | 20 | 3 | 0 | 2 | 25 |

## Results By UI Environment

| Environment | Passed | Failed | Flaky | Skipped | Total |
| --- | ---: | ---: | ---: | ---: | ---: |
| native/default | 3 | 0 | 0 | 2 | 5 |
| profile: minimum · zoom: 1 | 4 | 0 | 0 | 0 | 4 |
| profile: minimum · zoom: 1 · state: demo | 0 | 1 | 0 | 0 | 1 |
| profile: minimum · zoom: 1 · state: empty, demo | 1 | 0 | 0 | 0 | 1 |
| profile: minimum, default · zoom: 1 | 1 | 0 | 0 | 0 | 1 |
| profile: minimum, zoom-125, zoom-150 · zoom: 1, 1.25, 1.5 | 1 | 0 | 0 | 0 | 1 |
| profile: wide, large · zoom: 1 | 1 | 0 | 0 | 0 | 1 |
| profile: zoom-125 · zoom: 1.25 | 1 | 0 | 0 | 0 | 1 |
| profile: zoom-125, zoom-150 · zoom: 1.25, 1.5 | 0 | 1 | 0 | 0 | 1 |
| profile: zoom-150 · zoom: 1.5 | 1 | 0 | 0 | 0 | 1 |
| profile: zoom-90, zoom-80 · zoom: 0.9, 0.8 · state: demo | 1 | 0 | 0 | 0 | 1 |
| theme: bureau, vellum, specter | 4 | 0 | 0 | 0 | 4 |
| theme: bureau, vellum, specter · profile: laptop, default · zoom: 1 · state: demo | 1 | 0 | 0 | 0 | 1 |
| theme: bureau, vellum, specter · profile: minimum, default · zoom: 1 | 1 | 0 | 0 | 0 | 1 |
| theme: bureau, vellum, specter · profile: minimum, default, wide, large, zoom-125, zoom-150, zoom-90, zoom-80, zoom-75, zoom-200 · zoom: 1, 1.25, 1.5, 0.9, 0.8, 0.75, 2 | 0 | 1 | 0 | 0 | 1 |

## Changes From Prior Local Report

Newly failing: REG-UI-005, REG-UI-008, REG-UI-021.

No newly fixed selected IDs.

## Security Release Blockers

None.

## UI, Font, And Usability Release Blockers

- **REG-UI-005** [REG-UI-005] @ui @usability reaches required controls in all twelve views at minimum size — failed
- **REG-UI-008** [REG-UI-008] @ui @usability keeps critical workflows reachable at 125% and 150% zoom — failed

## Failures And Artifacts

| Workflow | Duration | Attempts | Evidence |
| --- | ---: | ---: | --- |
| **REG-UI-005** [REG-UI-005] @ui @usability reaches required controls in all twelve views at minimum size | 13.5s | 1 | [screenshot](<results/ui-layout-UI-layout-reacha-6a6be-welve-views-at-minimum-size/test-failed-1.png>) · [error-context](<results/ui-layout-UI-layout-reacha-6a6be-welve-views-at-minimum-size/error-context.md>) · [trace](<results/ui-layout-UI-layout-reacha-6a6be-welve-views-at-minimum-size/trace.zip>) |
| **REG-UI-008** [REG-UI-008] @ui @usability keeps critical workflows reachable at 125% and 150% zoom | 15.2s | 1 | [screenshot](<results/ui-layout-UI-layout-reacha-34311-achable-at-125-and-150-zoom/test-failed-1.png>) · [error-context](<results/ui-layout-UI-layout-reacha-34311-achable-at-125-and-150-zoom/error-context.md>) · [trace](<results/ui-layout-UI-layout-reacha-34311-achable-at-125-and-150-zoom/trace.zip>) |
| **REG-UI-021** [REG-UI-021] @ui @visual @ui-full captures the full view, theme, and window matrix | 70.9s | 1 | [screenshot](<results/ui-visual-UI-visual-baseli-a6eea-iew-theme-and-window-matrix/test-failed-1.png>) · [error-context](<results/ui-visual-UI-visual-baseli-a6eea-iew-theme-and-window-matrix/error-context.md>) · [trace](<results/ui-visual-UI-visual-baseli-a6eea-iew-theme-and-window-matrix/trace.zip>) |

## Slowest Workflows

| Rank | Workflow | Outcome | Duration | Attempts |
| ---: | --- | --- | ---: | ---: |
| 1 | **REG-UI-021** [REG-UI-021] @ui @visual @ui-full captures the full view, theme, and window matrix | failed | 70.9s | 1 |
| 2 | **REG-UI-006** [REG-UI-006] @ui passes every view at laptop and default layouts | passed | 22.3s | 1 |
| 3 | **REG-UI-008** [REG-UI-008] @ui @usability keeps critical workflows reachable at 125% and 150% zoom | failed | 15.2s | 1 |
| 4 | **REG-UI-005** [REG-UI-005] @ui @usability reaches required controls in all twelve views at minimum size | failed | 13.5s | 1 |
| 5 | **REG-UI-025** [REG-UI-025] @ui @visual @usability @ui-critical preserves clarity and hierarchy below 100% zoom | passed | 5.6s | 1 |
| 6 | **REG-UI-010** [REG-UI-010] @ui @usability prevents toolbar and primary-action overlap | passed | 4.0s | 1 |
| 7 | **REG-UI-013** [REG-UI-013] @ui @usability keeps primary overlays within the viewport with internal scrolling | passed | 3.7s | 1 |
| 8 | **REG-UI-012** [REG-UI-012] @ui @usability prevents undisclosed truncation on primary headings and actions | passed | 3.5s | 1 |
| 9 | **REG-UI-002** [REG-UI-002] @ui @font @security loads production fonts locally without fallback or external traffic | passed | 3.5s | 1 |
| 10 | **REG-UI-003** [REG-UI-003] @ui @font resolves every theme's display, sans, and mono roles | passed | 3.3s | 1 |

## Application Startup Distribution

Samples: 24 · min 1.0s · median 1.1s · p95 1.3s · max 1.4s.

## Skipped Coverage Gaps

- **REG-UI-020** [REG-UI-020] @ui @visual @ui-critical matches approved Linux visual anchors
- **REG-UI-024** [REG-UI-024] @ui @usability validates the recorded human release review

## Catalog Coverage

All 189 specified catalog cases have executable Playwright registrations.
No registered test IDs fall outside the specification.

## Artifact Guide

- [`html/index.html`](html/index.html): interactive report with steps and attachments.
- [`results.json`](results.json): complete Playwright machine-readable output.
- [`summary.json`](summary.json): compact status, tag, duration, and stable-ID data for CI ingestion.
- [`ui-summary.md`](ui-summary.md) and [`ui-summary.json`](ui-summary.json): UI environment coverage, gates, and blockers.
- [`font-audit.json`](font-audit.json) and [`layout-metrics.json`](layout-metrics.json): aggregated typography and geometry evidence.
- `visual/`: copied expected, actual, and diff evidence when Playwright emits it.
- `results/`: retained screenshots, traces, videos, and error context for failures.

## Tested Architecture

Each test launches a real Electron main process and renderer with an isolated user-data directory, SQLite store, proxy port, browser-debug port, and cleanup lifecycle. Playwright workers therefore run separate Radar use cases concurrently without sharing project evidence or browser profiles. Suite-owned loopback HTTP/S, WebSocket, deterministic AI, and file fixtures exercise real IPC and persistence boundaries without transmitting to external targets.
