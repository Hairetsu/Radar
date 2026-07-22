# Radar

Radar is a local-first defensive web security workbench. It launches a dedicated browser profile, attaches Playwright to that visible managed Chrome session, captures HTTP/S and WebSocket traffic through Chrome's DevTools protocol plus a local MITM proxy, lets you replay requests through a controlled repeater, and runs bounded payload testing from explicit markers. Work in Manual-First mode when you want direct operator control, or switch to AI-First mode to let a scoped agent drive the same browser and evidence surfaces while you watch.

## MVP Surface

- Sidebar workspace with dedicated HTTP(S), WebSocket, Intercept, Repeater, Automate, Findings, Workflows, Plugins, Advanced, Sitemap, Scope, and SSL tabs.
- Radar Browser toolbar using a supported local Chrome, Edge, Brave, or Chromium binary with a Radar-owned profile, address/back/forward/reload controls, Radar proxy wiring, and a persistent Playwright-over-CDP automation session.
- Persistent local projects and sessions for separating clients, retests, captures, targets, stable workspace-scoped identity profiles and activations, project notes, saved views, findings, workflows, plugins, SSL events, WebSocket frames, AI-First run history, and local AI run memory.
- HTTP/S capture history with method/type filters, a scoped traffic query language, saved filters, tags and comments, bulk tag/delete/export, request/response detail search fallback, selectable copyable details, multi-select, right-click request actions, TLS metadata, and source attribution (browser / proxy / repeater).
- WebSocket analyzer with handshake, sent, received, error, and close frames; the same scoped query language; direction filters; frame detail copy; and proxy-backed passthrough so controlled Chrome can load WebSocket apps.
- Global search overlay across scoped HTTP/S captures, WebSocket frames, Repeater drafts/history/collections, findings, workflows, workflow runs, plugins, Advanced testing signals, saved filters, project notes, and saved views, with jump-to-source navigation.
- Project bundle export/import with redaction profiles, import preview, conflict summary, and inactive proposed scope targets.
- Handoff package export for reviewed findings, referenced evidence, project notes, workflows, Repeater collections, and a Markdown summary.
- Sitemap view with host/path/endpoint tree navigation, endpoint inventory (query params, body keys, auth signals), session diff against an earlier session, and one-click jump into filtered HTTP(S) traffic.
- Intercept view for pausing scoped proxy requests and responses, editing request method/URL/headers/body or response status/headers/body, forwarding, dropping, resuming queued items, applying persisted intercept and match/replace rules, and preserving mutation evidence in HTTP history.
- Clone captured requests into a repeater with full header and body editing, multiple named tabs, per-tab replay history, response diffing, environment variables, collections, request transforms, and WebSocket frame replay.
- Single replay plus capped burst replay (count, parallelism, delay) for hardening checks.
- Automate surface that detects explicit `{{payload:name}}` markers in the active repeater draft, persists inline payload sets and wordlist references, runs scoped sessions with count/concurrency/delay/timeout caps, clusters results, applies match/extract rules, exports result evidence, and promotes interesting attempts to Repeater or draft findings.
- Findings inbox with severity, confidence, status, component, owner, assignee, affected assets, evidence references, reproduction, impact, remediation, retest result, common templates, duplicate merge suggestions, retest matrix rows, report presets, Markdown/HTML report export, and redacted evidence appendices.
- Workflows surface with built-in passive checks, declarative JSON/YAML-like definitions, visual graph review, branch/dry-run validation, reusable step templates, scoped active replay/browser checks, saved definition revisions, session run history, and promotion of warning/failure results into draft findings.
- Plugins surface for local plugin manifest preview and developer validation, workspace-local install registry, explicit permission approval, trust/compatibility markers, disable/block/remove controls, sandboxed approved panel rendering, bounded SDK action console, plugin audit ledger, TypeScript SDK/API contracts, and first-party example plugins.
- Advanced testing surface for GraphQL operation extraction, grouping, and variable templates; OpenAPI/Postman preview imports to Repeater drafts or collections; auth-state matrix and comparison review; an Identity Lab with isolated identity profiles, attributed role/tenant evidence, and recorded-only differentials; parameter discovery; local sensitive-data rule detection; header/cache behavior signals; workflow draft preparation; and mobile/thick-client proxy guidance.
- Scope-filtered HTTP/S and WebSocket evidence for focusing on selected targets.
- Local HTTPS proxy mode for external browsers, with a Radar-generated CA, SPKI fingerprint, and per-workspace setup notes for browser, CLI, and device clients.
- SSL/cert event log for visibility into trusted vs. blocked endpoints.
- Manual-First / AI-First mode toggle: keep direct operator control, or hand a saved-scope goal to an autonomous run console with selectable local history, a persistent Mission Graph, and pause, resume, and stop controls.
- AI-First Tutorial Mode: turn a scoped assessment into a paced field lesson with evidence-led clue cards, stronger-evidence and falsifier prompts, safe next steps, and an operator checkpoint after every meaningful inspection.
- Command-palette AI with per-view skills, provider adapters, context preview, selectable HTTP/S and WebSocket packets, prepare-only outputs, and session audit trail.
- AI-First autonomous runs with a Browser Assessment profile, Playwright accessibility/element inspection and actionability-aware click/fill/form tools, scoped request routing during browser actions, a full observation console, revision-checked Mission Graph patches, risk-tiered capability leases with durable action receipts, cumulative checkpointed budgets, durable pause/resume, operator steering and failure recovery, resolved-evidence graph/finding gates, review-first Repeater/Workflow drafts, and project-scoped run memory for tested hypotheses, dismissed leads, and retest notes.
- Switchable Bureau, Vellum, and Specter themes with high-contrast text selection for request/response inspection.
- Seeded **Radar Demo Project** for screenshots, manual QA, onboarding, and walkthroughs, with synthetic captures, WebSocket frames, findings, workflows, plugins, Advanced signals, and AI run history.

## Stack

- Electron 42 main process (`electron/main.ts`) wiring CDP capture, mockttp HTTP/WebSocket proxying, system browser launcher, autonomous agent runs, and AI IPC.
- React 18 + Vite + TypeScript renderer (`src/`).
- Tailwind CSS v4 with CSS-variable themes and shadcn-style UI primitives (`cn`, `cva`, `src/components/ui/`).
- SQLite local store (`radar-local.sqlite`) with an explicit migration ledger for projects, sessions, identity metadata and activations, evidence, workflows, plugins, AI run history, and project-scoped run memory.
- mockttp for the local MITM proxy, CA generation, HTTP/S passthrough capture, and WebSocket passthrough/frame events.
- Playwright Core for persistent control of the operator-visible managed Chrome session through its loopback CDP endpoint; Radar uses the installed browser and does not download a second Chromium build.
- System browser discovery for Chrome, Edge, Brave, and Chromium.

## Run

```bash
pnpm install
pnpm dev
```

This starts Vite on `127.0.0.1:5173`, then launches Electron pointing at it. `pnpm build` runs `tsc` and a production Vite build into `dist/`. `pnpm lint` runs ESLint. `pnpm screenshots` rebuilds and refreshes README screenshots into `docs/screens/`. `pnpm plugin:validate -- <plugin-path>` validates a local plugin manifest and referenced entry/panel files without installing it.

## Install (Releases)

Pre-built installers are published on the [Releases page](https://github.com/Hairetsu/Radar/releases).

### macOS

Radar isn't notarized with Apple yet, so Gatekeeper will refuse to open it with either *"could not verify"* or *"Radar is damaged and can't be opened"*. To get past this, drag `Radar.app` into `/Applications`, then strip the quarantine flag in Terminal:

```bash
sudo xattr -dr com.apple.quarantine /Applications/Radar.app
```

Then launch normally. You only need to do this once per install.

### Windows

Run the `.exe` installer. SmartScreen may show *"Windows protected your PC"* — click **More info → Run anyway**.

### Linux

- `.AppImage`: `chmod +x Radar-*.AppImage && ./Radar-*.AppImage`
- `.deb`: `sudo apt install ./radar_*_amd64.deb`

## Workspace Tour

The renderer is a twelve-view operator console with a Manual-First / AI-First toggle. Persistent across all views: a left sidebar with the Radar lockup, project/session controls, view navigation, live per-view counts, a top classification banner with UTC dossier clock, a one-click **Open Browser** launcher, global **Search**, project **Notes** and saved views, live status pills (engine / req / ws / tls / proxy), appearance and AI settings, and a bottom telemetry ticker mirroring live counts.

For a full user-facing guide to the app, see [docs/USER_GUIDE.md](docs/USER_GUIDE.md).

### 01 — HTTP(S)

![Radar HTTP/S view](docs/screens/radar-01-traffic.png)

HTTP and HTTPS capture log filtered to the current scope. WebSocket frames are intentionally separated into the WebSocket tab. The toolbar narrows requests by HTTP method, resource type, sort field, sort direction, or a scoped query such as `method:POST path:/api status:401,403 mime:json`. Plain text without field syntax falls back to a redacted search index across URL, headers, and bodies so bearer tokens, cookies, and API keys do not become default search results. Saved filters can be stored per workspace and reapplied from filter chips. Tags and comments persist on individual captures; multi-select supports bulk tag, redacted export, and delete. `⌘F` / `Ctrl+F` focuses the query bar; `Escape` clears it when focused. Each row shows method, status, host, path, resource type, and round-trip duration. Click selects one request; Cmd/Ctrl-click toggles individual rows; Shift-click selects ranges for AI context. Selecting a row reveals selectable request/response detail with TLS info on the right; tag and comment fields sit above the detail pane. **Copy** puts the active detail pane on the clipboard, and **Repeater** clones the selected request into Repeater. Right-click a row or the detail pane to copy the request as cURL, Bash, Python, Fetch, or raw HTTP, copy its URL, add the origin to scope, send it to Repeater, or delete the capture. Empty state reads _"No in-scope HTTP/S requests intercepted"_ until matching traffic flows in.

![Radar request context menu](docs/screens/radar-06-request-menu.png)

### 02 — WebSocket

WebSocket traffic analysis for streams that are separate from ordinary HTTP/S requests. Radar records client handshakes, server handshake responses, sent frames, received frames, frame errors, and clean close events from the proxy path, with CDP-backed frame capture for Electron-attached pages. The tab shows connection, frame, inbound/outbound, error, and payload totals; direction filters; the same scoped query language for frames (`direction:sent payload:ping`); frame size and opcode; selectable frame details; and copy support for the active frame. Click selects one frame; Cmd/Ctrl-click toggles frames; Shift-click selects a range for AI context. **Clear WebSocket frames** clears frame history for the active session without touching HTTP/S captures.

### 03 — Intercept

Scoped proxy request and response queue. Turn **Requests On** to pause in-scope HTTP/S requests before upstream delivery, or **Responses On** to pause responses before they return to the client. Optional per-workspace JSON rules narrow queueing by method, host, path, content type, status, initiator, headers, or body. Match/replace rules can rewrite scoped request or response headers and bodies in the pass-through path and record each fired rule as evidence metadata. Edit request method/URL/headers/body or response status/headers/body, then **Forward** or **Drop** the selected queued item. **Resume All** forwards everything currently paused. Radar records queued, edited, forwarded, dropped, resumed, rule-hit, and rewrite metadata on the matching HTTP history entry.

### 04 — Repeater

![Radar Repeater view](docs/screens/radar-02-repeater.png)

Manual replay surface with multiple tabs, per-tab history, response diffing, environment variables, collections, request transforms, and optional WebSocket frame replay. Left: method selector, URL line, JSON-edited headers, free-form body, transform shortcuts, and **Transmit** for a single round trip. Right: the Saturate burst panel (count / parallel / delay), response well, replay history, diff panel, and collection/environment shortcuts. **Trust Origin** in the panel header pushes the current URL's origin into the scope allowlist in one click. Any unresolved `{{variable}}` fails before transmission, and hop-by-hop/proxy credential headers are stripped from materialized requests.

### 05 — Automate

![Radar Automate view](docs/screens/radar-07-automate.png)

Manual payload-position testing for the active Repeater draft. Use explicit `{{payload:name}}` markers in URLs, header values, or bodies, or add them with **Mark URL**, **Mark Header**, and **Mark Body**. Radar lists each marked position, saves reusable inline payload sets and local wordlist references, renders the first materialized request preview, and starts bounded Automate sessions with count, concurrency, delay, timeout, pause, resume, stop, and retry controls. Results persist per session with status, length, latency, word count, redirect/error details, match markers, extract values, deterministic response clusters, outlier filtering, copy/export controls, and promotion to Repeater or draft Findings.

### 06 — Findings

Durable findings inbox shared by Manual-First and AI-First. Create draft findings from selected HTTP/S captures, WebSocket frames, or Automate results; choose templates for common web classes; filter by text, status, severity, owner/assignee, and component; track severity, confidence, status, component, affected assets, reproduction, impact, remediation, owner, assignee, notes, and retest result; review operator-controlled duplicate merge suggestions; attach new evidence during retest; and build Markdown or HTML reports with local presets, narrative sections, validation warnings, retest matrix rows, and redacted evidence appendices by default. Raw evidence export is an explicit toggle and remains limited to evidence referenced by the included findings.

### 07 — Workflows

![Radar Workflows view](docs/screens/radar-08-workflows.png)

Repeatable security checks for the active workspace. Operators can run built-in workflows for security headers, cookie flags, CORS/cache control, metadata exposure, and selected-capture unauthenticated replay; save custom declarative JSON or constrained YAML-like workflow definitions with passive, replay, or browser-open steps; inspect a visual graph, branch conditions, dry-run validation, reusable templates, local revision diffs, scope policy, caps, inputs, run history, pass/warn/fail results, and evidence references; and promote warning/failure results into draft Findings.

### 08 — Plugins

Local extension management for Radar's SDK. Preview or validate a folder containing `.radar-plugin/plugin.json` or `plugin.json`, inspect requested permissions, compatibility warnings, and trust markers, install it into the active workspace as pending, then explicitly approve only the requested permissions before plugin SDK calls can read scoped evidence, create draft findings, prepare/send scoped replay, or work with saved workflows. Disable, block, or remove installed plugins from the same view. Approved panels render in a no-script sandbox iframe, bounded SDK actions can be exercised from the console, and every plugin action writes to the workspace audit ledger. First-party examples live under `plugins/examples/`.

### 09 — Advanced

![Radar Advanced view](docs/screens/radar-09-advanced.png)

Advanced API and auth testing helpers for the active scoped evidence. Radar extracts and groups GraphQL operations from HTTP/S requests and WebSocket frames, prepares variable templates, previews OpenAPI/Postman JSON imports into draft replay templates and sitemap seeds, saves reviewed imports into Repeater collections, loads selected imports into Repeater without sending traffic, compares observed anonymous/bearer/basic/cookie/mixed status behavior, discovers parameters across query/body/cookies/headers/frames, detects secret-shaped response data with a local rule pack and masked previews, flags cache/header behavior signals, prepares visible workflow drafts from Advanced signals, and keeps mobile/thick-client proxy guidance near the evidence. Toggle **Identity Lab** for workspace-scoped identity creation, activation, health verification, archival, attributed role/tenant review, and recorded-only one-identity differentials. Import preview and Identity Lab comparison do not transmit traffic.

### 10 — Sitemap

Host, path, and endpoint map for scoped HTTP/S traffic in the active session. The left tree groups hosts, paths, and method/status families. Selecting an endpoint opens inventory details for discovered query params, JSON/form keys, content types, and auth signals, or jumps straight into a matching HTTP(S) query. The right pane includes session diff: pick an earlier session under the same project, compare endpoint coverage, and review added, removed, status-changed, header-changed, and response-shape changes. Example queries are listed for quick reuse in the HTTP(S) tab.

### 11 — Scope

![Radar Scope view](docs/screens/radar-03-scope.png)

The engagement boundary. Newline-delimited origins filter HTTP/S captures and WebSocket frame visibility; defaults are local development origins. WebSocket URLs match equivalent HTTP origins, so `https://example.test` brings `wss://example.test` evidence into scope. Edit and **Commit** to persist. If an AI-First goal names an out-of-scope origin, **Start Run** only adds that origin to this unsaved editor and switches visibly to Scope; it does not widen scope or start the run. Review the proposal, click **Commit**, then click **Start Run** again. The **AI command palette** strip below the editor opens the same palette as **⌘K** / **Ctrl+K** or the **AI** button in the panel header.

### 12 — SSL

![Radar SSL / Proxy view](docs/screens/radar-04-ssl.png)

Crypto and proxy interception. The summary strip shows current proxy URL, generated CA path, and active browser profile. Below: **Engage Proxy** / **Disengage** / **Forge CA** controls plus a printout of HTTP proxy address, CA cert path, SPKI fingerprint, Chrome CDP endpoint, Playwright connection/page count, and selected browser binary. The lower panes hold the certificate event log, local-only proxy profile notes for Radar Browser / external browser / CLI / mobile-device setup, and a TLS detail pane for the currently selected capture.

### Projects And Sessions

Radar stores work locally by project and session. A project owns a workspace, scope targets, project notes, saved views, saved workflows, installed plugin records, AI run memory, a dedicated launched-browser profile directory, and its session list. A session is the active evidence ledger: HTTP/S captures, WebSocket frames, findings, workflow runs, SSL events, and AI-First run history are loaded from and written to the active session.

Use the sidebar project/session panel to create, rename, save, and load projects or sessions. Use the sidebar session selector to jump between existing sessions under the current project. Switching projects stops the launched Radar browser when needed so browser state stays isolated.

Use **Notes** in the workspace header to store local handoff notes and saved views. Notes keep engagement context with the project. Saved views remember the active view, filters, selected evidence, Repeater tab, Sitemap node, workflow/finding selection, and related panel state so operators can return to a review posture quickly.

The same project artifacts panel exports and imports local project bundles. Export profiles include metadata-only, redacted evidence, reviewed findings, and explicit raw evidence. Import preview shows contents, conflicts, and proposed scope targets; imported targets are not applied to active scope automatically.

Use **Handoff package** in that panel when you need a narrower deliverable than a full bundle. It includes reviewed findings by default, pulls only referenced evidence, applies the selected redaction profile, and emits a Markdown summary inside the JSON package.

### Modes — Manual-First And AI-First

Manual-First is the default. The HTTP(S), WebSocket, Intercept, Repeater, Automate, Findings, Workflows, Plugins, Advanced, Sitemap, Scope, and SSL views remain the primary controls, and the AI command palette stays prepare-only: it can summarize, draft, and suggest, but the operator clicks navigation, intercept, replay, Automate execution, workflow definition changes, plugin approval, import/replay use, finding review, and export controls.

AI-First adds a goal prompt, profile picker, optional **Tutorial Mode**, budget chips, saved **Run History** selector, Mission Graph, live **Agent Thoughtstream**, and observation console above the existing views. The Thoughtstream animates each auditable decision brief into view with the current mission focus, concise planner rationale, selected tool, visible target, and latest result; it exposes saved decision summaries rather than private model chain-of-thought. Profiles include Browser Assessment, Passive Map, Auth Review, API Hardening, Header/Cookie Review, Advanced API Review, and Report From Evidence. Browser Assessment is the default live-site path: clicking **Start Run** confirms tightly bounded, `GET`-only opening and navigation inside saved Scope, so the agent can inspect the visible page, follow discovered in-scope links, capture resulting traffic, and continue planning without a resume click after every successful step. Its active runtime budget is 10 minutes so multi-step browser missions can absorb local planner latency. Form interaction, identity changes, replay, and workflow execution retain separate capability review. Every profile constrains tools and budgets for steps, replay, workflow requests, capture sample, timeout, and raw-context policy. Selecting a saved run swaps the graph, Thoughtstream, transcript, findings, status, and controls to that run. **Pause** stores a durable checkpoint; **Resume** continues from it while keeping elapsed time, tool steps, replay sends, and workflow requests cumulative instead of resetting the profile budget. When a runtime or tool-call budget is spent, Radar seals that checkpoint, disables Resume, and offers **Continue as New Run**; the new run receives a fresh bounded profile budget while the source transcript remains preserved and linked in the continuation timeline.

Tutorial Mode uses the same visible tools, saved Scope, capability leases, budgets, and evidence gates, but changes the pace. Each meaningful inspection stops at a lesson checkpoint and shows the current clue, why it matters, what to inspect, what would strengthen the lead, what could disprove it, and the next safe step. The operator inspects the underlying browser or Radar evidence pane and clicks **Continue Lesson** when ready. Triage stays explicit: `learning clue`, `local hardening`, `vendor report`, or `CVE review`. Radar downgrades unsupported CVE language unless the lesson includes durable evidence references plus a named product, affected versions, repeatable security impact, and product-level deployment relevance. **CVE review never means CVE assigned or confirmed**; private vendor/CNA coordination and normal disclosure review remain operator responsibilities.

![Radar AI-First Tutorial Mode](docs/screens/radar-10-tutorial.png)

Each run owns a versioned Mission Graph persisted locally with its objectives, falsifiable hypotheses, bounded experiments, evidence-backed claims, host/endpoint/identity/state/control coverage cells, and operator questions. The planner advances it through bounded patches against an exact base revision instead of replacing the graph. Stale revisions, dangling objective/hypothesis links, invalid statuses, and unresolved local evidence references fail closed. A supported hypothesis, supported or verified claim, or covered cell must cite evidence that resolves in Radar's current local evidence catalog.

If the planner adds an operator question, Radar persists the graph patch and pauses before executing the proposed tool. To steer a running mission, click **Pause** and wait for the current tool to settle; then add objective or hypothesis branches, choose the legal status for an item, set P1-P5 priority on objectives or hypotheses, pin hypotheses, or ask, answer, and dismiss operator questions. Click **Resume** only after the graph reflects the intended direction and required questions are resolved. Completed and stopped graphs are read-only.

Risk-tiered capability leases govern tools that can navigate, mutate browser/auth state, or send active traffic. Effective authority is always the intersection of the selected profile ceiling, current saved Scope, one exact granted origin + method + path-prefix + identity tuple, and the run's remaining step/replay/workflow/runtime budgets. Tuple fields are evaluated together, so Radar never combines the origin from one grant with the method, path, or identity from another. Passive observation and prepare-only tools do not need a lease. Navigate, reversible, and active tiers can be proposed within profile caps; destructive authority and `DELETE` are never grantable.

Every run has a revisioned capability ledger stored locally. A planner may only propose a bounded lease for its selected tool. Radar automatically grants only an in-scope, `GET`-only `openBrowser` or `navigateBrowser` lease because the operator already confirmed that narrow authority with **Start Run** or **Start Tutorial**; the grant and every use still appear in the ledger and transcript. Other lease requests remain drafts: Radar records the pending call and pauses before dispatch so the operator can review duration, action/use count, known request cost, concurrency, payload size, exact tuple, and reason. **Grant** grants only that draft and never resumes automatically. After the operator clicks **Resume**, the saved pending call is attempted exactly once before planning continues; a block or failure pauses again for review instead of silently retrying. Operators can also **Pause** first to propose, grant, deny, or revoke leases manually. Completed and stopped ledgers are read-only.

Before a leased action dispatches, Radar reserves its action and known explicit-request cost in a durable receipt; afterward it finalizes the receipt as succeeded, failed, or unknown. Expiry or exhaustion blocks further use. Saved-scope drift, auth-state drift, an unexpected resulting URL or auth state, a failed/unknown outcome, operator revocation, run stop/completion, or runtime/session change revokes granted authority. Lease accounting covers normalized leased actions and known explicit costs, including declared active-workflow request cost. C10 adds causal attribution for observed managed-Chrome traffic, but attributed browser subresources do not become additional lease receipt costs.

Identity Lab profiles have stable workspace-scoped IDs and operator-authored role and tenant labels. New identities use separate persistent Chrome user-data directories under the Radar project profile. Activation switches those directories serially: Radar stops the previous managed Chrome instance before starting the selected identity. Create, Activate, Verify, and Archive are explicit actions. Verification reloads the scoped identity origin and records a reachability/session observation: `healthy` means a 2xx/3xx response was observed, `expired` means 401/403 was observed, `stale` means another response was observed, `error` means no usable capture was recorded, and `unknown`/`checking` mean no completed result yet. None of these states proves authorization.

The renderer and `getIdentityLabContext` receive only identity metadata, health, activation IDs, and attributed counts. Cookie and storage values remain in the Electron main process and the dedicated browser profile; sending raw values to AI still requires Radar's existing raw-context opt-in. Legacy named auth-state snapshots remain historical comparison artifacts: they are not dedicated isolation and are not auto-imported as Identity Lab profiles.

A persistent CDP Network observer on managed Chrome records request-time run, navigation, action, identity, and activation lineage when available; sequence and experiment fields are reserved for later producers. Later response/body updates retain original request-time attribution. Proxy-only traffic intentionally does not inherit managed-browser identity or action context. Radar's causal-link contract reports explicit `exact`, `correlated`, `inferred`, or `unmatched` confidence with a reason; the current Identity Lab ledger shows requests observed under explicit action contexts and retains unmatched captures without claiming temporal proximity proves causation. AI-First persists bounded page text, accessibility summaries, and action results in the run transcript; it does not persist a full DOM or screenshot stream.

Identity Lab's role × tenant × resource matrix uses operator-authored labels and includes only captures with both a known identity ID and activation ID. A 2xx response is an observation, not authorization proof. The one-dimension comparison uses already-recorded requests only, offers a second capture only when identity is the sole changing dimension, compares recorded response metadata/shape, and sends no traffic.

A run can move the visible workbench through Scope, HTTP(S), WebSocket, Intercept, Repeater, Automate, Workflows, Plugins, Advanced, Sitemap, and SSL; launch or navigate the visible managed browser; read page text and accessibility structure; discover stable page-specific selectors; click, fill, and submit through Playwright; wait for network idle; then inspect causally attributed captures. Scoped AI browser actions temporarily abort out-of-scope HTTP/S requests, and submit-capable controls must use the separately leased form tool. The run can also summarize local sitemap/findings/Advanced/workflow/note/saved-view/run-memory context, prepare traffic queries into the visible filter bar, read queued intercept items, load visible intercept edit drafts, load Repeater and Workflow drafts for review, prepare visible Automate payload/rule controls, analyze existing Automate results, read approved plugin inventory, and write quality-gated draft findings. AI-prepared Repeater and Workflow work stays visible and requires the existing operator Save/Run/Transmit controls. A failed or policy-blocked tool pauses the run for operator direction. Radar can re-execute an operator-requested retry only for safe, idempotent tools; it never automatically retries mutating browser, authentication-state, replay, or workflow actions. Before any AI finding persists, every cited reference must resolve in the current local evidence catalog, with network evidence still constrained by saved Scope. Local run memory can be confirmed or dismissed from transcript proposals, or created manually in the Run Memory panel. Intercept forwarding, dropping, Automate session execution, plugin install/approval/execution, Advanced import/replay actions, finding review, and export remain Manual-First operator actions.

### AI — Command Palette

![Radar AI command palette](docs/screens/radar-05-ai-palette.png)

Open with **⌘K** / **Ctrl+K**, the panel **AI** button, or the Scope strip. The palette is view-aware: built-in tasks change per view, custom skills can be added for the current view, and AI only sends selected HTTP/S requests, selected WebSocket frames, or the active view context. The packet picker can select all evidence, clear all evidence, or mix individual HTTP/S and WebSocket packets in the same prompt.

**Tasks (prepare-only):**

- Capture Summary — explain selected HTTP/S request/response evidence and WebSocket frames
- Repeater Drafts — suggest request variants; loads draft, never transmits
- Scope Checklist — manual test checklist within allowlist
- Report Notes — concise evidence notes referencing `capture:id` and `websocket:id` evidence
- Browser Helper — suggested exploration steps; you confirm navigation
- TLS Review — review proxy posture, certificate events, and capture TLS metadata
- Custom skills — saved operator instructions scoped to the active view

**Connect presets:**

- **Codex Connect** — local ChatGPT/Codex desktop or CLI auth via its bundled/installed `codex` executable; override discovery with `CODEX_CLI_PATH`.
- **Cursor CLI Connect** — invokes the installed Cursor `agent` CLI directly (like Codex Connect). Run `curl https://cursor.com/install | bash` and `agent login` first, or set `CURSOR_API_KEY` for headless auth.

**Providers:** Codex app, Cursor agent, OpenAI, Anthropic, OpenAI-compatible endpoints.

**Guardrails:** raw headers, bodies, WebSocket payloads, cookies, and storage values require explicit raw-context confirmation; Identity Lab roster/context stays metadata-only; scope stays authoritative for traffic visibility, AI context, autonomous tool calls, identity activation/verification, capability leases, and network evidence cited by AI findings; out-of-scope goal origins remain unsaved proposals until Commit; active tools cannot exceed the intersection of profile, Scope, exact lease tuple, and remaining run budgets; command-palette audit is session-only; AI-First run history, checkpoints, lease ledgers, and receipts are stored locally with the active session; run memory is stored locally under the active project.

## Scope Model

Scope controls which HTTP/S captures and WebSocket frames appear in the workspace and become available to AI. Defaults are local development origins:

```text
http://localhost:*
http://127.0.0.1:*
http://[::1]:*
```

Add project origins in the Scope view (or use "Trust Origin" in Repeater) to bring matching captured production or staging traffic into the workspace. WebSocket URLs are matched against equivalent HTTP origins: `ws://example.test` matches `http://example.test`, and `wss://example.test` matches `https://example.test`.

## SSL And Proxying

Radar has two HTTPS/WebSocket interception paths:

- **Radar Browser mode** — **Open Browser** launches a supported local Chrome, Edge, Brave, or Chromium binary with a dedicated Radar profile, remote debugging on `127.0.0.1:9223`, the Radar proxy attached, and Playwright connected to the same visible window. Radar's CA fingerprint is supplied as a launch-scoped certificate exception so HTTPS works without touching the system trust store.
- **External browser proxy** — engage the proxy from the SSL view, point your browser at `http://127.0.0.1:8088`, then manually trust the generated `radar-ca.pem` shown in the UI.

The SSL view also stores workspace-local notes for Radar Browser, external browser, CLI tools, and mobile/device proxy setup so client-specific proxy instructions stay with the active workspace.

Mockttp rules are registered separately for HTTP/S requests and WebSocket upgrades. HTTP/S evidence stays in the HTTP(S) tab; WebSocket handshakes and frames stay in the WebSocket tab.

Radar never installs a root certificate automatically. On macOS, Radar launches the isolated browser with Chrome's mock-keychain flag where supported so it does not request your login keychain password or share system Chrome's saved secrets.

## Design

The interface is a themed "operator console" aesthetic:

- **Bureau**: Antonio / Saira / JetBrains Mono with signal orange on warm-dark slate.
- **Vellum**: Instrument Serif / Hanken Grotesk / DM Mono with vermillion ink on sunlit paper.
- **Specter**: Unbounded / Sora / Space Mono with chartreuse acid over midnight plum.
- Theme tokens live in `src/styles.css` as CSS variables that feed Tailwind's `@theme`; layout and surfaces are Tailwind utilities in components.
- Asymmetric layout: left sidebar with project/session controls and live view counts, a classification banner up top, oversized outlined display numerals anchoring each panel, registration corner marks on the workspace, dense evidence grids, and a bottom telemetry ticker.
- Motion via Tailwind utilities and keyframes in `src/styles.css`: staggered page-load reveal with blur-in, dual-ring radar pulse on the brand mark, pulsing live dots, and a bottom-up signal fill on the burst button.
- Text selection is explicitly high-contrast in every theme so request and response evidence can be copied without losing readability.

## Development Conventions

See [docs/CODE_CONVENTIONS.md](docs/CODE_CONVENTIONS.md) for the repo-specific code style guide used for future development.
See [docs/BRANCHING.md](docs/BRANCHING.md) for the protected branch and promotion workflow.
See [docs/MANUAL_QA_CHECKLIST.md](docs/MANUAL_QA_CHECKLIST.md) for the twelve-view release and demo QA checklist.
See [docs/REGRESSION_TESTING.md](docs/REGRESSION_TESTING.md) for the 164-case multi-instance Playwright Electron regression suite, loopback fixture labs, platform/soak gates, and release report artifacts.
See [docs/REGRESSION_SUITE_SPEC.md](docs/REGRESSION_SUITE_SPEC.md) for the full real-use workflow catalog and execution roadmap.

## Project Layout

```
electron/
  main.ts         Main-process: CDP capture, HTTP/WebSocket proxy, browser launcher, IPC handlers
  playwrightBrowser.ts Persistent Playwright-over-CDP controller for managed Chrome
  preload.ts      Exposes the typed `window.radar` API to the renderer
  screenshot.ts   Headless screenshot runner for README assets
  ai/             Provider adapters, context builder, connect presets, audit trail
src/
  App.tsx         Bureau-style operator console (12 views + AI palette)
  ai/             Command palette UI and AI types
  components/
    ui/           shadcn-style primitives (Button, Input, Select, Textarea)
    radar/        Radar-specific labels, badges, pills, and empty states
  lib/            Renderer utilities including `cn()` for class merging
  styles.css      Theme tokens, base styles, shell texture, and keyframes
  types.ts        Shared types between main and renderer
  main.tsx        React entry
docs/
  BRANCHING.md
  CODE_CONVENTIONS.md
  screens/        Screenshots used in this README
index.html        Vite entry
vite.config.ts    Vite + Tailwind v4 + React
```
