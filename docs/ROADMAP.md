# Radar Roadmap

Radar's goal is to become the primary local-first web security workbench for authorized testing, covering day-to-day proxy, replay, automation, evidence, and reporting workflows while going further on operator-visible AI.

## Product North Star

Radar should feel like a defensive security console with two equally complete paths:

- **Manual-First:** direct, fast, keyboard-friendly human testing with complete proxy, intercept, replay, automate, sitemap, findings, and reporting surfaces.
- **AI-First:** scoped agent runs that use the same capture, replay, scope, workflow, and findings contracts as the manual app, with visible timelines and immediate stop controls.

The replacement bar is not "has similar tabs." Radar should replace the full workflow:

1. Start a project for a target.
2. Configure scope and proxy.
3. Browse or route external clients through Radar.
4. Intercept, modify, drop, forward, and match/replace traffic.
5. Search, filter, tag, and map all discovered traffic.
6. Replay and compare request variants quickly.
7. Run payload automation safely with clear rate limits.
8. Capture findings with evidence links.
9. Export useful report material.
10. Extend the tool through local plugins, scripts, SDKs, or AI tools.

## Current Baseline

Radar already has a strong MVP foundation:

- Local Electron workbench with HTTP/S capture, WebSocket capture, scope, SSL/proxy, repeater, profiles, and sessions.
- Dedicated Radar browser profile with proxy wiring and certificate handling.
- Local SQLite persistence for profiles, sessions, captures, WebSocket frames, findings, workflows, SSL events, and AI-First runs.
- Manual replay plus capped burst replay.
- Automate v1 with explicit payload markers, saved payload sets, scoped attack sessions, visible pause/stop/retry controls, result clustering, match/extract rules, and Repeater/Finding promotion.
- Findings inbox with templates, durable evidence references, Manual-First review/retest status, Automate/AI draft promotion, and Markdown/HTML report export with redacted evidence appendices.
- Workflows v1 with built-in passive checks, declarative JSON/YAML-like definitions, scoped active replay checks, saved definitions, session run history, result evidence references, Finding promotion, and AI workflow selection by id.
- WebSocket frame inspection separate from HTTP/S evidence.
- AI command palette with redacted context previews, local/custom provider support, and prepare-only tasks.
- AI-First autonomous run loop with scoped browser tools, run-scoped capture reads, capped replay, security header/cookie/CORS checks, auth state helpers, and local timeline persistence.

The gap is breadth and depth around professional testing operations: plugin extensibility, global search, advanced API/auth testing helpers, collaboration handoff, richer workflow authoring, and release polish.

## Guiding Principles

- **Local-first by default:** captures, scopes, credentials, findings, workflows, and AI run history stay on the operator machine unless explicitly exported or sent to a configured AI provider.
- **Scope is the safety boundary:** every feature that reads, filters, automates, replays, or gives AI context must use the same allowlist model.
- **Manual and AI use the same engine:** no AI-only shortcuts around proxy, replay, persistence, or policy.
- **Evidence should be durable:** every finding, replay, workflow result, and AI observation should link back to captures, WebSocket frames, replay attempts, or timeline entries.
- **Power features need caps:** fuzzing, replay batches, workflows, and AI tools need concurrency, delay, timeout, payload, and target limits.
- **The UI should stay operational:** dense, searchable, keyboard-aware, readable under pressure, and specific to Radar's security workbench identity.

## Full Workbench Coverage Map

| Area | Radar Today | Replacement Target |
| --- | --- | --- |
| Projects | Profiles and sessions | First-class projects with environments, notes, findings, saved filters, workflows, and import/export |
| Proxy | Local MITM proxy and Radar browser | Full proxy control, browser setup helpers, external client profiles, proxy health, invisible proxy research |
| Intercept | Capture-only workflow | Queue, forward, drop, edit request/response, interception rules, pause modes |
| HTTP history | Capture log and search | HTTPQL-style query language, saved filters, tags, comments, bulk actions, smart grouping |
| WebSockets | Frame log and inspection | Replay/edit WebSocket messages, conversation grouping, protocol helpers |
| Sitemap | Not yet present | Host/path tree, endpoint inventory, parameter discovery, diff between sessions |
| Replay | Single editor, replay, burst | Multi-tab repeater, history per tab, response diffing, variables, environments, collections |
| Automate | Payload positions, payload sets, bounded sessions, result filters, clustering, match/extract rules, Finding promotion | Reusable active workflow integration |
| Match & Replace | Not yet present | Request/response rewrite rules with scope, conditions, and audit logs |
| Findings | Manual and AI findings inbox, severity, evidence, reproduction, status, retest, export | Richer triage, deduplication, assignment filters, and workflow/plugin promotion |
| Workflows | Declarative JSON/YAML-like workflows, built-in passive checks, scoped selected-capture active replay, run history, Finding promotion, and AI workflow selection | Visual workflow editing, richer branching, SDK steps, and reusable active workflow integration |
| Plugins | Not yet present | Local plugin API, signed/community package model later, SDK for extension authors |
| Search | Basic string filters | Global search across captures, frames, replays, findings, notes, and workflows |
| Reports | Markdown/HTML export with redacted evidence appendix | Report builder sections, appendices, retest matrices, and customizable templates |
| Team/cloud | Intentionally local-first | Optional export/import and file-based handoff before any hosted collaboration |

## Roadmap Phases

### Phase 0 - Product Hardening

Purpose: make the current MVP reliable enough to build on without compounding weak foundations.

- Add a first-class `Project` layer above profiles/sessions or rename the current model so client/target/project terminology is clear.
- Add schema migrations with explicit compatibility tests for local SQLite data.
- Expand performance tests around large capture sets, WebSocket frame volume, and long AI timelines.
- Add crash-safe writes for sessions, findings, and workflow results.
- Improve packaging: notarized macOS builds, signed Windows builds, verified Linux artifacts, release update notes.
- Add a seeded demo project for screenshots, manual QA, and onboarding.

Exit criteria:

- Existing MVP workflows survive app restart, project switch, and large local datasets.
- `pnpm lint`, `pnpm test:unit`, and `pnpm build` are reliable release gates.
- New roadmap features have stable persistence and naming to attach to.

### Phase 1 - Intercept And Proxy Control

Purpose: match the control operators expect from a serious web proxy.

- Add an **Intercept** view or mode with request and response queues.
- Support forward, drop, edit, and resume-all actions.
- Add interception rules by method, host, path, content type, status, initiator, request header, response header, and body search.
- Add per-project proxy profiles for browser, external browser, CLI tools, and mobile/device notes.
- Add Match & Replace v1 for scoped request and response rewrites.
- Record every intercept edit and rewrite as evidence metadata.
- Expose safe AI-First tools for reading queued items and preparing edits, but keep forwarding/dropping operator-confirmed until policy is mature.

Exit criteria:

- A tester can pause a login request, edit headers/body, forward it, inspect the response, and save the mutation as evidence.
- Match & Replace can rewrite headers or bodies inside explicit scope and explain which rule fired.
- Intercept changes are visible in HTTP history and findings evidence.

### Phase 2 - Traffic Intelligence And Sitemap

Purpose: make large target exploration faster than scrolling a capture table.

- Add a global query language for HTTP/S and WebSocket evidence, inspired by HTTPQL but tailored to Radar's data model.
- Add saved filters, filter chips, and keyboard shortcuts.
- Add tags, comments, and bulk actions for captures and frames.
- Add a **Sitemap** view with host tree, path tree, methods, status families, MIME types, parameters, and first/last seen timestamps.
- Add endpoint inventory with discovered query params, body keys, forms, auth signals, and content types.
- Add session diffing: new endpoints, removed endpoints, changed status, changed headers, changed response shape.
- Add AI-First passive mapping tools that can summarize coverage and suggest next manual paths without leaving scope.

Exit criteria:

- A tester can answer "show POST JSON endpoints returning 401/403 under `/api` from this session" quickly.
- The sitemap can become the main navigation surface for discovered hosts and endpoints.
- Radar can compare a retest session against an earlier session and show changed attack surface.

### Phase 3 - Repeater Pro

Purpose: make manual request iteration fast enough for serious day-to-day testing.

- Add multiple repeater tabs with names, pinned requests, and per-tab history.
- Add response comparison across replay attempts: status, latency, headers, body length, body diff, JSON diff.
- Add environment variables and project variables for hosts, tokens, IDs, and payload snippets.
- Add collections for reusable requests and endpoint groups.
- Add request transformations: URL encode/decode, JSON format/minify, base64, JWT decode, cookie parse, multipart helpers.
- Add WebSocket replay/edit support for selected frames where protocol and connection state allow it.
- Let AI-First load repeater drafts into visible tabs, compare results, and write findings from replay evidence.

Exit criteria:

- A tester can maintain a set of replay tabs for auth, API, and edge-case testing without losing history.
- Response diffs make auth bypass, cache, and validation changes obvious.
- Variables work in Manual-First replay and AI-First replay through the same normalization path.

### Phase 4 - Automate

Purpose: replace Automate-style payload testing without turning Radar into unsafe exploitation automation.

- Add payload positions in requests using explicit markers.
- Add local wordlists and inline payload sets.
- Add attack session controls: count, concurrency, delay, timeout, stop, pause, resume, and retry.
- Add result table with status, length, latency, word count, error, redirect, and match markers.
- Add result clustering by response similarity and status families.
- Add match/extract rules for interesting responses.
- Add safe defaults and hard caps per project, with separate stricter AI-First caps.
- Persist automate sessions and allow promoting interesting results to findings or repeater tabs.

Exit criteria:

- A tester can run a controlled payload pass against a scoped endpoint and sort results by meaningful deltas.
- Radar can stop immediately and preserve partial results.
- AI can propose payload positions and analyze results, but execution remains capped and visible.

### Phase 5 - Findings And Reporting

Purpose: make Radar useful through the end of an assessment, not just during traffic capture.

- Add a findings inbox shared by Manual-First and AI-First.
- Support severity, confidence, status, affected assets, evidence refs, reproduction steps, impact, remediation, notes, owner, and retest result.
- Convert captures, frames, repeater attempts, automate results, workflow results, and AI observations into finding evidence.
- Add finding templates for common web classes: auth, session, CORS, cache, headers, IDOR, injection signal, access control, information disclosure.
- Add report builder with Markdown and HTML export.
- Add evidence appendix generation with redaction controls.
- Add retest mode that links old findings to new session evidence.

Exit criteria:

- A tester can produce credible report notes and evidence appendices from inside Radar.
- AI-generated findings are clearly draft until reviewed.
- Every exported finding has stable local evidence references.

### Phase 6 - Workflows

Purpose: create repeatable security checks and custom operator automation.

- Add a workflow model with typed inputs, scope policy, steps, conditions, result records, and evidence outputs.
- Start with declarative YAML/JSON workflows before investing in a visual node editor.
- Support passive workflows that run on captures and active workflows that run scoped replay/browser actions.
- Add built-in workflows: security headers, cookie flags, CORS, cache control, unauthenticated access check, auth state comparison, common metadata exposure.
- Add workflow run history and result promotion to findings.
- Add AI-First workflow planning that chooses from existing workflows rather than inventing hidden behavior.

Exit criteria:

- Operators can save and rerun checks across projects.
- Workflow results are explainable, bounded, and tied to evidence.
- The same workflow can run manually, from AI-First, or from a future SDK.

### Phase 7 - Plugins And SDK

Purpose: make Radar extensible without sacrificing local-first safety.

- Add a local plugin manifest with permissions for captures, frames, replay, files, AI, workflows, and UI panels.
- Add a TypeScript SDK for reading scoped evidence, creating findings, adding workflow steps, and rendering panels.
- Add a CLI or local API for headless project queries and workflow runs.
- Add plugin sandboxing, permission prompts, versioning, and install/remove flows.
- Add first-party example plugins: JWT helper, GraphQL helper, OpenAPI importer, parameter miner, report exporter.
- Defer public plugin registry until local package loading and permissions are solid.

Exit criteria:

- A developer can build a local extension without modifying Radar core.
- Plugin permissions are visible and enforceable.
- Plugins cannot bypass scope, replay caps, raw-context policy, or local data boundaries.

### Phase 8 - Advanced Testing Surfaces

Purpose: cover the workflows that make testers keep a second proxy open.

- Add GraphQL operation extraction, batching helpers, and introspection review.
- Add OpenAPI/Postman import to create collections, sitemap seeds, and replay templates.
- Add auth matrix testing using saved auth states and endpoint inventory.
- Add parameter discovery across query, body, JSON, multipart, cookies, and headers.
- Add secrets and sensitive data detection in responses with local-only rules.
- Add cache poisoning and header behavior helpers as bounded check workflows.
- Add mobile and thick-client proxy guidance, with invisible proxy research only after core proxy safety is strong.

Exit criteria:

- Radar handles modern API testing workflows without plugins for the most common cases.
- Auth and API testing become first-class, not just manual request editing.

## AI-First Roadmap

AI-First should become Radar's differentiator, not a separate product bolted onto the proxy.

Near term:

- Add run profiles: Passive Map, Auth Review, API Hardening, Header/Cookie Review, Report From Evidence.
- Add clearer tool budgets in the run console.
- Add AI-visible sitemap and findings context.
- Add draft-to-repeater workflows where the agent prepares visible mutations and the operator can approve execution.
- Add AI result quality checks that reject findings without evidence, reproduction, and uncertainty notes.

Medium term:

- Let AI run passive workflows over captured evidence.
- Let AI compare auth states and propose access-control checks from the sitemap.
- Let AI cluster automate results and suggest likely findings.
- Let AI assemble a report draft from reviewed findings.

Long term:

- Let AI orchestrate bounded active workflows end-to-end when a run profile explicitly allows it.
- Add local model optimization for redacted offline analysis.
- Add project memory that remembers tested hypotheses, dismissed findings, and retest outcomes locally.

Non-negotiables:

- AI cannot widen scope silently.
- AI cannot erase evidence.
- AI cannot install certificates or change trust settings.
- AI cannot run unbounded fuzzing.
- AI cannot export data without an explicit user action.

## Data Model Additions

Plan the persistence model before implementing the broad features:

- `projects`: top-level assessment container.
- `environments`: variable sets for hosts, tokens, accounts, and test contexts.
- `capture_tags`: tags and comments attached to captures and frames.
- `intercept_entries`: queued traffic, edits, decisions, and timestamps.
- `rewrite_rules`: Match & Replace rules with scope and audit metadata.
- `sitemap_nodes`: host/path/endpoint inventory with first/last seen metadata.
- `replay_tabs`: tab state, request drafts, and replay history.
- `automate_sessions`: payload config, run config, result rows, clusters, and stop state.
- `findings`: reviewed and draft findings.
- `finding_evidence`: stable links to captures, frames, replays, automate results, workflow runs, and AI timeline entries.
- `workflows`: workflow definitions, permissions, versions, and run history.
- `plugins`: local plugin manifests, permissions, install paths, and state.

## Engineering Order

Build shared contracts first, then Electron behavior, then preload API, then renderer UI, then AI tools, then docs/tests:

1. Shared types and pure helpers in `shared/`.
2. Local persistence and migrations in `electron/`.
3. IPC handlers and preload methods in `shared/radar-api.ts` and `electron/preload.ts`.
4. Renderer hooks and UI in `src/`.
5. AI-First tools and policies in `electron/agent/`.
6. Tests for helpers, policy gates, IPC behavior, persistence, and UI flows.
7. README and user guide updates for user-facing changes.

This order keeps Radar's security boundary clear and prevents AI features from bypassing the manual product model.

## Suggested Build Sequence

1. Product hardening and project naming.
2. Intercept queue.
3. Match & Replace.
4. Query language and saved filters.
5. Sitemap.
6. Multi-tab repeater with response diff.
7. Automate v1.
8. Findings inbox.
9. Report export.
10. Workflow definitions.
11. Plugin/SDK foundation.
12. Advanced API/auth testing helpers.

## Release Milestones

### 0.2 - Proxy Control

- Intercept queue.
- Request/response edit, forward, drop.
- Match & Replace v1.
- Proxy profile improvements.
- Evidence audit for modified traffic.

### 0.3 - Traffic Intelligence

- Query language.
- Saved filters.
- Tags and comments.
- Sitemap v1.
- Session diff.

### 0.4 - Repeater Pro

- Multi-tab repeater.
- Replay history.
- Response diffing.
- Variables and environments.
- Collections.

### 0.5 - Automate

- Payload positions.
- Wordlists.
- Attack sessions.
- Result clustering.
- Repeater promotion.

### 0.6 - Findings

- Findings inbox.
- Evidence linking.
- Report notes to Markdown/HTML.
- Retest status.
- AI draft finding review flow.

### 0.7 - Workflows

- Declarative workflows.
- Passive checks.
- Active scoped checks.
- Workflow history.
- AI workflow selection.

### 0.8 - Extensions

- Local plugin manifest.
- TypeScript SDK.
- Local API or CLI.
- First-party helper plugins.
- Permission model.

### 1.0 - Complete Security Workbench

- Stable project model.
- Proxy, intercept, history, sitemap, replay, automate, findings, reports, workflows, and plugins are usable without another proxy.
- AI-First uses the same trusted engine as Manual-First.
- Release builds are signed/notarized where practical.
- Documentation covers install, proxy setup, workflows, reporting, plugin development, and troubleshooting.

## Risks

- **Scope creep:** a complete security workbench touches many surfaces. Keep phases shippable and avoid building plugins or visual workflow editing before core proxy/repeater/findings are strong.
- **Performance:** large histories will punish renderer-only filtering. Design query/search with persistence and indexing in mind.
- **Safety:** Automate, workflows, plugins, and AI tools can create unsafe behavior if they bypass scope or caps.
- **Data migrations:** local-first products must protect old projects. Add migration tests before schema growth accelerates.
- **UX density:** adding full workbench coverage can crowd the console. Use mode-specific panels, saved views, and keyboard search rather than adding permanent clutter.
- **AI trust:** AI findings are useful only when evidence-backed and visibly reviewed.

## Immediate Next Step

Start with **0.2 Proxy Control**:

1. Define `InterceptEntry`, `InterceptDecision`, and `RewriteRule` shared contracts.
2. Add local persistence and migrations.
3. Add proxy queue hooks for scoped request/response interception.
4. Build the Intercept view with forward, drop, edit, and resume-all.
5. Add Match & Replace v1 after the queue is stable.
6. Add policy tests for scope, queue decisions, body caps, and rewrite auditing.
7. Update README and user guide with the new proxy workflow.
