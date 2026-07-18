# Radar Full-Workflow Regression Suite Specification

Status: implemented coverage contract (164/164 IDs registered)  
Runner: Playwright Electron  
Canonical product workflow: `docs/USER_GUIDE.md`  
Canonical manual inventory: `docs/MANUAL_QA_CHECKLIST.md`

The default suite executes deterministic local cases and explicitly skips five `@platform` cases plus two `@soak` cases unless `RADAR_REGRESSION_PLATFORM=1` or `RADAR_REGRESSION_SOAK=1` is set. Skips remain coverage gaps in the generated report.

## Purpose

This specification defines the regression workflows Radar should automate beyond renderer/unit tests. The suite must use the application as an operator would: launch a real Electron process, interact through visible controls, cross the real preload/IPC boundary, persist to a real isolated SQLite store, and use suite-owned local HTTP/S and WebSocket services whenever traffic is required.

The suite is intended to answer four release questions:

1. Can an operator complete Radar's primary defensive-testing workflows?
2. Do scope, replay caps, confirmation gates, redaction, and AI policy fail closed?
3. Does evidence survive the expected project, session, and application lifecycle?
4. Which failures, flaky workflows, coverage gaps, or slow paths need improvement?

## Test Levels And Tags

| Tag | Meaning | Default cadence |
| --- | --- | --- |
| `@smoke` | Launch and highest-value operator paths. | Every pull request. |
| `@core` | Deterministic local-data workflows. | Every pull request. |
| `@network` | Real loopback HTTP/S, proxy, replay, intercept, or WebSocket traffic. | Every pull request after fixture harness ships. |
| `@persistence` | Restart, session, project, and database isolation. | Every pull request. |
| `@security` | Scope, redaction, caps, permission, or confirmation boundaries. | Every pull request. |
| `@files` | Imports, exports, reports, wordlists, and plugin directories. | Every pull request. |
| `@ai` | Deterministic fake-provider Manual-First or AI-First behavior. | Nightly and release; selected smoke cases on pull requests. |
| `@platform` | Installed browser, keychain, certificate, packaged-app, or OS integration. | Nightly on each supported OS. |
| `@soak` | Repetition, concurrency, leak, and longevity tests. | Nightly or scheduled. |

Tests may carry multiple tags. A failed `@security` case is always release-blocking. Skipped cases must be listed as coverage gaps in the generated report.

## Real-Use Fixture System

### Per-test Radar application

Every test launches its own Electron process with:

- An isolated temporary `userData` directory and SQLite database.
- Worker-specific proxy and Chrome debugging ports.
- An independent project/session/browser profile.
- Captured console, main-process stderr, trace, screenshot, and video artifacts on failure.
- Guaranteed cleanup, including child browser and fixture-server processes.

Tests must not share mutable Radar state. A serial group is permitted only when application restart is itself part of the story.

### Loopback target laboratory

Create a suite-owned target server bound to `127.0.0.1` on dynamic ports. It should expose deterministic routes:

| Route | Behavior and use |
| --- | --- |
| `/` | HTML page linking to the laboratory routes. |
| `/api/users?role=` | JSON response, query parameters, cache/CORS headers. |
| `/api/login` | Accepts JSON and form bodies; sets a non-sensitive test cookie. |
| `/api/account` | Returns 200 for a fixture bearer/cookie and 401 otherwise. |
| `/api/redirect` | Redirects to another in-scope route. |
| `/api/slow?ms=` | Bounded delay for timeout and concurrency tests. |
| `/api/echo` | Echoes normalized method, headers, query, and body. |
| `/api/status/:code` | Returns a requested safe fixture status. |
| `/graphql` | Handles named queries/mutations, variables, batching, and an introspection-shaped response. |
| `/openapi.json` | Serves a deterministic OpenAPI fixture. |
| `/socket` | WebSocket echo, server event, close, and error fixtures. |

The server records an append-only request ledger so tests can prove whether Radar did or did not transmit. No regression test may send traffic to a non-loopback destination.

### HTTPS laboratory

Run a second local server with a suite-generated certificate. It supplies predictable trusted/blocked TLS observations without changing the system trust store. Platform-specific certificate installation remains outside normal pull-request runs.

### Deterministic AI provider

Provide a local OpenAI-compatible fixture endpoint with scripted responses keyed by task/goal. It must support:

- Valid Manual-First summaries and draft outputs.
- Valid AI-First tool plans.
- Malformed JSON, timeout, HTTP error, and interrupted-stream responses.
- Unsafe/out-of-scope tool requests for policy-block tests.
- Findings with complete and incomplete evidence contracts.

The fake provider request ledger must prove exactly what redacted or raw context Radar sent.

### File fixtures

Generate fixtures in a per-test temporary directory:

- Valid and invalid OpenAPI/Postman definitions.
- Small and over-limit Automate wordlists.
- Valid, incompatible, missing-file, untrusted, and over-permission plugin packages.
- Project bundles for metadata-only, redacted, reviewed-finding, raw, conflicting-id, corrupt, and newer-version cases.
- Expected Markdown/HTML report snapshots normalized for timestamps and generated ids.

## Assertion Rules

- Prefer roles, labels, visible copy, and stable `data-testid` selectors.
- Assert visible state and fixture-server ledgers together for traffic-producing workflows.
- Prove negative safety outcomes: no request sent, no scope widened, no plugin executed, no raw context included, or no record changed.
- Do not assert implementation-only SQLite rows unless persistence cannot be verified visibly. Process/path invariants may use Electron evaluation.
- Normalize only volatile ids, ports, and timestamps in artifact snapshots.
- A workflow passes only after its final durable or externally observable result is verified.

## Workflow Catalog

### A. Harness, startup, and shell

| ID | Tags | Operator use case and actions | Required proof |
| --- | --- | --- | --- |
| `REG-APP-001` | `@smoke` | Launch Radar from the production build with a clean profile. | Shell appears, default project/session load, no renderer error, preload API is available. |
| `REG-APP-002` | `@core` `@security` | Launch four Radar instances concurrently. | Unique user-data paths, databases, proxy ports, debug ports, and unchanged state across instances. |
| `REG-APP-003` | `@smoke` | Load the demo from Projects. | Demo project/session names, scope, captures, frames, findings, workflows, plugin, and advanced signals appear. |
| `REG-APP-004` | `@core` | Navigate all twelve numbered views. | Correct active marker, heading, controls, and no page/console error for every view. |
| `REG-APP-005` | `@core` | Switch Bureau, Vellum, and Specter themes. | Theme persists after reload and selected evidence remains readable/visible. |
| `REG-APP-006` | `@core` | Open and close Search, Notes, Projects, Appearance, and AI settings with buttons and Escape. | Only intended overlay is active; focus returns to its trigger. |
| `REG-APP-007` | `@core` | Toggle Manual-First and AI-First without submitting a goal. | Mode changes visibly; no agent run or fixture-provider request is created. |
| `REG-APP-008` | `@core` | Create and switch sessions from both quick selector and Projects panel. | Active session changes and prior evidence counts remain intact. |
| `REG-APP-009` | `@core` | Exercise `Cmd/Ctrl+P` and keyboard navigation in global search. | Overlay opens, result can be selected, Escape closes it, focus behavior is stable. |
| `REG-APP-010` | `@core` | Compare sidebar and footer telemetry after demo load and view changes. | Counts match visible scoped captures, frames, TLS events, and proxy state. |

### B. Projects, sessions, notes, saved views, and search

| ID | Tags | Operator use case and actions | Required proof |
| --- | --- | --- | --- |
| `REG-PROJ-001` | `@core` `@persistence` | Create and rename a project, then restart. | Project name and independent workspace survive restart. |
| `REG-PROJ-002` | `@core` `@persistence` | Create, rename, and switch sessions. | Each session keeps its own evidence ledger; names survive restart. |
| `REG-PROJ-003` | `@core` | Create, edit, search, and delete a project note. | Search opens the note; edits persist; delete removes only that note. |
| `REG-PROJ-004` | `@core` `@persistence` | Save a filtered Traffic view and a selected Finding view, restart, then open them. | View, filters, and supported selection state restore correctly. |
| `REG-PROJ-005` | `@core` | Search each supported kind using kind filters. | Capture, frame, replay, finding, workflow, plugin, advanced, saved filter, note, and saved view results route correctly. |
| `REG-PROJ-006` | `@security` | Search for an out-of-scope capture known to the fixture ledger. | No result exposes the out-of-scope evidence. |
| `REG-PROJ-007` | `@core` | Enter malformed or unsupported global-search filters. | Clear operator error appears; app remains usable and no state changes. |
| `REG-PROJ-008` | `@persistence` | Load the demo twice. | Stable records refresh without duplicate captures/findings/workflows/plugins. |

### C. Project bundles, handoffs, and reports

| ID | Tags | Operator use case and actions | Required proof |
| --- | --- | --- | --- |
| `REG-FILE-001` | `@files` `@security` | Preview metadata-only, redacted, reviewed-findings, and raw bundle profiles. | Counts/warnings match; raw preview requires explicit selection and warning. |
| `REG-FILE-002` | `@files` | Export a redacted project bundle and inspect the written JSON. | File exists, parses, contains expected artifacts, and omits fixture secrets/raw bodies. |
| `REG-FILE-003` | `@files` `@security` | Preview import with conflicts and proposed scope targets. | Conflicts are skipped, proposed targets remain inactive, and no traffic/action occurs. |
| `REG-FILE-004` | `@files` `@persistence` | Apply a valid redacted import. | Imported sessions/artifacts appear; existing records remain; restart preserves import. |
| `REG-FILE-005` | `@files` `@security` | Import corrupt and unsupported-newer bundles. | Apply is disabled/fails closed and the current project remains unchanged. |
| `REG-FILE-006` | `@files` `@security` | Preview and export a default handoff package. | Only reviewed findings and their referenced redacted evidence are included. |
| `REG-FILE-007` | `@files` | Opt draft findings into a handoff. | Draft count changes only after opt-in and unrelated evidence is excluded. |
| `REG-FILE-008` | `@files` `@security` | Build Markdown and HTML finding reports. | Narrative sections, validation warnings, retest matrix, and redacted appendices match expected artifacts. |
| `REG-FILE-009` | `@files` `@security` | Enable raw report evidence explicitly. | Raw fixture evidence appears only in this output and the UI shows the raw warning. |

### D. HTTP/S capture and evidence operations

| ID | Tags | Operator use case and actions | Required proof |
| --- | --- | --- | --- |
| `REG-HTTP-001` | `@network` `@smoke` | Start proxy, send GET/POST requests through it to the lab. | Real requests reach the lab and appear with method, URL, status, size, timing, and session. |
| `REG-HTTP-002` | `@network` `@security` | Send one in-scope and one out-of-scope request. | Both may be recorded locally as designed, but only in-scope evidence is visible/queryable/AI-readable. |
| `REG-HTTP-003` | `@core` | Combine method, type, sort, and query filters. | Rows and count match expected intersection and order. |
| `REG-HTTP-004` | `@core` | Save, apply, and clear a Traffic filter. | Chip reproduces query state; clear restores all in-scope rows. |
| `REG-HTTP-005` | `@core` `@persistence` | Add tags/comments to a capture and restart. | Annotation appears in detail and global search after restart. |
| `REG-HTTP-006` | `@core` | Multi-select captures, bulk-tag two, then delete one. | Only selected records change; unselected evidence remains. |
| `REG-HTTP-007` | `@files` `@security` | Bulk export selected captures. | Export includes selected scoped evidence and honors redaction. |
| `REG-HTTP-008` | `@core` | Inspect request, response, and TLS detail; copy URL/raw/cURL. | Detail matches lab ledger; clipboard formats are syntactically correct and secrets are handled per action. |
| `REG-HTTP-009` | `@core` | Send a capture to Repeater using button and context menu. | Both paths create equivalent normalized drafts without transmitting. |
| `REG-HTTP-010` | `@core` `@security` | Clear HTTP captures with the explicit eraser action. | HTTP rows clear; WebSocket frames and other project artifacts remain. |
| `REG-HTTP-011` | `@network` | Capture redirects, query parameters, JSON, form, empty, and truncated bodies. | Inspector renders each safely and truncation caps are visible/consistent. |
| `REG-HTTP-012` | `@security` | Capture authorization/cookie fixtures. | Default UI/search/export/AI redaction behavior does not leak fixture secret values. |

### E. WebSocket workflows

| ID | Tags | Operator use case and actions | Required proof |
| --- | --- | --- | --- |
| `REG-WS-001` | `@network` | Connect to lab WebSocket, send/receive text frames, then close. | Handshake, sent, received, and close evidence appear in order. |
| `REG-WS-002` | `@core` | Filter by direction and query payload/header fields. | Visible rows/count match the expected frames. |
| `REG-WS-003` | `@core` `@persistence` | Tag/comment a frame and restart. | Annotation persists and is searchable. |
| `REG-WS-004` | `@core` | Copy selected frame detail. | Clipboard contains URL, direction, payload, headers, timestamp, and source id. |
| `REG-WS-005` | `@network` | Load a frame into WebSocket replay and transmit to lab. | Draft preserves source data; lab receives payload; result is visible. |
| `REG-WS-006` | `@security` | Attempt WebSocket replay to an invalid/unavailable target. | Bounded error appears; no unrelated app state changes. |
| `REG-WS-007` | `@core` | Clear WebSocket events. | Frames clear while HTTP captures remain. |

### F. Scope and safety boundaries

| ID | Tags | Operator use case and actions | Required proof |
| --- | --- | --- | --- |
| `REG-SCOPE-001` | `@security` | Launch a clean project. | Default targets are local-development-only. |
| `REG-SCOPE-002` | `@security` | Save exact origins, hostnames, wildcard origins, and `local`. | Matching lab URLs become visible exactly as documented. |
| `REG-SCOPE-003` | `@security` | Save blanks, malformed URLs, wildcard abuse, and mixed-case targets. | Inputs normalize or are rejected safely; no unintended widening. |
| `REG-SCOPE-004` | `@security` | Remove the active lab origin after evidence exists. | HTTP, WebSocket, sitemap, search, and AI context hide it without deleting stored evidence. |
| `REG-SCOPE-005` | `@security` | Re-add the origin. | Existing evidence becomes visible again without duplication. |
| `REG-SCOPE-006` | `@security` | Use Repeater Trust Origin on a draft. | Only the normalized draft origin is added; no request is sent. |
| `REG-SCOPE-007` | `@security` `@network` | Attempt AI-First replay/navigation outside saved scope. | Policy card records the block and lab/external ledgers show no transmission. |

### G. Intercept and match/replace

| ID | Tags | Operator use case and actions | Required proof |
| --- | --- | --- | --- |
| `REG-INT-001` | `@network` | Enable request intercept and send a lab request. | Request pauses visibly and lab has not received it. |
| `REG-INT-002` | `@network` | Edit paused method, URL, headers, and body, then forward. | Lab receives exactly the edited request and evidence records resolution. |
| `REG-INT-003` | `@network` | Drop a paused request. | Queue clears with dropped state and lab receives nothing. |
| `REG-INT-004` | `@network` | Queue several requests and Resume All. | All resolve once, queue empties, and no duplicate sends occur. |
| `REG-INT-005` | `@core` `@persistence` | Save valid request/response intercept rules and restart. | Rules render and retain normalized values. |
| `REG-INT-006` | `@security` | Enter invalid or over-broad intercept rule JSON. | Save fails with clear error and prior valid configuration remains active. |
| `REG-INT-007` | `@network` | Apply match/replace to a scoped lab request. | Lab and captured evidence show the bounded transformation. |
| `REG-INT-008` | `@security` `@ai` | Have AI prepare an intercept edit. | Visible draft changes, but queue item remains paused until operator forward/drop. |

### H. Repeater and replay history

| ID | Tags | Operator use case and actions | Required proof |
| --- | --- | --- | --- |
| `REG-REP-001` | `@network` `@smoke` | Clone a captured lab request, edit it, and transmit once. | Lab receives normalized request; response status/headers/body/duration/bytes appear. |
| `REG-REP-002` | `@core` `@persistence` | Create, rename, pin, select, close, and restore tabs. | Tab state and selected draft persist across restart. |
| `REG-REP-003` | `@network` | Use environment variables in URL, header, and body. | Lab receives materialized values while saved draft retains variables. |
| `REG-REP-004` | `@security` | Use a missing variable and an oversized body. | Clear validation/cap error; lab receives no request. |
| `REG-REP-005` | `@network` | Send two variants and compare replay history. | Both records are selectable and diff highlights status/header/body changes. |
| `REG-REP-006` | `@core` `@persistence` | Save a draft to a collection, edit active tab, then reload saved item. | Collection restores original normalized draft and survives restart. |
| `REG-REP-007` | `@network` | Run a bounded burst with count, concurrency, and delay. | Lab sees exact count; observed concurrency/delay stay within configured bounds. |
| `REG-REP-008` | `@security` | Enter burst values below/above caps. | UI clamps values and lab never receives more than the hard maximum. |
| `REG-REP-009` | `@network` | Exercise 204, 401, 500, redirect, slow, and connection-error responses. | Each result is represented accurately without crashing or losing history. |
| `REG-REP-010` | `@security` | Replay headers containing hop-by-hop or unsafe values. | Lab sees normalized safe headers; stripped headers are absent. |

### I. Automate

| ID | Tags | Operator use case and actions | Required proof |
| --- | --- | --- | --- |
| `REG-AUTO-001` | `@core` | Insert URL, header, and body payload markers. | Visible positions and Repeater draft update with stable marker names. |
| `REG-AUTO-002` | `@core` `@persistence` | Create, select, update, and reload an inline payload set. | Values persist in workspace without cross-project leakage. |
| `REG-AUTO-003` | `@files` `@security` | Reference a wordlist file. | Main process reads bounded contents; renderer receives preview/metadata, not unrestricted file access. |
| `REG-AUTO-004` | `@security` | Use over-limit wordlist and count/concurrency/delay/timeout values. | Limits clamp/fail clearly before excessive traffic. |
| `REG-AUTO-005` | `@network` | Run payloads against lab status/echo routes with match/extract rules. | Exact requests, results, matches, extracts, and clusters appear. |
| `REG-AUTO-006` | `@network` | Pause and resume an active slow session. | Request issuance pauses, resumes without duplication, and final counts are exact. |
| `REG-AUTO-007` | `@network` | Stop one of two sessions. | Only selected session stops; other session completes. |
| `REG-AUTO-008` | `@network` | Retry failed attempts after lab recovery. | Only eligible failures retry and result lineage remains visible. |
| `REG-AUTO-009` | `@core` | Promote a result to Repeater and Findings. | Visible draft/finding contain materialized request and evidence reference; no extra send occurs. |

### J. Findings and retesting

| ID | Tags | Operator use case and actions | Required proof |
| --- | --- | --- | --- |
| `REG-FIND-001` | `@core` | Filter demo findings by text, status, severity, owner/assignee, and component. | Each filter and combined filters return expected queue. |
| `REG-FIND-002` | `@core` | Create findings from capture, WebSocket frame, Automate result, and Workflow result. | Each draft includes correct source and evidence reference. |
| `REG-FIND-003` | `@core` | Create from each built-in template. | Expected title/impact/remediation scaffolding appears without auto-review. |
| `REG-FIND-004` | `@core` `@persistence` | Fill all fields, save, switch sessions, return, and restart. | Complete finding persists only in its session. |
| `REG-FIND-005` | `@core` | Add retest notes and transition draft/reviewed/resolved states. | History/matrix reflects transitions and latest result. |
| `REG-FIND-006` | `@core` | Generate duplicate suggestions and merge. | Preview identifies primary/duplicate; only explicit Merge consolidates evidence/notes. |
| `REG-FIND-007` | `@security` | Cancel or ignore a duplicate suggestion. | Neither finding changes. |
| `REG-FIND-008` | `@core` | Delete a selected finding among several. | Only selected id disappears; evidence records remain. |
| `REG-FIND-009` | `@security` | Attempt to save invalid severity/status/evidence references via imported or AI data. | Normalization rejects or safely defaults; malformed record does not enter inbox. |

### K. Workflows

| ID | Tags | Operator use case and actions | Required proof |
| --- | --- | --- | --- |
| `REG-WF-001` | `@core` | Browse built-in and demo saved workflows. | Built-ins are marked immutable; saved workflow is editable. |
| `REG-WF-002` | `@core` | Insert every supported step template. | Visible definition and graph show correct type, order, branch labels, and active/passive marker. |
| `REG-WF-003` | `@core` `@security` | Validate valid, malformed, unknown-step, missing-input, and over-cap definitions. | Dry Run reports runnable/skipped steps, warnings, estimates, and cap errors accurately. |
| `REG-WF-004` | `@core` `@persistence` | Save and edit a custom workflow several times. | Revision history records compact diffs and survives restart. |
| `REG-WF-005` | `@core` | Run a passive workflow on demo/lab evidence. | Results and evidence appear with zero new lab requests. |
| `REG-WF-006` | `@network` `@security` | Run an active workflow within scope/cap. | Lab receives only estimated bounded requests; run records inputs/results. |
| `REG-WF-007` | `@security` | Run active workflow without scope, required capture, or within action cap. | Run is blocked/skipped as appropriate and lab receives nothing excessive. |
| `REG-WF-008` | `@core` | Promote warning/failure result to Findings. | Draft finding references workflow run/result evidence. |
| `REG-WF-009` | `@core` | Delete a saved workflow and attempt to delete a built-in. | Saved workflow deletes; built-in remains protected. |
| `REG-WF-010` | `@ai` `@security` | AI prepares a workflow draft. | Visible editor/graph change; workflow is neither saved nor run until operator acts. |
| `REG-WF-011` | `@ai` `@security` | AI selects an existing workflow id. | Normal run contract, scope checks, caps, timeline, and visible result are reused. |

### L. Plugins

| ID | Tags | Operator use case and actions | Required proof |
| --- | --- | --- | --- |
| `REG-PLUG-001` | `@core` | Inspect the seeded demo plugin. | Requested/granted permissions, status, panels, and metadata match fixture. |
| `REG-PLUG-002` | `@files` `@security` | Preview a valid plugin directory. | Manifest is displayed but entry/panel code has not executed. |
| `REG-PLUG-003` | `@files` `@security` | Validate missing files, incompatible version, bad manifest, and untrusted marker fixtures. | Specific warnings/errors appear and no registry install occurs. |
| `REG-PLUG-004` | `@files` | Install a valid plugin. | Pending registry record appears with no granted permissions. |
| `REG-PLUG-005` | `@security` | Approve a subset/invalid superset of requested permissions. | Only requested approved permissions can be granted. |
| `REG-PLUG-006` | `@core` `@persistence` | Disable, enable, block, and restart. | Status persists and affects only selected plugin. |
| `REG-PLUG-007` | `@security` | Render approved and unapproved panels. | Approved static panel renders in no-script sandbox; unapproved/blocked panel does not execute. |
| `REG-PLUG-008` | `@security` | Execute allowed and denied SDK actions. | Allowed bounded result appears; denied action fails; audit records permission/result metadata. |
| `REG-PLUG-009` | `@core` | Remove a plugin. | Selected registry/panels disappear; unrelated plugins and project evidence remain. |
| `REG-PLUG-010` | `@ai` `@security` | Ask AI to inspect and then operate plugin inventory. | Inventory may be read; install/approve/execute requests are blocked and audited. |

### M. Advanced analysis and sitemap

| ID | Tags | Operator use case and actions | Required proof |
| --- | --- | --- | --- |
| `REG-ADV-001` | `@network` | Capture fixture GraphQL named, variable, batched, and introspection traffic. | Operations/groups/templates and batching/introspection signals match requests. |
| `REG-ADV-002` | `@files` `@security` | Preview OpenAPI and Postman fixtures. | Drafts/sitemap seeds appear and lab ledger proves no request was sent. |
| `REG-ADV-003` | `@files` | Save reviewed imported drafts to collection and Repeater. | Selected normalized drafts load visibly without transmission. |
| `REG-ADV-004` | `@core` | Build auth matrix from anonymous, bearer, basic, cookie, and mixed fixture captures. | Counts/status comparisons/evidence refs match fixture set. |
| `REG-ADV-005` | `@core` | Build parameter inventory from query, JSON, cookie, GraphQL, and WS JSON. | Each parameter is attributed to correct source and evidence. |
| `REG-ADV-006` | `@security` | Detect fixture secret patterns. | Masked previews/rule counts appear; raw secret is absent from overview/search/report. |
| `REG-ADV-007` | `@core` | Generate cache, CORS, host, and redirect signals. | Signal type, severity/context, and evidence links route correctly. |
| `REG-ADV-008` | `@security` | Prepare a workflow from an Advanced signal. | Visible draft appears; no save/run/transmission until operator action. |
| `REG-MAP-001` | `@network` | Capture multiple hosts/paths/methods/statuses on lab aliases. | Sitemap tree and endpoint inventory aggregate correctly. |
| `REG-MAP-002` | `@core` | Select a sitemap node and jump to Traffic. | Traffic query and visible captures match node. |
| `REG-MAP-003` | `@persistence` | Compare baseline and active sessions. | Added, removed, and changed endpoints match fixture ledgers. |

### N. SSL, proxy, and browser integration

| ID | Tags | Operator use case and actions | Required proof |
| --- | --- | --- | --- |
| `REG-SSL-001` | `@network` | Generate CA and start/stop isolated proxy. | Paths/fingerprint render; running state/URL/port update; shutdown releases port. |
| `REG-SSL-002` | `@security` | Verify CA generation in isolated user data. | Files have restricted permissions and no system certificate store is modified. |
| `REG-SSL-003` | `@network` | Send HTTPS fixture traffic through proxy. | TLS/capture evidence appears with expected subject/issuer/trust result. |
| `REG-SSL-004` | `@core` `@persistence` | Save Radar Browser, external, CLI, and device proxy notes. | Notes survive workspace reload and do not leak to another project. |
| `REG-SSL-005` | `@platform` | Launch the supported isolated system browser to lab. | Dedicated profile/debug endpoint/proxy are used and traffic appears in Radar. |
| `REG-SSL-006` | `@platform` `@security` | Switch projects while browser is active. | Old project browser/profile stops or detaches safely; state does not cross projects. |
| `REG-SSL-007` | `@platform` | Simulate unavailable browser and occupied default ports. | Clear launch error or alternate port behavior; Radar remains usable. |

### O. Identity Lab

| ID | Tags | Operator use case and actions | Required proof |
| --- | --- | --- | --- |
| `REG-ID-001` | `@core` `@persistence` | Create/edit/archive identities with role, tenant, resource, origin, and notes. | Roster persists and archived identity cannot activate. |
| `REG-ID-002` | `@security` | Attempt identity creation/activation outside scope. | Operation is blocked and no browser/navigation occurs. |
| `REG-ID-003` | `@platform` `@network` | Activate scoped dedicated identity against lab. | Dedicated profile, activation record, and attributed captures appear. |
| `REG-ID-004` | `@platform` `@network` | Verify healthy, expired, stale, and error identity routes. | Health semantics and evidence refs match status/redirect behavior. |
| `REG-ID-005` | `@core` | Build role × tenant × resource matrix from attributed evidence. | Cells/counts/statuses match identity fixtures. |
| `REG-ID-006` | `@core` | Record one-dimension comparison. | Differential identifies intended changed dimension and referenced evidence. |
| `REG-ID-007` | `@ai` `@security` | Include identity context in AI task with raw context off/on. | Metadata always allowed; raw cookie/storage values appear only after explicit opt-in. |

### P. AI Manual-First

| ID | Tags | Operator use case and actions | Required proof |
| --- | --- | --- | --- |
| `REG-AIM-001` | `@ai` | Configure/probe deterministic local provider and choose model. | Connection state/model persist without exposing credential fields. |
| `REG-AIM-002` | `@ai` `@security` | Preview default redacted context. | Provider ledger contains scoped redacted samples and no fixture secrets. |
| `REG-AIM-003` | `@ai` `@security` | Explicitly enable raw context and preview. | Warning/opt-in visible and raw fixture values are sent only for that enabled request. |
| `REG-AIM-004` | `@ai` | Run summary, report notes, checklist, TLS, and WebSocket analysis tasks. | Normalized results render and audit records task/model/context mode. |
| `REG-AIM-005` | `@ai` `@security` | Request repeater/navigation/workflow drafts. | Drafts load visible controls but do not transmit, navigate, save, or run. |
| `REG-AIM-006` | `@ai` | Save/edit/delete a custom skill and use it in a task. | Skill persists locally, affects provider request, and deletion removes it. |
| `REG-AIM-007` | `@ai` | Return malformed JSON, HTTP failure, and timeout from provider. | Clear recoverable errors render; prior drafts/evidence remain unchanged. |
| `REG-AIM-008` | `@ai` `@security` | Switch project/session between preview and run. | Run uses current visible scoped context and audit attribution, never stale hidden context. |

### Q. AI-First runtime and safety

| ID | Tags | Operator use case and actions | Required proof |
| --- | --- | --- | --- |
| `REG-AIF-001` | `@ai` `@smoke` | Start a passive scoped goal with deterministic planner. | Visible timeline, profile/budgets, tool cards, tab switches, completion, and saved transcript appear. |
| `REG-AIF-002` | `@ai` `@security` | Request out-of-scope navigation/replay. | Tool is policy-blocked, timeline explains why, and no request is sent. |
| `REG-AIF-003` | `@ai` `@security` | Exhaust replay, workflow, step, capture-sample, and timeout budgets separately. | Each hard limit stops further matching actions and remains visible. |
| `REG-AIF-004` | `@ai` | Pause and resume a run. | No tool steps execute while paused; same run continues after resume. |
| `REG-AIF-005` | `@ai` `@security` | Stop an active run during delayed planner/tool response. | Run stays stopped and no later tool result mutates app state. |
| `REG-AIF-006` | `@ai` | Force passive tool failure and use retry, retry-with-evidence, skip, and stop recovery paths. | Selected recovery is recorded and only permitted next step occurs. |
| `REG-AIF-007` | `@ai` | Draft a finding from failed recovery. | Draft is visible/reviewable with failure evidence; no reviewed status is granted. |
| `REG-AIF-008` | `@ai` `@security` | Return incomplete and complete findings. | Incomplete finding is rejected with reasons; complete finding enters inbox as draft. |
| `REG-AIF-009` | `@ai` `@persistence` | Confirm/dismiss proposed memory, create manual memory, search, restart. | Confirmed, dismissed, and manual dispositions persist with distinct status so later runs do not repeat dismissed leads. |
| `REG-AIF-010` | `@ai` `@security` | Attempt invisible Automate, plugin approval, file import, raw-context, burst, or certificate actions. | Capability/policy blocks are visible and no prohibited side effect occurs. |
| `REG-AIF-011` | `@ai` | Steer an active mission and grant/revoke a bounded capability lease. | Mission graph/timeline update and actions obey current lease only. |
| `REG-AIF-012` | `@ai` `@persistence` | Restart after completed, stopped, and failed runs. | Run history/full transcripts preserve correct terminal status and findings/memory attribution. |

### R. Persistence, corruption, and resilience

| ID | Tags | Operator use case and actions | Required proof |
| --- | --- | --- | --- |
| `REG-DATA-001` | `@persistence` | Build representative project state, quit cleanly, relaunch same profile. | Scope, evidence, annotations, tabs, collections, findings, workflows, plugins, AI runs, and memory persist. |
| `REG-DATA-002` | `@persistence` `@security` | Create two projects with overlapping fixture ids/data. | Switching never merges evidence, identities, notes, plugins, or AI memory. |
| `REG-DATA-003` | `@persistence` | Create new session after traffic and return to prior session. | New session starts clean and prior ledger remains intact. |
| `REG-DATA-004` | `@persistence` `@security` | Launch against database with newer unsupported schema. | Startup fails closed with actionable error and file remains unmodified. |
| `REG-DATA-005` | `@persistence` | Launch against supported older fixture database. | Migration succeeds once, data remains, repeat launch is idempotent. |
| `REG-RES-001` | `@network` | Kill lab/proxy during replay, Automate, intercept, and workflow runs. | Operations end with bounded errors; queues/controllers recover; restart is unnecessary. |
| `REG-RES-002` | `@core` | Rapidly switch views/sessions while polling data. | No stale selection crash, cross-session flash, or unhandled rejection. |
| `REG-RES-003` | `@soak` | Repeat demo load, view navigation, filtering, and project switching 50 times. | Stable record counts and bounded Electron renderer/main memory growth. |
| `REG-RES-004` | `@soak` `@network` | Capture/replay a bounded high-volume fixture set. | UI remains responsive, caps hold, persistence completes, and report flags performance regressions. |

## Completed Implementation Waves

### Wave 1: deterministic operator core

Implemented `REG-APP-*`, `REG-PROJ-*`, `REG-SCOPE-001` through `006`, demo-backed `REG-HTTP-003` through `010`, `REG-FIND-*`, passive `REG-WF-*`, and `REG-DATA-001` through `003`.

This wave needs no traffic fixture and gives broad daily confidence in visible workflows and persistence.

### Wave 2: loopback network laboratory

Built the HTTP/S/WebSocket server and request ledger and implemented `REG-HTTP-001`, `002`, `011`, `012`, `REG-WS-*`, `REG-INT-*`, `REG-REP-*`, `REG-AUTO-*`, active workflow cases, sitemap network cases, and proxy/TLS cases.

This wave proves Radar's actual capture/replay behavior rather than seeded rendering alone.

### Wave 3: file and extension workflows

Built file generators and implemented `REG-FILE-*`, `REG-PLUG-*`, API import cases, wordlists, report snapshots, migrations, and corrupt/newer-version cases.

### Wave 4: deterministic AI modes

Built the local provider/planner ledger and implemented `REG-AIM-*`, `REG-AIF-*`, and AI-linked scope/intercept/workflow/plugin/identity safety cases.

### Wave 5: platform and soak matrix

Registered browser, TLS/keychain, identity-browser, longevity, and performance cases behind explicit platform/soak gates for suitable macOS, Windows, and Linux CI hosts.

## Reporting Requirements

The existing HTML, JSON, Markdown, trace, screenshot, and video artifacts remain required. Extend `summary.md` with:

- Results grouped by tag and product view.
- Passed/failed/flaky/skipped counts against this catalog's stable ids.
- Newly failing and newly fixed cases compared with the prior baseline when CI history is available.
- Slowest ten workflows and application startup time distribution.
- Security-boundary failures in a dedicated release-blocker section.
- Fixture-ledger mismatches: unexpected sends, missing sends, duplicates, or concurrency/cap violations.
- Coverage gaps for catalog ids not yet implemented or intentionally skipped on a platform.
- Artifact links for every failure/retry.

## Definition Of Done For A Catalog Case

A test case is implemented only when it:

1. Carries its stable catalog id and tags in the Playwright title/annotations.
2. Uses visible operator controls for the workflow.
3. Verifies the final visible and durable/external outcome.
4. Verifies relevant negative safety behavior.
5. Runs independently and in parallel unless explicitly marked restart-serial.
6. Produces useful failure evidence without leaking fixture secrets.
7. Is documented as implemented in the coverage manifest used by the regression report.
