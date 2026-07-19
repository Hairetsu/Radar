# Radar Regression Report

Generated: 2026-07-19T17:12:55.183Z
Overall result: **PASSED**
Workers: 6
Wall time: 158.3s
Aggregate workflow time: 817.8s

## Outcome

| Passed | Failed | Flaky | Skipped | Selected |
| ---: | ---: | ---: | ---: | ---: |
| 157 | 0 | 0 | 7 | 164 |

## Release Signals

- No blocking workflow failures were detected.
- No flaky workflows were detected.
- 7 selected workflow(s) were skipped and remain explicit coverage gaps for this run.
- 4 workflow(s) exceeded 10 seconds; review the slowest-workflow table for startup, polling, or IPC latency.
- No security-tagged release blockers were detected.
- Catalog automation: 164/164 stable IDs (100.0%).
- This invocation selected 164/164 catalog IDs.

## Results By Tag

| Tag | Passed | Failed | Flaky | Skipped | Total |
| --- | ---: | ---: | ---: | ---: | ---: |
| @ai | 27 | 0 | 0 | 0 | 27 |
| @core | 65 | 0 | 0 | 0 | 65 |
| @files | 17 | 0 | 0 | 0 | 17 |
| @network | 29 | 0 | 0 | 3 | 32 |
| @persistence | 24 | 0 | 0 | 0 | 24 |
| @platform | 0 | 0 | 0 | 5 | 5 |
| @security | 58 | 0 | 0 | 1 | 59 |
| @smoke | 7 | 0 | 0 | 0 | 7 |
| @soak | 0 | 0 | 0 | 2 | 2 |

## Results By Product Surface

| Surface | Passed | Failed | Flaky | Skipped | Total |
| --- | ---: | ---: | ---: | ---: | ---: |
| Advanced Testing | 8 | 0 | 0 | 0 | 8 |
| AI Manual-First | 8 | 0 | 0 | 0 | 8 |
| AI-First | 12 | 0 | 0 | 0 | 12 |
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
| WebSocket | 7 | 0 | 0 | 0 | 7 |
| Workflows | 11 | 0 | 0 | 0 | 11 |

## Changes From Prior Local Report

No newly failing selected IDs.

Newly fixed: REG-WF-004.

## Security Release Blockers

None.

## Failures And Artifacts

No failed workflows.

## Slowest Workflows

| Rank | Workflow | Outcome | Duration | Attempts |
| ---: | --- | --- | ---: | ---: |
| 1 | **REG-WF-007** [REG-WF-007] @network @security blocks an active workflow with no selected capture | passed | 36.0s | 1 |
| 2 | **REG-WS-006** [REG-WS-006] @security shows a bounded WebSocket replay error without disturbing HTTP evidence | passed | 33.6s | 1 |
| 3 | **REG-AIF-006** [REG-AIF-006] @ai records retry, retry-with-evidence, skip, and stop recovery choices | passed | 13.0s | 1 |
| 4 | **REG-AIF-003** [REG-AIF-003] @ai @security enforces visible tool, replay, workflow, capture-sample, and runtime budgets | passed | 12.1s | 1 |
| 5 | **REG-AIF-004** [REG-AIF-004] @ai pauses a delayed planner and resumes the same durable run | passed | 8.4s | 1 |
| 6 | **REG-AUTO-008** [REG-AUTO-008] @network retries only a failed Automate attempt after fixture recovery | passed | 8.3s | 1 |
| 7 | **REG-AIF-012** [REG-AIF-012] @ai @persistence restores completed, stopped, and failed AI runs after restart | passed | 8.1s | 1 |
| 8 | **REG-HTTP-012** [REG-HTTP-012] @network @security keeps authorization and cookie fixture values out of search and default export | passed | 8.0s | 1 |
| 9 | **REG-HTTP-011** [REG-HTTP-011] @network safely captures redirects, query strings, JSON, form, empty, and truncated bodies | passed | 8.0s | 1 |
| 10 | **REG-AIF-009** [REG-AIF-009] @ai @persistence confirms, dismisses, searches, and restores project run memory | passed | 7.9s | 1 |

## Application Startup Distribution

Samples: 158 · min 1.7s · median 2.7s · p95 4.4s · max 5.2s.

## Skipped Coverage Gaps

- **REG-SSL-005** [REG-SSL-005] @platform launches the supported isolated browser through Radar to the local lab
- **REG-SSL-006** [REG-SSL-006] @platform @security detaches an active browser identity when the project changes
- **REG-SSL-007** [REG-SSL-007] @platform handles an occupied preferred debugging port and remains usable
- **REG-ID-003** [REG-ID-003] @platform @network activates a scoped dedicated identity and attributes its real captures
- **REG-ID-004** [REG-ID-004] @platform @network records healthy and failed dedicated identity verification semantics
- **REG-RES-003** [REG-RES-003] @soak repeats demo load, navigation, filtering, and project state checks fifty times
- **REG-RES-004** [REG-RES-004] @soak @network sustains a bounded high-volume capture and replay set

## Catalog Coverage

All 164 specified catalog cases have executable Playwright registrations.
No registered test IDs fall outside the specification.

## Artifact Guide

- [`html/index.html`](html/index.html): interactive report with steps and attachments.
- [`results.json`](results.json): complete Playwright machine-readable output.
- [`summary.json`](summary.json): compact status, tag, duration, and stable-ID data for CI ingestion.
- `results/`: retained screenshots, traces, videos, and error context for failures.

## Tested Architecture

Each test launches a real Electron main process and renderer with an isolated user-data directory, SQLite store, proxy port, browser-debug port, and cleanup lifecycle. Playwright workers therefore run separate Radar use cases concurrently without sharing project evidence or browser profiles. Suite-owned loopback HTTP/S, WebSocket, deterministic AI, and file fixtures exercise real IPC and persistence boundaries without transmitting to external targets.
