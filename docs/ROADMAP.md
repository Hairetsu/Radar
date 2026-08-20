# Radar roadmap

Radar already has the first complete workbench loop: capture, inspect, intercept, replay, automate, map, record findings, run workflows, extend locally, and operate through a visible AI companion. The next work is about trust and depth. Adding another tab is easy. Making Radar dependable on a real engagement is the harder and more useful job.

This is the only active planning document. It records outcomes, not implementation history. Completed plans and audits remain available in Git history.

## Product direction

Radar should become a daily local-first workbench for authorized web testing. Manual-First and AI-First must remain two ways to use the same evidence and safety model.

The non-negotiables are stable:

- Project data stays local unless the operator exports it or sends selected context to an AI provider.
- Saved Scope is authoritative for evidence visibility and AI-First actions.
- Active work has explicit request, concurrency, payload, delay, timeout, and runtime limits.
- AI actions remain visible in the browser and workbench.
- Findings cite durable local evidence and remain reviewable.
- Plugins and workflows cannot bypass IPC validation, Scope, replay limits, or audit logging.

## Shipped baseline

Radar currently includes:

- Project and session persistence with migrations, demo data, notes, saved views, search, bundle import/export, and handoff packages.
- HTTP/S and WebSocket capture through a managed browser or local proxy.
- Scoped query filters, tags, comments, bulk actions, a sitemap, and session diff.
- Request and response interception with match/replace rules and evidence metadata.
- Multi-tab Repeater with environments, collections, history, response diff, burst replay, and WebSocket replay.
- Bounded Automate sessions with explicit markers, payload sets, clustering, match/extract rules, and promotion.
- Findings, report presets, dedupe suggestions, assignment fields, evidence appendices, and retest matrices.
- Declarative workflows with visual review, conditions, templates, dry run, revision history, and scoped active steps.
- Local plugins with manifest validation, explicit permissions, bounded SDK actions, no-script panel preview, trust labels, and audit records.
- Advanced GraphQL, API import, auth, identity, parameter, secret, cache, CORS, host, and redirect signals.
- A separate AI Operator with run profiles, task history, Mission Graph, capability grants, durable receipts, recovery, run memory, and completion reports.
- Unit coverage gates, Electron workflow regression, deterministic fixtures, visual baselines, platform checks, containers, and a human UI release review.

## Priority 0: make releases trustworthy

Radar is pre-1.0 and its installers are not yet fully signed. Public trust work comes before claims that Radar can replace a mature proxy.

### Distribution

- Sign and notarize macOS builds.
- Sign Windows installers.
- Publish Linux checksums and verify AppImage, Debian, and Arch packages on matching hosts.
- Add release SBOM and provenance artifacts.
- Add packaged-app smoke tests for every supported operating system.
- Generate release notes with a short human-edited summary.
- Add a local-only update check that sends no project data.

### Public security posture

- Add `SECURITY.md` with supported versions, disclosure instructions, and response expectations.
- Add `CONTRIBUTING.md` with setup, branch rules, tests, screenshots, and IPC safety guidance.
- Add issue templates and a maintained changelog.
- Publish a threat model for Electron windows, preload IPC, the proxy CA, AI context, bundles, plugins, and workflows.
- Add a Content Security Policy to the renderer.
- Remove `webviewTag` if no shipped feature needs it, or document and constrain the requirement.
- Revisit the documented Electron 42 sandbox exception for both renderer windows.
- Move pasted AI keys from plain JSON to operating-system protected storage.
- Add dependency, license, Electron security, and secret-handling checks to CI.

### First-run clarity

- Add onboarding that can load the demo, explain local storage, show the proxy address, and guide manual certificate trust.
- Put privacy and data-path explanations inside the app, including raw AI context and raw export.
- Add proxy health diagnostics for port use, CA state, browser discovery, Playwright connection, and the last proxy error.

## Priority 1: prove findings independently

The next AI and evidence milestone is independent verification and finding-to-regression.

- Let an operator ask for a separate verification pass over one draft finding.
- Keep the verifier read-only until a narrowly scoped repro needs explicit authority.
- Record supporting, contradicting, and missing evidence without rewriting the original observation.
- Make negative results visible and useful.
- Turn an accepted finding into a saved regression workflow with reviewed inputs and caps.
- Link the workflow result back to the finding and retest matrix.
- Add seeded evaluation cases for unsupported claims, bad references, false confidence, and clean negative results.

Success means a finding can move from observation to independent check to repeatable retest without copying evidence between tools.

## Priority 2: deepen daily proxy work

### History and evidence review

- Add configurable columns, persisted widths, and density presets.
- Add body viewers for raw text, formatted JSON, hex, images, and normalized diff.
- Add retention controls with a clear warning before raw evidence is deleted.
- Add a chronological project event log across proxy, replay, Automate, workflows, plugins, SSL, and AI.
- Add large-dataset renderer tests and virtualize tables only where measurement proves the need.

### Proxy and intercept

- Add upstream proxy settings, authentication, bypass rules, and DNS or host aliases for labs.
- Add a setup wizard for external browsers, CLIs, mobile devices, emulators, and desktop clients.
- Add intercept queue search, grouping, and hold-next controls.
- Add match/replace rule testing, import/export, hit counts, and affected-capture links.
- Add WebSocket match/replace only after the evidence and cancellation model is clear.

### Repeater

- Add semantic JSON, cookie, redirect, timing, and TLS comparisons.
- Add history search across tabs and grouped send with explicit total request cost.
- Add project, session, tab, and one-use variable scopes with masking.
- Preview environment substitution before transmit.
- Add XML, GraphQL, multipart, protobuf, and grpc-web transforms where the format can be handled safely.

### Automate

- Add pitchfork, cluster-bomb, battering-ram, numeric-range, and null payload modes.
- Add visible preprocessing chains for encoding, prefixes, suffixes, replacement, hashing, and JSON escaping.
- Add resumable sessions with crash-safe checkpoints.
- Add baseline comparison, stronger outlier scoring, timing bands, and extracted-value columns.
- Add per-host rate limits, backoff, pause-on-error, maximum runtime, and one visible kill switch.
- Add CSV and Markdown evidence exports alongside JSON.

## Priority 3: bounded scanner and discovery work

Radar should not hide active scanning behind a button. Scanner-style work should be a visible set of scoped workflows with budgets and evidence.

- Expand passive checks for mixed content, redirects, disclosure, robots and sitemap files, content type, TLS, CSP, and reflected parameter clues.
- Add low-noise active profiles for method changes, reflection, cache behavior, CORS, host headers, and selected metadata discovery.
- Add a scanner dashboard for coverage, pending checks, skipped origins, issues, and request cost.
- Add crawl planning from links, forms, scripts, OpenAPI references, GraphQL endpoints, and saved identities.
- Add bounded content discovery with wordlists, extension filters, recursion limits, and per-host rates.
- Add tested and untested state to sitemap endpoints without confusing absence of evidence with a passing result.

## Priority 4: focused advanced tools

These tools should be added only when the daily capture and replay loop remains clear.

- Out-of-band interaction support through an operator-provided callback service, with local correlation and evidence linking.
- Browser-side DOM source and sink review, `postMessage`, storage, prototype-pollution clues, frame checks, and safe canaries.
- A page-action recorder that produces a reviewable workflow draft.
- Token sample collection and randomness analysis.
- Dedicated Decoder and Comparer tools for common web formats.
- HAR and raw HTTP import/export.
- Better HTTP/2 and HTTP/3 visibility notes, plus focused gRPC and grpc-web helpers where the underlying libraries support them.

Hosted callback infrastructure is not a prerequisite. If it is ever added, it must be a separate opt-in service and must not receive project data by default.

## Priority 5: harden extensions and workflows

The current plugin API is bounded, but approved entry code still needs a stronger isolation story before Radar encourages third-party packages.

- Run plugin code in an isolated process or a hardened sandbox outside the privileged Electron main process.
- Add SDK documentation, a test harness, package size and dependency checks, and signed first-party packages.
- Add workflow import/export and maintained workflow packs.
- Expand workflow nodes for bounded HTTP, browser, extract, match, transform, delay, loop, finding, note, and report actions.
- Add JavaScript or shell steps only after permission, sandbox, timeout, filesystem, and audit behavior are explicit.

Do not build a public marketplace before package signing, isolation, abuse review, and update verification are in place.

## Work intentionally deferred

- Hosted project sync and collaboration.
- A public plugin marketplace.
- Invisible proxy mode.
- Unbounded AI orchestration.
- Automatic certificate installation.
- Silent scope expansion.

File-based bundles and handoff packages are the collaboration model until local safety and public governance are solid.

## How roadmap work ships

Every user-facing change must land as one vertical slice:

1. Define or update serializable contracts in `shared/`.
2. Add main-process behavior and boundary validation in `electron/`.
3. Expose the narrow preload and IPC path.
4. Build the Manual-First controls and visible state in `src/`.
5. Add or explicitly rule out the AI-First tool or read-only context path.
6. Test the main path, the likely failure, and every changed safety boundary.
7. Update the README, user guide, manual QA, and screenshots when the operator surface changes.
8. Run `pnpm lint`, `pnpm test:unit`, and `pnpm build`, plus the relevant Electron regression gate.

A roadmap item is done when the shipped app and its verification agree. A checked box in a plan is not evidence.
