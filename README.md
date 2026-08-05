# Radar

Radar is a local-first defensive web security workbench for authorized testing. It brings traffic capture, replay, bounded active testing, evidence, reporting, and a visible AI operator into one desktop app.

Use it manually when you want direct control, or give AI-First a scoped goal and watch one sequential browser operator work through the same visible tools and evidence.

![Radar HTTP/S workspace](docs/screens/radar-01-traffic.png)

## What Radar Does

- **Observe:** capture HTTP/S and WebSocket traffic from a dedicated managed browser or local proxy, then explore it through filters, search, request details, and a generated sitemap.
- **Test:** pause and edit traffic, replay requests, run capped payload checks, compare identity evidence, and execute repeatable workflows.
- **Document:** turn captures and test results into evidence-backed findings, retest records, handoff packages, and Markdown or HTML reports.
- **Extend:** install local, permissioned plugins against Radar's bounded SDK.
- **Assist:** use prepare-only AI from the command palette or run a scoped assessment from the separate AI Operator window.

The core workflow is deliberately simple:

1. Create a project and save the authorized scope.
2. Open Radar Browser or connect an external client to the proxy.
3. Capture and inspect the application traffic.
4. Reproduce or test interesting behavior in Repeater, Automate, Identity Lab, or Workflows.
5. Promote resolved evidence into findings and a report.

The [User Guide](docs/USER_GUIDE.md) covers every surface and workflow in detail.

## AI That Stays Observable

AI-First does not run as a hidden background swarm. One browser operator follows task-relevant in-scope paths, lets each action settle, reads the resulting evidence, and only then chooses the next step.

The companion window keeps the current Thoughtstream, newest-first event feed, mission state, budgets, and controls visible. Permission-gated actions use focused prompts, while Pause, Resume, Stop, and manual workspace controls remain available throughout the run.

![Radar AI Operator tutorial](docs/screens/radar-10-tutorial.png)

## Safety Model

- **Local first:** projects, captures, findings, workflows, run history, and agent memory are stored in local SQLite.
- **Scope is authoritative:** evidence visibility, browser actions, replay, workflows, capability grants, and AI findings all reuse the saved allowlist.
- **Active work is bounded:** sends and workflow requests have explicit caps; burst replay and several mutation/export paths remain Manual-First.
- **Authority is explicit:** AI side effects require the active profile, policy, exact capability lease, and remaining budget to agree.
- **Raw context is opt-in:** headers, bodies, cookies, WebSocket payloads, and storage values are not sent to AI by default.

Radar never installs a root certificate automatically and does not introduce cloud behavior unless you explicitly configure an AI provider.

## Get Started

Pre-built installers are available on the [Releases page](https://github.com/Hairetsu/Radar/releases). See [Install and Launch](docs/USER_GUIDE.md#install-and-launch) for current macOS Gatekeeper, Windows SmartScreen, Linux, and source-build notes.

To run from source:

```bash
pnpm install
pnpm dev
```

Common development checks:

```bash
pnpm test
pnpm test:regression:ui:build
```

`pnpm test` runs lint, unit tests, and the production build. The blocking UI regression command also validates Radar's desktop readability, fonts, zoom behavior, and core usability contracts.

## Stack

- Electron 42, React 18, Vite, and strict TypeScript
- Tailwind CSS v4 with CSS-variable themes and local font assets
- SQLite for project, evidence, and run persistence
- Mockttp for local HTTP/S and WebSocket proxying
- Playwright Core over the operator-visible managed Chromium session

Radar uses an installed Chrome, Edge, Brave, or Chromium binary instead of downloading a second browser build.

## Documentation

- [Documentation index](docs/README.md) — operator, engineering, roadmap, and historical references
- [User Guide](docs/USER_GUIDE.md) — installation, navigation, workflows, AI-First, privacy, and troubleshooting
- [Design System](docs/DESIGN_SYSTEM.md) — themes, typography, composition, motion, and accessibility
- [Code Conventions](docs/CODE_CONVENTIONS.md) — architecture boundaries, implementation practices, and testing
- [Regression Testing](docs/REGRESSION_TESTING.md) — release gates and suite operation
- [Branching](docs/BRANCHING.md) — protected-branch and promotion workflow
- [Roadmap](docs/ROADMAP.md) — active product direction

## License

Radar is released under the MIT License.
