# Radar Manual QA Checklist

Use this checklist before release builds, demos, screenshot refreshes, and roadmap phase signoff. Start from a clean launch unless the scenario explicitly uses existing local data.

## Preflight

- [ ] Run `pnpm install` if dependencies changed.
- [ ] Run `pnpm lint`.
- [ ] Run `pnpm test:unit`.
- [ ] Run `pnpm build`.
- [ ] Run `pnpm screenshots` when UI screenshots may be affected.
- [ ] Launch Radar with `pnpm dev` or a packaged build.
- [ ] Open the project/session panel and click **Load Demo**.
- [ ] Confirm the active project is **Radar Demo Project** and the active session is **Seeded Walkthrough**.
- [ ] Confirm scope includes `https://api.demo.radar.test` and `http://localhost:3000`.

## Persistent Shell

- [ ] Sidebar view numbers run from **01 HTTP(S)** through **12 SSL**.
- [ ] Project/session controls open the Local Ledger modal.
- [ ] Session dropdown changes sessions without deleting previous evidence.
- [ ] Theme selector switches Bureau, Vellum, and Specter without unreadable text selection.
- [ ] **Open Browser** opens or reports a clear browser-launch error.
- [ ] Manual-First / AI-First toggle changes mode without starting an agent run.
- [ ] Bottom telemetry counts match visible request, WebSocket, TLS, and proxy state.

## 01 HTTP(S)

- [ ] Demo captures are visible and in scope.
- [ ] Method, type, sort, and query filters narrow rows correctly.
- [ ] Saved filter chips can be applied and cleared.
- [ ] Selecting a row shows request, response, TLS, tags, and comments.
- [ ] Multi-select supports bulk tag, export, and delete without affecting unselected rows.
- [ ] Context menu can copy cURL/raw/URL and send a request to Repeater.
- [ ] Clear captures requires the explicit eraser action and does not clear WebSocket frames.

## 02 WebSocket

- [ ] Demo handshake, sent, and received frames are visible.
- [ ] Direction filters and query search narrow frames correctly.
- [ ] Frame details are selectable and copyable.
- [ ] Tags/comments persist on selected frames.
- [ ] Loading a frame into WebSocket replay preserves URL, payload, headers, source frame id, and direction.
- [ ] Clear frames does not clear HTTP/S captures.

## 03 Intercept

- [ ] Request and response intercept toggles update visible queue state.
- [ ] Intercept rules save, reload, and render valid JSON.
- [ ] Match/replace rules save, reload, and render valid JSON.
- [ ] Queued proxy requests can be edited and forwarded.
- [ ] Queued proxy requests can be dropped.
- [ ] Resume all clears queued items.
- [ ] AI-First may prepare visible intercept edits but cannot forward/drop invisibly.

## 04 Repeater

- [ ] Captured request cloning populates method, URL, headers, and body.
- [ ] Tabs can be created, renamed, pinned, selected, and closed.
- [ ] Environment variables materialize in request drafts.
- [ ] Single replay shows status, headers, body, duration, and bytes.
- [ ] Replay history records are selectable.
- [ ] Response diff compares two history entries.
- [ ] Collections save and reload request drafts.
- [ ] Burst replay obeys count, concurrency, and delay controls.

## 05 Automate

- [ ] Payload marker insertion updates the active Repeater draft.
- [ ] Inline payload sets save and reload.
- [ ] Wordlist references save without reading file contents in the renderer.
- [ ] Limits clamp count, concurrency, delay, and timeout.
- [ ] Automate sessions show status, payloads, results, clusters, and matched rules.
- [ ] Results promote to Repeater and Findings through visible controls.
- [ ] Pause, resume, stop, and retry controls only affect the selected Automate session.

## 06 Findings

- [ ] Demo findings appear with severity, confidence, status, owner, and retest fields.
- [ ] Template selection creates a draft with expected impact/remediation copy.
- [ ] Evidence can be attached from selected captures, WebSocket frames, Automate results, and Workflow results.
- [ ] Save persists edits across session reload.
- [ ] Delete removes only the selected finding.
- [ ] Markdown and HTML report previews generate with redacted appendices by default.
- [ ] Raw evidence export requires explicit opt-in.

## 07 Workflows

- [ ] Built-in workflows are visible and cannot be deleted.
- [ ] Demo saved workflow appears in the saved workflow list.
- [ ] JSON/YAML-like workflow definitions validate before save.
- [ ] Passive workflows run without sending traffic.
- [ ] Active workflows require scope and action caps.
- [ ] Workflow run history shows status, inputs, results, and evidence.
- [ ] Warning/failure results promote to draft findings.
- [ ] AI-First can choose existing workflows by id but cannot invent hidden workflow behavior.

## 08 Plugins

- [ ] Demo plugin appears as approved with requested and granted permissions.
- [ ] Local plugin preview reads manifest without executing plugin code.
- [ ] Install creates a pending registry record.
- [ ] Approve grants only requested permissions.
- [ ] Disable, block, and remove update only the selected plugin.
- [ ] Panel inventory shows approved panel declarations.
- [ ] AI-First can read plugin inventory but cannot install, approve, or execute plugins invisibly.

## 09 Advanced

- [ ] Demo GraphQL operations are listed.
- [ ] OpenAPI/Postman import preview creates draft templates and sitemap seeds without sending traffic.
- [ ] Auth matrix rows summarize observed anonymous/bearer/cookie behavior.
- [ ] Parameter inventory includes query, JSON, cookie, GraphQL, and WebSocket JSON sources where present.
- [ ] Secret detections show masked previews.
- [ ] Cache/CORS/host/redirect signals show evidence links.
- [ ] Proxy guidance remains local text-only guidance.
- [ ] AI-First can read the Advanced summary but cannot import files or run requests invisibly.

## 10 Sitemap

- [ ] Host/path tree builds from HTTP/S captures.
- [ ] Endpoint inventory shows methods, statuses, parameters, auth signals, and evidence ids.
- [ ] Selecting a node filters HTTP/S traffic.
- [ ] Session diff compares the active session against an earlier baseline.
- [ ] Diff output distinguishes added, removed, and changed endpoints.

## 11 Scope

- [ ] Default scope is local development only on a fresh project.
- [ ] Demo scope is loaded after **Load Demo**.
- [ ] Adding origins, wildcard origins, hostnames, and `local` produces expected matching behavior.
- [ ] Invalid or blank scope lines are ignored safely.
- [ ] Repeater **Trust Origin** adds the current draft origin.
- [ ] Scope changes affect HTTP/S, WebSocket, and AI context visibility.

## 12 SSL

- [ ] Proxy CA paths and fingerprint render.
- [ ] Start/stop proxy controls update running state and proxy URL.
- [ ] Radar Browser, external browser, CLI, and mobile/device notes save per workspace.
- [ ] TLS events show trusted/blocked state, subject, issuer, URL, and timestamp.
- [ ] Radar never installs a root certificate automatically.
- [ ] Browser launch uses a dedicated profile and does not require a system keychain password on supported macOS setups.

## AI-First Safety

- [ ] Starting an AI-First run shows a visible timeline and stop control.
- [ ] Run budgets are visible in policy/timeline state.
- [ ] AI-First tab switches are visible.
- [ ] Replay probes remain scoped and capped.
- [ ] Findings created from AI remain draft/reviewable.
- [ ] Raw context stays opt-in.
- [ ] Stopping a run prevents additional tool steps.

## Local Data

- [ ] Restart preserves projects, sessions, scope, captures, WebSocket frames, findings, workflows, plugins, and AI run history.
- [ ] Loading another project does not merge evidence across projects.
- [ ] Creating a new session does not delete previous session evidence.
- [ ] Re-running **Load Demo** refreshes stable demo records instead of duplicating them.
- [ ] A database from a newer unsupported schema fails closed rather than downgrading.
