# Radar

Radar is a local-first defensive web security workbench. It embeds Chromium, captures browser traffic through Electron's DevTools protocol and an optional MITM proxy, and lets you replay scoped requests through a controlled repeater — all in a desktop bureau-style operator console.

## MVP Surface

- Burp-style Radar Browser using a Radar-managed Chromium binary and a Radar-owned profile.
- Network capture history with request/response headers and body previews, TLS metadata, and source attribution (browser / proxy / repeater).
- Clone captured requests into a repeater with full header and body editing.
- Single replay plus capped burst replay (count, parallelism, delay) for hardening checks.
- Target allowlist enforced before replaying requests.
- Local HTTPS proxy mode for external browsers, with a Radar-generated CA and SPKI fingerprint.
- SSL/cert event log for visibility into trusted vs. blocked endpoints.
- Reserved agent dock and architecture notes for later AI provider integration.

## Stack

- Electron 42 main process (`electron/main.cjs`) wiring CDP capture, mockttp proxy, and the puppeteer-managed Chromium.
- React 18 + Vite + TypeScript renderer (`src/`).
- Tailwind CSS v4 with a custom bureau theme (Antonio / Manrope / JetBrains Mono).
- mockttp for the optional MITM proxy and CA generation.
- `@puppeteer/browsers` to fetch and pin Radar's own Chromium build.

## Run

```bash
pnpm install
pnpm dev
```

This starts Vite on `127.0.0.1:5173`, then launches Electron pointing at it. `pnpm build` runs `tsc` and a production Vite build into `dist/`. `pnpm lint` runs ESLint.

## Workspace Tour

The renderer is a four-view operator console. Persistent across all views: a left rail with vertical bureau lockup and live section numerals, a top classification banner with UTC dossier clock, the Radar Browser address bar (Deploy + Mark), live status pills (engine / req / tls / proxy), and a bottom telemetry ticker mirroring live counts.

### 01 — Traffic

![Radar Traffic view](docs/screens/radar-01-traffic.png)

Live capture log. Each row shows method, status, host, path, transport (TLS protocol or resource type), and round-trip duration. Selecting a row reveals request/response detail with TLS info on the right; a one-click **To Repeater** action clones the selected request into view 02. Empty state reads *"No transmissions intercepted"* until traffic flows in.

### 02 — Repeater

![Radar Repeater view](docs/screens/radar-02-repeater.png)

Manual replay surface. Left: method selector, URL line, JSON-edited headers, free-form body, and **Transmit** for a single round trip. Right: the Saturate burst panel (count / parallel / delay) and a response well showing the most recent status, latency, body, and any flagged failures from a burst. **Trust Origin** in the panel header pushes the current URL's origin into the scope allowlist in one click.

### 03 — Scope

![Radar Scope view](docs/screens/radar-03-scope.png)

The engagement boundary. Newline-delimited origins form the allowlist that gates every replay; defaults are local development origins. Edit and **Commit** to persist. The dashed *Agent Dock — reserved channel* strip below the editor is the future home for provider-agnostic AI agents that will inherit this same scope.

### 04 — SSL

![Radar SSL / Proxy view](docs/screens/radar-04-ssl.png)

Crypto and proxy interception. The summary strip shows current proxy URL, generated CA path, and active Chrome profile. Below: **Engage Proxy** / **Disengage** / **Forge CA** controls plus a printout of HTTP proxy address, CA cert path, SPKI fingerprint, Chrome CDP endpoint, and the managed Chromium build. The lower panes hold the certificate event log (trusted vs. blocked endpoints) and a TLS detail pane for the currently selected capture.

## Scope Model

Replay is intentionally blocked unless the target matches the allowlist. Defaults are local development origins:

```text
http://localhost:*
http://127.0.0.1:*
http://[::1]:*
```

Add project origins in the Scope view (or use the "Mark" button on the address bar / "Trust Origin" in Repeater) before replaying captured production or staging traffic you are authorized to test.

## SSL And Proxying

Radar has two HTTPS paths:

- **Radar Browser mode** — Radar installs and launches its own Chromium build with a dedicated profile, remote debugging on `127.0.0.1:9223`, and the Radar proxy attached. Radar's CA fingerprint is supplied as a launch-scoped certificate exception so HTTPS works without touching the system trust store.
- **External browser proxy** — engage the proxy from the SSL view, point your browser at `http://127.0.0.1:8088`, then manually trust the generated `radar-ca.pem` shown in the UI.

Radar never installs a root certificate automatically. On macOS, Radar launches the isolated Chrome with Chrome's mock-keychain flag so it does not request your login keychain password or share system Chrome's saved secrets.

## Design

The interface is a "bureau / operator console" aesthetic:

- Display: **Antonio** (variable condensed) — tactical authority for headers and section numerals.
- Body: **Manrope** (geometric humanist).
- Mono: **JetBrains Mono** for all operational text.
- Single signal-orange accent (`#ff5733`) on warm-dark slate, with steel-blue / jade / sand / rust status tokens. Driven entirely by CSS variables in `src/styles.css`.
- Asymmetric layout: vertical left rail with live section numerals, a classification banner up top, oversized outlined display numerals anchoring each panel, registration corner marks on the workspace, and a bottom telemetry ticker.
- CSS-only motion: staggered page-load reveal with blur-in, dual-ring radar pulse on the brand mark, pulsing live dots, and a bottom-up signal fill on the burst button.

## AI Integration Later

The MVP keeps AI out of the request path for now. When it is time to add agents, the clean boundary is:

- **Provider adapters** — OpenAI, Anthropic, local OpenAI-compatible servers, and other hosted APIs.
- **Tool permissions** — browser navigation, capture search, request drafting, replay execution, report writing.
- **Scope gates** — agents inherit the same target allowlist and replay caps as manual actions.
- **Audit trail** — every agent action produces an inspectable event with prompt, tool call, target, and result metadata.

This keeps the first version useful while leaving room for provider-agnostic agent work without coupling it to the UI too early.

## Project Layout

```
electron/
  main.cjs        Main-process: CDP capture, proxy, Chromium launcher, IPC handlers
  preload.cjs     Exposes the typed `window.radar` API to the renderer
src/
  App.tsx         Bureau-style operator console (4 views)
  styles.css      Theme tokens, layout, and motion
  types.ts        Shared types between main and renderer
  main.tsx        React entry
docs/
  screens/        Screenshots used in this README
index.html        Vite entry
vite.config.ts    Vite + Tailwind v4 + React
```
