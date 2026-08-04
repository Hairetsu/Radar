# Radar Regression Report

Generated: 2026-08-04T20:34:48.217Z
Overall result: **PASSED**
Workers: 2
Wall time: 47.2s
Aggregate workflow time: 93.2s

## Outcome

| Passed | Failed | Flaky | Skipped | Selected |
| ---: | ---: | ---: | ---: | ---: |
| 22 | 0 | 0 | 3 | 25 |

## Release Signals

- No blocking workflow failures were detected.
- No flaky workflows were detected.
- 3 selected workflow(s) were skipped and remain explicit coverage gaps for this run.
- 1 workflow(s) exceeded 10 seconds; review the slowest-workflow table for startup, polling, or IPC latency.
- No security-tagged release blockers were detected.
- No critical UI/font/usability release blockers were detected.
- The scheduled full UI matrix was not selected for this invocation.
- The installed-browser platform matrix was not selected for this invocation.
- Catalog automation: 192/192 stable IDs (100.0%).
- This invocation selected 25/192 catalog IDs.

## Results By Tag

| Tag | Passed | Failed | Flaky | Skipped | Total |
| --- | ---: | ---: | ---: | ---: | ---: |
| @ai | 1 | 0 | 0 | 0 | 1 |
| @font | 3 | 0 | 0 | 0 | 3 |
| @platform | 1 | 0 | 0 | 0 | 1 |
| @security | 1 | 0 | 0 | 0 | 1 |
| @ui | 22 | 0 | 0 | 3 | 25 |
| @ui-critical | 2 | 0 | 0 | 1 | 3 |
| @ui-full | 0 | 0 | 0 | 1 | 1 |
| @usability | 14 | 0 | 0 | 1 | 15 |
| @visual | 1 | 0 | 0 | 2 | 3 |

## Results By Product Surface

| Surface | Passed | Failed | Flaky | Skipped | Total |
| --- | ---: | ---: | ---: | ---: | ---: |
| UI, Typography & Usability | 22 | 0 | 0 | 3 | 25 |

## Results By UI Environment

| Environment | Passed | Failed | Flaky | Skipped | Total |
| --- | ---: | ---: | ---: | ---: | ---: |
| native/default | 3 | 0 | 0 | 3 | 6 |
| profile: minimum · zoom: 1 | 5 | 0 | 0 | 0 | 5 |
| profile: minimum · zoom: 1 · state: demo | 1 | 0 | 0 | 0 | 1 |
| profile: minimum · zoom: 1 · state: empty, demo | 1 | 0 | 0 | 0 | 1 |
| profile: minimum, default · zoom: 1 | 1 | 0 | 0 | 0 | 1 |
| profile: minimum, zoom-125, zoom-150 · zoom: 1, 1.25, 1.5 | 1 | 0 | 0 | 0 | 1 |
| profile: wide, large · zoom: 1 | 1 | 0 | 0 | 0 | 1 |
| profile: zoom-125, zoom-150 · zoom: 1.25, 1.5 | 1 | 0 | 0 | 0 | 1 |
| profile: zoom-150 · zoom: 1.5 | 1 | 0 | 0 | 0 | 1 |
| profile: zoom-90, zoom-80 · zoom: 0.9, 0.8 · state: demo | 1 | 0 | 0 | 0 | 1 |
| theme: bureau, vellum, specter | 4 | 0 | 0 | 0 | 4 |
| theme: bureau, vellum, specter · profile: laptop, default · zoom: 1 · state: demo | 1 | 0 | 0 | 0 | 1 |
| theme: bureau, vellum, specter · profile: minimum, default · zoom: 1 | 1 | 0 | 0 | 0 | 1 |

## Changes From Prior Local Report

No newly failing selected IDs.

No newly fixed selected IDs.

## Security Release Blockers

None.

## UI, Font, And Usability Release Blockers

None.

## Failures And Artifacts

No failed workflows.

## Slowest Workflows

| Rank | Workflow | Outcome | Duration | Attempts |
| ---: | --- | --- | ---: | ---: |
| 1 | **REG-UI-006** [REG-UI-006] @ui passes every view at laptop and default layouts | passed | 19.5s | 1 |
| 2 | **REG-UI-005** [REG-UI-005] @ui @usability reaches required controls in all twelve views at minimum size | passed | 8.1s | 1 |
| 3 | **REG-UI-025** [REG-UI-025] @ui @visual @usability @ui-critical preserves clarity and hierarchy below 100% zoom | passed | 6.8s | 1 |
| 4 | **REG-UI-008** [REG-UI-008] @ui @usability keeps critical workflows reachable at 125% and 150% zoom | passed | 6.0s | 1 |
| 5 | **REG-UI-010** [REG-UI-010] @ui @usability prevents toolbar and primary-action overlap | passed | 4.1s | 1 |
| 6 | **REG-UI-012** [REG-UI-012] @ui @usability prevents undisclosed truncation on primary headings and actions | passed | 3.5s | 1 |
| 7 | **REG-UI-013** [REG-UI-013] @ui @usability keeps primary overlays within the viewport with internal scrolling | passed | 3.4s | 1 |
| 8 | **REG-UI-003** [REG-UI-003] @ui @font resolves every theme's display, sans, and mono roles | passed | 3.3s | 1 |
| 9 | **REG-UI-002** [REG-UI-002] @ui @font @security loads production fonts locally without fallback or external traffic | passed | 3.3s | 1 |
| 10 | **REG-UI-022** [REG-UI-022] @ui @platform @font loads all pinned font roles at native platform scale | passed | 3.0s | 1 |

## Application Startup Distribution

Samples: 24 · min 1.0s · median 1.0s · p95 1.2s · max 1.3s.

## Skipped Coverage Gaps

- **REG-UI-020** [REG-UI-020] @ui @visual @ui-critical matches approved Linux visual anchors
- **REG-UI-021** [REG-UI-021] @ui @visual @ui-full captures the full view, theme, and window matrix
- **REG-UI-024** [REG-UI-024] @ui @usability validates the recorded human release review

## Catalog Coverage

All 192 specified catalog cases have executable Playwright registrations.
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
