# Radar Public Readiness And Feature Parity Plan

Last reviewed: 2026-06-27

This document is the public-release gap list for turning Radar from a broad local-first workbench into a dependable public tool that can credibly sit beside Burp Suite or Caido in day-to-day web security testing.

It is not a replacement for `docs/ROADMAP2_EXECUTION.md`. That file tracks implementation slices already chosen for Roadmap 2. This file is the wider product audit: release trust, security posture, workflow depth, ecosystem depth, and the feature classes that testers expect from mature proxies.

## Benchmark References

Use these official references as the feature benchmark, not marketing summaries:

- Burp Suite Desktop tools: https://portswigger.net/burp/documentation/desktop/tools
- Burp manual scanning workflow: https://portswigger.net/burp/documentation/desktop/scanning
- Burp extensions: https://portswigger.net/burp/documentation/desktop/extensions
- Burp Intruder: https://portswigger.net/burp/documentation/desktop/tools/intruder
- Burp Repeater: https://portswigger.net/burp/documentation/desktop/tools/repeater
- Burp Target site map: https://portswigger.net/burp/documentation/desktop/tools/target/site-map
- Burp Collaborator: https://portswigger.net/burp/documentation/desktop/tools/collaborator
- Burp Sequencer: https://portswigger.net/burp/documentation/desktop/tools/sequencer
- Burp DOM Invader: https://portswigger.net/burp/documentation/desktop/tools/dom-invader
- Caido HTTP History: https://docs.caido.io/quickstart/http_history
- Caido Intercept: https://docs.caido.io/quickstart/intercept
- Caido Replay: https://docs.caido.io/quickstart/replay
- Caido Automate: https://docs.caido.io/quickstart/automate
- Caido Findings: https://docs.caido.io/quickstart/findings
- Caido Workflows: https://docs.caido.io/quickstart/workflows
- Caido Plugins: https://docs.caido.io/quickstart/plugins
- Caido Sitemap: https://docs.caido.io/quickstart/sitemap
- Caido HTTPQL: https://docs.caido.io/reference/httpql
- Caido workflow nodes: https://docs.caido.io/reference/workflow_nodes

## Current Position

Radar already has a large first-generation surface:

- Local Electron workbench with HTTP/S capture, WebSocket capture, scope, SSL/proxy, Intercept, Repeater, Automate, Findings, Workflows, Plugins, Advanced, Sitemap, Manual-First mode, and AI-First mode.
- Local SQLite persistence, migrations, demo data, project/session separation, bundle import/export, handoff package export, global search, and AI run memory.
- Typed IPC and shared contracts for most major user workflows.
- Bounded replay, Automate caps, workflow caps, allowlist checks, and prepare-only AI behavior for risky actions.

The remaining gap is not "add the missing tabs." The remaining gap is professional depth, release trust, richer testing engines, stronger extension execution, and a public security posture.

## Public Release Gates

Do not market Radar as public-ready until Gate 0 is done. Do not market it as a Burp/Caido-class replacement until Gates 0-3 are done.

| Gate | Scope | Required outcome |
| --- | --- | --- |
| Gate 0 | Public trust and installation | A new user can install, launch, trust the binary, read the safety policy, report vulnerabilities, run a demo project, and understand local data behavior without source checkout. |
| Gate 1 | Daily-driver proxy parity | Proxy, history, intercept, sitemap, replay, Automate, findings, search, project handoff, and reporting are reliable on real engagements and large local data. |
| Gate 2 | Advanced testing parity | Scanner-style checks, content discovery, auth/API depth, DOM/browser helpers, token analysis, out-of-band testing, and protocol helpers cover the reasons testers keep Burp open. |
| Gate 3 | Ecosystem parity | Plugins and workflows can execute safely, render panels, audit actions, and be developed/tested outside Radar core. |
| Gate 4 | Optional team scale | Hosted sync, collaboration, marketplace, or cloud relay features exist only if they preserve Radar's local-first consent model. |

## Gate 0: Public Trust And Installation

### P0 Blockers

- Add `SECURITY.md` with responsible disclosure, supported versions, expected response windows, and a clear statement that Radar is for authorized testing only.
- Add `CONTRIBUTING.md` with local setup, branch rules, code conventions, test commands, screenshot refresh, release flow, and how to add shared IPC contracts safely.
- Add issue templates for bug reports, security reports, feature requests, and release checklist items.
- Add `CHANGELOG.md` or generate release notes from execution slices with human-edited highlights.
- Decide whether `package.json` should stay `"private": true`. If it remains private, document that Radar is distributed as an app, not as an npm package.
- Replace development signing with real distribution signing: macOS Developer ID and notarization, Windows code signing, Linux checksums and artifact signatures.
- Add SBOM and provenance artifacts to releases.
- Add checksum verification instructions beside release downloads.
- Add a first-run onboarding flow that can load the demo project, explain local-first storage, show the proxy address, and guide certificate setup without reading the README first.
- Add a public data/privacy page that explains captures, CA files, AI settings, AI provider calls, project bundles, handoff exports, and raw evidence toggles.
- Add a public threat model covering Electron renderer, preload IPC, local proxy, CA material, AI context, project bundles, plugins, and workflow execution.
- Add a Content Security Policy to the app shell.
- Review Electron `webPreferences`: `contextIsolation` and `nodeIntegration: false` are good, but `webviewTag: true` and `sandbox: false` need either a hardened design or a documented reason.
- Move saved AI API keys out of plaintext JSON, or document an explicit "not encrypted yet" warning and prioritize OS keychain or Electron `safeStorage`.
- Run dependency audit, license audit, and Electron security checklist in CI.
- Add crash/error diagnostics that never include request bodies, auth headers, cookies, API keys, or raw AI context.
- Add release smoke tests for macOS, Windows, and Linux packaged builds, not only source builds.

### Acceptance Criteria

- A fresh user can download a signed or clearly verified artifact, start Radar, load the demo project, open the Radar Browser or see a precise browser-discovery error, and run the manual QA checklist.
- Gatekeeper, SmartScreen, and Linux install warnings are either eliminated through signing or explicitly documented next to downloads.
- A maintainer can answer "where is sensitive data stored?" and "how do I report a vulnerability?" from checked-in docs.

## Gate 1: Daily-Driver Proxy Parity

### 1. Proxy, Scope, And Certificate Operations

- Add a proxy setup wizard for Radar Browser, external browser, CLI, mobile, emulator, and thick-client paths.
- Add proxy health diagnostics: listening address, port conflict, upstream connectivity, CA validity, browser launch status, CDP connection status, and last proxy error.
- Add upstream proxy support with per-project settings, authentication, and bypass rules.
- Add DNS rewrite and host alias support for lab environments.
- Add invisible proxy research behind a feature flag and only after explicit risk review.
- Add per-project certificate lifecycle controls: regenerate CA, export CA, expire/rotate warning, and "where this CA is trusted" checklist.

### 2. HTTP/S And WebSocket History

- Add user-configurable columns, column presets, width persistence, and per-view density settings.
- Add richer filter language coverage: request/response header fields, cookies, body size, MIME family, initiator, TLS fields, timing bands, replay source, tag/comment fields, and negation.
- Add saved filter folders, pinned filters, and import/export for filters.
- Add logger-style chronological event feed across proxy, replay, workflow, Automate, AI, plugin, and SSL events.
- Add per-request notes, evidence review status, bookmark/star, and issue-link state.
- Add request/response body viewer modes: raw, pretty JSON, wrapped text, hex, image preview, HTML render preview, and diff-friendly normalized text.
- Add custom request/response table columns derived from headers, JSON paths, regex, or plugin annotations.
- Add request and frame retention policies with local-only warnings before deleting raw evidence.

### 3. Intercept And Match/Replace

- Add intercept queue search, queue grouping, and "hold only next request/response" controls.
- Add response editing preview with status/header/body validation before forwarding.
- Add match/replace rule testing UI with sample request/response fixtures.
- Add rule hit analytics: counts, last fired, affected captures, and rollback visibility.
- Add rule import/export and rule presets for common headers, CORS, cache, auth, and mobile-client work.
- Add WebSocket match/replace editing and evidence for modified frames.

### 4. Repeater Depth

- Add grouped send for multiple selected Repeater tabs.
- Add richer response comparison: JSON semantic diff, header diff, cookie diff, timing chart, redirect chain, TLS diff, and status family summary.
- Add history search inside a tab and across all tabs.
- Add variable scoping for project, session, tab, and one-off secrets, with clear masking.
- Add environment switch preview that shows materialized URLs/headers before transmit.
- Add request transforms for JWT, XML, GraphQL, multipart, protobuf/grpc-web where practical, URL component operations, cookies, and common encodings.
- Add Repeater tab folders/groups, tab color/status, duplicate detection, and lock-to-scope guardrails.
- Add WebSocket conversation replay with connection state, message edit/send, and transcript diff.

### 5. Automate / Intruder-Class Depth

- Add multiple attack modes: single marker, pitchfork, cluster-bomb, battering-ram, numeric range, null/empty, file/wordlist, recursive grep/extract, and payload processors.
- Add payload preprocessing chain: encode/decode, case transforms, prefix/suffix, regex replace, hashing, JSON escaping, URL encoding, base64, and custom JS/shell processors through workflows.
- Add result analysis: response baseline, outlier scoring, similarity buckets, extracted value columns, response grep columns, timing bands, redirect target columns, and failure reason filters.
- Add resumable Automate sessions after restart.
- Add wordlist management that can reference files safely, show counts, and prevent accidental import of huge secrets into the renderer.
- Add strict active testing safety controls: per-host rate limits, backoff, pause on error spike, maximum runtime, target allowlist locks, and a visible kill switch.
- Add export formats for Automate results: CSV, JSON, Markdown evidence, and finding appendix snippets.

### 6. Findings, Reporting, And Retest

- Complete Roadmap 2 Phase D: report section builder, finding dedupe/merge, assignment/filter depth, local report templates, retest matrix, and export presets.
- Add report structure beyond raw findings: executive summary, methodology, scope table, limitations, timeline, finding narrative, evidence appendix, retest matrix, and change log.
- Add local report template editor with variables, section ordering, severity labels, and organization branding.
- Add finding duplicate suggestions by affected asset, title, evidence similarity, CWE/OWASP tags, and workflow source.
- Add component/owner/assignee fields and filters.
- Add finding status workflow: draft, needs evidence, reviewed, accepted risk, fixed pending retest, retest passed, retest failed.
- Add retest mode that compares old evidence to a new session and prompts for updated evidence.
- Add export validation that blocks "client report" presets when required fields or evidence refs are missing.

### 7. Performance And Reliability

- Add large-dataset UI performance tests, not only local-store tests.
- Add virtualization and keyboard navigation checks for large HTTP history, WebSocket history, findings, workflow runs, AI timelines, and Automate result tables.
- Add crash-safe long-running operations for Automate, workflows, plugin execution, and AI runs.
- Add background task cancellation tests for proxy shutdown, project switch, app quit, and session switch.
- Add import/export fuzz tests for malformed bundles, very large bundles, duplicate IDs, and mixed redaction profiles.
- Add packaged-app smoke automation that opens each view and verifies the demo project renders.

## Gate 2: Advanced Testing Parity

### 1. Scanner-Style Auditing

- Add passive scanner checks for headers, cookies, CORS, cache, mixed content, redirects, information disclosure, robots/sitemap exposure, content type mismatch, TLS/cert metadata, CSP issues, and reflected parameter hints.
- Add active scanner workflows that are explicit, scoped, rate-limited, and reviewable: unauthenticated access checks, method tampering, parameter reflection, cache behavior, CORS probes, host header checks, and selected metadata discovery.
- Add scan issue confidence, evidence, reproduction, remediation, and "why this is uncertain" fields.
- Add scan configuration profiles: passive only, low-noise active, API auth review, header/cookie review, and retest.
- Add scanner run history, pause/resume/stop, retry failed probes, and finding promotion.
- Add a scanner dashboard with coverage, pending checks, issues by severity, skipped out-of-scope items, and active request budgets.

### 2. Sitemap And Content Discovery

- Add crawl planning: target seeds, discovered forms, links, scripts, robots/sitemap files, OpenAPI links, GraphQL endpoints, and unauthenticated/authenticated coverage.
- Add content discovery with bounded wordlists, extension lists, status/length filters, recursion controls, and per-host rate limits.
- Add sitemap risk and coverage signals: auth-required endpoints, state-changing methods, parameter-rich paths, upload endpoints, admin-looking paths, GraphQL mutations, and secrets exposure.
- Add site map compare views with saved baselines and exportable attack surface deltas.
- Add endpoint ownership notes and "tested/not tested" status.

### 3. Auth And API Depth

- Complete Roadmap 2 Phase E: import preview to Repeater collections, Advanced-generated workflow drafts, GraphQL helper depth, auth-state comparison, sensitive-data rule packs, and cache/header behavior workflows.
- Add saved auth states from browser cookies/storage with labels, role, tenant, and validity notes.
- Add role/tenant matrix testing from selected captures and endpoint inventory.
- Add OpenAPI/Postman import review that creates scoped Repeater collections, workflow drafts, and sitemap seeds without sending traffic.
- Add GraphQL operation grouping, variable templates, introspection diffing, batching review, persisted query support, and subscription review.
- Add parameter mining across query, JSON, form, multipart, cookies, headers, GraphQL variables, WebSocket JSON, and OpenAPI schemas.
- Add local sensitive-data rule packs with configurable severity, masking, ignore rules, and finding promotion.

### 4. Out-Of-Band Testing

- Add a local-first out-of-band interaction model before any hosted relay: user-provided collaborator endpoint, DNS/HTTP callback ingestion, payload generator, interaction polling, and evidence linking.
- If hosted callback infrastructure is added later, make it opt-in and separate from local project data.
- Add payload labels, correlation IDs, expiry, per-project callback settings, and explicit export redaction.
- Add workflows for SSRF, blind command injection signal, blind XSS signal, and webhook callback validation, all with strong authorization warnings.

### 5. Browser And DOM Testing

- Add browser-side instrumentation for DOM sinks/sources, postMessage, storage, URL fragments, prototype pollution signals, DOM clobbering hints, and clickjacking frame checks.
- Add safe canary payload generation for DOM testing.
- Add browser console, network, storage, and DOM mutation evidence panes tied back to captures.
- Add page action recorder for repeatable manual exploration and AI-visible evidence.
- Add form inventory and CSRF PoC generation for selected requests.

### 6. Token, Session, Decoder, And Comparer Tools

- Add token randomness analysis inspired by Sequencer: sample collection, entropy tests, byte/character distribution, duplicate analysis, timestamp pattern detection, and reportable charts.
- Add Decoder workbench for URL, HTML, base64, hex, JWT, JWK, gzip/deflate, JSON, XML, multipart, cookies, and hashing.
- Add Comparer workbench for arbitrary requests, responses, text, JSON, headers, cookies, and binary/hex.
- Add Inspector-style structured panes for params, cookies, headers, JWT claims, forms, GraphQL variables, and OpenAPI operation metadata.
- Add generated CSRF PoC for selected form-like requests.

### 7. Protocol And Platform Coverage

- Add HAR import/export.
- Add curl/raw HTTP import into Repeater and collections.
- Add improved HTTP/2, HTTP/3 visibility notes where Electron/mockttp support is limited.
- Add gRPC/grpc-web and protobuf helper support where feasible.
- Add mobile proxy workflows for Android/iOS emulators and physical devices with certificate pinning notes.
- Add thick-client proxy and upstream proxy workflows with explicit limitations.

## Gate 3: Ecosystem And Workflow Parity

### 1. Plugin Runtime

- Roadmap 2 Phase F baseline shipped: bounded SDK action execution, no-script panel rendering, plugin audit logs, compatibility checks, trust markers, and developer CLI.
- Execute approved local plugins in an isolated process or hardened sandbox, never inside the privileged Electron main process.
- Enforce plugin permissions at every API call and log every action with plugin id, permission, input summary, evidence refs, result, and error.
- Render plugin panels with scoped APIs and no access to raw project files unless explicitly granted.
- Add plugin test harness and SDK docs.
- Add plugin package validation: manifest schema, version compatibility, requested permission explanation, panel entry validation, file size limits, and dependency warnings.
- Add first-party plugins: JWT helper, GraphQL helper, OpenAPI importer, parameter miner, report exporter, decoder/comparer tools, and auth matrix helper.

### 2. Workflow Runtime And Visual Authoring

- Roadmap 2 Phase G baseline shipped: workflow graph review, branching/conditions, step templates, dry-run validation, diff/version history, and AI-assisted visible drafts.
- Add workflow node types: HTTP request, replay selected capture, browser open/click/fill, extract, match, transform, delay, loop bounded list, condition, finding draft, note, and report section.
- Add JavaScript and shell workflow steps only after a permission model and sandbox story exist.
- Expand workflow versioning with run diff, richer dry-run preview, active request budget dashboards, and result schema validation.
- Add workflow import/export and first-party workflow packs.

### 3. AI-First Depth

- Add AI plans that choose existing workflows, Repeater drafts, report sections, and finding updates, while keeping operator review for risky actions.
- Add model/provider safety docs that explain what data leaves the machine for each provider.
- Add local model profile for redacted offline analysis.
- Add AI evaluation tests using seeded projects and expected transcript/finding quality.
- Add AI hallucination controls: strict evidence refs, uncertainty fields, rejected draft cards, and review-required report sections.
- Add "show me what changed" summaries after AI-First runs: selected views, filters applied, drafts prepared, findings created, workflows suggested, and skipped risks.

## Gate 4: Optional Team And Distribution Scale

Do not start hosted collaboration until local-first export/import, signing, plugin safety, and public governance are solid.

- Add local-only update checks that send only app version and platform, never project data.
- Add optional file-based team handoff before hosted sync.
- Add encrypted project bundle support with passphrase-based sharing.
- Add hosted collaboration only as an explicit opt-in product mode with separate privacy docs.
- Add public plugin marketplace only after local plugin signing, sandboxing, and abuse review.

## Feature Parity Matrix

| Area | Radar today | Burp/Caido-class target | Priority |
| --- | --- | --- | --- |
| Install and trust | Release workflow exists, but app signing/notarization is not complete. | Signed/notarized releases, checksums, SBOM, onboarding, vulnerability policy. | P0 |
| Electron security | Context isolation and no node integration, but no CSP, `webviewTag: true`, and `sandbox: false`. | Hardened renderer policy and documented threat model. | P0 |
| Secret handling | AI settings can be saved locally. | OS keychain/safeStorage for API keys and explicit privacy docs. | P0 |
| Proxy setup | Local proxy, Radar Browser, external notes. | Setup wizard, health diagnostics, upstream proxy, DNS rewrite, device/emulator recipes. | P1 |
| HTTP history | Scoped query, saved filters, tags/comments, bulk actions. | Custom columns, richer query fields, logger feed, body viewer modes, retention controls. | P1 |
| Intercept | Request/response pause, edit, forward, drop, rules, match/replace. | Queue search/grouping, hold-next mode, rule test UI, rule hit analytics, WebSocket match/replace. | P1 |
| Sitemap | Host/path tree, endpoint inventory, session diff. | Crawl planning, content discovery, risk scoring, tested status, richer baseline exports. | P1 |
| Repeater | Multi-tab replay, history, variables, collections, diff, WebSocket replay. | Grouped send, semantic diff, richer transforms, tab groups, WebSocket conversation replay. | P1 |
| Automate | Explicit payload markers, caps, clustering, match/extract, promotion. | Multiple attack modes, payload processors, resumability, richer result columns, rate governance. | P1 |
| Findings/reporting | Findings inbox and Markdown/HTML report export. | Full report builder, templates, dedupe/merge, assignment filters, retest matrix, export validation. | P1 |
| Scanner | Passive workflows and selected active checks. | Dedicated scanner dashboard, passive/active profiles, run history, issue confidence, safe active probes. | P2 |
| Advanced API/auth | GraphQL extraction, import preview, auth matrix, parameters, secrets, header signals. | Reviewed collections/workflows, auth-state comparison, GraphQL templates/diffing, configurable rule packs. | P2 |
| Out-of-band testing | Not present as a first-class system. | Callback payload generator, interaction ingestion, evidence linking, optional hosted relay later. | P2 |
| Browser/DOM | Browser control and AI page observation. | DOM sink/source helpers, postMessage/prototype pollution signals, console/storage evidence, CSRF PoC. | P2 |
| Token/decoder/comparer | Some request transforms and response diff. | Dedicated Sequencer/Decoder/Comparer/Inspector-style workbenches. | P2 |
| Plugins | Manifest preview, approval, permissioned API action path, panel inventory. | Sandboxed execution, rendered panels, audit logs, SDK docs, developer CLI, first-party packages. | P3 |
| Workflows | Declarative JSON/YAML-like definitions and run history. | Visual graph editor, branching, node library, dry-run, version history, workflow packs. | P3 |
| AI-First | Observation console, profiles, budgets, quality gates, run memory. | Evaluation suite, richer workflow/report orchestration, local model profiles, clear provider privacy. | P3 |

## Suggested Implementation Order

1. Finish Gate 0 public trust work before announcing public availability.
2. Finish Roadmap 2 Phase D reporting/retest because it completes the assessment lifecycle.
3. Deepen proxy/history/intercept/repeater/Automate reliability and UX before adding new advanced tabs.
4. Add scanner/content discovery as explicit, bounded workflows with a scanner dashboard.
5. Complete Advanced API/auth depth and convert passive signals into reviewed Repeater collections and workflow drafts.
6. Build plugin sandbox execution and panel rendering before encouraging community extensions.
7. Build visual workflow authoring after the workflow runtime and plugin permission model are stable.
8. Add out-of-band, DOM, token, decoder, comparer, and protocol helpers as focused tools once daily-driver loops are solid.

## Definition Of "Fully Featured"

Radar can be called fully featured against Burp/Caido when all of these are true:

- A new user can install and trust a release without source checkout or local signing workarounds.
- The app has a documented security, privacy, and responsible-disclosure posture.
- Core proxy workflows survive real engagement volume: capture, search, intercept, modify, replay, automate, find, report, retest, export, and import.
- Active testing is powerful but bounded by visible scope, rate limits, cancellation, audit logs, and evidence references.
- Scanner-style, API/auth, DOM/browser, token, decoder/comparer, and out-of-band workflows cover the most common reasons testers switch to Burp.
- Plugins and workflows can be developed outside Radar core, executed safely, and audited.
- AI-First improves operator workflow without creating invisible traffic, hidden state changes, or evidence-free findings.
- Public release gates are automated enough that `pnpm lint`, `pnpm test:unit`, `pnpm build`, packaged-app smoke tests, dependency/security audits, and artifact signing/checksum checks are routine.
