# Radar Regression Report

Generated: 2026-08-05T20:42:45.298Z
Overall result: **PASSED**
Workers: 1
Wall time: 15.8s
Aggregate workflow time: 15.3s

## Outcome

| Passed | Failed | Flaky | Skipped | Selected |
| ---: | ---: | ---: | ---: | ---: |
| 1 | 0 | 0 | 0 | 1 |

## Release Signals

- No blocking workflow failures were detected.
- No flaky workflows were detected.
- No selected workflows were skipped.
- 1 workflow(s) exceeded 10 seconds; review the slowest-workflow table for startup, polling, or IPC latency.
- No security-tagged release blockers were detected.
- No critical UI/font/usability release blockers were detected.
- The scheduled full UI matrix was not selected for this invocation.
- The installed-browser platform matrix was not selected for this invocation.
- Catalog automation: 192/192 stable IDs (100.0%).
- This invocation selected 1/192 catalog IDs.

## Results By Tag

| Tag | Passed | Failed | Flaky | Skipped | Total |
| --- | ---: | ---: | ---: | ---: | ---: |
| @ui | 1 | 0 | 0 | 0 | 1 |
| @ui-critical | 1 | 0 | 0 | 0 | 1 |
| @visual | 1 | 0 | 0 | 0 | 1 |

## Results By Product Surface

| Surface | Passed | Failed | Flaky | Skipped | Total |
| --- | ---: | ---: | ---: | ---: | ---: |
| UI, Typography & Usability | 1 | 0 | 0 | 0 | 1 |

## Results By UI Environment

| Environment | Passed | Failed | Flaky | Skipped | Total |
| --- | ---: | ---: | ---: | ---: | ---: |
| theme: bureau, vellum, specter · profile: default, zoom-90, minimum, laptop, zoom-150, zoom-80, zoom-125 · zoom: 1, 0.9, 1.5, 0.8, 1.25 | 1 | 0 | 0 | 0 | 1 |

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
| 1 | **REG-UI-020** [REG-UI-020] @ui @visual @ui-critical matches approved Linux visual anchors | passed | 15.3s | 1 |

## Application Startup Distribution

Samples: 1 · min 0.8s · median 0.8s · p95 0.8s · max 0.8s.

## Skipped Coverage Gaps

No selected catalog cases were skipped.

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
