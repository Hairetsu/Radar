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
| D1. Report section builder | Complete | Added report title, preset, executive summary, methodology, scope, limitations, findings, appendix, retest matrix, change log, copy/download, and client-report validation warnings. |
| D2. Finding dedupe and merge suggestions | Complete | Added shared merge scoring and an operator-controlled merge queue that combines evidence, assets, owner/assignee, severity, confidence, notes, and retest text only after a visible click. |
| D3. Assignment and filter depth | Complete | Findings now track component and assignee, filter by text/status/severity/owner-or-assignee/component, and show assignment context in the queue. |
| D4. Local report templates | Complete | Added local built-in report presets for internal notes, client reports, and raw technical appendices; no cloud template behavior was introduced. |
| D5. Retest matrix generation | Complete | Added shared retest matrix rows and report rendering for pending, passed, failed, accepted-risk, and not-ready states. |
| D6. Export presets | Complete | Report export options now apply internal-notes, client-report, and raw-technical-appendix presets with raw evidence remaining opt-in. |

## Phase E - Advanced API/Auth Depth

| Slice | Status | Notes |
| --- | --- | --- |
| E1. Import previews to Repeater collections | Complete | OpenAPI/Postman previews can save reviewed draft templates into Repeater collections or load a selected draft into Repeater without sending traffic. |
| E2. Advanced-generated workflow drafts | Complete | API imports, GraphQL operations, auth matrix rows, parameters, header signals, and secret signals can prepare visible workflow drafts for manual review. |
| E3. GraphQL helper depth | Complete | Added operation grouping, variable templates, host/type counts, batching review, and introspection review signals. |
| E4. Auth-state comparison | Complete | Added auth-state comparison rows across observed anonymous, bearer, basic, cookie, and mixed evidence for each endpoint. |
| E5. Sensitive-data rule packs | Complete | Added a local sensitive-data rule pack with rule ids, names, severities, enabled state, masked previews, and UI rule counts. |
| E6. Cache/header behavior workflows | Complete | Cache, CORS, host-header, redirect, and secret/header signals now prepare bounded visible workflows with explicit operator Save/Run approval. |

## Phase F - Plugin Execution And SDK Panels

| Slice | Status | Notes |
| --- | --- | --- |
| F1. Sandboxed plugin execution | Complete | Approved local plugins execute only through Radar's bounded typed SDK action runner; actions reuse scope, replay, workflow, and finding validation. |
| F2. Permissioned panel rendering | Complete | Approved `ui:panel` entries render in a no-script iframe sandbox; JavaScript panels are shown as source instead of being executed. |
| F3. Plugin audit logs | Complete | SDK actions, panel renders, and developer validation write workspace-local audit entries with plugin id, permission, result, summaries, and timing. |
| F4. Version and compatibility checks | Complete | Manifest preview, registry, install records, and validation surface SDK/min-Radar compatibility warnings. |
| F5. Trust markers | Complete | Plugin preview and registry show first-party, verified-local, local, or untrusted labels. |
| F6. Plugin developer CLI | Complete | `pnpm plugin:validate -- <plugin-path>` validates manifests, entry files, panel files, version shape, and SDK mismatch warnings. |

## Phase G - Visual Workflow Authoring

| Slice | Status | Notes |
| --- | --- | --- |
| G1. Workflow graph/editor | Complete | Existing workflow definitions now produce a visual node/edge graph alongside the raw JSON/YAML-like editor. |
| G2. Branching and conditions | Complete | Conditional steps show branch labels and dry-run skipped/runnable step sets. |
| G3. Reusable step templates | Complete | Headers, cookies, CORS, cache, metadata, active replay, and browser-open templates can be inserted into the current draft. |
| G4. Dry-run validation | Complete | The Workflows view validates draft definitions, required inputs, active request estimates, duplicate steps, skipped branches, and caps before operator save/run. |
| G5. Workflow diff/version history | Complete | Saved custom workflows append local revision records with compact field/step/input diffs. |
| G6. AI-assisted visible drafts | Complete | AI/Advanced-prepared workflow drafts load into the visible editor and stay unsaved until the operator clicks Save or Run. |

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

Phase A through Phase G are complete. Continue with the next roadmap slice by prioritizing scanner/content discovery, DOM/browser testing, or release-hardening items from `docs/PUBLIC_READINESS_AND_PARITY_PLAN.md`.
