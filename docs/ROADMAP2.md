# Radar Roadmap 2

This is the post-MVP roadmap after the Phase 1-8 workbench coverage is in place. The goal is no longer to add missing core tabs. The goal is to turn Radar from a broad local-first workbench into a dependable daily driver with release quality, stronger project workflows, deeper AI-First operation, and professional handoff/reporting.

## Current Position

Radar now has the complete first-generation workbench surface:

- HTTP/S and WebSocket evidence capture.
- Scope, proxy, SSL, and dedicated browser control.
- Intercept, match/replace, Repeater, Automate, Findings, Workflows, Plugins, Advanced, Sitemap, and report export.
- Local persistence for profiles, sessions, findings, workflows, plugins, SSL events, AI-First runs, and project-scoped AI run memory.
- Manual-First controls for risky operations and AI-First profiles/tools that stay visible, scoped, budgeted, recoverable, and bounded.

The next work should favor reliability, continuity across engagements, and depth inside the workflows operators repeat every day.

## Roadmap 2 Principles

- Keep Radar local-first. Add handoff/import/export before hosted collaboration.
- Prefer better operator loops over more tabs.
- Make every AI-First improvement observable in the existing workbench.
- Treat packaging, migrations, performance, and demo data as product features.
- Turn Advanced and Workflows into useful operators' assistants without hidden active testing.
- Keep plugin execution and external extensibility permissioned, auditable, and reversible.

## Priority Order

1. **Release hardening and demo readiness.**
2. **Project model, global search, and handoff.**
3. **AI-First observation console, run profiles, and quality gates.**
4. **Report builder depth and retest matrices.**
5. **Advanced API/auth workflow generation.**
6. **Plugin sandbox execution and SDK panels.**
7. **Visual workflow authoring.**
8. **Packaging, updates, and distribution polish.**

## Phase A - Release Hardening

Purpose: make the current app reliable enough to ship, demo, and test repeatedly.

Slices:

- Add explicit SQLite schema migrations with compatibility tests.
- Add a seeded demo project with captures, frames, findings, workflows, plugins, Advanced signals, and AI run history.
- Add crash-safe write checks for sessions, findings, workflow runs, plugin records, and agent timelines.
- Add large-dataset performance tests for captures, WebSocket frames, findings, and agent timelines.
- Add a manual QA checklist that matches the twelve-view console.
- Fix naming drift between profile, workspace, session, and project concepts.

Exit criteria:

- Existing local data survives app restart, schema upgrades, and profile/session switches.
- Demo data can refresh screenshots and support a full product walkthrough.
- `pnpm lint`, `pnpm test:unit`, `pnpm build`, and `pnpm screenshots` remain dependable release gates.

## Phase B - Projects, Global Search, And Handoff

Purpose: make engagement setup, navigation, and file-based collaboration feel first class.

Slices:

- Introduce a first-class project layer or rename the current profile/workspace model so client/project/session terminology is clear.
- Add global search across captures, WebSocket frames, repeater history, findings, workflows, plugins, Advanced signals, and notes.
- Add project notes and saved views.
- Add export/import for project bundles with clear redaction choices.
- Add handoff packages for reviewed findings, selected evidence, scope, workflows, and replay collections.
- Add conflict-safe import behavior for duplicate captures, sessions, findings, and workflows.

Exit criteria:

- An operator can start a project, search across all local evidence, and hand off a redacted bundle without using the filesystem manually.
- Imported bundles cannot widen active scope or execute actions automatically.

## Phase C - AI-First Observation And Run Profiles

Purpose: make AI-First observable, recoverable, and predictable for common assessment workflows.

Slices:

- Add an AI-First observation console before adding more autonomy: a docked chat/transcript surface with the full run history, durable streaming updates, user messages, tool calls, tool results, evidence refs, policy blocks, and failed steps. The UI may virtualize rendering for performance, but it must not truncate the saved or inspectable run history.
- Add operator-facing rationale summaries for each agent decision without exposing raw hidden chain-of-thought. The console should show why a tool was selected, what evidence it used, what it expected to change, and what happened.
- Add visible action choreography for the main app and controlled browser. Every tool call should declare the Radar view, evidence row, form control, browser URL, DOM element, or workflow result it is acting on so the renderer can switch views, focus the relevant pane, pulse/highlight the active target, and clear the highlight when the result lands.
- Add failure recovery states for tool errors and provider errors. A failed tool should create a highlighted transcript card with input summary, error, last visible app/browser state, affected evidence refs, and explicit next actions such as retry same tool, retry with refreshed evidence, skip and continue, stop run, or convert notes into a draft finding. The operator should never see a dead-end `Run failed` without context.
- Add run profiles: Passive Map, Auth Review, API Hardening, Header/Cookie Review, Advanced API Review, and Report From Evidence.
- Add visible run budgets for steps, replay count, capture sample, timeout, workflow requests, and raw-context policy.
- Add AI-visible sitemap, findings, Advanced, and workflow context summaries.
- Add quality gates that reject AI findings without evidence refs, reproduction notes, uncertainty, and affected assets.
- Add draft-to-repeater and draft-to-workflow review flows where AI prepares visible work and the operator approves execution.
- Add run memory for tested hypotheses, dismissed leads, and retest notes stored locally per project.

Exit criteria:

- A sequence such as `getStorageState` followed by a failed `analyzeSecurityHeaders` remains fully visible in the AI-First transcript, highlights the failed action in the console, preserves the previous evidence and browser state, and offers a controlled retry/continue/stop path.
- While AI-First is running, the visible Radar workbench and controlled browser show what the agent is doing now: active tab, selected evidence, prepared draft, clicked/focused page element, or workflow result.
- AI-First can complete a passive review profile with useful draft findings and no hidden mutation.
- Active AI profiles remain opt-in, budgeted, and tied to existing Repeater/Workflow controls.

## Phase D - Reporting And Retest Operations

Purpose: make Radar useful through delivery and retest, not just discovery.

Slices:

- Add report section builder: executive summary, methodology, scope, findings, evidence appendix, retest matrix, and change log.
- Add finding deduplication and merge suggestions.
- Add assignment, owner, component, status, and severity filters.
- Add customizable report templates with local-only storage.
- Add retest matrix generation across sessions.
- Add export presets for internal notes, client report, and raw technical appendix.

Exit criteria:

- Reviewed findings can become a credible report package without leaving Radar.
- Retest sessions show what changed, what passed, and what still needs evidence.

## Phase E - Advanced API/Auth Depth

Purpose: turn the Advanced surface into practical testing plans and reusable checks.

Slices:

- Convert OpenAPI/Postman preview items into reviewed Repeater collections.
- Generate scoped workflow drafts from OpenAPI operations, GraphQL mutations, auth matrix rows, and parameter inventory.
- Add richer GraphQL helpers for operation grouping, variable templates, introspection diffing, and batching review.
- Add auth-state comparison from saved browser states and endpoint inventory.
- Add local sensitive-data rule packs with configurable severity and ignore lists.
- Add bounded cache/header behavior workflows that require explicit operator run approval.

Exit criteria:

- Advanced can move from passive signal review to reviewed Repeater/Workflow drafts without sending traffic invisibly.
- Auth/API hypotheses can be tracked from signal to replay/workflow to finding.

## Phase F - Plugin Execution And SDK Panels

Purpose: make local extensions genuinely useful while preserving Radar's safety boundary.

Slices:

- Add sandboxed plugin execution for approved local plugins.
- Render approved panels with scoped, permissioned APIs.
- Add plugin audit logs for every SDK/API action.
- Add version checks, update prompts, and manifest compatibility warnings.
- Add plugin signing or trust markers for first-party packages.
- Add a local plugin developer CLI for validating manifests and running tests.

Exit criteria:

- A developer can build a local extension that renders a panel, reads scoped evidence, and creates draft findings without modifying Radar core.
- Plugin actions are permission-gated, visible, logged, and reversible where applicable.

## Phase G - Visual Workflow Authoring

Purpose: let operators build and understand workflows without editing JSON.

Slices:

- Add a workflow graph/editor surface for existing step kinds.
- Add branching and conditions with visual validation.
- Add reusable step templates for headers, cookies, CORS, cache, metadata, auth replay, browser-open, and Advanced-generated checks.
- Add dry-run validation before active workflows can run.
- Add workflow diffing and version history.
- Add AI-assisted workflow draft generation that loads into the visible editor.

Exit criteria:

- Operators can create, inspect, run, and revise workflows without touching raw JSON.
- AI-created workflows remain drafts until reviewed and saved manually.

## Phase H - Distribution And Update Polish

Purpose: make Radar easier to install, trust, and keep current.

Slices:

- Add notarized macOS builds.
- Add signed Windows installers.
- Verify Linux AppImage and Debian artifacts.
- Add release notes generated from completed roadmap slices.
- Add update checks that do not send project data.
- Add first-run onboarding using the seeded demo project.

Exit criteria:

- A user can install Radar on macOS, Windows, or Linux without local build steps.
- Release artifacts are signed or clearly documented where signing is not yet available.

## Execution Status

**Phase A - Release Hardening**, **Phase B - Projects, Global Search, And Handoff**, and **Phase C - AI-First Observation And Run Profiles** are complete in `docs/ROADMAP2_EXECUTION.md`.

Completed release-hardening slices:

- SQLite schema migrations with compatibility tests.
- Seeded Radar Demo Project for walkthroughs and screenshots.
- Crash-safe local-store writes for sessions, findings, workflow runs, plugin records, and agent timelines.
- Large-dataset local-store regression coverage.
- Twelve-view manual QA checklist.
- Project/session naming cleanup across user-facing docs and UI copy.

Next slice:

Start **Phase D, Slice 1: Report section builder**. Track implementation status in `docs/ROADMAP2_EXECUTION.md`.

## Parking Lot

These are useful but should not outrank Phase A/B:

- Public plugin marketplace.
- Hosted collaboration.
- Invisible proxy mode.
- Full active AI orchestration without operator review.
- Cloud sync.
- Visual theme expansion beyond the current three themes.
