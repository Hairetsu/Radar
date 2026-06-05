# Radar

Radar is a local-first defensive web security workbench. It launches a dedicated browser profile, captures HTTP/S and WebSocket traffic through Electron's DevTools protocol plus a local MITM proxy, lets you replay requests through a controlled repeater, and runs bounded payload testing from explicit markers. Work in Manual-First mode when you want direct operator control, or switch to AI-First mode to let a scoped agent drive the app while you watch.

## MVP Surface

- Sidebar workspace with dedicated HTTP(S), WebSocket, Intercept, Repeater, Automate, Findings, Workflows, Plugins, Advanced, Sitemap, Scope, and SSL tabs.
- Radar Browser launcher using a supported local Chrome, Edge, Brave, or Chromium binary with a Radar-owned profile and Radar proxy wiring.
- Persistent local projects and sessions for separating clients, retests, captures, targets, findings, workflows, plugins, SSL events, WebSocket frames, and AI-First run history.
- HTTP/S capture history with method/type filters, a scoped traffic query language, saved filters, tags and comments, bulk tag/delete/export, request/response detail search fallback, selectable copyable details, multi-select, right-click request actions, TLS metadata, and source attribution (browser / proxy / repeater).
- WebSocket analyzer with handshake, sent, received, error, and close frames; the same scoped query language; direction filters; frame detail copy; and proxy-backed passthrough so controlled Chrome can load WebSocket apps.
- Sitemap view with host/path/endpoint tree navigation, endpoint inventory (query params, body keys, auth signals), session diff against an earlier session, and one-click jump into filtered HTTP(S) traffic.
- Intercept view for pausing scoped proxy requests and responses, editing request method/URL/headers/body or response status/headers/body, forwarding, dropping, resuming queued items, applying persisted intercept and match/replace rules, and preserving mutation evidence in HTTP history.
- Clone captured requests into a repeater with full header and body editing, multiple named tabs, per-tab replay history, response diffing, environment variables, collections, request transforms, and WebSocket frame replay.
- Single replay plus capped burst replay (count, parallelism, delay) for hardening checks.
- Automate surface that detects explicit `{{payload:name}}` markers in the active repeater draft, persists inline payload sets and wordlist references, runs scoped sessions with count/concurrency/delay/timeout caps, clusters results, applies match/extract rules, exports result evidence, and promotes interesting attempts to Repeater or draft findings.
- Findings inbox with severity, confidence, status, affected assets, evidence references, reproduction, impact, remediation, owner, retest result, common templates, Markdown/HTML report export, and redacted evidence appendices.
- Workflows surface with built-in passive checks, declarative JSON/YAML-like definitions, scoped active replay/browser checks, saved workflow definitions, session run history, and promotion of warning/failure results into draft findings.
- Plugins surface for local plugin manifest preview, workspace-local install registry, explicit permission approval, disable/block/remove controls, approved panel inventory, TypeScript SDK/API contracts, and first-party example plugins.
- Advanced testing surface for GraphQL operation extraction, OpenAPI/Postman preview imports, auth-state matrix review, parameter discovery, local secret detection, header/cache behavior signals, and mobile/thick-client proxy guidance.
- Scope-filtered HTTP/S and WebSocket evidence for focusing on selected targets.
- Local HTTPS proxy mode for external browsers, with a Radar-generated CA, SPKI fingerprint, and per-workspace setup notes for browser, CLI, and device clients.
- SSL/cert event log for visibility into trusted vs. blocked endpoints.
- Manual-First / AI-First mode toggle: keep direct operator control, or hand a scoped goal to an autonomous run console with a live stop button.
- Command-palette AI with per-view skills, provider adapters, context preview, selectable HTTP/S and WebSocket packets, prepare-only outputs, and session audit trail.
- AI-First autonomous runs that switch Radar tabs, open/navigate the browser, inspect run-scoped HTTP/S capture context across redirects, read intercept queues, summarize sitemap coverage, choose visible workflows, read approved plugin inventory, read advanced testing summaries, prepare visible traffic queries and intercept edits without forwarding/dropping, recover the controlled browser when CDP drops, send strictly capped replay probes, record timeline entries, and produce durable draft findings inside local session history.
- Switchable Bureau, Vellum, and Specter themes with high-contrast text selection for request/response inspection.
- Seeded **Radar Demo Project** for screenshots, manual QA, onboarding, and walkthroughs, with synthetic captures, WebSocket frames, findings, workflows, plugins, Advanced signals, and AI run history.

## Stack

- Electron 42 main process (`electron/main.ts`) wiring CDP capture, mockttp HTTP/WebSocket proxying, system browser launcher, autonomous agent runs, and AI IPC.
- React 18 + Vite + TypeScript renderer (`src/`).
- Tailwind CSS v4 with CSS-variable themes and shadcn-style UI primitives (`cn`, `cva`, `src/components/ui/`).
- SQLite local store (`radar-local.sqlite`) with an explicit migration ledger for profiles, sessions, evidence, workflows, plugins, and AI run history.
- mockttp for the local MITM proxy, CA generation, HTTP/S passthrough capture, and WebSocket passthrough/frame events.
- System browser discovery for Chrome, Edge, Brave, and Chromium.

## Run

```bash
pnpm install
pnpm dev
```

This starts Vite on `127.0.0.1:5173`, then launches Electron pointing at it. `pnpm build` runs `tsc` and a production Vite build into `dist/`. `pnpm lint` runs ESLint. `pnpm screenshots` rebuilds and refreshes README screenshots into `docs/screens/`.

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

The renderer is a twelve-view operator console with a Manual-First / AI-First toggle. Persistent across all views: a left sidebar with the Radar lockup, project/session controls, view navigation, live per-view counts, a top classification banner with UTC dossier clock, a one-click **Open Browser** launcher, live status pills (engine / req / ws / tls / proxy), appearance and AI settings, and a bottom telemetry ticker mirroring live counts.

For a full user-facing guide to the app, see [docs/USER_GUIDE.md](docs/USER_GUIDE.md).

### 01 — HTTP(S)

![Radar HTTP/S view](docs/screens/radar-01-traffic.png)

HTTP and HTTPS capture log filtered to the current scope. WebSocket frames are intentionally separated into the WebSocket tab. The toolbar narrows requests by HTTP method, resource type, sort field, sort direction, or a scoped query such as `method:POST path:/api status:401,403 mime:json`. Plain text without field syntax still falls back to substring search across URL, headers, and bodies. Saved filters can be stored per workspace and reapplied from filter chips. Tags and comments persist on individual captures; multi-select supports bulk tag, export, and delete. `⌘F` / `Ctrl+F` focuses the query bar; `Escape` clears it when focused. Each row shows method, status, host, path, resource type, and round-trip duration. Click selects one request; Cmd/Ctrl-click toggles individual rows; Shift-click selects ranges for AI context. Selecting a row reveals selectable request/response detail with TLS info on the right; tag and comment fields sit above the detail pane. **Copy** puts the active detail pane on the clipboard, and **Repeater** clones the selected request into Repeater. Right-click a row or the detail pane to copy the request as cURL, Bash, Python, Fetch, or raw HTTP, copy its URL, add the origin to scope, send it to Repeater, or delete the capture. Empty state reads _"No in-scope HTTP/S requests intercepted"_ until matching traffic flows in.

![Radar request context menu](docs/screens/radar-06-request-menu.png)

### 02 — WebSocket

WebSocket traffic analysis for streams that are separate from ordinary HTTP/S requests. Radar records client handshakes, server handshake responses, sent frames, received frames, frame errors, and clean close events from the proxy path, with CDP-backed frame capture for Electron-attached pages. The tab shows connection, frame, inbound/outbound, error, and payload totals; direction filters; the same scoped query language for frames (`direction:sent payload:ping`); frame size and opcode; selectable frame details; and copy support for the active frame. Click selects one frame; Cmd/Ctrl-click toggles frames; Shift-click selects a range for AI context. **Clear WebSocket frames** clears frame history for the active session without touching HTTP/S captures.

### 03 — Intercept

Scoped proxy request and response queue. Turn **Requests On** to pause in-scope HTTP/S requests before upstream delivery, or **Responses On** to pause responses before they return to the client. Optional per-workspace JSON rules narrow queueing by method, host, path, content type, status, initiator, headers, or body. Match/replace rules can rewrite scoped request or response headers and bodies in the pass-through path and record each fired rule as evidence metadata. Edit request method/URL/headers/body or response status/headers/body, then **Forward** or **Drop** the selected queued item. **Resume All** forwards everything currently paused. Radar records queued, edited, forwarded, dropped, resumed, rule-hit, and rewrite metadata on the matching HTTP history entry.

### 04 — Repeater

![Radar Repeater view](docs/screens/radar-02-repeater.png)

Manual replay surface with multiple tabs, per-tab history, response diffing, environment variables, collections, request transforms, and optional WebSocket frame replay. Left: method selector, URL line, JSON-edited headers, free-form body, transform shortcuts, and **Transmit** for a single round trip. Right: the Saturate burst panel (count / parallel / delay), response well, replay history, diff panel, and collection/environment shortcuts. **Trust Origin** in the panel header pushes the current URL's origin into the scope allowlist in one click.

### 05 — Automate

![Radar Automate view](docs/screens/radar-07-automate.png)

Manual payload-position testing for the active Repeater draft. Use explicit `{{payload:name}}` markers in URLs, header values, or bodies, or add them with **Mark URL**, **Mark Header**, and **Mark Body**. Radar lists each marked position, saves reusable inline payload sets and local wordlist references, renders the first materialized request preview, and starts bounded Automate sessions with count, concurrency, delay, timeout, pause, resume, stop, and retry controls. Results persist per session with status, length, latency, word count, redirect/error details, match markers, extract values, deterministic response clusters, outlier filtering, copy/export controls, and promotion to Repeater or draft Findings.

### 06 — Findings

Durable findings inbox shared by Manual-First and AI-First. Create draft findings from selected HTTP/S captures, WebSocket frames, or Automate results; choose templates for common web classes; track severity, confidence, status, affected assets, reproduction, impact, remediation, owner, notes, and retest result; attach new evidence during retest; and build Markdown or HTML reports with redacted evidence appendices by default. Raw evidence export is an explicit toggle.

### 07 — Workflows

![Radar Workflows view](docs/screens/radar-08-workflows.png)

Repeatable security checks for the active workspace. Operators can run built-in workflows for security headers, cookie flags, CORS/cache control, metadata exposure, and selected-capture unauthenticated replay; save custom declarative JSON or constrained YAML-like workflow definitions with passive, replay, or browser-open steps; inspect scope policy, caps, inputs, steps, run history, pass/warn/fail results, and evidence references; and promote warning/failure results into draft Findings.

### 08 — Plugins

Local extension management for Radar's Phase 7 SDK. Preview a folder containing `.radar-plugin/plugin.json` or `plugin.json`, inspect requested permissions and warnings, install it into the active workspace as pending, then explicitly approve only the requested permissions before plugin SDK calls can read scoped evidence, create draft findings, prepare/send scoped replay, or work with saved workflows. Disable, block, or remove installed plugins from the same view. Approved plugin panels are listed in the console; live plugin execution remains behind the SDK/API permission boundary. First-party examples live under `plugins/examples/`.

### 09 — Advanced

![Radar Advanced view](docs/screens/radar-09-advanced.png)

Advanced API and auth testing helpers for the active scoped evidence. Radar extracts GraphQL operations from HTTP/S requests and WebSocket frames, previews OpenAPI/Postman JSON imports into draft replay templates and sitemap seeds, groups observed anonymous/authenticated status behavior into an auth matrix, discovers parameters across query/body/cookies/headers/frames, detects secret-shaped response data locally with masked previews, flags cache/header behavior signals, and keeps mobile/thick-client proxy guidance near the evidence. Import preview is text-only and does not transmit traffic.

### 10 — Sitemap

Host, path, and endpoint map for scoped HTTP/S traffic in the active session. The left tree groups hosts, paths, and method/status families. Selecting an endpoint opens inventory details for discovered query params, JSON/form keys, content types, and auth signals, or jumps straight into a matching HTTP(S) query. The right pane includes session diff: pick an earlier session under the same project, compare endpoint coverage, and review added, removed, status-changed, header-changed, and response-shape changes. Example queries are listed for quick reuse in the HTTP(S) tab.

### 11 — Scope

![Radar Scope view](docs/screens/radar-03-scope.png)

The engagement boundary. Newline-delimited origins filter HTTP/S captures and WebSocket frame visibility; defaults are local development origins. WebSocket URLs match equivalent HTTP origins, so `https://example.test` brings `wss://example.test` evidence into scope. Edit and **Commit** to persist. The **AI command palette** strip below the editor opens the same palette as **⌘K** / **Ctrl+K** or the **AI** button in the panel header.

### 12 — SSL

![Radar SSL / Proxy view](docs/screens/radar-04-ssl.png)

Crypto and proxy interception. The summary strip shows current proxy URL, generated CA path, and active browser profile. Below: **Engage Proxy** / **Disengage** / **Forge CA** controls plus a printout of HTTP proxy address, CA cert path, SPKI fingerprint, Chrome CDP endpoint, and selected browser binary. The lower panes hold the certificate event log, local-only proxy profile notes for Radar Browser / external browser / CLI / mobile-device setup, and a TLS detail pane for the currently selected capture.

### Projects And Sessions

Radar stores work locally by project and session. A project owns a workspace, scope targets, saved workflows, installed plugin records, a dedicated launched-browser profile directory, and its session list. A session is the active evidence ledger: HTTP/S captures, WebSocket frames, findings, workflow runs, SSL events, and AI-First run history are loaded from and written to the active session.

Use the sidebar project/session panel to create, rename, save, and load projects or sessions. Use the sidebar session selector to jump between existing sessions under the current project. Switching projects stops the launched Radar browser when needed so browser state stays isolated.

### Modes — Manual-First And AI-First

Manual-First is the default. The HTTP(S), WebSocket, Intercept, Repeater, Automate, Findings, Workflows, Plugins, Advanced, Sitemap, Scope, and SSL views remain the primary controls, and the AI command palette stays prepare-only: it can summarize, draft, and suggest, but the operator clicks navigation, intercept, replay, Automate execution, workflow definition changes, plugin approval, import/replay use, finding review, and export controls.

AI-First adds a goal prompt and autonomous run console above the existing views. A run can move the visible workbench through Scope, HTTP(S), WebSocket, Intercept, Repeater, Automate, Workflows, Plugins, Advanced, Sitemap, and SSL, launch or inspect the browser, sample captures, summarize sitemap coverage, choose existing workflows by id, read approved plugin inventory, read Advanced testing summaries, prepare traffic queries into the visible filter bar, read queued intercept items, load visible intercept edit drafts, load replay drafts, prepare visible Automate payload/rule controls, analyze existing Automate results, send a single capped replay probe, and write draft findings into the durable Findings inbox. Intercept forwarding, dropping, Automate session execution, workflow editing, plugin install/approval/execution, Advanced import/replay actions, finding review, and export remain Manual-First operator actions. The operator watches the timeline and can hit **Stop** at any time.

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

- **Codex Connect** — local Codex app/CLI auth via the installed `codex` executable; override discovery with `CODEX_CLI_PATH`.
- **Cursor CLI Connect** — invokes the installed Cursor `agent` CLI directly (like Codex Connect). Run `curl https://cursor.com/install | bash` and `agent login` first, or set `CURSOR_API_KEY` for headless auth.

**Providers:** Codex app, Cursor agent, OpenAI, Anthropic, OpenAI-compatible endpoints.

**Guardrails:** raw headers, bodies, and WebSocket payloads require explicit checkbox confirmation; scope stays authoritative for traffic visibility, AI context, and autonomous tool calls; command-palette audit is session-only; AI-First run history is stored locally with the active session.

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

- **Radar Browser mode** — **Open Browser** launches a supported local Chrome, Edge, Brave, or Chromium binary with a dedicated Radar profile, remote debugging on `127.0.0.1:9223`, and the Radar proxy attached. Radar's CA fingerprint is supplied as a launch-scoped certificate exception so HTTPS works without touching the system trust store.
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

## Project Layout

```
electron/
  main.ts         Main-process: CDP capture, HTTP/WebSocket proxy, browser launcher, IPC handlers
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
