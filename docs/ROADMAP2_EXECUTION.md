# Roadmap 2 Execution Slices

This checklist tracks Roadmap 2 implementation in the order Radar should ship it. Slices are marked complete only after code, focused tests, documentation, and practical verification are done.

Detailed implementation slices for finishing Phase B and Phase C live in `docs/PHASE_BC_EXECUTION_PLAN.md`. That plan is the acceptance checklist for unit coverage, renderer coverage, AI-First policy coverage, README updates, user guide updates, manual QA updates, and release-gate commands for B2-B6 and C0-C6.

## Phase A - Release Hardening

| Slice | Status | Notes |
| --- | --- | --- |
| A1. SQLite schema migrations with compatibility tests | Complete | Added `schema_migrations`, version 13 bootstrap migration, legacy compatibility tests, newer-schema guard, README/user-guide notes, and migration conventions. Verified with `pnpm lint`, `pnpm test:unit`, and `pnpm build`. |
| A2. Seeded demo project | Complete | Added a dedicated demo seed module, Manual-First Load Demo control, local IPC/preload API, synthetic captures/frames/findings/workflows/plugins/Advanced signals/AI history, docs, and tests. Verified with `pnpm lint`, `pnpm test:unit`, `pnpm build`, and `pnpm screenshots`. |
| A3. Crash-safe write checks | Complete | Wrapped session creation, findings, workflow runs, plugin records, and agent run/timeline writes in immediate transactions. Added rollback tests for failed parent metadata updates. Verified with `pnpm lint`, `pnpm test:unit`, and `pnpm build`; no screenshot update required. |
| A4. Large-dataset performance tests | Complete | Added a high-volume local-store regression test covering 900 captures, 1500 WebSocket frames, 300 findings, and 60 agent runs with timelines, including capped read assertions and runtime budget. Verified with `pnpm lint`, `pnpm test:unit`, and `pnpm build`; no screenshot update required. |
| A5. Twelve-view manual QA checklist | Complete | Added `docs/MANUAL_QA_CHECKLIST.md` covering preflight, persistent shell behavior, all twelve views, AI-First safety, and local data checks. Linked it from README and the user guide. Documentation-only slice; no screenshot update required. |
| A6. Naming drift cleanup | Complete | Standardized user-facing copy around Project and Session, documented internal `LocalProfile`/workspace naming in code conventions, and left browser/proxy profile terms intact. |

## Phase B - Projects, Search, And Handoff

| Slice | Status | Notes |
| --- | --- | --- |
| B1. Project terminology and model | Complete | Covered by A6: user-facing UI/docs now use Project and Session, while code conventions document existing `LocalProfile`/workspace internals. |
| B2. Global search | Complete | Added shared global search contracts/helpers, `search:global` IPC/preload API, scoped search across captures, WebSocket frames, Repeater drafts/history/collections, findings, workflows/runs, plugins, Advanced signals, and saved filters, a docked renderer overlay with jump-to-source behavior, README/user-guide/manual-QA docs, and focused shared/UI tests. Verified with `pnpm lint`, `pnpm test:unit`, `pnpm build`, and `pnpm screenshots`. |
| B3. Project notes and saved views | Complete | Added workspace-local project notes and saved views with schema 14 persistence, normalized shared contracts, IPC/preload APIs, global search indexing, a persistent Notes panel, README/user-guide/manual-QA docs, focused shared/local-store/UI tests, and refreshed screenshots. Verified with `pnpm vitest run shared/projectArtifacts.test.ts shared/globalSearch.test.ts electron/localStore.test.ts src/App.test.tsx`, `pnpm lint`, `pnpm test:unit`, `pnpm build`, and `pnpm screenshots`. |
| B4. Project bundle export/import | Complete | Added versioned project bundle contracts, redaction profiles, bundle serialization/parsing, import preview conflicts, inactive proposed scope targets, Electron export/import IPC with file picker/path support, apply-to-imported-session behavior without scope widening or execution, renderer controls in Notes, README/user-guide/manual-QA docs, focused shared/UI tests, and refreshed screenshots. Verified with `pnpm vitest run shared/projectBundle.test.ts src/App.test.tsx`, `pnpm lint`, `pnpm test:unit`, `pnpm build`, and `pnpm screenshots`. |
| B5. Handoff packages | Complete | Added focused handoff package contracts, reviewed-finding/default evidence selection, optional draft findings/project notes/workflows/Repeater collections, embedded Markdown summary, Electron preview/write IPC, renderer controls in Notes, README/user-guide/manual-QA docs, focused shared/UI tests, and refreshed screenshots. Verified with `pnpm vitest run shared/handoffPackage.test.ts src/App.test.tsx`, `pnpm lint`, `pnpm test:unit`, `pnpm build`, and `pnpm screenshots`. |
| B6. Conflict-safe import | Complete | Changed bundle conflicts to skip semantics, preserved existing workspace filters/notes/views/workflows/collections/plugins during apply, deduped duplicate imported captures/WebSocket frames/findings within new imported sessions, returned skipped counts, kept proposed scope inactive, updated user-facing copy/docs, and refreshed screenshots. Verified with `pnpm vitest run shared/projectBundle.test.ts src/App.test.tsx`, `pnpm lint`, `pnpm test:unit`, `pnpm build`, and `pnpm screenshots`. |

## Phase C - AI-First Observation And Run Profiles

| Slice | Status | Notes |
| --- | --- | --- |
| C0. AI-First observation console | Complete | Expanded the AI-First console into a non-truncated observation transcript with phase/status cards, rationale summaries, visible targets, policy-block/failure cards, and recovery actions for retry, refresh, skip/continue, stop, and draft-finding prompts. |
| C1. Run profile presets | Complete | Added Passive Map, Auth Review, API Hardening, Header/Cookie Review, Advanced API Review, and Report From Evidence profiles with persisted `profileId` on agent runs and profile-filtered tool access. |
| C2. Visible run budgets | Complete | Added visible chips and enforced policy fields for steps, replay, workflow requests, capture sample, timeout, and raw-context policy, including workflow-request budget checks. |
| C3. AI-visible context summaries | Complete | Added redacted AI context summaries for sitemap, findings, Advanced signals, workflow definitions/runs, project notes, saved views, and local run memory via `getAgentContextSummary`. |
| C4. Finding quality gates | Complete | Added quality gates requiring evidence refs, affected assets, reproduction notes, severity rationale, remediation, and uncertainties before AI draft findings enter Findings; rejected drafts stay in the transcript. |
| C5. Draft-to-review flows | Complete | Added review-first workflow draft preparation alongside existing Repeater/Automate draft preparation; AI loads drafts into visible controls and the operator retains Save/Run/Transmit approval. |
| C6. Local run memory | Complete | Added project-scoped run memory persistence, manual memory creation/search/delete, transcript proposal confirm/dismiss controls, and memory summaries for future AI-First context. |

## Phase D - Reporting And Retest Operations

| Slice | Status | Notes |
| --- | --- | --- |
| D1. Report section builder | Pending | Executive summary, methodology, scope, findings, appendix, retest matrix, change log. |
| D2. Finding dedupe and merge suggestions | Pending | Keep operator-controlled merges. |
| D3. Assignment and filter depth | Pending | Owner, component, status, severity, and retest filters. |
| D4. Local report templates | Pending | Template storage remains local-only. |
| D5. Retest matrix generation | Pending | Compare reviewed findings across sessions. |
| D6. Export presets | Pending | Internal notes, client report, and raw technical appendix. |

## Phase E - Advanced API/Auth Depth

| Slice | Status | Notes |
| --- | --- | --- |
| E1. Import previews to Repeater collections | Pending | OpenAPI/Postman items become reviewed drafts only. |
| E2. Advanced-generated workflow drafts | Pending | Operations, mutations, auth matrix rows, and parameter inventory feed visible workflow drafts. |
| E3. GraphQL helper depth | Pending | Grouping, variable templates, introspection diffing, batching review. |
| E4. Auth-state comparison | Pending | Compare saved browser states against endpoint inventory. |
| E5. Sensitive-data rule packs | Pending | Local rule packs, severity, and ignore lists. |
| E6. Cache/header behavior workflows | Pending | Bounded workflows with explicit operator approval. |

## Phase F - Plugin Execution And SDK Panels

| Slice | Status | Notes |
| --- | --- | --- |
| F1. Sandboxed plugin execution | Pending | Approved local plugins only. |
| F2. Permissioned panel rendering | Pending | Scoped APIs and visible panel state. |
| F3. Plugin audit logs | Pending | Log every SDK/API action. |
| F4. Version and compatibility checks | Pending | Update prompts and manifest warnings. |
| F5. Trust markers | Pending | First-party signing or trust labels. |
| F6. Plugin developer CLI | Pending | Validate manifests and run plugin tests locally. |

## Phase G - Visual Workflow Authoring

| Slice | Status | Notes |
| --- | --- | --- |
| G1. Workflow graph/editor | Pending | Existing step kinds first. |
| G2. Branching and conditions | Pending | Visual validation before save/run. |
| G3. Reusable step templates | Pending | Headers, cookies, CORS, cache, metadata, auth replay, browser-open, Advanced checks. |
| G4. Dry-run validation | Pending | Required before active workflows run. |
| G5. Workflow diff/version history | Pending | Make revisions inspectable. |
| G6. AI-assisted visible drafts | Pending | AI output loads into the editor and remains a draft. |

## Phase H - Distribution And Update Polish

| Slice | Status | Notes |
| --- | --- | --- |
| H1. Notarized macOS builds | Pending | Release pipeline and docs. |
| H2. Signed Windows installers | Pending | Release pipeline and docs. |
| H3. Linux artifact verification | Pending | AppImage and Debian checks. |
| H4. Release notes from slices | Pending | Generate from completed execution entries. |
| H5. Local-only update checks | Pending | No project data leaves the machine. |
| H6. First-run demo onboarding | Pending | Built on the seeded demo project. |

## Current Next Slice

Phase A, Phase B, and Phase C are complete. Continue with **D1. Report section builder** when starting Roadmap 2 Phase D.
