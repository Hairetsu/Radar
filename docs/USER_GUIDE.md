# Radar user guide

Radar is a local-first desktop workbench for authorized web security testing. This guide explains the operator workflow that ships today.

Radar has two modes. Manual-First gives you direct control over capture, replay, automation, findings, and export. AI-First lets one scoped browser operator use the same visible tools while you follow its work in a separate companion window.

## Read this before testing

Use Radar only on systems where you have permission to test.

The safety model has a few rules worth knowing before you send traffic:

- New projects start with local development origins in Scope.
- Scope filters HTTP/S and WebSocket evidence and bounds AI-First actions.
- Manual Repeater is an operator tool and can send outside saved Scope. Check the URL before every transmit or burst.
- Automate and active workflows enforce saved Scope and hard request limits.
- AI-First needs the selected profile, saved Scope, a matching capability grant, and remaining run budget before an action with side effects can run.
- Radar excludes raw headers, bodies, cookies, WebSocket payloads, and browser storage from AI context unless you opt in.
- Radar generates a local proxy CA but never installs a root certificate automatically.
- Exported evidence is redacted by default. Raw export requires an explicit choice.

## Install Radar

Download the current build from [GitHub Releases](https://github.com/Hairetsu/Radar/releases). Radar also needs a local Chrome, Edge, Brave, or Chromium installation.

### macOS

Radar is not notarized yet. If macOS blocks the app:

1. Move `Radar.app` to `/Applications`.
2. Run:

```bash
sudo xattr -dr com.apple.quarantine /Applications/Radar.app
```

3. Open Radar again.

Only remove quarantine from a build that you downloaded from the project release page and intended to run.

### Windows

Run the `.exe` installer. The installer is not signed yet. If SmartScreen appears, choose **More info**, verify the file you downloaded, and then choose **Run anyway**.

### Linux

Run the AppImage:

```bash
chmod +x Radar-*.AppImage
./Radar-*.AppImage
```

Install the Debian package:

```bash
sudo apt install ./radar_*_amd64.deb
```

Install the Arch package:

```bash
sudo pacman -U ./radar-*.pacman
```

The Debian and Arch packages install a `radar` launcher.

### Run from source

Install dependencies and start the development build:

```bash
pnpm install
pnpm dev
```

The main repository commands are:

| Command | Result |
| --- | --- |
| `pnpm dev` | Build Electron, start Vite, and open Radar. |
| `pnpm build` | Build the renderer and Electron processes. |
| `pnpm test` | Run ESLint, both unit coverage gates, and the production build. |
| `pnpm test:regression:build` | Build and run the Electron workflow suite. |
| `pnpm test:regression:ui:build` | Build and run the blocking UI, font, focus, and zoom gate. |
| `pnpm screenshots` | Rebuild and refresh the checked-in product screenshots. |
| `pnpm pack` | Build an unpacked desktop application. |
| `pnpm dist` | Build release installers and packages. |

See [Regression testing](REGRESSION_TESTING.md) for the complete test and container workflow.

## Capture your first session

The fastest safe walkthrough uses a local application:

1. Open Radar.
2. Open **Local Ledger** and create a project or use the default project.
3. Keep the default local Scope, or open **11 Scope**, add your authorized origin, and click **Commit**.
4. Enter the target URL in the header and click **Open Browser**.
5. Use the visible managed browser to exercise the target.
6. Open **01 HTTP(S)** and select a request.
7. Review the request and response detail tabs.
8. Click **Repeater** when you want to copy that request into **04 Repeater**.
9. Verify the Repeater URL and headers before clicking **Transmit**.
10. Create a finding only after you have evidence that supports it.

For a walkthrough without a live target, open **Local Ledger** and click **Load Demo**. Radar creates or refreshes **Radar Demo Project** and its **Seeded Walkthrough** session. The demo contains synthetic traffic, frames, findings, workflows, plugin records, Advanced signals, TLS events, and AI run history. It does not send traffic.

## Know the workspace

Radar opens with a persistent shell around one active view:

- The sidebar groups the twelve views under Observe, Test, Report, and Configure.
- The Console block shows Manual-First or AI-First state, AI connection, **Open AI Operator**, **Local Ledger**, and Appearance.
- The header contains the project name, browser address and history controls, search, notes, and view actions.
- The session selector switches evidence ledgers inside the active project.
- The footer reports the current view, capture counts, TLS events, and proxy state.

At narrow desktop widths the sidebar becomes a horizontal strip. Use its chevrons, mouse wheel, trackpad, or keyboard to reach hidden views. Radar scrolls an AI-selected view into sight.

### Workbench views

| View | Use |
| --- | --- |
| **01 HTTP(S)** | Search and inspect in-scope HTTP/S captures. |
| **02 WebSocket** | Inspect handshakes, frames, errors, closes, and payloads. |
| **03 Intercept** | Pause, edit, forward, or drop scoped proxy traffic. |
| **04 Repeater** | Edit and resend one request or a capped burst. |
| **05 Automate** | Run bounded payload-marker sessions and compare results. |
| **06 Findings** | Review evidence-backed findings, retests, and reports. |
| **07 Workflows** | Save and run repeatable passive or scoped active checks. |
| **08 Plugins** | Install and approve local extensions against Radar's SDK boundary. |
| **09 Advanced** | Review API, auth, identity, secret, parameter, and cache signals. |
| **10 Sitemap** | Browse discovered hosts, paths, endpoints, and session changes. |
| **11 Scope** | Save the authorized engagement boundary. |
| **12 SSL** | Control the proxy and inspect CA, browser, and TLS state. |

### Search the project

Open global search with **Search** or `Cmd+P` on macOS and `Ctrl+P` on Windows or Linux.

Search covers local captures, frames, replay history, findings, workflows, plugins, Advanced signals, saved filters, project notes, and saved views. Capture and frame results stay scope-filtered. Sensitive values are indexed through Radar's normal redaction.

Examples:

```text
session cookie
kind:capture host:api.example.test status:403
kind:websocket source:received "session:update"
kind:finding severity:high status:draft authorization
kind:note "auth handoff"
```

Supported global fields include `kind`, `host`, `path`, `status`, `severity`, and `source`.

## Organize an engagement

### Projects and sessions

A project separates one client, target group, environment, or testing context. It owns Scope, notes, saved views, plugin records, a managed-browser profile, and its sessions.

A session is one evidence ledger inside a project. It holds captures, frames, findings, workflow runs, SSL events, and timestamps. Use separate sessions for test passes, environments, or retests.

Open **Local Ledger** to create, rename, load, or switch projects and sessions. Switching projects may stop the managed browser so that browser state does not leak between projects.

Clearing HTTP/S captures or WebSocket frames affects only that evidence type in the active session. It does not delete the project, session, or Scope.

### Notes and saved views

Open **Notes** in the header to save engagement context, test-account notes, hypotheses, retest reminders, or handoff details. Notes stay in the active project and appear in global search.

A saved view stores the current workbench view and useful state, including traffic queries and selected evidence. Open the saved view from Notes or global search.

Do not store secrets in a note unless the local machine and any exported bundle are allowed to contain them.

### Project bundles

Use the **Project bundle** panel under Notes to move local project data between Radar installs.

| Profile | Included data |
| --- | --- |
| **Metadata Only** | Project artifacts and evidence metadata without raw headers, bodies, or payloads. |
| **Redacted Evidence** | In-scope evidence with sensitive values removed. This is the default. |
| **Reviewed Findings** | Reviewed findings and only their referenced redacted evidence. |
| **Raw Evidence** | Full headers, bodies, cookies, auth values, and WebSocket payloads. |

Always run **Preview Export** before saving a bundle. Import also has a preview. Imported records go into local imported sessions, matching IDs are skipped, and proposed targets remain inactive until you add them to Scope yourself. Import never runs a workflow, plugin, replay, or AI task.

### Handoff packages

A handoff package is smaller than a project bundle. It contains selected findings and their referenced evidence, with optional notes, workflows, and Repeater collections.

Reviewed findings are included by default. Draft findings require an explicit option. Preview the package and its redaction profile before export.

## Set Scope

Open **11 Scope** and enter one rule per line:

```text
https://staging.example.com
https://api.staging.example.com
https://*.internal.example.com
example.test
local
```

Click **Commit** to save the rules.

The default rules are:

```text
http://localhost:*
http://127.0.0.1:*
http://[::1]:*
```

Rule behavior:

| Rule | Match |
| --- | --- |
| `https://staging.example.com` | The exact origin. |
| `example.test` | The hostname under any scheme. |
| `https://*.example.com` | Matching subdomains under HTTPS. |
| `local` | Localhost, `127.x.x.x`, and `[::1]`. |

WebSocket URLs use the equivalent HTTP origin for matching. `wss://example.test/socket` matches an allowed `https://example.test` origin.

Blank and invalid lines are ignored. An empty saved list falls back to local development Scope. In Repeater, **Trust Origin** adds the current request origin to Scope.

Scope is authoritative for evidence visibility and AI-First. It does not replace your testing authorization, and it does not block a Manual-First Repeater send.

## Capture browser and proxy traffic

### Use the Radar Browser

Enter a URL in the header and click **Open Browser**. The header also provides Back, Forward, Reload, and Navigate after launch.

Radar finds a local Chrome, Chrome Canary on macOS, Chromium, Edge, or Brave installation. It launches a Radar-owned browser profile, starts the local proxy, attaches Playwright through a loopback debugging port, and supplies a launch-scoped exception for the generated proxy CA.

The header shows `pw ready` when page control is available. **12 SSL** shows the selected browser binary, profile path, proxy URL, debugging endpoint, Playwright state, and any launch error.

Radar can recover an orphaned managed-browser process after an interrupted restart. It proves ownership from the exact Radar profile before closing anything. It does not close normal personal browser profiles.

### Use an external client

To capture another browser, a CLI, a mobile device, or a desktop client:

1. Open **12 SSL**.
2. Click **Engage Proxy**.
3. Copy the displayed loopback proxy URL.
4. Configure the external client to use that proxy.
5. Add the target origin to **11 Scope**.
6. For HTTPS, manually trust the displayed `radar-ca.pem` in that client or its trust store.

Radar does not install the CA for you. Remove manual trust when the testing setup no longer needs it.

The default manual proxy port is `8088`. The managed browser can choose a nearby open port if that port is busy.

### Inspect TLS state

**12 SSL** shows proxy state, CA path, SPKI fingerprint, browser details, workspace-local setup notes, and TLS events. Click **Forge CA** to generate or load the local proxy CA. Save client-specific setup notes under the proxy profiles when a project needs repeatable external-client configuration.

## Review evidence

### HTTP/S traffic

**01 HTTP(S)** lists captures that match Scope and use `http://` or `https://`.

Filter by method, resource type, sort field, or query. The query language accepts field predicates and `AND`, `OR`, and `NOT`:

```text
method:POST path:/api status:401,403 mime:json
host:staging.example.com req.header:authorization
tag:auth comment:session
```

Fields include `method`, `host`, `path`, `url`, `status`, `mime`, `type`, `source`, `initiator`, `req.header`, `resp.header`, `req.body`, `resp.body`, `tag`, and `comment`. Text without a field becomes a substring search.

Use `Cmd+F` or `Ctrl+F` to focus the view search. Save a useful query as a workspace filter.

Select one capture to inspect request and response details. Cmd-click or Ctrl-click toggles rows. Shift-click selects a range. The bulk bar can tag, export, or delete the selected rows. Bulk export is redacted by default.

Right-click a capture or its detail pane to copy cURL, Bash, Python, Fetch, raw HTTP, or the URL. The menu can also send the request to Repeater, add its origin to Scope, or delete it.

### WebSocket traffic

**02 WebSocket** records handshakes, sent frames, received frames, errors, and closes. Filter by direction or use fields such as `direction`, `opcode`, `payload`, and `error`.

```text
direction:sent payload:ping
host:staging.example.com direction:received
```

Select a frame to inspect or copy its headers and payload. Selected frames can enter Manual-First AI context. A replayable frame can be loaded into the WebSocket section of Repeater for one edited send.

### Sitemap and session diff

**10 Sitemap** groups scoped captures by host, path, method, and status. Endpoint detail lists query parameters, body keys, content types, and observed auth signals. **Open in HTTP(S)** prepares a matching traffic query.

Choose an earlier session as the baseline to review added or removed endpoints and changes in status, headers, or response shape.

Treat the sitemap as recorded coverage. An endpoint that is missing from the map may never have been exercised.

## Intercept traffic

**03 Intercept** pauses scoped proxy requests before upstream send and scoped responses before client delivery.

Turn request interception, response interception, or both on from the view actions. Out-of-scope traffic continues without pausing.

The rules editor accepts JSON records that can match stage, method, host, path, content type, status, initiator, request header, response header, or body. If interception is on and no enabled rule exists, Radar pauses every in-scope item for that stage.

The match/replace editor accepts request or response rules for a named header or body. Radar records which rules changed a capture.

Select a queued item and edit its method, URL, status, headers, or body. Then choose:

- **Forward** to release the selected item, including your edits.
- **Drop** to close it and record the decision.
- **Reset** to restore the original values in the editor.
- **Resume All** to release the current queue without more edits.

AI-First can inspect the queue and prepare an edit in these visible controls. It cannot forward, drop, or resume queued traffic.

## Replay requests

### Repeater

**04 Repeater** stores multiple named tabs. Tabs keep their request draft, environment binding, replay history, and response comparisons.

The request editor contains method, URL, JSON headers, and body. Request transforms cover URL encoding, JSON formatting, JWT decoding, and cookie parsing. Environment variables use `{{variable}}`. Radar rejects a request with an unresolved variable.

Click **Transmit** for one send. Radar uppercases the method, removes bodies from `GET` and `HEAD`, caps the body at 500,000 characters, strips hop-by-hop headers, does not follow redirects automatically, and uses a 30-second timeout.

Replay history belongs to the active tab. Select two entries to compare status, latency, headers, body size, and text changes. Collections store reusable drafts.

Click **Saturate** for a manual burst:

| Setting | Limit |
| --- | --- |
| Count | 1 to 50 |
| Concurrency | 1 to 5 |
| Delay | 0 to 10,000 ms |

The burst reports the actual count, concurrency, average latency, failures, and last response.

### Automate

**05 Automate** replaces explicit `{{payload:name}}` markers in the active Repeater draft. Markers can appear in the URL, header values, or body.

Enter one payload per line or load a saved payload set. Radar can save a local wordlist reference without copying the file contents into renderer logs.

The hard limits are:

| Setting | Limit |
| --- | --- |
| Positions | 32 |
| Payloads per set | 500 |
| Attempts per run | 100 |
| Concurrency | 5 |
| Delay | 10,000 ms |
| Request timeout | 30,000 ms |
| Rules | 30 |

The result table records payload, status, length, word count, latency, redirect, error, cluster, match, and extracted values. Radar groups similar responses and marks one-off groups as outliers.

Use **Pause**, **Resume**, **Stop**, or **Retry** on the selected session. Promote an interesting request to Repeater before manual confirmation, or create a draft finding with the Automate result attached.

Automate execution is Manual-First. AI can prepare markers and rules or analyze saved results, but it cannot start a run.

## Create findings and reports

Open **06 Findings** after selecting a capture, frame, Automate result, or workflow result. Choose a template or create a draft and attach the evidence.

A useful finding records:

- Severity, confidence, and review status.
- Affected assets and component.
- Owner and assignee when used by the project.
- Reproduction steps.
- Impact and severity rationale.
- Remediation.
- Uncertainty and retest notes.
- Stable evidence references.

Statuses cover draft, needs evidence, reviewed, accepted risk, fixed pending retest, retest passed, and retest failed. Duplicate suggestions are advisory. Radar merges two findings only after you click **Merge**.

The report builder supports internal notes, client report, and raw technical appendix presets. It can render Markdown or HTML with executive summary, methodology, scope, limitations, findings, evidence appendix, retest matrix, and change log.

Client reports warn about missing evidence, reproduction, impact, or remediation. Reviewed findings are included by default. Draft findings and raw evidence both require explicit options. Preview the report before copying or downloading it.

## Run repeatable workflows

**07 Workflows** contains built-in and project-saved checks. Passive workflows inspect captured evidence. Active workflows use the same normalized, scope-checked replay path as Repeater and declare request, delay, timeout, and result limits.

Built-in checks cover security headers, cookie flags, CORS, cache control, metadata exposure, and a selected-capture unauthenticated access check.

The editor accepts JSON and a constrained YAML-like syntax. The visual graph shows steps and conditions, while the raw definition remains the source of truth. Use **Dry Run** to catch missing inputs, duplicate step IDs, skipped branches, active request estimates, and cap violations.

Custom workflows can contain up to 24 steps and 24 inputs. Active definitions can request no more than 12 sends, a 30-second request timeout, a 5-second delay, and 200 result rows. A saved edit creates a local revision with a compact diff.

Warning and failure results can become draft findings. AI-First can run an existing allowed workflow by ID when the run profile, Scope, capability, and budget allow it. AI-prepared definitions load into the visible editor and remain unsaved until you click **Save** or **Run**.

## Review Advanced and Identity Lab

**09 Advanced** derives local review signals from scoped evidence. The main panels cover:

- GraphQL operations, variables, batching, and introspection.
- OpenAPI and Postman JSON import previews.
- Observed auth-state comparisons.
- Parameters from URLs, JSON, forms, multipart data, cookies, headers, GraphQL variables, and WebSocket JSON.
- Masked secret-shaped response and frame data.
- Cache, CORS, host-header, and redirect behavior.
- Proxy setup notes for devices, desktop clients, and CLI tools.

Advanced does not send traffic by itself. Import previews can save reviewed request drafts to Repeater collections or prepare workflow drafts. You still decide whether to save or run them.

### Compare recorded identities

Open **Identity Lab** from Advanced to separate browser state by role, tenant, or account:

1. Create an identity with a label, role, tenant, and in-scope origin.
2. Click **Activate** to launch its dedicated managed-browser profile.
3. Establish the intended signed-in or anonymous state in the visible browser.
4. Exercise the target workflow.
5. Click **Verify** when you need a scoped reachability observation.
6. Repeat for the other identities.
7. Review the recorded role, tenant, and resource matrix.
8. Compare two existing captures only when identity is the sole request difference.

Identity health is a reachability observation. A `2xx` response does not prove that access was authorized. Proxy-only traffic remains unattributed unless it already carries valid identity and activation lineage. The comparison panels read recorded evidence and send no missing request for you.

Raw cookies and storage remain in the Electron main process and the identity's browser directory. Renderer and ordinary AI identity context contain metadata only.

## Manage local plugins

**08 Plugins** installs extensions from a local folder into the active project.

1. Enter the plugin folder path.
2. Click **Validate** or **Preview**.
3. Review its ID, version, entry file, panels, trust label, compatibility warnings, and requested permissions.
4. Click **Install** to create a pending record. Install does not execute the plugin.
5. Click **Approve** only when the requested permissions match the job.

Plugin states are pending, approved, disabled, and blocked. Remove deletes only the project's registry record.

Permissions cover scoped capture or frame reads, replay preparation or send, operator-selected file reads, AI context, workflow read, run, or write, finding drafts, and UI panels. Radar checks the permission at every SDK action and records the result in the local audit ledger.

Approved HTML panels render in a no-script sandbox. JavaScript panels are shown as source instead of running in the panel preview. Plugin execution still uses Radar's bounded main-process API. It is not a general operating-system sandbox, so inspect local plugin code before approval.

Validate an example from the terminal with:

```bash
pnpm plugin:validate -- plugins/examples/jwt-helper
```

The example packages under `plugins/examples/` contain complete manifests, entry files, and panels.

AI-First can read plugin inventory. Install, approval, permission changes, removal, and execution remain Manual-First.

## Use AI

Radar has two AI surfaces. The command palette assists a manual workflow. The AI Operator runs a bounded task against the visible workbench.

### Connect a provider

Open **AI Operator**, then open **Connection** in the Mission Inspector.

| Provider | Authentication |
| --- | --- |
| Codex app | Uses the installed Codex or ChatGPT desktop login. |
| Cursor agent | Uses the installed `agent` CLI login or optional Cursor key. |
| OpenAI | Uses `OPENAI_API_KEY` or a pasted key. |
| Anthropic | Uses `ANTHROPIC_API_KEY` or a pasted key. |
| xAI | Uses `XAI_API_KEY` or a pasted key. |
| OpenRouter | Uses `OPENROUTER_API_KEY` or a pasted key. |
| OpenAI-compatible | Uses a custom base URL and an optional bearer key. |

Radar tests the connection and refreshes the model list where the provider supports it. Fixed cloud providers use their official API base URL. Only the OpenAI-compatible provider accepts a custom URL.

Pasted keys are saved as plain text in `ai-settings.json`. Radar requests owner-only file permissions where the operating system supports them, but the file is not encrypted. Prefer a local CLI login or an environment variable when plain local storage does not meet your requirements.

### Use the Manual-First command palette

Open the palette with the **AI** action, `Cmd+K`, or `Ctrl+K`.

The built-in tasks summarize selected evidence, write report notes, suggest Repeater drafts, prepare Scope checklists, suggest browser steps, and review TLS evidence. A returned request remains a draft until you transmit it.

Preview context before every task. The preview shows selected evidence, size, redaction, and any blocking reason. Raw context includes request and response bodies, sensitive headers, WebSocket payloads, and token-shaped strings. Leave it off unless exact values are required and the configured provider is allowed to receive them.

Custom command-palette skills are local and scoped to the view where you create them. The palette audit is in-memory for the current app run.

### Run AI-First

Open the AI Operator with **Open AI Operator** or `Cmd/Ctrl+Shift+A`. Opening the window does not start a run or change mode.

To start:

1. Save every authorized origin in **11 Scope**.
2. Choose a run profile.
3. Review its visible step, replay, workflow, capture, timeout, and raw-context budgets.
4. Enter a goal with the target origin.
5. Click **Start Run** or **Start Tutorial**.

If the goal contains an origin outside saved Scope, Radar places it in the unsaved Scope editor and stops. Review the whole list, click **Commit**, and then start the run again. Radar never saves a goal origin by itself.

Run profiles:

| Profile | Intended work |
| --- | --- |
| **Browser Assessment** | Explore task-relevant in-scope pages and use tightly bounded verification. |
| **Passive Map** | Read captures, sitemap coverage, findings, and local context without sends. |
| **Auth Review** | Inspect permitted browser and identity context. Raw cookie or storage tools require raw-context opt-in. |
| **API Hardening** | Review API evidence and prepare Repeater, Automate, or workflow drafts. |
| **Header/Cookie Review** | Review headers, cookies, CORS, and affected evidence. |
| **Advanced API Review** | Review Advanced summaries and run allowed saved workflows. |
| **Report From Evidence** | Turn local evidence into quality-gated draft findings and run memory. |

During the run, the AI Operator shows:

- **Mission Pulse** for the current goal, selected action, target, and latest result.
- **Operation Stream** for durable Decide, Act, and Observe records.
- **Task History** for saved tasks in the active session.
- **Mission Inspector** for the graph, permissions, report, memory, status, and budgets.
- **Completion Report** for assessed scope, method, evidence-backed observations, findings, limits, and next actions.

The main Radar workspace stays operable and shows the selected view, evidence, prepared draft, or browser effect.

### Approve an AI action

Starting a run confirms only bounded in-scope `GET` browser opening and navigation. Form interaction, identity changes, replay, and active workflows may need a capability grant.

When Radar pauses for authority, review the exact tool, origin, method, path, identity, duration, use count, request cost, concurrency, and payload limit. Then choose:

- **Approve Once** for the displayed path and one use.
- **Approve All** for matching calls by the same tool, origin, method, and identity within the profile and run limits.
- **Deny** to keep the action from running.

**Resume after approval** is on by default. Clear it when you want to inspect the saved grant before resuming.

Radar never grants destructive actions or `DELETE` requests. Scope changes, auth changes, failures, expiry, budget exhaustion, completion, Stop, or a runtime change can revoke or invalidate authority.

### Pause, steer, recover, or stop

Click **Pause & Steer** to let the current tool settle and save a checkpoint. Add a direction or edit the Mission Graph, then resume with the same cumulative budget.

A failed or policy-blocked operation stays open with its error and the safe recovery choices for that tool. Automatic retry is limited to safe idempotent work. Radar does not retry browser mutation, auth mutation, replay, or workflow sends behind your back.

When a run exhausts its step or runtime budget, use **Continue as New Run** if you want another bounded task. The old run stays intact.

**Return to Manual** checkpoints a queued or running task before changing modes. **Stop** ends the task and revokes its authority. Closing the companion window hides it; it does not pause or stop the run.

### Use Tutorial Mode

Tutorial Mode pauses after meaningful inspections and explains the current clue, why it matters, stronger evidence, benign alternatives, and the next safe step. Click **Continue Lesson** when ready.

The lesson may label a clue as learning, local hardening, vendor report, or CVE review. These labels are triage guidance, not vulnerability confirmation. CVE-review guidance needs a named product, affected versions, reproducible impact, deployment relevance, and durable evidence. Missing support downgrades the label.

## Change appearance

Open Appearance from the Console block. Radar ships six themes: Bureau, Vellum, Specter, Aperture, Verdigris, and Aegis. Theme selection is local to the renderer.

All theme fonts ship with the app. No font CDN is used. The supported desktop contract covers a `1120 x 760` minimum workspace and a `760 x 640` minimum AI Operator window, plus the zoom and text-size checks in [Regression testing](REGRESSION_TESTING.md).

## Understand local data

Radar stores application data under Electron's `userData` directory:

| OS | Typical path |
| --- | --- |
| macOS | `~/Library/Application Support/Radar` |
| Windows | `%APPDATA%\Radar` |
| Linux | `~/.config/Radar` |

Important items:

| Item | Contents |
| --- | --- |
| `radar-local.sqlite` | Projects, sessions, Scope, evidence, findings, workflows, plugins, identities, AI runs, and migrations. |
| `proxy-ca/radar-ca.pem` | Local proxy CA certificate. |
| `proxy-ca/radar-ca-key.pem` | Local proxy CA private key. Treat it as sensitive. |
| `profiles/<project-id>/proxy-browser-profile` | Managed browser state for the project. |
| `profiles/<project-id>/identities/<identity-id>/browser-profile` | Dedicated Identity Lab browser state. |
| `ai-settings.json` | Provider, model, base URL, and any pasted API key. The key is not encrypted. |
| `ai-skills.json` | Manual-First custom AI skills. |

Radar applies ordered SQLite migrations when it opens. If the database was created by a newer unsupported build, Radar opens a fail-closed error window and does not modify the file. Back up `radar-local.sqlite` before opening active engagement data with an older build.

Captures, reports, and AI run history stay local until you export them or send selected context to a configured provider.

## Troubleshoot Radar

### No HTTP/S traffic appears

Check that the target is saved in **11 Scope**, the browser or client uses Radar's proxy, the proxy is running for external clients, and the current filters are not hiding the request.

### No WebSocket frames appear

Check Scope, the proxy path, and the direction filter. Confirm that the target uses `ws://` or `wss://` rather than HTTP long polling.

### The managed browser does not open

Install Chrome, Edge, Brave, or Chromium. Open **12 SSL** and read the browser path and connection error. Radar checks common application paths and then the executable path available to the app.

### Chrome shows `ERR_PROXY_CONNECTION_FAILED`

The managed Chrome process is pointing at a proxy port without a listener. Click **Open Browser** again. Radar attempts to verify and replace only the stale Radar-owned browser process. If the profile remains locked, close that managed browser window and retry.

### An external browser rejects HTTPS

Open **12 SSL**, click **Forge CA**, and manually trust the displayed `radar-ca.pem` in the external client. Radar Browser normally uses a launch-scoped certificate exception and does not need system-wide trust.

### macOS reports `SSLV3_ALERT_CERTIFICATE_UNKNOWN`

Quit Radar and its managed browser, reopen Radar, and click **Open Browser**. Confirm that **12 SSL** shows both the CA path and SPKI fingerprint. External clients still need manual trust.

### The proxy will not start

Port `8088` may be in use. Stop the other listener or use **Open Browser**, which can select a nearby port for the managed-browser session.

### Repeater rejects headers

The header editor requires a JSON object:

```json
{
  "Accept": "application/json"
}
```

`Accept: application/json` is not valid input for that editor.

### Repeater removed the body

Radar removes bodies from `GET` and `HEAD` during normalization. Use a method that carries a body when the target expects one.

### A burst or Automate value changed

Radar clamps values to the limits documented in [Replay requests](#replay-requests). The normalized values shown after start are the values the main process uses.

### Plugin preview fails

Check that the folder contains `.radar-plugin/plugin.json` or root `plugin.json`, the manifest has a valid ID and semantic version, file paths are relative and contain no `..`, and the plugin declares an entry file, a panel, or both.

### An installed plugin does nothing

Check that its state is approved, the required permission was requested and granted, the evidence is in Scope, and the action is supported by Radar's plugin API. Panels also need `ui:panel`.

### Advanced panels are empty

Collect in-scope evidence first. GraphQL extraction needs a GraphQL-shaped path, content type, or JSON `query`. Auth comparisons need more than one observed state. Secret and cache panels only show local rule matches.

### Identity Lab has no comparison

Activate the identity before browsing. Comparisons require two recorded captures from different identities with the same method, origin, path, query, source, selected semantic headers, and body. Proxy-only and unattributed captures are excluded.

### AI does not connect

Open **AI Operator**, then **Connection**. Check the provider, model, key or CLI login, and custom base URL. Start Radar from a shell that has the expected environment variable when you use environment-based keys.

### Codex or Cursor is not found

For Codex, install ChatGPT or Codex desktop, or set `CODEX_CLI_PATH` before launch. For Cursor, install and authenticate the `agent` CLI. Radar also accepts `CURSOR_API_KEY` or `CURSOR_AUTH_TOKEN`.

### An AI-First run does not move

Check the selected Task History item, saved Scope, provider connection, remaining budget, and newest Operation Stream card. A permission draft, operator question, policy block, provider error, or failed tool can pause the task. Fix the stated cause before resuming.

### An AI command is blocked

The command palette needs context for the selected task. Select a capture or frame, load a Repeater or Automate draft, save a Scope target, or collect TLS events before running the matching task.
