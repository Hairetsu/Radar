# Radar Regression Report

Generated: 2026-08-04T17:47:29.706Z
Overall result: **PASSED**
Workers: 6
Wall time: 118.7s
Aggregate workflow time: 668.3s

## Outcome

| Passed | Failed | Flaky | Skipped | Selected |
| ---: | ---: | ---: | ---: | ---: |
| 182 | 0 | 0 | 10 | 192 |

## Release Signals

- No blocking workflow failures were detected.
- No flaky workflows were detected.
- 10 selected workflow(s) were skipped and remain explicit coverage gaps for this run.
- 4 workflow(s) exceeded 10 seconds; review the slowest-workflow table for startup, polling, or IPC latency.
- No security-tagged release blockers were detected.
- No critical UI/font/usability release blockers were detected.
- The scheduled full UI matrix was not selected for this invocation.
- The installed-browser platform matrix was not selected for this invocation.
- Catalog automation: 192/192 stable IDs (100.0%).
- This invocation selected 192/192 catalog IDs.

## Results By Tag

| Tag | Passed | Failed | Flaky | Skipped | Total |
| --- | ---: | ---: | ---: | ---: | ---: |
| @ai | 31 | 0 | 0 | 0 | 31 |
| @core | 65 | 0 | 0 | 0 | 65 |
| @files | 17 | 0 | 0 | 0 | 17 |
| @font | 3 | 0 | 0 | 0 | 3 |
| @network | 29 | 0 | 0 | 3 | 32 |
| @persistence | 24 | 0 | 0 | 0 | 24 |
| @platform | 1 | 0 | 0 | 5 | 6 |
| @security | 60 | 0 | 0 | 1 | 61 |
| @smoke | 8 | 0 | 0 | 0 | 8 |
| @soak | 0 | 0 | 0 | 2 | 2 |
| @ui | 22 | 0 | 0 | 3 | 25 |
| @ui-critical | 2 | 0 | 0 | 1 | 3 |
| @ui-full | 0 | 0 | 0 | 1 | 1 |
| @usability | 14 | 0 | 0 | 1 | 15 |
| @visual | 1 | 0 | 0 | 2 | 3 |

## Results By Product Surface

| Surface | Passed | Failed | Flaky | Skipped | Total |
| --- | ---: | ---: | ---: | ---: | ---: |
| Advanced Testing | 8 | 0 | 0 | 0 | 8 |
| AI Manual-First | 8 | 0 | 0 | 0 | 8 |
| AI-First | 12 | 0 | 0 | 0 | 12 |
| AIOP | 3 | 0 | 0 | 0 | 3 |
| Application Shell | 10 | 0 | 0 | 0 | 10 |
| Automate | 9 | 0 | 0 | 0 | 9 |
| Data & Persistence | 5 | 0 | 0 | 0 | 5 |
| Files & Reports | 9 | 0 | 0 | 0 | 9 |
| Findings | 9 | 0 | 0 | 0 | 9 |
| HTTP/S Traffic | 12 | 0 | 0 | 0 | 12 |
| Identity Lab | 5 | 0 | 0 | 2 | 7 |
| Intercept | 8 | 0 | 0 | 0 | 8 |
| Plugins | 10 | 0 | 0 | 0 | 10 |
| Projects & Sessions | 8 | 0 | 0 | 0 | 8 |
| Repeater | 10 | 0 | 0 | 0 | 10 |
| Resilience | 2 | 0 | 0 | 2 | 4 |
| Scope | 7 | 0 | 0 | 0 | 7 |
| Sitemap | 3 | 0 | 0 | 0 | 3 |
| SSL & Proxy | 4 | 0 | 0 | 3 | 7 |
| UI, Typography & Usability | 22 | 0 | 0 | 3 | 25 |
| WebSocket | 7 | 0 | 0 | 0 | 7 |
| Workflows | 11 | 0 | 0 | 0 | 11 |

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
| 1 | **REG-WF-007** [REG-WF-007] @network @security blocks an active workflow with no selected capture | passed | 33.4s | 1 |
| 2 | **REG-WS-006** [REG-WS-006] @security shows a bounded WebSocket replay error without disturbing HTTP evidence | passed | 32.5s | 1 |
| 3 | **REG-UI-006** [REG-UI-006] @ui passes every view at laptop and default layouts | passed | 20.7s | 1 |
| 4 | **REG-AIF-003** [REG-AIF-003] @ai @security enforces visible tool, replay, workflow, capture-sample, and runtime budgets | passed | 12.5s | 1 |
| 5 | **REG-UI-005** [REG-UI-005] @ui @usability reaches required controls in all twelve views at minimum size | passed | 8.4s | 1 |
| 6 | **REG-AUTO-008** [REG-AUTO-008] @network retries only a failed Automate attempt after fixture recovery | passed | 7.1s | 1 |
| 7 | **REG-UI-008** [REG-UI-008] @ui @usability keeps critical workflows reachable at 125% and 150% zoom | passed | 7.1s | 1 |
| 8 | **REG-UI-025** [REG-UI-025] @ui @visual @usability @ui-critical preserves clarity and hierarchy below 100% zoom | passed | 7.1s | 1 |
| 9 | **REG-AIF-004** [REG-AIF-004] @ai pauses a delayed planner and resumes the same durable run | passed | 6.9s | 1 |
| 10 | **REG-AUTO-006** [REG-AUTO-006] @network pauses and resumes a real slow Automate session without duplicate sends | passed | 6.9s | 1 |

## Application Startup Distribution

Samples: 185 · min 1.0s · median 1.1s · p95 1.3s · max 1.9s.

## Skipped Coverage Gaps

- **REG-SSL-005** [REG-SSL-005] @platform launches the supported isolated browser through Radar to the local lab
- **REG-SSL-006** [REG-SSL-006] @platform @security detaches an active browser identity when the project changes
- **REG-SSL-007** [REG-SSL-007] @platform handles an occupied preferred debugging port and remains usable
- **REG-ID-003** [REG-ID-003] @platform @network activates a scoped dedicated identity and attributes its real captures
- **REG-ID-004** [REG-ID-004] @platform @network records healthy and failed dedicated identity verification semantics
- **REG-RES-003** [REG-RES-003] @soak repeats demo load, navigation, filtering, and project state checks fifty times
- **REG-RES-004** [REG-RES-004] @soak @network sustains a bounded high-volume capture and replay set
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
