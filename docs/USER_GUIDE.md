# Radar User Guide

Radar is a local-first defensive web security workbench for capturing browser traffic, inspecting request and response evidence, replaying requests manually, managing engagement scope, reviewing TLS/proxy behavior, and preparing AI-assisted analysis without giving the AI permission to act on your behalf.

This guide covers the app as it exists now: the main console, profiles and sessions, traffic capture, repeater, scope management, SSL/proxy setup, AI features, appearance settings, local data, and troubleshooting.

## Table Of Contents

- [What Radar Is For](#what-radar-is-for)
- [Safety Model](#safety-model)
- [Install And Launch](#install-and-launch)
- [Main Console Tour](#main-console-tour)
- [Profiles And Sessions](#profiles-and-sessions)
- [Scope](#scope)
- [Opening The Radar Browser](#opening-the-radar-browser)
- [Traffic](#traffic)
- [Repeater](#repeater)
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
- Capture HTTP and HTTPS traffic from the Radar browser or an external browser configured to use Radar's proxy.
- Filter captured traffic to an explicit scope allowlist.
- Inspect selectable request and response evidence.
- Copy evidence for notes or reports.
- Clone captured requests into a manual repeater.
- Send a single replay or a capped burst replay for hardening checks.
- Review proxy, certificate, and TLS signals.
- Ask AI for summaries, report notes, checklist ideas, safe repeater drafts, browser exploration suggestions, or TLS review.

Radar is not an exploitation automation tool. It is built around manual confirmation: you choose the scope, you choose what to replay, and AI output only prepares analysis or drafts.

## Safety Model

Radar is designed for defensive, authorized work.

- Scope controls what appears in Traffic and what the AI can use as app context.
- The default scope is local development only.
- AI context is redacted by default. Raw headers and bodies require explicit opt-in in the command palette.
- AI tasks are prepare-only. They can suggest drafts or navigation, but they do not send requests or navigate without you.
- Radar never installs a root certificate automatically.
- Radar stores captures, targets, sessions, proxy CA files, AI settings, and custom skills locally on your machine.
- Replay is manual. It is not blocked by scope, so confirm the URL before transmitting.
- Burst replay is capped to reduce accidental load.

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

Radar opens into a four-view operator console.

Persistent areas:

- **Left rail**: view numerals for Traffic, Repeater, Scope, and SSL.
- **Top banner**: active workspace/session and UTC clock.
- **Header**: Radar identity, active profile, Open Browser button, live status pills, Profiles, Appearance, and AI settings.
- **View switcher**: Traffic, Repeater, Scope, SSL, plus a session selector.
- **Workspace panel**: the active tool surface.
- **Footer ticker**: current view, capture count, TLS event count, and proxy status.

Views:

| View | Purpose |
| --- | --- |
| **01 Traffic** | In-scope capture log and request/response inspector. |
| **02 Repeater** | Manual request editor, single replay, and burst replay. |
| **03 Scope** | Engagement boundary and target allowlist. |
| **04 SSL** | Proxy controls, generated CA details, TLS event log, and TLS metadata. |

## Profiles And Sessions

Radar separates local work into profiles and sessions.

### Profiles

A profile represents an operator or client context. It owns:

- A local workspace.
- Scope targets.
- A dedicated launched-browser profile directory.
- Sessions created under that workspace.

Use profiles when you need to separate clients, projects, accounts, or testing contexts. Switching profiles can stop the launched Radar browser so browser state stays isolated.

### Sessions

A session is a capture ledger for a specific testing run. It tracks:

- Captures.
- SSL events.
- Session name and timestamps.

Use sessions for separate test passes, retests, environments, or report evidence windows.

### Open The Profiles Panel

Click **Profiles** in the header.

In the panel you can:

- Rename and save the active profile.
- Create a new profile.
- Load an existing profile.
- Rename and save the active session.
- Create a new session.
- Load an earlier session.
- See capture and TLS event counts for saved sessions.

### Quick Session Selector

The view switcher includes a **Session** dropdown. Use it to jump between existing sessions under the active profile.

### Clear A Session's Captures

In the Traffic view, click the eraser icon in the panel header. This clears captures for the active session. It does not delete the profile or scope targets.

## Scope

Scope is the engagement boundary. Traffic only shows captures whose URL matches the active allowlist.

![Radar Scope view](screens/radar-03-scope.png)

Default scope:

```text
http://localhost:*
http://127.0.0.1:*
http://[::1]:*
```

### Add Targets

Open **03 Scope**, then enter one target per line:

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

## Traffic

Traffic is the in-scope capture log.

![Radar Traffic view](screens/radar-01-traffic.png)

Each row shows:

- HTTP method.
- Status code.
- Host.
- Path.
- Resource type or source.
- Duration.

Traffic only lists captures that match the active scope rules. If requests are happening but the list is empty, check the Scope view first.

### Filter Traffic

Use the toolbar to filter by:

- Method.
- Resource type.
- Search text.

Search looks across:

- Method.
- URL.
- Host and path.
- Status and status text.
- MIME type.
- Source.
- Request headers.
- Request body.
- Response headers.
- Response body.

Click the eraser icon in the toolbar to clear active filters.

### Inspect A Capture

Select a row to open the detail pane.

Tabs:

- **Request**: method, URL, TLS line, request headers, request body.
- **Response**: status, TLS line, response headers, response body.

The detail pane is selectable so you can copy evidence.

### Copy Evidence

Click **Copy** in the detail pane. Radar copies whichever detail tab is active.

### Request Context Menu

Right-click a Traffic row or the request/response detail pane to open request actions.

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

### Clone To Repeater

Click **To Repeater**. Radar copies the selected request into Repeater with:

- Method.
- URL.
- Request headers.
- Request body.

## Repeater

Repeater is for manual request editing and replay.

![Radar Repeater view](screens/radar-02-repeater.png)

The left side is the request editor:

- Method selector.
- URL input.
- JSON headers editor.
- Body editor.
- **Transmit** button.

The right side is the burst and response area:

- Count.
- Parallel.
- Delay.
- **Saturate** button.
- Last response status, latency, body preview, and burst failure count.

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

### Radar Browser HTTPS

The recommended HTTPS path is **Open Browser**. Radar launches the browser with the Radar proxy attached and supplies a launch-scoped certificate exception for the generated CA fingerprint.

This avoids changing system trust settings.

### External Browser Proxy

Use this when you want another browser or tool to route traffic through Radar.

1. Open **04 SSL**.
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
| Traffic | Capture Summary, Report Notes |
| Repeater | Repeater Drafts |
| Scope | Scope Checklist, Browser Helper |
| SSL | TLS Review |

Task behavior:

- **Capture Summary** explains selected request/response, headers, TLS, timing, and notable signals.
- **Report Notes** writes concise evidence notes with capture references and uncertainty markers.
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

- Number of captures included.
- Character count.
- Whether context is redacted.
- Any blocking reason.

Radar blocks tasks that lack enough context. Examples:

- Traffic tasks need a selected capture.
- Repeater tasks need a selected capture or loaded draft.
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

Use the raw-context checkbox only when you are comfortable sending raw headers and bodies to the configured provider.

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
| `radar-local.sqlite` | Profiles, workspaces, sessions, targets, captures, SSL events, cached model lists. |
| `proxy-ca/radar-ca.pem` | Local proxy CA certificate. |
| `proxy-ca/radar-ca-key.pem` | Local proxy CA private key. |
| `profiles/<profile-id>/proxy-browser-profile` | Dedicated launched-browser profile. |
| `ai-settings.json` | AI provider, model, base URL, and saved API key when applicable. |
| `ai-skills.json` | Custom AI skills. |

Privacy notes:

- Captures stay local unless you explicitly include them in AI context.
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
5. Open **01 Traffic**.
6. Select a row to inspect request and response details.
7. Click **To Repeater** when you want to replay a request manually.

### Capture A Staging Target

1. Open **03 Scope**.
2. Add the staging origin, for example:

```text
https://staging.example.com
```

3. Click **Commit**.
4. Click **Open Browser**.
5. Visit the staging target in the launched browser.
6. Inspect matching captures in **01 Traffic**.

### Use An External Browser

1. Open **04 SSL**.
2. Click **Engage Proxy**.
3. Configure the external browser to use the displayed proxy URL.
4. For HTTPS, manually trust the displayed CA certificate in that browser.
5. Add the target origin in **03 Scope**.
6. Browse the target.
7. Inspect matching captures in **01 Traffic**.

### Prepare A Safe Repeater Draft With AI

1. Capture a request or manually load a request in Repeater.
2. Open **02 Repeater**.
3. Open the **AI** palette.
4. Choose **Repeater Drafts**.
5. Preview context.
6. Run the task.
7. Review the returned draft.
8. Apply the draft if useful.
9. Manually confirm the URL and headers.
10. Click **Transmit** yourself.

### Create Report Notes

1. Select a capture in **01 Traffic**.
2. Open the **AI** palette.
3. Choose **Report Notes**.
4. Preview the context.
5. Leave raw context off unless needed.
6. Run the task.
7. Copy the resulting notes into your report workflow.

### Start A Retest Session

1. Open **01 Traffic**.
2. Click **New Session**.
3. Name the session, for example `Checkout retest`.
4. Continue capturing.
5. Use the session selector to compare or return to earlier sessions.

## Troubleshooting

### No Traffic Appears

Check:

- The target URL is in **03 Scope**.
- You clicked **Commit** after editing scope.
- You are using the launched Radar browser or an external browser configured to use Radar's proxy.
- The proxy is running for external browser capture.
- Your filters are not hiding captures.
- The request URL starts with `http://` or `https://`.

### Traffic Is Captured But Not In Scope

Add the origin to Scope:

```text
https://target.example.com
```

Or in Repeater, click **Trust Origin** for the current URL.

### Browser Launch Fails

Radar needs a supported local browser. Install Chrome, Edge, Brave, or Chromium. On macOS, Radar checks common app locations under `/Applications`.

### HTTPS Pages Fail In An External Browser

For external browsers, you must manually trust Radar's generated CA certificate. Open **04 SSL**, click **Forge CA**, then trust the displayed `radar-ca.pem` in the browser or OS trust store you are using for that test.

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

### AI Is Not Connected

Open AI settings and check:

- Provider is correct.
- API key is present for OpenAI, Anthropic, or non-local compatible providers.
- Base URL is correct for OpenAI-compatible providers.
- Codex CLI is installed and authenticated for Codex Connect.
- Cursor agent is installed and authenticated for Cursor CLI Connect.

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

The command palette blocks tasks without enough context. Select a capture, load a repeater draft, add scope targets, or collect SSL events depending on the active view.

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
| Scope | The allowlist that controls visible Traffic and AI context boundaries. |
| Profile | A local operator/client context with its own workspace and browser profile. |
| Session | A capture ledger under a profile. |
| Repeater | The manual request editor and replay tool. |
| Burst | A capped group of repeated manual replays. |
| Proxy CA | Radar's local certificate authority used for HTTPS interception through the proxy. |
| SPKI fingerprint | Certificate public-key fingerprint used for the launched browser's certificate exception. |
| Raw AI context | Unredacted request and response headers/bodies sent to the configured AI provider. |
| Custom skill | A saved view-specific AI instruction. |
