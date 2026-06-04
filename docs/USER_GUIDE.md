# Radar User Guide

Radar is a local-first defensive web security workbench for capturing HTTP/S and WebSocket traffic, inspecting request, response, and frame evidence, replaying requests, running bounded payload-marker tests, running repeatable workflows, managing local plugins, creating evidence-backed findings and reports, managing engagement scope, reviewing TLS/proxy behavior, and running AI-assisted analysis. Manual-First keeps AI prepare-only for risky actions; AI-First lets a scoped agent choose bounded tools while you watch.

This guide covers the app as it exists now: the main console, profiles and sessions, HTTP/S capture and query filters, WebSocket analysis, sitemap mapping, request interception, repeater, Automate sessions, workflows, plugins, findings and reports, scope management, SSL/proxy setup, AI features, appearance settings, local data, and troubleshooting.

## Table Of Contents

- [What Radar Is For](#what-radar-is-for)
- [Safety Model](#safety-model)
- [Install And Launch](#install-and-launch)
- [Main Console Tour](#main-console-tour)
- [Profiles And Sessions](#profiles-and-sessions)
- [Scope](#scope)
- [Opening The Radar Browser](#opening-the-radar-browser)
- [HTTP And HTTPS Traffic](#http-and-https-traffic)
- [WebSocket](#websocket)
- [Sitemap](#sitemap)
- [Intercept](#intercept)
- [Repeater](#repeater)
- [Automate](#automate)
- [Findings](#findings)
- [Workflows](#workflows)
- [Plugins](#plugins)
- [SSL And Proxy](#ssl-and-proxy)
- [AI Command Palette](#ai-command-palette)
- [Appearance](#appearance)
- [Local Data And Privacy](#local-data-and-privacy)
- [Common Workflows](#common-workflows)
- [Troubleshooting](#troubleshooting)
- [Glossary](#glossary)

## What Radar Is For

Use Radar when you need a controlled local workbench for authorized web security testing:

- Launch an isolated browser profile through Radar.
- Capture HTTP, HTTPS, and WebSocket traffic from the Radar browser or an external browser configured to use Radar's proxy.
- Filter captured HTTP/S requests and WebSocket frames with a scoped query language or saved filters.
- Map discovered hosts, paths, and endpoints in a sitemap with inventory and session diff.
- Tag, comment on, and bulk-manage captured evidence.
- Inspect selectable request, response, and frame evidence.
- Copy evidence for notes or reports.
- Clone captured requests into a manual repeater.
- Send a single replay or a capped burst replay for hardening checks.
- Mark payload positions in a request draft, run capped Automate sessions, cluster results, and promote interesting attempts to Repeater or Findings.
- Create durable findings with evidence references, retest notes, and Markdown/HTML report export.
- Save and rerun declarative workflows for passive checks and selected scoped active replay checks.
- Install local plugins from disk with explicit permission approval and SDK/API boundaries.
- Review proxy, certificate, and TLS signals.
- Ask AI for summaries, report notes, checklist ideas, safe repeater drafts, browser exploration suggestions, TLS review, WebSocket frame analysis, or a bounded AI-First run.

Radar is not an exploitation automation tool. It is built around explicit scope, local evidence, operator-visible timelines, and bounded replay budgets.

## Safety Model

Radar is designed for defensive, authorized work.

- Scope controls what appears in HTTP/S and WebSocket evidence views and what the AI can use as app context.
- The default scope is local development only.
- AI context is redacted by default. Raw headers, bodies, and WebSocket payloads require explicit opt-in in the command palette.
- Manual-First AI tasks are prepare-only. AI-First can navigate, inspect, and send strictly capped replay probes, but only through saved-scope policy checks.
- Radar never installs a root certificate automatically.
- Radar stores captures, WebSocket frames, findings, workflows, targets, sessions, proxy CA files, AI settings, and custom skills locally on your machine.
- Manual replay is operator-driven. AI-First replay is scope-checked and capped separately.
- Burst replay is capped to reduce accidental load and is not available to AI-First.
- Automate execution is Manual-First only. AI-First can prepare visible payload/rule controls and analyze existing results, but it cannot start invisible payload runs.
- Workflow execution always uses saved workflow definitions, scope policy, and caps. AI-First can choose existing workflows by id; it cannot invent hidden workflow behavior.
- Plugin install, approval, disable/block/remove, and live execution are Manual-First operator actions. AI-First can read approved plugin inventory but cannot approve plugins, widen permissions, or run hidden plugin actions.
- Finding export is Manual-First only. Evidence appendices are redacted by default, and raw evidence requires an explicit export toggle.

Use Radar only on systems, domains, and environments where you have permission to test.

## Install And Launch

### Install From A Release

Prebuilt installers are published on the [Radar GitHub Releases page](https://github.com/Hairetsu/Radar/releases).

#### macOS

Radar is not notarized yet. If macOS blocks launch with a verification or damaged-app warning:

1. Move `Radar.app` to `/Applications`.
2. Run:

```bash
sudo xattr -dr com.apple.quarantine /Applications/Radar.app
```

3. Open Radar normally.

#### Windows

Run the `.exe` installer. If SmartScreen appears, choose **More info**, then **Run anyway**.

#### Linux

For AppImage:

```bash
chmod +x Radar-*.AppImage
./Radar-*.AppImage
```

For Debian package:

```bash
sudo apt install ./radar_*_amd64.deb
```

### Run From Source

For users testing the app from the repository:

```bash
pnpm install
pnpm dev
```

Useful source commands:

| Command | Use |
| --- | --- |
| `pnpm dev` | Start Vite and open the Electron app. |
| `pnpm build` | Build the renderer and Electron main process. |
| `pnpm test` | Run lint, unit tests, and production build. |
| `pnpm screenshots` | Rebuild and refresh screenshot assets. |
| `pnpm pack` | Build an unpacked desktop app with electron-builder. |
| `pnpm dist` | Build release distributables. |

## Main Console Tour

Radar opens into an eleven-view operator console.

Persistent areas:

- **Left sidebar**: Radar lockup, profile/session controls, view navigation, and live per-view counts.
- **Top banner**: active workspace/session and UTC clock.
- **Header**: Radar identity, active profile, Open Browser button, live status pills, Profiles, Appearance, and AI settings.
- **Session selector**: quick session switching under the active profile.
- **Workspace panel**: the active tool surface.
- **Footer ticker**: current view, HTTP/S capture count, WebSocket frame count, TLS event count, and proxy status.

Views:

| View | Purpose |
| --- | --- |
| **01 HTTP(S)** | In-scope HTTP/S request log, query filters, tags/comments, and request/response inspector. |
| **02 WebSocket** | In-scope WebSocket handshakes, frames, payloads, errors, closes, and query filters. |
| **03 Intercept** | Scoped proxy request pause, edit, forward, drop, and resume controls. |
| **04 Repeater** | Manual request editor, single replay, and burst replay. |
| **05 Automate** | Explicit payload markers, saved payload sets, bounded sessions, result table, clustering, and match/extract rules. |
| **06 Findings** | Evidence-backed findings inbox, templates, retest tracking, and Markdown/HTML report export. |
| **07 Workflows** | Built-in and saved declarative checks, scoped run history, and result promotion to Findings. |
| **08 Plugins** | Local plugin manifest preview, permission approval, registry controls, SDK/API boundary, and panel inventory. |
| **09 Sitemap** | Host/path/endpoint map, endpoint inventory, session diff, and jump-to-traffic queries. |
| **10 Scope** | Engagement boundary and target allowlist. |
| **11 SSL** | Proxy controls, generated CA details, TLS event log, and TLS metadata. |

## Profiles And Sessions

Radar separates local work into profiles and sessions.

### Profiles

A profile represents an operator or client context. It owns:

- A local workspace.
- Scope targets.
- Installed plugin records.
- A dedicated launched-browser profile directory.
- Sessions created under that workspace.

Use profiles when you need to separate clients, projects, accounts, or testing contexts. Switching profiles can stop the launched Radar browser so browser state stays isolated.

### Sessions

A session is a capture ledger for a specific testing run. It tracks:

- HTTP/S captures.
- WebSocket frames.
- Findings and report-ready evidence references.
- Saved workflow definitions and session workflow runs.
- SSL events.
- Session name and timestamps.

Use sessions for separate test passes, retests, environments, or report evidence windows.

### Open The Profiles Panel

Click the profile/session control in the sidebar.

In the panel you can:

- Rename and save the active profile.
- Create a new profile.
- Load an existing profile.
- Rename and save the active session.
- Create a new session.
- Load an earlier session.
- See capture and TLS event counts for saved sessions.

### Quick Session Selector

The sidebar includes a **Session** dropdown. Use it to jump between existing sessions under the active profile.

### Clear A Session's Captures

In **01 HTTP(S)**, click the eraser icon in the panel header to clear HTTP/S captures for the active session. In **02 WebSocket**, click the eraser icon to clear WebSocket frames. Neither action deletes the profile, session, or scope targets.

## Scope

Scope is the engagement boundary. HTTP/S and WebSocket views only show evidence whose URL matches the active allowlist.

![Radar Scope view](screens/radar-03-scope.png)

Default scope:

```text
http://localhost:*
http://127.0.0.1:*
http://[::1]:*
```

### Add Targets

Open **10 Scope**, then enter one target per line:

```text
https://staging.example.com
https://api.staging.example.com
https://*.internal.example.com
example.test
local
```

Click **Commit** to save.

### Scope Rule Behavior

Radar accepts:

| Rule Type | Example | Behavior |
| --- | --- | --- |
| Origin | `https://staging.example.com` | Matches that exact origin. |
| Hostname | `example.test` | Matches the hostname regardless of scheme. |
| Wildcard | `https://*.example.com` | Matches wildcard patterns against the origin or full URL. |
| Local keyword | `local` | Matches localhost, `127.x.x.x`, and `[::1]`. |

WebSocket URLs match equivalent HTTP origins. For example, `ws://example.test` matches `http://example.test`, and `wss://example.test/socket` matches `https://example.test`.

Blank lines are ignored. If all targets are removed, Radar falls back to the default local development scope.

### Trust Origin From Repeater

In Repeater, click **Trust Origin** to add the current request URL's origin to scope.

## Opening The Radar Browser

Click **Open Browser** in the header.

Radar looks for a supported local browser:

- Google Chrome
- Google Chrome Canary on macOS
- Chromium
- Microsoft Edge
- Brave Browser on macOS

When Radar launches the browser it:

- Uses a Radar-owned profile directory instead of your normal browser profile.
- Starts the local Radar proxy if needed.
- Routes browser traffic through Radar's proxy.
- Opens remote debugging on `127.0.0.1:9223`.
- Uses a launch-scoped certificate exception for Radar's generated proxy CA fingerprint.
- Uses a mock keychain flag on macOS where supported to avoid prompting for your login keychain.

The SSL view shows the selected browser channel, binary path, profile path, proxy URL, and Chrome remote debugging endpoint.

### Address Behavior

Radar normalizes bare addresses. For example:

```text
example.com
```

becomes:

```text
https://example.com
```

Empty addresses fall back to:

```text
http://localhost:3000
```

## HTTP And HTTPS Traffic

HTTP(S) is the in-scope request and response capture log. WebSocket traffic is intentionally split into its own tab.

![Radar HTTP/S view](screens/radar-01-traffic.png)

Each row shows:

- HTTP method.
- Status code.
- Host.
- Path.
- Resource type or source.
- Duration.

HTTP(S) only lists captures that match the active scope rules and start with `http://` or `https://`. If requests are happening but the list is empty, check the Scope view first. If the app uses WebSockets, open **02 WebSocket**.

### Filter HTTP/S Traffic

Use the toolbar to narrow by method, resource type, sort field, and sort direction. The search bar accepts a scoped query language or plain text.

**Structured queries** use field predicates with optional comma-separated values:

```text
method:POST path:/api status:401,403 mime:json
host:staging.example.com req.header:authorization
tag:auth comment:session
```

Supported fields include `method`, `host`, `path`, `url`, `status`, `mime`, `type`, `source`, `initiator`, `req.header`, `resp.header`, `req.body`, `resp.body`, `tag`, and `comment`. Combine terms with `AND`, `OR`, and `NOT`. Quote values that contain spaces.

**Plain text** without field syntax falls back to substring search across method, URL, host, path, status, MIME type, source, headers, and bodies.

**Saved filters** persist per workspace. Save the current query from the filter chips, then reapply it later from the same chip row. Click the eraser icon to clear active filters.

**Keyboard shortcuts:**

- `Cmd+F` / `Ctrl+F` focuses the traffic search bar.
- `Escape` clears the active query when the search bar is focused.

### Tag And Comment On Captures

Select a capture to open tag and comment fields above the detail pane. Tags and comments persist for the active session and can be queried with `tag:` and `comment:` predicates.

### Bulk Actions

Multi-select captures with Cmd/Ctrl-click and Shift-click. When more than one row is selected, the bulk action bar supports bulk tag, export, and delete.

### Select Captures For AI

Click a row to select one capture. Cmd/Ctrl-click toggles individual rows. Shift-click selects a range from the current anchor. The AI command palette uses this selection as the initial packet set, and you can still adjust it inside the palette.

### Inspect A Capture

Select a row to open the detail pane.

Tabs:

- **Request**: method, URL, TLS line, request headers, request body.
- **Response**: status, TLS line, response headers, response body.

The detail pane is selectable so you can copy evidence.

### Copy Evidence

Click **Copy** in the detail pane. Radar copies whichever detail tab is active.

### Request Context Menu

Right-click an HTTP/S row or the request/response detail pane to open request actions.

![Radar request context menu](screens/radar-06-request-menu.png)

Available actions:

- Copy as cURL.
- Copy as Bash.
- Copy as Python.
- Copy as Fetch.
- Copy as raw HTTP.
- Copy URL.
- Send to Repeater.
- Add the request origin to Scope.
- Delete the capture.

### Clone Request

Click **Repeater**. Radar copies the selected request into Repeater with:

- Method.
- URL.
- Request headers.
- Request body.

## WebSocket

WebSocket is the in-scope stream and frame analyzer.

Radar captures WebSocket traffic separately from HTTP/S traffic. It records:

- Client handshake requests.
- Server handshake responses.
- Frames sent by the browser/client.
- Frames received from the server.
- Frame errors.
- Close events.

The proxy has a dedicated WebSocket passthrough rule, so controlled Chrome and external browsers can load WebSocket apps while Radar records frame events. Electron-attached pages can also contribute CDP WebSocket frame events.

### Filter WebSocket Frames

Use the toolbar to filter by direction: all, handshake, sent, received, error, or closed. The search bar accepts the same scoped query language as HTTP(S), with WebSocket-specific fields such as `direction`, `opcode`, `payload`, and `error`.

Examples:

```text
direction:sent payload:ping
host:staging.example.com direction:received
```

Plain text without field syntax falls back to substring search across URL, host, payload, direction, opcode, status, and error.

Click the eraser icon in the toolbar to clear active filters. `Cmd+F` / `Ctrl+F` focuses the WebSocket search bar; `Escape` clears the active query when focused.

### Inspect A Frame

Select a frame to open the detail pane. The detail includes:

- Frame URL and connection id.
- Host.
- Direction.
- Opcode.
- Size.
- Status or close code when present.
- Request and response handshake headers.
- Payload preview or copied payload text.

Click **Copy** in the detail pane to copy the active frame detail.

### Select Frames For AI

Click a frame to select one frame. Cmd/Ctrl-click toggles individual frames. Shift-click selects a range from the current anchor. Selected frames are passed into the AI command palette as WebSocket packet evidence, alongside any selected HTTP/S captures.

### Clear WebSocket Frames

Click the eraser icon in the WebSocket panel header. This clears WebSocket frame history for the active session and does not remove HTTP/S captures.

## Sitemap

Sitemap is the host, path, and endpoint map for scoped HTTP/S traffic in the active session.

Open **09 Sitemap** to browse discovered structure without leaving Radar.

### Tree Navigation

The left tree groups:

- Hosts.
- Paths under each host.
- Endpoint families by method and status.

Select a node to inspect coverage counts and jump into matching HTTP(S) traffic with a prepared query.

### Endpoint Inventory

Selecting an endpoint opens inventory details for:

- Query parameters seen in captured requests.
- JSON body keys and form fields.
- Content types.
- Auth signals such as bearer tokens, cookies, and API keys.

Use **Open in HTTP(S)** to apply a matching query in the traffic tab.

### Session Diff

The right pane compares the active session against an earlier session under the same profile. Pick a baseline session, then review:

- Added endpoints.
- Removed endpoints.
- Status changes.
- Header changes.
- Response-shape changes.

Session diff helps retests and regression checks without exporting captures manually.

## Intercept

Intercept is the Manual-First request pause and mutation surface for scoped proxy traffic.

Open **03 Intercept** and click **Requests Off** to switch request interception on, or **Responses Off** to switch response interception on. Request interception pauses matching in-scope HTTP/S proxy requests before they are sent upstream. Response interception pauses matching in-scope HTTP/S responses after upstream response headers/body are available but before the client receives them. Out-of-scope traffic continues without pausing.

The left side shows the live queue:

- Method or response status.
- Host.
- Path.
- Stage.

The lower rules editor accepts a JSON array of per-workspace intercept rules. A rule can match by `stage`, `method`, `host`, `path`, `contentType`, `status`, `initiator`, `requestHeader`, `responseHeader`, or `body`. If no enabled rules exist, enabled request or response interception pauses all in-scope traffic for that stage. If any enabled rules exist, only matching traffic is queued, and the queue/detail surfaces show rule-hit counts.

The match/replace editor beside it accepts a JSON array of per-workspace rewrite rules. A rewrite rule uses `stage` (`request` or `response`), `target` (`header` or `body`), `match`, `replace`, and optional `headerName`. Rewrites only run for in-scope HTTP/S proxy traffic. Fired rewrites are recorded on the HTTP/S capture so the history explains which rule changed a header or body.

Select a queued item to load it into the editor. For requests, the right side lets you edit:

- Method.
- URL.
- JSON headers.
- Body.

For responses, the right side lets you edit:

- Status code.
- Status text.
- JSON headers.
- Body.

Actions:

- **Forward** sends the selected request upstream or releases the selected response to the client. If you edited method, URL, status, headers, or body, Radar forwards the edited version.
- **Drop** closes the selected queued item and records it as dropped in HTTP history.
- **Reset** reloads the queued item's original values into the editor.
- **Resume All** forwards every currently queued item without further edits.

Radar records intercept and rewrite metadata on the corresponding HTTP/S capture, including whether the request or response was queued, forwarded, edited, dropped, resumed, or changed by match/replace. The metadata appears in the HTTP detail pane so the history shows how the item was handled.

AI-First can read queued intercept items and prepare edits into the visible Intercept controls. It does not forward or drop intercepted traffic; those actions remain operator-confirmed Manual-First controls.

## Repeater

Repeater is for manual request editing and replay.

![Radar Repeater view](screens/radar-02-repeater.png)

The tab bar at the top holds multiple named replay tabs. Create tabs with **+**, pin important tabs, close extras, and switch without losing each tab's draft. Each tab can bind to a workspace environment for `{{variable}}` substitution in the URL, headers, and body.

The left side is the request editor:

- Method selector.
- URL input.
- JSON headers editor.
- Body editor.
- Transform shortcuts for URL encode/decode, JSON format/minify, JWT decode, and cookie parse.
- **Transmit** button.

The right side is the burst and response area:

- Count.
- Parallel.
- Delay.
- **Saturate** button.
- Last response status, latency, body preview, and burst failure count.
- Replay history for the active tab with **Load** and diff selectors.
- Response diff panel when two history entries are selected.
- Collections and environment shortcuts when configured.

### Replay History And Diff

Each tab keeps a capped replay history. After **Transmit**, the request/response pair is stored on the active tab. Select two history rows with the diff radios to compare status, latency, headers, body length, and body text deltas.

### Environments And Collections

Workspace environments hold reusable variables such as hosts, tokens, and IDs. Bind an environment from the Repeater tab bar, then use `{{variable}}` placeholders in the editor. Collections store reusable request drafts; save the active tab into a collection or load saved items back into Repeater.

### WebSocket Replay

From the WebSocket view, select a sent or received frame and click **Replay** to load its payload into the Repeater WebSocket panel. Edit the payload and click **Send frame** for one bounded replay attempt. Radar records resulting frame evidence in the active session when the connection succeeds.

### Edit Headers

Headers must be a JSON object:

```json
{
  "Accept": "application/json",
  "Content-Type": "application/json"
}
```

Invalid JSON prevents replay and shows an error notice.

### Single Replay

Click **Transmit** to send one request.

Replay behavior:

- Runs from the Electron main process.
- Uses the request method, URL, headers, and body in the editor.
- Times out after 30 seconds.
- Does not automatically follow redirects.
- Returns status, status text, duration, headers, body preview, and byte count.

### Burst Replay

Click **Saturate** to send a capped burst.

Limits:

| Setting | Limit |
| --- | --- |
| Count | 1 to 50 |
| Parallel | 1 to 5 |
| Delay | 0 to 10000 ms |

The burst panel reports:

- Actual count.
- Actual concurrency.
- Average latency.
- Failure count.
- Last response.

Radar marks failures when a replay fails or returns a status code of 400 or higher.

### Replay Normalization

Before sending, Radar normalizes the draft:

- Method is uppercased.
- `GET` and `HEAD` bodies are removed.
- Bodies are capped.
- Hop-by-hop or unsafe headers are stripped:
  - `Host`
  - `Content-Length`
  - `Connection`
  - `Upgrade`
  - `Proxy-Connection`

Always verify the URL and headers before transmitting.

## Automate

Automate is the Manual-First payload-position testing surface. It detects explicit markers in the active Repeater draft, shows marked URL/header/body positions, saves bounded payload sets, runs scoped sessions with visible stop controls, and persists results for sorting, clustering, matching, extraction, export, and Repeater promotion.

![Radar Automate view](screens/radar-07-automate.png)

### Marker Syntax

Use explicit payload markers:

```text
{{payload:name}}
```

Marker names may contain letters, numbers, underscores, periods, and hyphens. Radar detects markers in:

- URL text.
- Header values.
- Request bodies.

Environment variables still use the existing Repeater syntax, such as `{{token}}`. Payload markers use the `payload:` prefix so they stay distinct from environment variables.

### Add Markers

Open **05 Automate** after loading or editing a Repeater draft.

Controls:

- **Marker** sets the marker name used by the add buttons.
- **Header** sets the header name for **Mark Header**.
- **Mark URL** appends a query parameter with the payload marker.
- **Mark Header** adds or replaces the named header value with the payload marker.
- **Mark Body** appends the payload marker to the request body.

You can also type markers directly in Repeater and then return to Automate.

### Payload Sets

Enter one inline payload per line. Blank lines are ignored and payloads are capped before they reach the runtime. Use **Save Set** to persist the inline deck per workspace, or save a local wordlist reference when you want Radar to remember where a list came from without copying secret list contents into logs.

The payload-set selector reloads saved decks into the visible editor. The first payload still drives the materialized preview so you can inspect the exact request shape before any traffic is sent.

### Run Controls

The run panel exposes the bounded execution controls:

| Control | Use |
| --- | --- |
| **Count** | Maximum payload attempts to run from the current deck. |
| **Concurrency** | Parallel request workers, capped by Radar. |
| **Delay** | Milliseconds between attempts per worker. |
| **Timeout** | Per-request timeout before an attempt is recorded as failed. |
| **Start** | Create a durable Automate session and begin sending scoped materialized requests. |
| **Pause / Resume** | Pause between attempts or continue a paused session. |
| **Stop** | Abort active requests and preserve partial results. |
| **Retry** | Re-run failed or error attempts while keeping the original evidence. |

Before each attempt, Radar materializes the request, applies Repeater environment variables, checks the current scope allowlist, applies timeout/delay/concurrency caps, and records either a response result or a scoped failure row.

### Match And Extract Rules

Rules are JSON records in the visible editor. Match rules can target status, headers, body text, regex, redirects, response length, or latency. Extract rules use regex captures; named captures are displayed as extracted values. Malformed regex rules fail closed and are ignored.

Example:

```json
[
  { "id": "server-errors", "name": "Server errors", "enabled": true, "kind": "match", "target": "status", "status": 500 },
  { "id": "token", "name": "Token", "enabled": true, "kind": "extract", "target": "regex", "pattern": "token=(?<value>[a-z0-9]+)" }
]
```

### Results

The result table records each payload attempt with status, length, word count, latency, cluster id, payload, errors, redirects, match markers, and extracted values. Filters show all rows, failures, matches, or outliers. Sorting can emphasize order, status, length, latency, or marker count.

Radar fingerprints responses by status family, body length band, header shape, and normalized text digest. Similar responses form deterministic clusters; one-off clusters are surfaced as outliers.

Use **Copy Result** to copy the selected row as JSON, **Export** to download all session results, **Promote** to open the exact materialized request in a new Repeater tab, or **Finding** to create a draft finding with the Automate result attached as evidence.

### Materialized Preview

The preview shows the request after replacing all detected payload markers with the first inline payload. Click **Load** to copy that materialized request into the active Repeater tab. Radar does not transmit that preview until you click **Transmit** in Repeater.

## Findings

Findings is the evidence-backed inbox for the end of an assessment. Manual-First operators can create findings from selected HTTP/S captures, selected WebSocket frames, or selected Automate results. AI-First can write draft findings at run completion, but those findings remain **draft** until reviewed manually.

### Create A Finding

Open **06 Findings**. Choose a template, then use one of the creation controls:

| Control | Use |
| --- | --- |
| **Capture** | Creates a draft from the currently selected HTTP/S capture. |
| **Frame** | Creates a draft from the currently selected WebSocket frame. |
| **Automate** | Creates a draft from the selected Automate result. |

Templates cover common web classes: authentication, session management, CORS, cache, missing headers, IDOR, injection signals, access control, and information disclosure.

Every saved finding needs at least one evidence reference. Radar stores references such as `capture:id`, `websocket:id`, `replay:id`, `automate:sessionId:resultId`, `workflow:runId:resultId`, and `ai:runId` locally with the active session.

### Review And Retest

The editor tracks:

- Severity and confidence.
- Status: draft, reviewed, accepted-risk, retest-passed, or retest-failed.
- Affected assets.
- Reproduction steps.
- Impact.
- Remediation.
- Notes and owner.
- Retest result.

Use **Attach Capture** or **Attach Automate** to add current-session evidence to an existing finding during retest. Update the retest result and set status to **retest-passed** or **retest-failed** before export.

### Report Export

The report builder generates Markdown or HTML from the local findings inbox. Reviewed findings are included by default. Draft findings are opt-in. The evidence appendix is included by default with sensitive-looking metadata redacted; enable **Raw evidence** only when you intentionally want unredacted appendix metadata in the export preview.

Use **Copy** to place the generated report on the clipboard or **Download** to save a `.md` or `.html` file.

## Workflows

Workflows are repeatable checks for the active workspace. They can be passive checks over scoped captures or active checks that send strictly bounded replay requests through the same scope-checked Repeater path.

Open **07 Workflows** to see the catalog, definition editor, run inputs, run history, and result detail panes.

![Radar Workflows view](screens/radar-08-workflows.png)

### Built-In Workflows

Radar ships built-ins for:

- Security headers.
- Cookie flags.
- CORS and cache control.
- Metadata exposure.
- Unauthenticated access check for a selected capture.

Passive workflows never send traffic. Active workflows show their mode, request cap, timeout, inputs, and selected capture id before execution.

### Custom Definitions

The definition editor accepts JSON or a constrained YAML-like syntax. Workflow definitions include:

- `id`, `name`, and `description`.
- `mode`: `passive` or `active`.
- `scope`: require in-scope evidence, active permission, request cap, timeout, delay, and result cap.
- `inputs`: text, number, boolean, or capture-id inputs.
- `steps`: supported checks such as `security-headers`, `cookie-flags`, `cors-policy`, `cache-control`, `metadata-exposure`, `active-replay`, and `browser-open`.

Click **Save** to persist a custom workflow to the active workspace. Built-ins cannot be overwritten or deleted, but you can save an edited copy with a new id.

### Running Workflows

Select a workflow and click **Run**. For active selected-capture workflows:

1. Select an HTTP/S capture in **01 HTTP(S)**.
2. Open **07 Workflows**.
3. Choose the active workflow.
4. Confirm the `capture-id` input.
5. Run the workflow.

Radar strips credentials for the unauthenticated replay built-in, enforces the workflow request cap, checks scope, persists the run, and records pass/warn/fail results with local evidence references.

### Promote Results

Warning and failure results can become draft findings. Click **Finding** on a result to create a draft in **06 Findings** with:

- A stable `workflow:runId:resultId` evidence reference.
- Linked capture evidence when the result came from session traffic.
- Source workflow, run, step, result, and level metadata.

Pass and info results stay in workflow history and are not promoted to findings.

## Plugins

Plugins are local extensions installed from disk into the active workspace. Radar supports manifest preview, explicit permission approval, a workspace-local install registry, a typed SDK/API boundary, approved panel inventory, and first-party examples under `plugins/examples/`.

Open **08 Plugins** to manage local extensions.

The Plugins view has three working areas:

- **Install local plugin** previews a folder path before adding anything to the registry.
- **Installed registry** shows each plugin's status, requested permissions, granted permissions, warnings, source path, and operator actions.
- **Panel inventory** lists approved plugin panels that can render inside the Radar console when the plugin requested `ui:panel`.

Plugin records belong to the active workspace. Switching profiles switches the visible plugin registry.

### Install A Local Plugin

1. Enter a plugin folder path such as `plugins/examples/jwt-helper`.
2. Click **Preview**.
3. Review the manifest id, version, source path, entry file, requested permissions, panels, and warnings.
4. Click **Install** to add the plugin as **pending**.
5. Click **Approve** to grant the requested permissions.

Radar looks for `.radar-plugin/plugin.json` first, then `plugin.json` at the plugin root. Install does not execute plugin code. Approval grants only permissions requested by the manifest.

### Manifest Shape

A plugin manifest must identify the plugin, declare a semantic version, point to an entry file or panel, and request only the permissions it needs. Entry paths are relative to the plugin folder; absolute paths and `..` segments are rejected.

Example:

```json
{
  "schemaVersion": 1,
  "id": "jwt-helper",
  "name": "JWT Helper",
  "version": "0.1.0",
  "description": "Inspect selected token-shaped values and prepare safe notes.",
  "author": "Radar",
  "sdkVersion": "0.1",
  "minRadarVersion": "0.1.0",
  "entry": "dist/index.js",
  "permissions": ["captures:read", "findings:write", "ui:panel"],
  "panels": [
    {
      "id": "jwt-helper",
      "title": "JWT Helper",
      "entry": "panel.html"
    }
  ]
}
```

Manifest validation normalizes ids, trims long text, caps panels, ignores unknown permissions, and adds `ui:panel` automatically when panels are declared.

### Status And Controls

Plugins move through explicit local states:

| Status | Meaning |
| --- | --- |
| **pending** | Installed in the workspace registry, but no permissions are granted yet. |
| **approved** | The operator granted the manifest's requested permissions. |
| **disabled** | The plugin stays installed, but cannot use granted permissions. |
| **blocked** | The plugin stays recorded as blocked and cannot use granted permissions. |

Registry actions:

| Action | Use |
| --- | --- |
| **Approve** | Grant the permissions requested by the manifest and make panels eligible for the panel inventory. |
| **Disable** | Temporarily stop an approved plugin without deleting its record. |
| **Block** | Keep a plugin record while preventing use after a warning or policy decision. |
| **Remove** | Delete the workspace-local plugin record. |

### Permissions

Supported plugin permissions are:

| Permission | Meaning |
| --- | --- |
| `captures:read` | Read in-scope HTTP/S captures through the SDK/API boundary. |
| `frames:read` | Read in-scope WebSocket frames. |
| `replay:prepare` | Normalize and prepare replay drafts without transmitting. |
| `replay:send` | Send scoped replay requests through Radar's replay caps. |
| `files:read` | Read operator-selected local files. |
| `ai:context` | Read redacted AI-visible context when supported. |
| `workflows:read` | Read workflow definitions and run history. |
| `workflows:run` | Run existing scoped workflows. |
| `workflows:write` | Save workflow definitions. |
| `findings:write` | Create draft findings with evidence references. |
| `ui:panel` | Register plugin panels in the Radar console. |

Permission warnings are surfaced during preview and in the registry. Higher-impact permissions such as `replay:send`, `files:read`, `workflows:run`, `workflows:write`, and `ai:context` deserve closer review before approval.

Disabled and blocked plugins cannot use approved permissions.

### SDK And Examples

The SDK surface lives in `shared/pluginSdk.ts`; the Electron local API enforcement lives in `electron/pluginApi.ts`. Extension authors should build against the SDK methods and let Radar enforce permissions, scope filtering, replay caps, finding evidence validation, and workflow caps.

SDK methods:

| SDK method | Required permission | Result |
| --- | --- | --- |
| `listCaptures(query)` | `captures:read` | Returns in-scope HTTP/S captures matching the query. |
| `listFrames(query)` | `frames:read` | Returns in-scope WebSocket events matching the query. |
| `prepareReplay(draft)` | `replay:prepare` | Returns a normalized replay draft without transmitting. |
| `sendReplay(draft)` | `replay:send` | Sends one scoped replay request through Radar replay enforcement. |
| `createFinding(finding)` | `findings:write` | Creates a draft finding with valid local evidence references. |
| `listWorkflows()` | `workflows:read` | Returns saved workflow definitions. |
| `saveWorkflow(workflow)` | `workflows:write` | Saves a normalized workflow definition. |
| `runWorkflow(workflowId, inputs)` | `workflows:run` | Runs an existing scoped workflow with caps and history. |

First-party examples:

- `plugins/examples/jwt-helper`: token-oriented capture review with finding draft support.
- `plugins/examples/graphql-helper`: GraphQL-shaped capture and frame review.
- `plugins/examples/openapi-importer`: workflow-oriented API surface import helper.
- `plugins/examples/parameter-miner`: capture/frame parameter discovery helper.
- `plugins/examples/report-exporter`: finding/report export companion panel.

Each example includes `.radar-plugin/plugin.json`, `dist/index.js`, and `panel.html` so you can inspect the manifest, SDK entry, and panel shape before installing it.

### AI-First Visibility

AI-First can switch to **08 Plugins** and read installed plugin inventory through `getPluginInventory`. It cannot install plugins, approve plugins, change permission grants, disable/remove plugins, or execute plugin SDK/API actions invisibly.

## SSL And Proxy

SSL shows proxy controls, generated CA details, certificate events, and TLS metadata.

![Radar SSL / Proxy view](screens/radar-04-ssl.png)

### Controls

| Control | Use |
| --- | --- |
| **Engage Proxy** | Start the local HTTP/HTTPS proxy. |
| **Disengage** | Stop the proxy. |
| **Forge CA** | Generate or load Radar's local proxy CA. |

### Proxy Details

The SSL view displays:

- HTTP proxy URL, usually `http://127.0.0.1:8088`.
- CA certificate path.
- SPKI fingerprint.
- Chrome remote debugging endpoint.
- Browser channel.
- Browser binary path.
- Browser profile path.

### Proxy Profiles

The SSL view includes workspace-local setup notes for:

- Radar Browser.
- External Browser.
- CLI Tools.
- Mobile / Device.

Select a profile, add client-specific setup notes, and click **Save Profile Notes**. Notes stay local to the active workspace and are not sent to AI unless you explicitly include relevant screen context in a task.

### Radar Browser HTTPS

The recommended HTTPS path is **Open Browser**. Radar launches the browser with the Radar proxy attached and supplies a launch-scoped certificate exception for the generated CA fingerprint.

This avoids changing system trust settings.

### External Browser Proxy

Use this when you want another browser or tool to route traffic through Radar.

1. Open **11 SSL**.
2. Click **Engage Proxy**.
3. Copy the displayed proxy URL.
4. Configure your browser or tool to use that proxy.
5. For HTTPS interception, manually trust the displayed `radar-ca.pem` certificate in that browser or tool.

Radar does not install the CA automatically.

### Certificate Event Log

The SSL event log shows certificate and TLS client events Radar observes, including:

- Trusted local certificate exceptions.
- Blocked certificate errors.
- Proxy TLS client errors.
- Subject or issuer names when available.

### TLS Detail Pane

If a selected capture includes TLS metadata, the SSL detail pane shows:

- URL.
- TLS protocol.
- Subject name.
- Issuer.

## Manual-First And AI-First Modes

Radar starts in **Manual-First** mode. In this mode, the operator drives HTTP(S), WebSocket, Intercept, Repeater, Automate, Findings, Workflows, Plugins, Sitemap, Scope, and SSL directly. The AI command palette can prepare summaries, drafts, checklists, browser steps, plugin review notes, and report notes, but it does not execute browser navigation, intercept actions, replay requests, Automate runs, workflow edits, plugin install/approval/execution, finding review, or exports.

Switch to **AI-First** from the top shell toggle when you want Radar to run from a prompt. AI-First opens a goal prompt and run console above the normal views. Enter a scoped goal such as:

```text
Inspect https://staging.example.com for auth, session, and API hardening issues.
```

When a run starts, Radar records a live timeline. The agent chooses one tool action at a time, observes the result, then chooses the next action or returns `finish`. Radar does not fall back to a preset autonomous script if the configured AI planner fails.

Available AI-First tools:

- `showView` moves the visible workbench between HTTP(S), WebSocket, Intercept, Repeater, Automate, Findings, Workflows, Plugins, Sitemap, Scope, and SSL.
- `getBrowserState` reads the launched browser state.
- `openBrowser` and `navigateBrowser` drive in-scope browser navigation.
- `waitForNetworkIdle` waits for captured HTTP/S traffic to settle after navigation.
- `getPageText` reads visible text from the active page.
- `getDomSummary` reads compact page text, links, buttons, and forms.
- `getClickableElements`, `clickElement`, `fillInput`, and `submitForm` inspect and operate page controls.
- `getCookies` and `getStorageState` inspect browser session state.
- `saveAuthState`, `loadAuthState`, `listAuthStates`, and `compareAuthStates` manage named auth/session states for comparison workflows.
- `getCaptures` reads run-scoped in-scope HTTP/S evidence across target redirects, with optional origin narrowing.
- `getSitemapCoverage` summarizes host, path, and endpoint coverage from run-scoped HTTP/S captures.
- `prepareTrafficQuery` loads a visible traffic query into the HTTP(S) filter bar without changing scope.
- `getInterceptQueue` reads queued in-scope intercept items without forwarding or dropping.
- `prepareInterceptEdit` loads a request or response edit into the visible Intercept controls for operator review.
- `getAutomateContext` reads saved payload sets and Automate session summaries.
- `prepareAutomateDraft` loads visible Automate payload and rule controls for operator review.
- `analyzeAutomateResults` summarizes existing Automate sessions, clusters, outliers, matches, and failures.
- `getWorkflowCatalog` reads built-in and saved workflow definitions without running checks.
- `runWorkflow` runs an existing workflow by id through the same scoped workflow runtime and records visible run history.
- `getPluginInventory` reads installed plugin status, requested permissions, granted permissions, warnings, and panel names without approving or executing plugins.
- `sendReplay` sends one policy-capped replay draft.
- `analyzeSecurityHeaders`, `analyzeCookieFlags`, and `checkCorsPolicy` produce evidence observations from run-scoped captures.

The existing views remain visible evidence panes, so you can watch the agent use the app instead of waiting for an opaque background job. Click **Stop** in the AI-First console to interrupt an active run. Switching back to Manual-First also stops an active autonomous run so it cannot continue invisibly.

AI-First runs are intentionally bounded:

- Every browser or replay URL must be in Scope.
- Captures created during an AI-First run are tagged with the run id, navigation id, frame URL, and initiator when available.
- AI-First feeds the current run's in-scope HTTP/S captures into each planner decision, so redirects and canonical hostnames remain visible without repeated capture reads.
- AI-First capture reads only return evidence for the active run unless an origin filter narrows that run evidence further.
- AI-First intercept tools are prepare-only. They can inspect queued items and load draft edits, but **Forward**, **Drop**, and **Resume All** remain operator actions.
- WebSocket frames stay visible in **02 WebSocket** and can be selected for command-palette AI tasks; autonomous AI-First capture tools currently read HTTP/S captures.
- If Chrome's debugging endpoint drops, page-inspection tools reopen the controlled browser at the current URL before retrying.
- Replay uses stricter autonomous limits than manual Repeater controls.
- Automate execution is not available to AI-First. AI can prepare visible Automate controls and analyze existing results, but payload runs remain Manual-First operator actions.
- AI-First workflow runs must choose an existing workflow id. Active workflow requests consume the autonomous replay budget and appear in **07 Workflows** run history.
- AI-First plugin visibility is read-only. It can inspect **08 Plugins** inventory, but plugin install, approval, permission changes, and SDK/API execution remain Manual-First.
- AI-First findings are saved into **06 Findings** as drafts with local evidence references. Review, status changes, retest results, and exports remain Manual-First.
- Burst replay is not part of the first autonomous slice.
- Invalid planner output fails the run instead of switching to heuristics.
- Findings without evidence references fail the run.
- Findings are draft findings until manually reviewed.
- Tool calls, policy blocks, results, and findings are saved locally with the active session.

## AI Command Palette

Open the AI command palette with:

- The **AI** button in the panel header.
- The Scope view's AI strip.
- `Cmd+K` on macOS.
- `Ctrl+K` on Windows/Linux.

![Radar AI command palette](screens/radar-05-ai-palette.png)

### What AI Can Do

AI features are view-aware.

| View | Built-in Tasks |
| --- | --- |
| HTTP(S) | Capture Summary, Report Notes |
| WebSocket | Capture Summary, Report Notes |
| Intercept | Capture Summary, Report Notes |
| Repeater | Repeater Drafts |
| Automate | Repeater Drafts |
| Findings | Report Notes, Capture Summary |
| Workflows | Scope Checklist, Report Notes |
| Plugins | Report Notes |
| Sitemap | Capture Summary, Report Notes |
| Scope | Scope Checklist, Browser Helper |
| SSL | TLS Review |

Task behavior:

- **Capture Summary** explains selected HTTP/S request/response evidence, WebSocket frames, headers, TLS, timing, direction, opcode, payload signals, and notable signals.
- **Report Notes** writes concise evidence notes with `capture:id` and `websocket:id` references plus uncertainty markers.
- **Repeater Drafts** suggests safe request variants and can load the first returned draft into Repeater. It never transmits.
- **Scope Checklist** creates a short manual checklist within the active allowlist.
- **Browser Helper** suggests exploration steps. If a navigation step is returned, Radar can prepare the URL, but you still decide whether to open it.
- **TLS Review** reviews certificate events, trust failures, proxy posture, and TLS metadata.

### Connect AI

Open AI settings from the header.

Supported providers:

| Provider | Notes |
| --- | --- |
| Codex app | Uses your installed Codex app/CLI login. No API key is stored in Radar. |
| Cursor agent | Uses the installed Cursor `agent` CLI. Sign in with Cursor or provide an optional API key. |
| OpenAI | Uses OpenAI's chat completions API. Requires an API key. |
| Anthropic | Uses Anthropic messages API. Requires an API key. |
| OpenAI-compatible | Uses a custom base URL, for example a local OpenAI-compatible server. |

Preset buttons:

- **Codex Connect**: selects the local Codex provider and probes the installed `codex` executable.
- **Cursor CLI Connect**: selects the local Cursor provider and probes the installed `agent` executable.

For Cursor, use **Sign in with Cursor** if the CLI is installed but not authenticated.

### Models

Radar refreshes model lists where possible:

- Codex and Cursor providers ask their local CLIs.
- OpenAI and OpenAI-compatible providers call `/models`.
- Anthropic uses a built-in model list.
- Cached model lists are stored locally.

If a selected model is unavailable, Radar selects a valid cached model or `auto`.

### Preview Context

Before running a task, preview the context. The preview shows:

- Number of packets included.
- Character count.
- Whether context is redacted.
- Any blocking reason.

Radar blocks tasks that lack enough context. Examples:

- HTTP(S) tasks need at least one selected HTTP/S capture or WebSocket frame.
- WebSocket tasks need at least one selected WebSocket frame or HTTP/S capture.
- Repeater tasks need a selected packet or loaded draft.
- Automate tasks need a loaded draft.
- Scope tasks need at least one scope target.
- SSL tasks need SSL events or a capture with TLS details.

### Raw Context Opt-In

By default, Radar redacts sensitive context before sending it to AI:

- `Authorization`
- `Cookie`
- `Set-Cookie`
- `X-API-Key`
- `X-Auth-Token`
- `Proxy-Authorization`
- Token-like strings in bodies

Use the raw-context checkbox only when you are comfortable sending raw headers, bodies, and WebSocket payloads to the configured provider.

For WebSocket evidence, raw context includes frame payloads. Without raw context, Radar still includes frame metadata but redacts token-like payload strings.

### Custom Skills

In the command palette, you can add a custom skill for the current view.

A custom skill needs:

- Label.
- Optional hint.
- Instructions.

Custom skills are stored locally and scoped to the view where they were created.

### Session Audit

The palette shows an in-memory audit trail for the current app run:

- Task.
- Provider.
- Model.
- Capture IDs.
- WebSocket frame IDs.
- Redacted or raw context.
- Prompt size.
- Result size.
- Success or error.

The audit trail is session-only in memory. It is not a cross-session AI memory store.

## Appearance

Open Appearance from the header palette icon.

Themes:

| Theme | Mood |
| --- | --- |
| Bureau | Warm operational dark with signal orange. |
| Vellum | Sunlit editorial light with vermillion ink. |
| Specter | Midnight phosphor dark with chartreuse and cyan accents. |

Theme selection is stored in browser local storage for the app UI.

## Local Data And Privacy

Radar stores app data under Electron's `userData` directory. The exact path depends on your OS, but it is usually:

| OS | Typical Location |
| --- | --- |
| macOS | `~/Library/Application Support/Radar` |
| Windows | `%APPDATA%\Radar` |
| Linux | `~/.config/Radar` |

Important local files and folders:

| Item | Purpose |
| --- | --- |
| `radar-local.sqlite` | Profiles, workspaces, sessions, targets, saved filters, evidence tags and comments, intercept rules, match/replace rules, proxy profile notes, HTTP/S captures, WebSocket frames, findings, saved workflows, workflow runs, installed plugin records, SSL events, cached model lists, and AI-First agent run history. |
| `proxy-ca/radar-ca.pem` | Local proxy CA certificate. |
| `proxy-ca/radar-ca-key.pem` | Local proxy CA private key. |
| `profiles/<profile-id>/proxy-browser-profile` | Dedicated launched-browser profile. |
| `ai-settings.json` | AI provider, model, base URL, and saved API key when applicable. |
| `ai-skills.json` | Custom AI skills. |

Privacy notes:

- Captures and WebSocket frames stay local unless you explicitly include them in AI context.
- AI-First run history, tool timelines, and draft findings stay local in the active session.
- Workflow definitions and run results stay local unless you promote results, copy evidence, or export reports.
- Findings and report previews stay local unless you copy or download an export.
- Raw AI context is opt-in.
- API keys are saved locally when entered for non-local providers.
- Codex local mode uses installed Codex authentication and does not store an API key in Radar.
- Cursor local mode can use installed Cursor auth or an optional API key.
- Radar's proxy CA private key is local. Treat it as sensitive.

## Common Workflows

### Capture Local Development Traffic

1. Open Radar.
2. Keep the default local scope.
3. Click **Open Browser**.
4. Visit `http://localhost:3000` or your local app URL.
5. Open **01 HTTP(S)**.
6. Select a row to inspect request and response details.
7. Click **Repeater** when you want to replay a request manually.

### Capture A Staging Target

1. Open **10 Scope**.
2. Add the staging origin, for example:

```text
https://staging.example.com
```

3. Click **Commit**.
4. Click **Open Browser**.
5. Visit the staging target in the launched browser.
6. Inspect matching captures in **01 HTTP(S)** or matching frames in **02 WebSocket**.

### Use An External Browser

1. Open **11 SSL**.
2. Click **Engage Proxy**.
3. Configure the external browser to use the displayed proxy URL.
4. For HTTPS, manually trust the displayed CA certificate in that browser.
5. Add the target origin in **10 Scope**.
6. Browse the target.
7. Inspect matching captures in **01 HTTP(S)** or matching frames in **02 WebSocket**.

### Prepare A Safe Repeater Draft With AI

1. Capture a request or manually load a request in Repeater.
2. Open **04 Repeater**.
3. Open the **AI** palette.
4. Choose **Repeater Drafts**.
5. Preview context.
6. Run the task.
7. Review the returned draft.
8. Apply the draft if useful.
9. Manually confirm the URL and headers.
10. Click **Transmit** yourself.

### Run A Bounded Payload Session

1. Capture a request and load it into **04 Repeater**.
2. Open **05 Automate**.
3. Set a marker name such as `id` or `role`.
4. Click **Mark URL**, **Mark Header**, or **Mark Body**, or type `{{payload:id}}` directly into the Repeater draft.
5. Enter one payload per line.
6. Save the deck if you want to reuse it.
7. Set count, concurrency, delay, timeout, and any match/extract rules.
8. Click **Start** and watch the result table update.
9. Stop or pause the session if the target behavior changes.
10. Promote interesting rows to Repeater for manual confirmation or to Findings for review.

### Run Repeatable Workflow Checks

1. Capture traffic under the active scope.
2. Open **07 Workflows**.
3. Select a built-in workflow such as **Security Headers** or **CORS And Cache Control**.
4. Review the mode, request cap, timeout, and steps.
5. Click **Run**.
6. Inspect pass, info, warn, and fail results in run history.
7. Promote warning or failure results to **06 Findings** when they need manual review.

For the unauthenticated access check, first select the HTTP/S capture you want to replay. Radar fills the `capture-id` input and strips credentials before sending one scoped replay request.

### Run AI-First Autonomy

1. Switch the top shell toggle from **Manual-First** to **AI-First**.
2. Enter a goal that includes the target, such as `hairetsu.com` or `https://staging.example.com`.
3. Click **Start Run**. Radar saves the goal's target origin into **10 Scope** before the agent chooses tools.
4. Watch the tool/action timeline update until the agent returns `finish`.
5. Click **Stop** if the run should halt.
6. Review draft findings in **06 Findings** before using them.

### Create A Finding And Report

1. Select a relevant request in **01 HTTP(S)**, a frame in **02 WebSocket**, or an Automate result in **05 Automate**.
2. Open **06 Findings**.
3. Choose a template.
4. Click **Capture**, **Frame**, or **Automate**.
5. Fill in reproduction, impact, remediation, affected assets, owner, and notes.
6. Set status to **reviewed** when the finding is ready.
7. Build a Markdown or HTML report preview.
8. Leave **Raw evidence** off unless the appendix intentionally needs unredacted metadata.
9. Copy or download the report.

### Create Report Notes

1. Select one or more captures in **01 HTTP(S)** or frames in **02 WebSocket**.
2. Open the **AI** palette.
3. Choose **Report Notes**.
4. Preview the context.
5. Leave raw context off unless needed.
6. Run the task.
7. Copy the resulting notes into your report workflow.

### Start A Retest Session

1. Open **01 HTTP(S)**.
2. Click **New Session**.
3. Name the session, for example `Checkout retest`.
4. Continue capturing.
5. Open **06 Findings** and select the finding under retest.
6. Attach new capture or Automate evidence.
7. Record the retest result.
8. Set status to **retest-passed** or **retest-failed**.
9. Use the session selector to compare or return to earlier sessions.

### Map Endpoints With Sitemap

1. Capture traffic in **01 HTTP(S)** under the active scope.
2. Open **09 Sitemap**.
3. Browse hosts and paths in the tree.
4. Select an endpoint to review query params, body keys, and auth signals.
5. Optionally pick an earlier session in the session diff panel to compare coverage.
6. Click through to HTTP(S) with a prepared query when you want to inspect raw evidence.

### Install And Review A Plugin

1. Open **08 Plugins**.
2. Enter a plugin folder path, for example `plugins/examples/parameter-miner`.
3. Click **Preview**.
4. Review the manifest id, entry path, requested permissions, panels, and warnings.
5. Click **Install** to create a pending workspace-local registry record.
6. Click **Approve** only if the requested permissions match the work you expect the plugin to do.
7. Confirm approved panels appear in the panel inventory.
8. Disable, block, or remove the plugin when it is no longer needed for the active workspace.

## Troubleshooting

### No HTTP/S Traffic Appears

Check:

- The target URL is in **10 Scope**.
- You clicked **Commit** after editing scope.
- You are using the launched Radar browser or an external browser configured to use Radar's proxy.
- The proxy is running for external browser capture.
- Your filters are not hiding captures.
- The request URL starts with `http://` or `https://`.

### No WebSocket Frames Appear

Check:

- The WebSocket URL is in **10 Scope** or matches an equivalent HTTP/S origin in scope.
- The app is using `ws://` or `wss://`, not long-polling HTTP.
- You are using the launched Radar browser or an external browser configured to use Radar's proxy.
- The proxy is running for external browser capture.
- Your WebSocket direction/search filters are not hiding frames.

### Evidence Is Captured But Not In Scope

Add the origin to Scope:

```text
https://target.example.com
```

Or in Repeater, click **Trust Origin** for the current URL.

### Browser Launch Fails

Radar needs a supported local browser. Install Chrome, Edge, Brave, or Chromium. On macOS, Radar checks common app locations under `/Applications`.

### HTTPS Pages Fail In An External Browser

For external browsers, you must manually trust Radar's generated CA certificate. Open **11 SSL**, click **Forge CA**, then trust the displayed `radar-ca.pem` in the browser or OS trust store you are using for that test.

Radar does not install this certificate automatically.

### macOS Keychain Prompts

Use **Open Browser** rather than your normal browser profile. Radar launches a dedicated browser profile and uses the mock-keychain flag where supported.

### Proxy Will Not Start

Port `8088` may already be in use. Stop the other process, then try **Engage Proxy** again.

### Repeater Says Headers Must Be A JSON Object

The Headers editor must contain valid JSON:

```json
{
  "Accept": "application/json"
}
```

This is invalid:

```text
Accept: application/json
```

### Repeater Request Has No Body

Radar removes bodies from `GET` and `HEAD` requests during normalization. Use a method that supports a body, such as `POST`, `PUT`, or `PATCH`.

### Burst Settings Change After Running

Radar clamps burst settings:

- Count cannot exceed 50.
- Parallel cannot exceed 5.
- Delay cannot exceed 10000 ms.

### Plugin Preview Fails

Check:

- The folder path points to a local plugin directory.
- The plugin has `.radar-plugin/plugin.json` or root `plugin.json`.
- The manifest has a valid `id`, `name`, and semantic `version`, such as `0.1.0`.
- Entry and panel paths are relative to the plugin folder and do not contain `..`.
- The plugin declares at least one executable `entry` or panel.

### Plugin Is Installed But Does Not Work

Check:

- The plugin status is **approved**, not **pending**, **disabled**, or **blocked**.
- The manifest requested the permission needed for the action, such as `captures:read` or `replay:send`.
- The target evidence is in **10 Scope**.
- Panels only appear when the manifest has a valid panel entry and `ui:panel` permission.
- Live plugin actions remain Manual-First; AI-First can only read plugin inventory.

### AI Is Not Connected

Open AI settings and check:

- Provider is correct.
- API key is present for OpenAI, Anthropic, or non-local compatible providers.
- Base URL is correct for OpenAI-compatible providers.
- Codex CLI is installed and authenticated for Codex Connect.
- Cursor agent is installed and authenticated for Cursor CLI Connect.

### AI-First Run Does Not Move

Check:

- AI settings are connected.
- The goal includes a URL, domain, or the address bar contains the target you want to inspect.
- If relying on the address bar instead of a goal target, the target origin is saved in **10 Scope**.
- The run timeline does not show invalid planner output, a policy block, or an AI provider error.
- The run has not been stopped by switching back to Manual-First.

### Codex Connect Cannot Find Codex

Install Codex or set `CODEX_CLI_PATH` to the executable path before launching Radar.

### Cursor CLI Connect Cannot Find Cursor

Install the Cursor agent and log in:

```bash
curl https://cursor.com/install | bash
agent login
```

You can also use `CURSOR_API_KEY` or `CURSOR_AUTH_TOKEN` for headless auth.

### AI Task Is Blocked

The command palette blocks tasks without enough context. Select an HTTP/S capture, select a WebSocket frame, load a repeater or Automate draft, add scope targets, or collect SSL events depending on the active view.

### AI Output Looks Too Generic

Use the optional operator note in the command palette to give more intent, for example:

```text
Focus on cache headers and auth boundary assumptions.
```

Keep raw context off unless you need exact headers or bodies.

## Glossary

| Term | Meaning |
| --- | --- |
| Capture | A recorded HTTP/HTTPS request and response. |
| WebSocket frame | A recorded WebSocket handshake, sent frame, received frame, error, or close event. |
| Traffic query | A scoped filter expression for HTTP(S) or WebSocket evidence using field predicates or plain-text fallback. |
| Saved filter | A workspace-persisted traffic or WebSocket query reapplied from filter chips. |
| Sitemap | A host/path/endpoint map built from scoped HTTP/S captures in the active session. |
| Session diff | A comparison of endpoint coverage between two sessions under the same profile. |
| Scope | The allowlist that controls visible HTTP/S and WebSocket evidence and AI context boundaries. |
| Profile | A local operator/client context with its own workspace and browser profile. |
| Session | An evidence ledger under a profile. |
| Repeater | The manual request editor and replay tool. |
| Burst | A capped group of repeated manual replays. |
| Automate | The payload-marker view for bounded request variant sessions, result clustering, and Repeater promotion. |
| Payload marker | An explicit `{{payload:name}}` placeholder in a URL, header value, or body. |
| Workflow | A saved or built-in repeatable check with typed inputs, scope policy, steps, run history, and evidence-backed results. |
| Plugin | A workspace-local extension installed from disk through a manifest, explicit permission approval, and the Radar SDK/API boundary. |
| Plugin manifest | The plugin's local `plugin.json` contract declaring id, version, entry path, panels, and requested permissions. |
| Plugin panel | A manifest-declared panel entry that appears in the Plugins view after approval. |
| Plugin SDK | The typed extension API for bounded capture reads, frame reads, replay preparation/sending, finding drafts, and workflow operations. |
| Finding | A local reviewed or draft security observation with severity, confidence, status, narrative fields, and evidence references. |
| Evidence reference | A stable local pointer such as `capture:id`, `websocket:id`, `replay:id`, `automate:sessionId:resultId`, `workflow:runId:resultId`, or `ai:runId`. |
| Evidence appendix | Report export section generated from finding evidence references. Appendix metadata is redacted by default. |
| Proxy CA | Radar's local certificate authority used for HTTPS interception through the proxy. |
| SPKI fingerprint | Certificate public-key fingerprint used for the launched browser's certificate exception. |
| Raw AI context | Unredacted request/response headers, bodies, and WebSocket payloads sent to the configured AI provider. |
| Custom skill | A saved view-specific AI instruction. |
