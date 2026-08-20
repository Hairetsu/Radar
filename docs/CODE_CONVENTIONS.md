# Radar code conventions

These rules describe the architecture that Radar uses now. Keep the trust boundary obvious, keep domain logic runnable without Electron or React, and make every user-facing action visible in both Manual-First and AI-First where that makes sense.

## Runtime ownership

Do not blur the renderer, Electron main process, and shared code.

| Location | Owns |
| --- | --- |
| `shared/` | Serializable types, limits, normalization, Scope rules, and pure domain helpers used by more than one runtime. |
| `electron/` | Files, SQLite, proxying, browser control, replay, Automate, workflows, plugins, AI providers, and AI-First execution. |
| `src/` | React renderers, operator controls, visible state, and presentation helpers. |

Important owners inside those boundaries:

- `shared/radar-api.ts` defines the workspace preload contract.
- `shared/api/aiOperatorApi.ts` defines the narrower AI Operator contract.
- `shared/agentMission/` owns Mission Graph normalization, patches, steering, and evidence validation.
- `shared/agentCapabilities/` owns risk, leases, receipts, and authorization.
- `electron/ipc/` owns IPC registration and boundary normalization by domain.
- `electron/store/` owns the SQLite schema, migration ledger, row mapping, transactions, and repositories.
- `electron/capture/` owns session-bound HTTP and WebSocket ledgers and causal attribution.
- `electron/proxy/` owns the local CA and proxy lifecycle.
- `electron/intercept/` owns scoped queueing, resolution, and match/replace.
- `electron/browser/` owns the managed browser, CDP, Playwright, inspection, and capture adapters.
- `electron/ai/` owns provider settings, prompts, model calls, context, and Manual-First AI tasks.
- `electron/agent/` owns the AI-First runtime, policy, planner, tool registry, and execution loop.
- `electron/windows/` owns native-window roles, lifecycle, bounds, normalized cross-window state, and workspace intents.
- `src/hooks/workbench/` owns Manual-First domain state and actions.
- `src/hooks/workbench/agent/` owns AI run lifecycle, governance, memory, and timeline projection.
- `src/ai-operator/` owns the companion renderer and its local controller state.
- `src/components/views/` owns the twelve workbench views.
- `src/components/shell/` owns shared app chrome and overlays.
- `src/components/ui/` and `src/components/radar/` own reusable controls and Radar-specific presentation primitives.

`electron/main.ts`, `src/App.tsx`, and `useRadarWorkbench` are composition roots. Do not move feature algorithms into them.

## Build one vertical feature path

For behavior that crosses runtimes, work in this order:

1. Add the shared type, limit, and pure normalization helper.
2. Add main-process behavior behind an explicit operation.
3. Register the IPC handler and validate untrusted input there.
4. Add the typed preload method.
5. Add the domain hook and visible Manual-First control.
6. Reuse the same operation for AI-First, or document why no AI path is appropriate.
7. Add focused tests and update operator documentation.

This order is a dependency rule, not a request for placeholder layers. Keep each change as small as the feature permits.

## Keep Manual-First and AI-First aligned

Manual-First is the complete human-operated path. AI-First uses bounded tool calls against the same contracts, Scope checks, replay and workflow caps, persistence, and audit model.

For every user-facing change, decide whether AI-First needs:

- A new tool.
- A parameter on an existing tool.
- More read-only context.
- No AI access because the action must remain Manual-First.

An AI action should change the app in front of the operator. Switch the visible view, select the evidence, load the draft into the existing editor, record the operation, and show the result. Do not add an AI-only shortcut that bypasses normal state or authority.

Radar uses one sequential effect-bearing browser operator. `electron/agent/executionLoop.ts` performs one allowed tool call, lets it settle, captures the result, and then asks the planner for the next step. Do not add concurrent browser operators or planner fan-out to this path.

## Write strict TypeScript

- Do not add `: any`. Treat external values as `unknown` until parsed.
- Use discriminated unions for state and result variants.
- Make illegal combinations unrepresentable instead of documenting optional-field rules in comments.
- Use branded primitives when two IDs or other semantic strings can be mixed up.
- Validate at the boundary, then trust the typed value inside the system.
- Prefer `satisfies` to an `as` cast. Keep an unavoidable cast local and earn it with validation.
- Make variant switches exhaustive with a `never` binding.
- Derive types with `Pick`, `Omit`, `Parameters`, `ReturnType`, `Awaited`, or `typeof` before duplicating an existing schema.
- Keep IPC values serializable. Use plain objects, arrays, strings, numbers, booleans, and `null`.
- Use named exports for application code. Framework configuration may use a required default export.
- Use `import type` for type-only imports.
- In `electron/` and `shared/`, use NodeNext-compatible `.js` specifiers for local modules.
- In `src/`, keep extensionless local imports.
- Keep constants near the owning domain and use uppercase names for hard limits and defaults.

## Prefer a functional core

- Put business rules in small pure functions.
- Pass immutable inputs and return explicit data.
- Keep side effects at the edges: React handlers and subscriptions, IPC handlers, SQLite repositories, filesystem calls, provider calls, proxy and browser controllers.
- Use dependency parameters for code that needs a clock, network client, store, or process boundary.
- Avoid class hierarchies, decorators, and service containers. Wrap a platform-required class behind a small functional API.
- Use early returns for invalid or empty cases.
- Remove a one-caller pass-through when it makes a reader cross another file without hiding useful complexity.

## Treat IPC as the security boundary

The renderer asks. Electron validates and performs the action.

- Main-process handlers clamp numbers, normalize strings, reject malformed structured data, and fail closed.
- Never import Electron, Node built-ins, filesystem APIs, or process APIs into `src/`.
- Keep `contextIsolation: true` and `nodeIntegration: false` for renderer windows.
- Authorize native-window requests with both the immutable preload role and `webContents.id`.
- A query string can select a renderer bundle. It cannot grant a role.
- Cross-window state must be normalized, serializable, and allowlisted.
- Do not inject JavaScript into another renderer, query another renderer's DOM, or forward raw evidence through a renderer-to-renderer channel.
- Do not log API keys, cookies, request bodies, raw headers, or storage values.

The AI Operator uses a dedicated Node-free preload and a narrower API. Electron 42 cannot execute the packaged ESM preload reliably with `sandbox: true`, so the companion currently uses `sandbox: false` with context isolation, no Node integration, no webview, immutable role registration, and sender authorization. The workspace also uses `sandbox: false` and currently enables `webviewTag`. Treat both settings as known security debt and re-evaluate them during Electron or renderer-security work.

Opening the AI Operator creates or focuses one non-modal companion. Closing it hides the window during normal app life. Starting a run changes app mode. Returning to Manual-First must checkpoint queued or running work first and remain AI-First if checkpointing fails.

## Enforce Scope, authority, and caps

- `shared/allowlist.ts` is the evidence and AI Scope contract.
- New projects default to local development targets.
- Manual Repeater is normalized and capped but is not blocked by Scope.
- Automate, active workflows, plugins, and AI-First use their domain-specific Scope and authority checks.
- Raw AI context is off by default.
- Radar never installs a root certificate automatically.
- Treat model and plugin output as untrusted input.

AI-First authority is the intersection of the selected profile, saved Scope, an exact granted capability tuple, and remaining budget. Destructive actions and `DELETE` requests are not grantable. A receipt reserves action and known request cost before dispatch.

Keep tool metadata, schemas, safety labels, and canonical normalization together under `electron/agent/toolRegistry/`. The runtime must not maintain a second interpretation of a public tool input.

## Keep SQLite changes recoverable

- `electron/store/schema.ts` owns current DDL.
- `electron/store/migrations.ts` owns `LOCAL_STORE_SCHEMA_VERSION` and the ordered ledger.
- Every schema change needs an idempotent migration and tests from an older supported schema.
- Use `IF NOT EXISTS` for tables and indexes. Check `PRAGMA table_info` before adding a column.
- Preserve existing rows unless the change describes and tests a safe transform.
- Record each migration in `schema_migrations` and keep legacy `meta.schema_version` current.
- Fail closed when a database comes from a newer unsupported version.
- Use `runImmediateTransaction` when a write changes a child row and then touches parent project or session metadata.
- Test fresh creation, migration, repeat-open idempotency, rollback, and incompatible versions.

User-visible local data changes need a user-guide update. Internal migration maintenance can state that no workflow changed.

## Build React surfaces around domain hooks

- Use function components and hooks.
- Keep `App.tsx` focused on shell composition, overlays, and view switching.
- Let one domain hook own each piece of state. Do not copy the same `useState` into `useRadarWorkbench` and a child hook.
- Use typed ports such as navigation, notice, and Repeater ports for cross-domain writes.
- Name actions after the operator action, such as `openBrowser`, `saveTargets`, or `runBurst`.
- Use `useAsyncAction` when a visible operation needs pending state.
- Use `useMemo` for reused derived values and `useCallback` for asynchronous workflows passed through the tree.
- Use effects for subscriptions, timers, shortcuts, and startup loads. Clean every listener and timer up.
- Use `useSyncExternalStore` for live DOM layout state instead of copying it into React state from an effect.
- Keep forms controlled.
- Add `data-testid` and `data-component` to interactive or regression-relevant elements.
- If `window.radar` is unavailable, show a useful notice instead of throwing.

## Preserve Radar's visual system

The product direction is in [Design system](DESIGN_SYSTEM.md).

- Keep theme tokens, font definitions, base rules, shared keyframes, selection, focus, and reduced-motion policy in `src/styles.css`.
- Style components with Tailwind utilities. Do not add view-specific selector blocks to the global stylesheet.
- Use `cn()` from `src/lib/utils.ts` for class merging.
- Use `cva` for reusable variants.
- Use the shared text and tracking scales. Add a token instead of a new arbitrary pixel value when a new role is real.
- Use `rd-eyebrow`, `rd-label`, `rd-label-sm`, and `rd-banner` for repeated chrome labels.
- Use the existing Button, Input, Select, Textarea, status, and empty-state primitives before writing a copy.
- Keep the global `:focus-visible` affordance. A control that removes it must replace it with an equivalent visible state.
- Add `radar-reveal` through the shared helper for page-load reveals so reduced motion can disable them safely.
- Use `lucide-react` for actions and status icons when an appropriate icon exists.

Evidence must remain readable, selectable, and more prominent than decoration.

## Change AI tasks as one unit

For a Manual-First AI task, update the type, metadata, prompt, provider normalization, preview/run behavior, renderer formatting, and tests together. The primary owners are:

- `shared/ai-types.ts`
- `src/ai/types.ts`
- `electron/ai/tasks.ts`
- `electron/ai/providers.ts`
- `electron/ai/index.ts`
- `src/lib/resultPreview.ts`

Prompts should name authorization, Scope, uncertainty, evidence, and user-confirmed actions. Keep model output behind strict JSON normalization before it affects the app.

## Test the behavior that matters

- Use Vitest for unit and renderer tests.
- Keep tests beside their owner as `*.test.ts` or `*.test.tsx`.
- Test pure helpers directly.
- Renderer tests should use Testing Library, visible queries, and `userEvent`.
- Boundary tests should cover valid input, malformed input, caps, and fail-closed behavior.
- Electron tests should use temporary directories and restore stubbed globals in `afterEach`.
- Prefer real framework behavior over mocks when it runs cheaply and deterministically.
- Add one main-path test, one likely failure, and every changed security or Scope boundary.
- Do not lower the broad 90 percent line, function, and statement gate to absorb new files.
- Expand the staged critical gate when agent, browser, store, controller, or renderer-intent logic moves into a new owner.

Useful commands:

```bash
pnpm lint
pnpm test:unit
pnpm build
pnpm test
pnpm test:regression:build
pnpm test:regression:ui:build
```

## Use clear errors and stable names

- Throw `Error` with an operator-readable message when an operation cannot continue.
- Return a result object when the UI needs to show failure without breaking the workflow.
- Convert an unknown caught value with `error instanceof Error ? error.message : "Fallback message"`.
- Keep catch blocks narrow. Do not swallow a failure without an obvious safe fallback.
- Call the user-facing engagement container a **Project**, the internal storage scope a **Workspace**, and an evidence ledger a **Session**.
- Keep existing domain words in file names: `allowlist`, `capture`, `draft`, `settings`, `providers`, and `context`.
- Use PascalCase for components and types, `use` for hooks, and lowercase `domain:action` for IPC channels.
- Name a test after observable behavior, such as `blocks preview without captures`.

## Keep documentation current

- Update the repository README when the product surface, installation, stack, design, screenshots, or high-level workflow changes.
- Update the user guide when an operator changes how they install, launch, configure, navigate, capture, replay, test, scope, analyze, export, or troubleshoot.
- Update this file only when an engineering convention changes.
- Update the design system for visual rules and the roadmap for future direction.
- Run `pnpm screenshots` when checked-in screenshots no longer match the app.
- Delete completed plans instead of leaving a second description of shipped behavior.

## Completion check

Before calling a change done:

- Shared contracts, Electron behavior, preload APIs, hooks, UI, and tests agree.
- Manual-First is complete.
- AI-First reuses the normal operation, or the change explains why no AI path belongs.
- IPC input is normalized and the security boundary fails closed.
- No new `: any` enters the codebase.
- Tests cover the main path and likely failure.
- Operator documentation matches the visible app.
- `pnpm lint`, `pnpm test:unit`, and `pnpm build` pass, or the handoff names the exact command that could not run and why.
