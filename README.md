# Radar

Radar is a local-first desktop workbench for authorized web security testing. It records HTTP/S and WebSocket traffic, gives you controlled ways to replay and mutate requests, and keeps the evidence, scope, findings, and reports in one project.

You can drive Radar by hand or give the AI Operator a scoped goal. Both modes use the same browser, proxy, evidence store, replay limits, workflow engine, and safety checks. There is no separate hidden automation path.

![Radar HTTP/S workspace](docs/screens/radar-01-traffic.png)

## The working loop

1. Create a project and save the authorized origins in **Scope**.
2. Open the Radar Browser or route an external client through Radar's proxy.
3. Inspect the recorded HTTP/S requests, WebSocket frames, and sitemap.
4. Move useful evidence into Intercept, Repeater, Automate, or a saved workflow.
5. Turn confirmed observations into findings, retest them, and export the report or a redacted handoff package.

Radar is built for remote targets as well as local development. The default scope is local-only, but a project can contain any HTTP/S or WebSocket origin that you are authorized to test.

## What is in the app

The main workbench has twelve views:

| Group | Views | Job |
| --- | --- | --- |
| Observe | HTTP(S), WebSocket, Sitemap | Capture, search, inspect, tag, and map evidence. |
| Test | Intercept, Repeater, Automate, Workflows | Pause traffic, edit requests, replay variants, and run bounded checks. |
| Report | Findings, Advanced | Review API and identity signals, write findings, retest, and export reports. |
| Configure | Plugins, Scope, SSL | Control local extensions, the engagement boundary, the proxy, and certificate handling. |

Projects also contain sessions, notes, saved views, local run memory, bundle export/import, and focused handoff packages.

## Two operating modes

Manual-First is the normal operator-driven mode. You click every action that sends, mutates, exports, installs, or approves something. The command palette can summarize evidence and prepare drafts, but it does not transmit them.

AI-First runs in a separate AI Operator window. One sequential browser operator chooses an in-scope step, waits for it to settle, records the result, and then chooses the next step. The workspace stays visible while the companion shows the Mission Pulse, Operation Stream, Task History, Mission Graph, permission requests, and Completion Report.

The AI Operator Connection Deck keeps saved credentials isolated by provider. Switching away from a provider and back restores only that provider's saved key and connection settings. Local CLI presets (Codex app, Cursor CLI, Grok CLI) use the installed CLI login instead of a Radar-stored cloud key.

The Goal-Driven Assessment profile gives the agent Radar's largest run budgets and widest non-destructive tool set. It remains inside saved Scope and pauses for capability approval before replay, form submission, identity changes, or active workflows. Raw context stays off.

**Autonomous Assessment** can open the managed browser to collect in-scope captures, then run a read-only experiment contract. **Start Autonomous** is the only approval action. Radar binds the contract to the current browser identity before the first probe, then ranks captures and runs visible Repeater baselines plus typed variants without another approval pause. Negative and inconclusive results move to the next candidate. The first supported or verification-required result stops the run with a Completion Report and retained Repeater history. The first families are CORS origin, reflection, injection signal, authorization omission, and resource ID. Raw context stays off. One concurrent request. Forms, arbitrary replay, identity changes, and workflows stay off. **Stop Traffic Now** aborts in-flight probes without deleting completed evidence.

Actions with side effects need the selected profile, saved Scope, a matching capability grant, and remaining run budget. Radar never grants destructive actions or `DELETE` requests to AI-First.

![Radar AI Operator](docs/screens/radar-11-ai-operator-feed.png)

## Safety rules

- Projects, captures, findings, workflows, plugins, and AI run history stay in local SQLite unless you export them.
- Scope filters visible evidence and bounds AI-First. Manual Repeater remains an explicit operator tool, so verify its URL before every send.
- Automate, workflows, replay bursts, and AI-First runs have hard request, concurrency, delay, timeout, or step limits.
- Raw headers, bodies, cookies, WebSocket payloads, and browser storage are excluded from AI context unless you opt in.
- AI findings remain drafts until a person reviews them, and every saved AI finding must resolve to local in-scope evidence.
- Radar generates a local proxy CA but never installs a root certificate automatically.
- Plugin install, approval, permission changes, and execution remain visible Manual-First actions.

Use Radar only on systems where you have permission to test.

## Install Radar

Installers are published on [GitHub Releases](https://github.com/Hairetsu/Radar/releases) for macOS, Windows, and Linux. Linux releases include AppImage, Debian, and Arch packages.

Radar is still pre-1.0. The macOS app is not notarized and the Windows installer is not signed yet, so the operating system may show a warning. The [installation guide](docs/USER_GUIDE.md#install-radar) has the current launch steps and the exact local data paths.

Radar uses a locally installed Chrome, Edge, Brave, or Chromium build. It does not download another browser at runtime.

## Run from source

You need Node.js, pnpm, and a supported browser.

```bash
pnpm install
pnpm dev
```

Build a production renderer and Electron bundle with:

```bash
pnpm build
```

## Run the Harborline demo target

Harborline is a fake freight-operations portal for live Radar demos. It listens only on `127.0.0.1:3000`. The site presents ordinary dispatch workflows and does not label its security weaknesses or provide test payloads.

Start the target in a separate terminal:

```bash
pnpm demo:dev
```

Open `http://127.0.0.1:3000` in the Radar Browser. Sign in with operator ID `operator` and password `harbor-2026`. Use Harborline as a black-box target: browse the freight workflows, inspect the captured requests, and decide which requests merit controlled replay.

Harborline's forms accept only normal business values. To test a changed parameter, capture a valid request and edit the copy in Radar Repeater. The browser does not send test strings, unlisted record IDs, unknown document paths, unapproved feed URLs, or markup.

Harborline uses fixed in-memory data. It does not read host files or make outbound requests, even when a request contains a file path or URL.

## Benchmark the AI Operator

Radar includes a versioned Harborline benchmark with prompts, expected evidence, policy-aware outcomes, and deterministic scoring. The core suite covers every AI-First run profile. Expected answer markers stay in the evaluator and are never sent to the model.

List the complete prompt catalog and expected outcomes:

```bash
pnpm benchmark:operator -- --list --suite full
```

Preview a model matrix without launching Radar or calling a provider:

```bash
pnpm benchmark:operator -- --dry-run --suite core --models model-a,model-b
```

Run the nine-case core suite with `gpt-5.6-terra` through the signed-in Codex CLI:

```bash
pnpm benchmark:operator:terra
```

Run the hands-off Autonomous Assessment acceptance case against Harborline:

```bash
pnpm benchmark:autonomous
```

The autonomous preset starts Harborline when needed, seeds every normal demo request through Radar's proxy, starts the read-only contract, and requires no capability approval clicks.

This preset keeps active capability approval paused. Add `-- --approve-active` when you want the benchmark runner to approve bounded, non-destructive Harborline leases.

The real runner launches isolated Radar sessions against `127.0.0.1:3000`, seeds only normal baseline traffic, preserves Scope and profile caps, and leaves capability approval paused unless you pass `--approve-active`. See the [Operator benchmark guide](docs/OPERATOR_BENCHMARK.md) for provider setup, full cross-profile runs, scoring, and artifacts.

## Test the app

Run the main gate:

```bash
pnpm test
```

`pnpm test` runs ESLint, both Vitest coverage gates, and the production build. The Electron regression suite uses deterministic loopback targets and isolated local data:

```bash
pnpm test:regression:build
pnpm test:regression:ui:build
```

The repository also contains Ubuntu and Windows container gates. See [Regression testing](docs/REGRESSION_TESTING.md) for commands, artifacts, screenshot baselines, and native platform checks.

## Design

Radar is a dense defensive console, not a generic dashboard. Evidence stays selectable and visually dominant. Scope, browser state, proxy state, AI authority, failures, and active work remain visible without relying on color alone.

Six complete appearance systems ship with local fonts:

- Bureau uses Antonio, Saira, and JetBrains Mono on warm slate with signal orange.
- Vellum uses Instrument Serif, Hanken Grotesk, and DM Mono on paper with vermillion ink.
- Specter uses Unbounded, Sora, and Space Mono over midnight plum with chartreuse and cyan.
- Aperture uses Unbounded, Hanken Grotesk, and JetBrains Mono on cool porcelain with cobalt.
- Verdigris uses Instrument Serif, Saira, and DM Mono over bottle green with copper.
- Aegis uses Antonio, Sora, and Space Mono over command navy with glacier blue and brass.

Theme tokens and shared motion live in `src/styles.css`. Components use Tailwind utilities and the existing UI primitives. The [design system](docs/DESIGN_SYSTEM.md) records the visual and accessibility rules.

## Architecture

- `shared/` owns serializable contracts, limits, normalization, scope rules, and pure domain logic.
- `electron/` owns SQLite, files, proxying, browser control, replay, plugins, AI providers, and the AI-First runtime.
- `src/` owns the React workbench and AI Operator renderers.
- Electron IPC is the trust boundary. The renderer asks; the main process validates and performs the action.

The stack is Electron 42, React 18, Vite, strict TypeScript, Tailwind CSS v4, SQLite, Mockttp, and Playwright Core.

## Documentation

- [User guide](docs/USER_GUIDE.md) for installation and operator workflows.
- [Code conventions](docs/CODE_CONVENTIONS.md) for runtime boundaries, TypeScript, IPC, tests, and feature delivery.
- [Design system](docs/DESIGN_SYSTEM.md) for themes, typography, layout, motion, and accessibility.
- [Regression testing](docs/REGRESSION_TESTING.md) and the [manual QA checklist](docs/MANUAL_QA_CHECKLIST.md) for release proof.
- [Operator benchmark](docs/OPERATOR_BENCHMARK.md) for model and run-profile evaluation against Harborline.
- [Roadmap](docs/ROADMAP.md) for the work that remains.
- [Documentation index](docs/README.md) for the complete maintained set.

## License

Radar is released under the MIT License.
