# Radar

Radar is a local-first defensive web security workbench. It launches a dedicated browser profile, captures browser traffic through Electron's DevTools protocol and an optional MITM proxy, and lets you replay requests through a controlled repeater. Work in Manual-First mode when you want direct operator control, or switch to AI-First mode to let a scoped agent drive the app while you watch.

## MVP Surface

- Burp-style Radar Browser launcher using a supported local Chrome, Edge, Brave, or Chromium binary with a Radar-owned profile.
- Network capture history with method/type filters, request/response string search, selectable copyable details, right-click request actions, TLS metadata, and source attribution (browser / proxy / repeater).
- Clone captured requests into a repeater with full header and body editing.
- Single replay plus capped burst replay (count, parallelism, delay) for hardening checks.
- Scope-filtered traffic list for focusing on selected targets.
- Local HTTPS proxy mode for external browsers, with a Radar-generated CA and SPKI fingerprint.
- SSL/cert event log for visibility into trusted vs. blocked endpoints.
- Manual-First / AI-First mode toggle: keep direct operator control, or hand a scoped goal to an autonomous run console with a live stop button.
- Command-palette AI with per-view skills, provider adapters, context preview, prepare-only outputs, and session audit trail.
- AI-First autonomous runs that switch Radar tabs, open/navigate the browser, inspect captures, send strictly capped replay probes, record timeline entries, and produce draft findings inside local session history.
- Switchable Bureau, Vellum, and Specter themes with high-contrast text selection for request/response inspection.

## Stack

- Electron 42 main process (`electron/main.ts`) wiring CDP capture, mockttp proxy, system browser launcher, autonomous agent runs, and AI IPC.
- React 18 + Vite + TypeScript renderer (`src/`).
- Tailwind CSS v4 with CSS-variable themes and shadcn-style UI primitives (`cn`, `cva`, `src/components/ui/`).
- mockttp for the optional MITM proxy and CA generation.
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

The renderer is a four-view operator console with a Manual-First / AI-First toggle. Persistent across all views: a left rail with vertical bureau lockup and live section numerals, a top classification banner with UTC dossier clock, a one-click **Open Browser** launcher, live status pills (engine / req / tls / proxy), appearance and AI settings, and a bottom telemetry ticker mirroring live counts.

For a full user-facing guide to the app, see [docs/USER_GUIDE.md](docs/USER_GUIDE.md).

### 01 — Traffic

![Radar Traffic view](docs/screens/radar-01-traffic.png)

Live capture log filtered to the current scope. The toolbar narrows captures by HTTP method, resource type, or a broad string match across URL, request headers/body, and response headers/body. Each row shows method, status, host, path, resource type, and round-trip duration. Selecting a row reveals selectable request/response detail with TLS info on the right; **Copy** puts the active detail pane on the clipboard, and **To Repeater** clones the selected request into view 02. Right-click a row or the detail pane to copy the request as cURL, Bash, Python, Fetch, or raw HTTP, copy its URL, add the origin to scope, send it to Repeater, or delete the capture. Empty state reads _"No in-scope transmissions intercepted"_ until matching traffic flows in.

![Radar request context menu](docs/screens/radar-06-request-menu.png)

### 02 — Repeater

![Radar Repeater view](docs/screens/radar-02-repeater.png)

Manual replay surface. Left: method selector, URL line, JSON-edited headers, free-form body, and **Transmit** for a single round trip. Right: the Saturate burst panel (count / parallel / delay) and a response well showing the most recent status, latency, body, and any flagged failures from a burst. **Trust Origin** in the panel header pushes the current URL's origin into the scope allowlist in one click.

### 03 — Scope

![Radar Scope view](docs/screens/radar-03-scope.png)

The engagement boundary. Newline-delimited origins filter the Traffic view; defaults are local development origins. Edit and **Commit** to persist. The **AI command palette** strip below the editor opens the same palette as **⌘K** / **Ctrl+K** or the **AI** button in the panel header.

### 04 — SSL

![Radar SSL / Proxy view](docs/screens/radar-04-ssl.png)

Crypto and proxy interception. The summary strip shows current proxy URL, generated CA path, and active browser profile. Below: **Engage Proxy** / **Disengage** / **Forge CA** controls plus a printout of HTTP proxy address, CA cert path, SPKI fingerprint, Chrome CDP endpoint, and selected browser binary. The lower panes hold the certificate event log (trusted vs. blocked endpoints) and a TLS detail pane for the currently selected capture.

### Modes — Manual-First And AI-First

Manual-First is the default. The Traffic, Repeater, Scope, and SSL views remain the primary controls, and the AI command palette stays prepare-only: it can summarize, draft, and suggest, but the operator clicks navigation and replay controls.

AI-First adds a goal prompt and autonomous run console above the existing views. A run can move the visible workbench through Scope, Traffic, Repeater, and SSL, launch or inspect the browser, sample captures, load replay drafts, send a single capped replay probe, and write draft findings. The operator watches the timeline and can hit **Stop** at any time.

### AI — Command Palette

![Radar AI command palette](docs/screens/radar-05-ai-palette.png)

Open with **⌘K** / **Ctrl+K**, the panel **AI** button, or the Scope strip. The palette is view-aware: built-in tasks change per view, custom skills can be added for the current view, and AI only sends selected captures or the active view context.

**Tasks (prepare-only):**

- Capture Summary — explain request/response, headers, TLS, timing
- Repeater Drafts — suggest request variants; loads draft, never transmits
- Scope Checklist — manual test checklist within allowlist
- Report Notes — concise evidence notes with uncertainty markers
- Browser Helper — suggested exploration steps; you confirm navigation
- Custom skills — saved operator instructions scoped to the active view

**Connect presets:**

- **Codex Connect** — local Codex app/CLI auth via the installed `codex` executable; override discovery with `CODEX_CLI_PATH`.
- **Cursor CLI Connect** — invokes the installed Cursor `agent` CLI directly (like Codex Connect). Run `curl https://cursor.com/install | bash` and `agent login` first, or set `CURSOR_API_KEY` for headless auth.

**Providers:** Codex app, OpenAI, Anthropic, OpenAI-compatible endpoints.

**Guardrails:** raw headers/bodies require explicit checkbox confirmation; scope stays authoritative for traffic visibility, AI context, and autonomous tool calls; command-palette audit is session-only; AI-First run history is stored locally with the active session.

## Scope Model

Scope controls which captures appear in Traffic. Defaults are local development origins:

```text
http://localhost:*
http://127.0.0.1:*
http://[::1]:*
```

Add project origins in the Scope view (or use "Trust Origin" in Repeater) to bring matching captured production or staging traffic into the Traffic list.

## SSL And Proxying

Radar has two HTTPS paths:

- **Radar Browser mode** — **Open Browser** launches a supported local Chrome, Edge, Brave, or Chromium binary with a dedicated Radar profile, remote debugging on `127.0.0.1:9223`, and the Radar proxy attached. Radar's CA fingerprint is supplied as a launch-scoped certificate exception so HTTPS works without touching the system trust store.
- **External browser proxy** — engage the proxy from the SSL view, point your browser at `http://127.0.0.1:8088`, then manually trust the generated `radar-ca.pem` shown in the UI.

Radar never installs a root certificate automatically. On macOS, Radar launches the isolated browser with Chrome's mock-keychain flag where supported so it does not request your login keychain password or share system Chrome's saved secrets.

## Design

The interface is a themed "operator console" aesthetic:

- **Bureau**: Antonio / Saira / JetBrains Mono with signal orange on warm-dark slate.
- **Vellum**: Instrument Serif / Hanken Grotesk / DM Mono with vermillion ink on sunlit paper.
- **Specter**: Unbounded / Sora / Space Mono with chartreuse acid over midnight plum.
- Theme tokens live in `src/styles.css` as CSS variables that feed Tailwind's `@theme`; layout and surfaces are Tailwind utilities in components.
- Asymmetric layout: vertical left rail with live section numerals, a classification banner up top, oversized outlined display numerals anchoring each panel, registration corner marks on the workspace, and a bottom telemetry ticker.
- Motion via Tailwind utilities and keyframes in `src/styles.css`: staggered page-load reveal with blur-in, dual-ring radar pulse on the brand mark, pulsing live dots, and a bottom-up signal fill on the burst button.
- Text selection is explicitly high-contrast in every theme so request and response evidence can be copied without losing readability.

## Development Conventions

See [docs/CODE_CONVENTIONS.md](docs/CODE_CONVENTIONS.md) for the repo-specific code style guide used for future development.
See [docs/BRANCHING.md](docs/BRANCHING.md) for the protected branch and promotion workflow.

## Project Layout

```
electron/
  main.ts         Main-process: CDP capture, proxy, browser launcher, IPC handlers
  preload.ts      Exposes the typed `window.radar` API to the renderer
  screenshot.ts   Headless screenshot runner for README assets
  ai/             Provider adapters, context builder, connect presets, audit trail
src/
  App.tsx         Bureau-style operator console (4 views + AI palette)
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
