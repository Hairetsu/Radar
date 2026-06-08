# Phase B/C Execution Plan

This plan expands Roadmap 2 Phase B and Phase C into shippable slices. Phase B finishes project-level navigation, search, notes, saved views, and file-based handoff. Phase C then deepens AI-First with a full observation console, run profiles, budgets, context summaries, quality gates, review flows, and local run memory.

Each slice must ship as a complete vertical change: shared contracts, local persistence, IPC/preload API, renderer workflow, AI-First impact, focused tests, README updates, user guide updates, and practical verification.

## Completion Bar

- Keep Manual-First complete before exposing AI-First access.
- Keep all new state local-first and session/project scoped.
- Validate, clamp, normalize, and fail closed at IPC and import boundaries.
- Add full unit coverage for every shared helper, store migration, IPC normalizer, import/export parser, AI policy gate, and renderer state reducer introduced by the slice.
- Add renderer tests for all new interactive flows, empty states, failure states, and recovery states.
- Add Electron/local-store tests for migrations, rollback behavior, large data reads, and incompatible schema handling when persistence changes.
- Add AI-First tests for visibility, scope policy, budget use, transcript entries, and failure paths when AI can read or prepare the new feature.
- Update `README.md` when the product surface, screenshots, stack, design notes, or high-level workflows change.
- Update `docs/USER_GUIDE.md` when install, launch, navigation, search, notes, export/import, handoff, AI-First, troubleshooting, or local-data behavior changes.
- Update `docs/MANUAL_QA_CHECKLIST.md` when there is a new operator workflow or AI-First safety behavior.
- Run `pnpm lint`, `pnpm test:unit`, and `pnpm build` before marking the slice complete. Run `pnpm screenshots` when visible screens change.

## Phase B - Projects, Search, And Handoff

### B2 - Global Search

Goal: search across local evidence and project artifacts without leaving Radar.

Deliverables:

- Shared `GlobalSearchQuery`, `GlobalSearchResult`, result-kind, match-range, and pagination contracts.
- Search indexes or query helpers covering HTTP/S captures, WebSocket frames, repeater history, findings, workflows, plugins, Advanced signals, project notes, and saved views.
- Scope-aware result filtering for traffic and frame evidence.
- IPC/preload methods for paged search, result open/focus, and saved recent searches.
- Renderer global search entry point with keyboard shortcut, filters, result grouping, empty/error states, and jump-to-source behavior.
- AI-First read-only search context if needed, with transcript entries when the agent loads a visible search.

Unit and integration coverage:

- Query parser tests for text, quoted terms, kind filters, severity/status filters, host/path filters, and invalid syntax.
- Ranking and pagination tests with mixed evidence kinds.
- Scope filtering tests proving out-of-scope captures/frames are omitted.
- Local-store tests for indexed reads and large result sets.
- Renderer tests for keyboard open, filtering, empty state, error state, and result navigation.
- AI-First tests proving search is read-only and visible when exposed.

Docs:

- README: add global search to the MVP surface and workspace tour.
- User guide: add a Global Search section, query examples, result kinds, and troubleshooting.
- Manual QA checklist: add search across captures, frames, findings, workflows, and notes.

### B3 - Project Notes And Saved Views

Goal: make project context and repeated workspace layouts first-class local objects.

Deliverables:

- Shared contracts for project notes, note metadata, saved views, saved view filters, active view target, and timestamps.
- Local persistence with migrations for notes and saved views under the active project/workspace.
- Renderer notes panel with create/edit/delete, Markdown preview if already supported by existing dependencies, and unsaved-state handling.
- Saved view controls for current tab, filters, selected evidence, and relevant layout state.
- Restore saved views without widening scope or executing actions.
- AI-First read-only note/saved-view summaries, plus visible load of a saved view when allowed.

Unit and integration coverage:

- Note normalization tests for title/body length, timestamps, and empty input.
- Saved view normalization tests for allowed views, filter payloads, stale selected evidence, and unknown fields.
- Migration and rollback tests.
- Renderer tests for create/edit/delete note, save current view, restore view, stale target fallback, and permission-free behavior.
- AI-First tests proving it cannot silently alter notes or saved views unless a future explicit tool is added.

Docs:

- README: add project notes and saved views to project/session behavior.
- User guide: document notes, saved views, restore behavior, local storage, and troubleshooting.
- Manual QA checklist: add note lifecycle and saved-view restore checks.

### B4 - Project Bundle Export/Import

Goal: move local project data between machines or teammates with explicit redaction and no automatic execution.

Deliverables:

- Versioned bundle manifest contract with project metadata, sessions, scope, captures, frames, findings, workflows, plugins metadata, Advanced signals, notes, saved views, and replay collections where available.
- Redaction profiles: metadata-only, redacted evidence, reviewed findings package, and explicit raw evidence.
- Export builder with deterministic ids, size caps, redaction summaries, and warnings.
- Import preview that validates schema, displays contents, flags conflicts, and shows scope changes without applying them.
- Import apply path that never widens active scope automatically and never executes workflows, plugins, replay, or AI actions.
- IPC/preload methods for export preview, write bundle, import preview, and import apply.

Unit and integration coverage:

- Bundle manifest validation tests for version, required fields, unknown fields, and corrupt JSON.
- Redaction tests proving secrets, raw headers/bodies, cookies, auth state, and raw payloads are excluded unless explicitly selected.
- Import preview tests for duplicate ids, missing sessions, incompatible versions, and proposed scope differences.
- Apply tests proving imported scope is inactive until operator confirmation.
- Filesystem IPC tests with temp directories and path validation.
- Renderer tests for export choices, redaction warnings, import preview, conflict display, and cancelled import.

Docs:

- README: add project bundle export/import to local-first handoff behavior.
- User guide: document export presets, import preview, redaction choices, conflict handling, and local-data implications.
- Manual QA checklist: add redacted export/import, raw export opt-in, and conflict-safe import checks.

### B5 - Handoff Packages

Goal: create focused deliverables for another operator or report writer without exporting an entire project.

Deliverables:

- Shared contracts for handoff package manifest, selected evidence refs, reviewed findings, scope summary, workflow definitions, replay collections, notes, and redaction profile.
- Handoff builder from selected findings/evidence and current project metadata.
- Review screen with included refs, redaction summary, missing evidence warnings, and output format.
- Optional Markdown/HTML handoff summary using existing report export primitives where possible.
- Import preview path that creates a new local project/session or attaches to an existing one only after explicit operator choice.

Unit and integration coverage:

- Package normalization and validation tests.
- Evidence-ref resolution tests for captures, frames, replay attempts, automate results, workflow runs, and AI timeline entries.
- Redaction tests matching project bundle redaction behavior.
- Renderer tests for selecting findings/evidence, previewing package contents, writing package, and import preview.
- Local-store tests for package import into new and existing projects without id collisions.

Docs:

- README: add handoff packages to reporting/project workflow.
- User guide: document creating, reviewing, exporting, and importing handoff packages.
- Manual QA checklist: add reviewed-finding handoff and selected-evidence handoff checks.

### B6 - Conflict-Safe Import

Goal: make repeated imports deterministic and safe.

Deliverables:

- Conflict model for duplicate projects, sessions, captures, frames, findings, workflows, notes, saved views, and handoff packages.
- Deterministic merge strategies: keep existing, import as copy, attach as new session, skip, and manually resolve naming conflicts.
- Import audit entries stored locally with bundle id, source metadata, decisions, and warnings.
- UI conflict resolver with batch decisions and per-item overrides.
- Scope-change review that requires explicit confirmation after import and never activates imported targets by default.

Unit and integration coverage:

- Conflict detection tests across every imported object kind.
- Merge-strategy tests for duplicate ids, same content/different id, same id/different content, and stale references.
- Rollback tests when one object fails during import apply.
- Renderer tests for batch decisions, per-item overrides, warnings, and cancel behavior.
- Security tests proving imported plugins are disabled/pending, workflows do not run, and imported scope is inactive.

Docs:

- README: summarize safe import behavior.
- User guide: document conflict choices, import audit, inactive imported scope, and troubleshooting.
- Manual QA checklist: add duplicate import and scope-safety checks.

## Phase C - AI-First Observation And Run Profiles

### C0 - AI-First Observation Console

Goal: make AI-First runs fully observable and recoverable before adding more autonomous profiles.

Deliverables:

- Implement `docs/PHASE_C_AI_FIRST_OBSERVATION_CONSOLE.md`.
- Shared transcript model with call ids, parent ids, statuses, visible targets, summaries, error categories, evidence refs, recovery actions, and redaction caps.
- Agent runtime events for queued, running, succeeded, failed, policy-blocked, cancelled, skipped, and resumed states.
- Persistence migration for full, paged, durable transcript entries.
- Docked transcript console with action cards, full history, filtering/search, failed-step cards, expandable redacted details, and saved-run restore.
- Visible target highlighting for Radar views, evidence rows, drafts, workflow runs, and browser targets.
- Recovery controls: retry, refresh-and-retry, skip, continue, stop, and convert selected transcript entries to note/draft finding where policy allows.

Unit and integration coverage:

- Shared transcript normalization, redaction, status transition, visible target, and recovery policy tests.
- Agent runtime tests for provider error, tool error, policy block, cancellation, skip, and resume.
- Persistence tests for long transcripts, paged reads, crash-safe writes, and migration compatibility.
- Renderer tests proving history is not limited to the last six entries, failed cards stay visible, filters work, and saved failed runs restore.
- Integration test for `getStorageState` followed by failed `analyzeSecurityHeaders` with retry/continue choices.

Docs:

- README: update AI-First surface and screenshots.
- User guide: update AI-First workflow, failure recovery, transcript search, and troubleshooting.
- Manual QA checklist: add failure-card, transcript restore, visible highlighting, and recovery checks.

### C1 - Run Profile Presets

Goal: make common AI-First runs predictable and bounded.

Deliverables:

- Shared run profile contracts for Passive Map, Auth Review, API Hardening, Header/Cookie Review, Advanced API Review, and Report From Evidence.
- Profile-specific allowed tools, budgets, raw-context policy, replay/workflow permissions, and quality gates.
- Renderer profile picker tied to the AI-First goal prompt and observation console.
- Agent planner prompt/context updates that force profile constraints into every decision.
- Local persistence of selected profile on each run.

Unit and integration coverage:

- Profile normalization tests for defaults, invalid profile ids, and migrated runs.
- Policy tests proving each profile only exposes allowed tools.
- Planner context tests proving profile budgets and raw-context policy are included.
- Renderer tests for profile selection, disabled controls, and persisted run display.
- AI-First tests for at least one successful passive profile and one blocked disallowed tool.

Docs:

- README: list AI-First run profiles.
- User guide: document when to use each profile and what each can/cannot do.
- Manual QA checklist: add profile-selection and blocked-tool checks.

### C2 - Visible Run Budgets

Goal: make cost, time, replay, capture, workflow, and context limits visible and enforceable.

Deliverables:

- Shared budget contract for max steps, timeout, replay count, workflow runs, capture sample, raw-context policy, provider tokens where available, and run memory writes.
- Budget state emitted into transcript and console header.
- Enforcement in agent runtime before tool execution.
- Budget exhaustion states with operator-facing recovery choices.

Unit and integration coverage:

- Budget normalization and decrement tests.
- Runtime tests for step, timeout, replay, workflow, and capture-sample exhaustion.
- Renderer tests for budget display, warning state, exhausted state, and stop behavior.
- AI-First tests proving exhausted budgets cannot be bypassed by planner output.

Docs:

- README: summarize visible budget model.
- User guide: document budget fields, exhausted states, and troubleshooting.
- Manual QA checklist: add budget exhaustion checks.

### C3 - AI-Visible Context Summaries

Goal: give AI-First enough local context to reason without requesting raw broad evidence.

Deliverables:

- Read-only summaries for sitemap, findings, Advanced signals, workflow catalog/history, notes, saved views, search results, and handoff/import state where useful.
- Shared summary builders with redaction and scope checks.
- Agent tools or context payloads that expose summaries through the transcript.
- Renderer links from summary transcript entries to source views.

Unit and integration coverage:

- Summary builder tests for empty state, populated state, redaction, caps, stale refs, and scope filtering.
- AI tool tests for read-only behavior and transcript entries.
- Renderer tests for link-to-source behavior.

Docs:

- README: update AI-First capability summary.
- User guide: document AI-visible summaries and raw-context boundaries.
- Manual QA checklist: add summary visibility checks.

### C4 - Finding Quality Gates

Goal: prevent low-evidence AI findings from entering the durable inbox.

Deliverables:

- Shared quality gate contract requiring evidence refs, affected assets, reproduction notes, uncertainty, severity rationale, and remediation.
- Normalizer that rejects or downgrades incomplete AI findings.
- Console feedback showing why a draft finding was rejected or needs review.
- Draft findings remain local and Manual-First reviewed before export.

Unit and integration coverage:

- Gate tests for missing evidence, stale refs, out-of-scope refs, missing reproduction, missing uncertainty, and valid findings.
- Agent finish tests proving invalid findings fail or become rejected transcript entries.
- Renderer tests for rejected finding cards and operator copy-to-note behavior.
- Local-store tests proving rejected findings do not enter reviewed/exportable state.

Docs:

- README: summarize AI draft finding quality gates.
- User guide: document AI draft finding review and rejection states.
- Manual QA checklist: add valid and invalid AI finding checks.

### C5 - Draft-To-Review Flows

Goal: let AI prepare useful manual work without executing hidden risky actions.

Deliverables:

- AI-prepared Repeater drafts, Workflow drafts, and possibly saved-view/search drafts that load into visible controls.
- Operator approval controls for transmit, workflow run, save workflow, or discard.
- Transcript links from draft creation to the visible review surface.
- Audit state recording who/what prepared the draft and who approved execution.

Unit and integration coverage:

- Draft normalization tests for method, URL, headers, body caps, workflow step kinds, and stale refs.
- Policy tests proving AI cannot transmit or save/execute without operator approval.
- Renderer tests for visible draft load, approve, discard, and stale-evidence warnings.
- Agent tests proving draft preparation emits transcript entries and visible targets.

Docs:

- README: update AI-First prepare/review flow.
- User guide: document reviewing AI-prepared Repeater and Workflow drafts.
- Manual QA checklist: add draft approve/discard checks.

### C6 - Local Run Memory

Goal: preserve tested hypotheses, dismissed leads, and retest notes locally per project without creating hidden autonomy.

Deliverables:

- Shared run memory contract for hypothesis, status, source run, evidence refs, dismissed reason, retest state, and timestamps.
- Local persistence under the project/workspace, not a cloud service.
- Renderer memory panel or section inside AI-First console with search/filter and source links.
- AI-First read/write policy: agent can propose memory entries; operator confirmation is required for durable writes unless a profile explicitly allows bounded memory writes.
- Memory summaries available to future runs through redacted local context.

Unit and integration coverage:

- Memory normalization tests for status, timestamps, evidence refs, and length caps.
- Persistence migration, rollback, and large-read tests.
- Policy tests for proposed vs. confirmed memory writes.
- Renderer tests for create/confirm/dismiss/search/source-link flows.
- AI context tests proving memory summaries are redacted, capped, and project-scoped.

Docs:

- README: add local run memory to AI-First and local-first behavior.
- User guide: document memory entries, confirmation behavior, deletion, privacy, and troubleshooting.
- Manual QA checklist: add proposed memory, confirmed memory, and project isolation checks.

## Sequencing

1. Ship B2 Global Search first because later notes, saved views, handoff packages, and AI summaries can link into it.
2. Ship B3 Project Notes And Saved Views before exports so project context has a stable local model.
3. Ship B4 Project Bundle Export/Import before focused handoff packages.
4. Ship B5 Handoff Packages on top of bundle/redaction primitives.
5. Ship B6 Conflict-Safe Import after both full bundles and handoff packages exist.
6. Ship C0 AI-First Observation Console before any new run profile.
7. Ship C1 and C2 together if practical, because profiles and budgets should be visible as one operator contract.
8. Ship C3 before C4-C6 so the agent has structured local context and evidence links.
9. Ship C4 before C5 so AI-prepared findings and review flows inherit evidence quality gates.
10. Ship C6 last because it depends on stable transcripts, context summaries, and quality-state semantics.

## Phase Exit Criteria

Phase B is complete when:

- Global search spans every planned local evidence/artifact kind.
- Notes and saved views are persisted, searchable, and restorable.
- Project bundle export/import supports redaction, preview, conflict handling, and inactive imported scope.
- Handoff packages can move reviewed findings and selected evidence without exporting an entire project.
- Duplicate imports are deterministic, reversible where practical, and audited.
- README, user guide, manual QA checklist, tests, lint, unit tests, and build are complete.

Phase C is complete when:

- AI-First runs have a full durable observation console with recoverable failed steps.
- Run profiles and budgets are visible, enforced, and persisted.
- AI-visible summaries cover sitemap, findings, Advanced, workflows, notes/saved views, and search context with redaction.
- AI findings pass quality gates before entering the durable draft inbox.
- AI-prepared Repeater and Workflow drafts require visible operator review before risky actions.
- Local run memory stores tested hypotheses and retest state under the active project only.
- README, user guide, manual QA checklist, tests, lint, unit tests, build, and screenshots where needed are complete.
