# Radar Code Conventions

This guide documents the code conventions already present in Radar and should be used for future development. It focuses on engineering patterns, module boundaries, naming, testing, and safety rules. Visual design guidance stays in `README.md`; styling implementation is covered below.

## Core Principles

- Keep the renderer, Electron main process, and shared runtime contracts separate.
- Put cross-runtime domain logic in `shared/`; keep renderer-only convenience exports in `src/lib/` and `src/types.ts`.
- Treat the Electron IPC boundary as the security boundary. The renderer asks; the main process performs filesystem, browser, proxy, replay, and AI work.
- Normalize untrusted input at boundaries, then pass typed values through the rest of the code.
- Prefer small named functions, pure helpers, and explicit data objects over classes, hidden mutation, or broad abstractions.
- Treat tests as part of the implementation. New behavior should ship with focused tests for the main path and the likely failure path.
- Keep local-first behavior intact. Radar should work without cloud services except where the user explicitly configures AI.
- Scope and allowlist checks are authoritative. Never add a shortcut that bypasses them.

## Project Structure

Use the existing folders as ownership boundaries:

- `shared/`: TypeScript modules that can run in both renderer and Electron. Domain types, allowlist logic, capture shaping, draft normalization, text truncation, and API contracts belong here.
- `electron/`: Main-process code, IPC handlers, filesystem access, proxy/browser orchestration, and AI provider calls.
- `electron/ai/`: AI settings, prompts, context building, provider calls, connect presets, and audit logic.
- `electron/agent/`: AI-First autonomous run loop, policy checks, and tool orchestration. Keep scope/replay limits here and have the runtime call existing browser, capture, and replay functions instead of duplicating them.
- `src/`: React renderer code.
- `src/hooks/`: Stateful renderer workflows. `useRadarWorkbench` is the composition root for workbench state.
- `src/hooks/workbench/`: Domain hooks composed by `useRadarWorkbench` (shell, scope, traffic, repeater, findings, workflows, automate, plugins, intercept, websocket, ssl/proxy, and related ports). Cross-domain writes go through typed ports such as `NavigationPort` and `NoticePort`.
- `src/lib/`: Renderer-facing utility re-exports and presentation helpers (including `cn()` and `presentation.ts` tone/format helpers).
- `src/components/ui/`: shadcn-style form and action primitives (`Button`, `Input`, `Select`, `Textarea`).
- `src/components/radar/`: Radar-specific presentation primitives (labels, status badges, pills, empty states).
- `src/components/shell/`: App chrome (sidebar, workspace header, panel header, telemetry ticker, AI-First drawer chrome, project artifacts overlay, request context menu, layout class helpers).
- `src/components/views/`: One view module per workbench tab (`TrafficView`, `RepeaterView`, …), each typed with `Pick<RadarWorkbench, …>` for the workbench keys it uses. Header action strips export as `*ViewActions` alongside the view body.
- `src/ai/`: AI command palette UI and renderer metadata.
- `src/test/`: Shared renderer test setup and structural guards such as the `data-testid` inventory.

When adding a feature, start with the shared types and pure helpers, then wire Electron IPC, then expose the typed preload API, then update hooks/UI, then tests.

## Feature Mode Contract

Every user-facing feature should be designed for both Radar operating modes:

- **Manual-First** is the human-operated path. It should expose the complete feature through direct controls, visible state, and operator-confirmed actions.
- **AI-First** is the agent-operated path. It should interact with features through bounded tool calls, typed inputs, normalized outputs, visible timeline entries, and the same policy checks as manual workflows.

When adding or changing a feature:

- Decide whether AI-First needs a new tool, a new tool parameter, or additional read-only context.
- Reuse the same shared helpers, IPC contracts, Electron operations, validation, scope checks, replay caps, and persistence paths that Manual-First uses.
- Keep AI-First behavior observable in the live app: tool calls should switch visible tabs when relevant, inspect visible evidence panes, load drafts into visible controls, record timeline entries, and persist run history in the local session.
- Avoid invisible background AI workflows for user-facing actions. If a background step is unavoidable, surface its status, result, and next user-visible effect in the AI-First console.
- Do not create separate AI-only shortcuts that bypass the renderer/main/shared architecture or the user's visible app state.
- If AI-First support is intentionally out of scope for a feature, document the reason in the change notes and keep the Manual-First path complete.

## TypeScript And Modules

- Write strict TypeScript. Do not use `: any`; use `unknown`, `Record<string, unknown>`, explicit unions, and type guards instead.
- Treat `unknown` as the default for untrusted external data: IPC payloads, JSON parsing, provider responses, filesystem data, and network data.
- Narrow `unknown` at the boundary with validation, type guards, or normalization before passing values deeper into the app.
- If a dependency forces an unsafe type escape, keep it local, document why, and convert back to a safe typed shape immediately.
- Use named exports for app code. Default exports are only used where framework config expects them.
- Use `import type` for type-only imports.
- Keep domain types serializable. IPC payloads and return values should be plain objects, arrays, strings, numbers, booleans, and nulls.
- Use discriminated unions for task/result shapes, matching `AiTaskOutput`.
- Keep constants near their domain. Use uppercase names for limits and defaults such as `MAX_REPLAY_BODY`, `DEFAULT_ALLOWLIST`, and `DEFAULT_SETTINGS`.
- In `electron/` and `shared/`, use NodeNext-compatible `.js` import specifiers for local TypeScript modules.
- In `src/`, keep extensionless imports.
- Keep compatibility shims and global declarations in `src/global.d.ts`.

Example:

```ts
import type { CapturedRequest } from "../../shared/domain.js";
import { buildContextPayload } from "./context.js";
```

## Functional Code First

- Default to functional code: pure functions, immutable inputs, explicit return values, and dependency injection through parameters.
- Keep business rules in small helpers that are easy to test without React, Electron, filesystem access, or network calls.
- Use plain objects and discriminated unions for state and results. Avoid class instances in domain models and IPC payloads.
- Do not introduce class hierarchies, inheritance, decorators, or service containers for normal app behavior.
- Use classes only when a platform API or dependency genuinely requires them, and keep that class behind a small functional wrapper.
- Prefer data transformation pipelines over methods that mutate internal state.
- Keep side effects at the edges: React event handlers/hooks, Electron IPC handlers, provider calls, filesystem reads/writes, browser/proxy orchestration.
- When a function has a side effect, make it obvious from the name and isolate the effect from pure validation/normalization logic.
- Make hard-to-test code thinner by extracting pure parsing, normalization, formatting, and authorization decisions into `shared/` or focused module helpers.

## Formatting

- Use 2-space indentation.
- Use double quotes for strings.
- Use semicolons.
- Keep object and function parameters readable. Break long parameter objects over multiple lines.
- Prefer early returns for guards and invalid states.
- Keep comments rare and useful. Explain why a security or platform choice exists, not what the next line does.
- Keep files ASCII unless the file already contains a specific character set or the UI copy requires otherwise.
- Do not introduce formatting-only churn in unrelated files.

## React Renderer Patterns

- Use function components and hooks only.
- Keep `App.tsx` as a thin composition root: shell chrome, overlays/dialogs, and view switching. Put each workbench tab in `src/components/views/` and shared chrome in `src/components/shell/`.
- Move workflow state into hooks. `useRadarWorkbench` composes domain hooks from `src/hooks/workbench/` and remains the public workbench API (`RadarWorkbench`).
- Use local component state for isolated UI surfaces, as `CommandPalette` and view-local filters/editors do.
- Wrap async workflows in `useCallback` and `useAsyncAction` when the UI needs pending state.
- Use `useMemo` for derived values that are reused by render.
- Use `useEffect` sparingly: subscriptions, polling, keyboard shortcuts, and startup loads. Prefer derived state, event handlers, and render-time ref assignment over effects for keeping callbacks in sync. Always return cleanup functions for timers and listeners.
- Keep form controls controlled: `value`, `onChange`, and explicit state setters.
- Electron-dependent calls must go through `window.radar`. The renderer should degrade with a notice when `window.radar` is unavailable.
- Do not import Electron, Node built-ins, filesystem APIs, or process APIs into `src/`.
- Add `data-testid` and `data-component` to interactive or test-relevant UI elements.
- Use `lucide-react` icons for actions and status markers.
- Style with Tailwind utilities and `src/components/ui/` / `src/components/radar/` primitives — not new selector blocks in `styles.css`.

## Hook And State Conventions

- Hooks should expose plain state values plus explicit action functions.
- Name async action functions with the user-facing operation: `openBrowser`, `saveTargets`, `sendReplay`, `runBurst`.
- Keep mutation wrappers local to the hook:

```ts
const sendReplayMutation = useAsyncAction(sendReplayAction);
```

- Keep derived state close to its source:

```ts
const selected = useMemo(
  () =>
    captures.find((capture) => capture.id === selectedId) ||
    captures[0] ||
    null,
  [captures, selectedId],
);
```

- Domain hooks under `src/hooks/workbench/` own their state exclusively. `useRadarWorkbench` composes them and must not keep a second copy of the same `useState`. Cross-domain writes use typed ports (`NavigationPort`, `NoticePort`, `RepeaterPort`) instead of importing sibling setters.
- Polling is acceptable for local Electron state snapshots. Keep intervals modest and clean them up.

## Electron And IPC

- `shared/radar-api.ts` is the preload contract. Update it before adding a new `window.radar` method.
- `electron/preload.ts` should be a thin one-to-one map from `RadarApi` methods to `ipcRenderer.invoke`.
- `electron/main.ts` owns `ipcMain.handle` registrations. IPC channel names should follow the existing `domain:action` pattern, such as `browser:open`, `proxy:start`, and `ai:run`.
- Keep `contextIsolation: true` and `nodeIntegration: false` for renderer windows.
- Main-process handlers should clamp numeric input, normalize strings, and reject unsafe actions.
- Replay, burst replay, browser launch, proxy setup, CA generation, and AI provider calls stay in the main process.
- Module-level main-process state is acceptable for app-wide browser/proxy/capture state. Expose snapshots as serializable values.
- Catch platform/API failures at the boundary and return useful error messages or result objects.
- Do not log secrets, API keys, request bodies, or raw headers.

## SQLite Local Store Migrations

- `electron/localStore.ts` owns the local SQLite schema, `LOCAL_STORE_SCHEMA_VERSION`, and the ordered migration list.
- Each schema change must add an idempotent migration entry, update `LOCAL_STORE_SCHEMA_VERSION`, record the migration in `schema_migrations`, and keep the legacy `meta.schema_version` value current for compatibility.
- Migrations should create missing tables/indexes with `IF NOT EXISTS`, add columns only after checking `PRAGMA table_info`, and preserve existing rows unless the change explicitly documents a safe data transform.
- Opening a store with a newer migration version must fail closed instead of attempting to downgrade or mutate unknown data.
- Multi-statement local-store writes that update a child record and then touch parent session/workspace metadata must run inside `runImmediateTransaction`; tests should prove rollback when the parent update fails.
- Local store tests should cover fresh database creation, migration from a simulated older database, repeat-open idempotency, and the likely failure path for incompatible schema versions.
- User-facing local data changes should update `docs/USER_GUIDE.md`; internal-only schema maintenance can note that no workflow change was introduced.

## Shared Utility Patterns

- Shared functions should be deterministic and side-effect free unless their name clearly indicates otherwise.
- Shared utility modules should be mostly pure functions plus constants. Avoid module-level mutable state in `shared/`.
- URL and parsing helpers should fail closed: return `false`, `""`, `null`, or a safe default instead of throwing when the caller is rendering UI.
- Boundary functions that parse user-authored structured text, such as JSON headers, may throw clear validation errors.
- Normalize network data into strings before crossing layers. Header values should end up as `Record<string, string>`.
- Keep truncation and safety caps central. Use existing limits such as `MAX_CAPTURED_BODY` and `MAX_REPLAY_BODY`.
- Strip hop-by-hop or unsafe headers during replay draft normalization.

## Security And Scope Rules

- The allowlist in `shared/allowlist.ts` defines Traffic visibility and AI scope. Repeater replay stays normalized and capped, but is not blocked by scope.
- The default allowlist is local development only.
- Raw AI context must remain explicit opt-in. Redacted context is the default.
- Manual-First AI output is prepare-only. In AI-First, **Start Run** or **Start Tutorial** is user confirmation only for bounded, saved-scope, `GET`-only browser opening and navigation; form interaction, identity changes, replay, workflows, and other active requests retain their existing capability confirmation.
- Radar must not install root certificates automatically.
- Keep proxy CA files and AI settings in Electron user data, not in the repository.
- Treat model responses as untrusted. Normalize every AI task output before using it.

## AI Feature Conventions

When adding or changing an AI task, update all of these surfaces together:

- `shared/ai-types.ts`: task union, request/result shape, and output data type.
- `src/ai/types.ts`: renderer metadata and ordered task list.
- `electron/ai/tasks.ts`: JSON-only system instructions.
- `electron/ai/providers.ts`: output normalization.
- `electron/ai/index.ts`: run/preview behavior if needed.
- `src/lib/resultPreview.ts`: display formatting.
- Tests for type metadata, provider normalization, preview/run behavior, and result preview.

Keep prompts concise, defensive, and operational. They should emphasize authorized scope, uncertainty, and user-confirmed actions.

## Styling Implementation

Radar uses Tailwind CSS v4 with shadcn practices. Follow these rules when adding or changing UI:

### Theme and global CSS

- Keep design tokens in `@theme` inside `src/styles.css` (colors, fonts, shadows). Reference them as Tailwind utilities (`bg-surface`, `text-signal`, `font-mono`, etc.).
- Reserve `src/styles.css` for tokens, base element styles, the bureau shell texture (`.radar-shell`), scrollbars, shared keyframes, the global focus and reduced-motion policy, and the shared label roles. Do not add page-level or per-component selector blocks there — those belong in the component's Tailwind utilities.
- Use `@layer base` and `@layer components` sparingly — only for truly global concerns that cannot live in a component.

### Type and label scale

- Use the shared type scale (`text-nano`, `text-micro`, `text-label`, `text-meta`, `text-body`, `text-lead`, `text-title`, `text-head`, `text-mark`) and tracking scale (`tracking-data`, `tracking-key`, `tracking-label`, `tracking-eyebrow`, `tracking-banner`). Do not introduce new arbitrary `text-[Npx]` or `tracking-[N.Nem]` values — add a scale step if a genuinely new size is needed.
- Use the label roles `rd-eyebrow`, `rd-label`, `rd-label-sm`, and `rd-banner` for the repeating uppercase mono chrome instead of respelling `font-mono text-X uppercase tracking-Y`. Colour stays a utility so callers can tone them per context.
- Because the three themes ship different mono faces with different widths, prefer ellipsis and scrollable strips over fixed widths for label-bearing chrome.

### Focus and motion

- There is one focus idiom: a theme-aware `:focus-visible` outline declared in `@layer base`, driven by `--theme-focus`. Do not add `focus-visible:outline-none` to a control without replacing the affordance.
- Text fields are the documented exception: they opt out of the outline and use a border shift plus a `--theme-focus-glow` ring, which never clips inside dense panes.
- Full-bleed rows, tabs, and menu items live inside `overflow-hidden` panes, so they use the inset focus offset from `layoutClasses.ts` rather than the default outward offset.
- Page-load reveals must carry the `radar-reveal` class (via `revealClass`) so `prefers-reduced-motion` can drop the animation without leaving the element stuck at `opacity-0`.

### shadcn-style components

- Use `cn()` from `src/lib/utils.ts` (`clsx` + `tailwind-merge`) to merge class names. `cn` is an `extendTailwindMerge` instance that registers the custom font-size and tracking scales as their own conflict groups; without that registration `tailwind-merge` reads `text-meta` as a colour and silently drops it when a real colour is merged in. Add any new scale step to those class groups in `src/lib/utils.ts` and cover it in `src/lib/utils.test.ts`.
- Use `class-variance-authority` (`cva`) for variant-driven components. Export both the component and its `*Variants` helper when variants may be reused.
- Put generic, reusable controls in `src/components/ui/` following shadcn patterns: `forwardRef`, `VariantProps`, typed props extending native element props, and `displayName`.
- Put Radar-specific presentation pieces in `src/components/radar/` (for example `FieldLabel`, `StatusBadge`, `StatusPill`, `EmptyState`).
- Prefer importing `Button`, `Input`, `Select`, and `Textarea` from `src/components/ui/` over raw elements with duplicated utility strings.
- Map existing interaction families to `Button` variants: `solid`, `outline`, `icon`, `zap`, and `ghost`.

Example:

```tsx
import { cn } from "../../lib";
import { Button } from "./components/ui/button";
import { StatusBadge } from "./components/radar/primitives";

<Button variant="solid" size="compact">Transmit</Button>
<StatusBadge tone="good">200</StatusBadge>
```

### Layout and composition

- Style views and panels with Tailwind utilities directly in JSX. Compose layout with flex/grid, spacing, borders, and typography classes — not bespoke CSS classes.
- Avoid inline styles except for values that must be computed at runtime.
- Preserve the operational console layout patterns when adding UI: dense, readable, keyboard-aware, and testable.
- When adding a new shadcn primitive, copy the shadcn structure (cva variants, `cn` merge, ref forwarding) and adapt tokens/colors to the bureau theme rather than importing default shadcn CSS variables wholesale.

## Testing Standards

- Use Vitest for all tests.
- Keep tests next to the code they validate with `*.test.ts` or `*.test.tsx`.
- Prefer testing pure helpers directly. Extract logic from UI or IPC handlers when that makes behavior easier to test.
- Renderer tests use Testing Library and jsdom. Prefer user-visible queries and `userEvent`.
- Shared utility tests should cover valid inputs, invalid inputs, boundary cases, and fail-closed behavior.
- Electron/AI tests should stub globals such as `fetch`, use temp directories for filesystem state, and clean up in `afterEach`.
- Add or update tests in the same change as behavior changes. At minimum, cover the happy path, an invalid input path, and any security/scope boundary touched.
- Maintain the configured coverage thresholds in `vite.config.ts`.

Useful commands:

```bash
pnpm lint
pnpm test:unit
pnpm build
pnpm test
```

## Error Handling

- Throw `Error` with clear operator-facing messages when a command cannot proceed.
- Use result objects for operations that need to display success/failure inside the UI without crashing the flow.
- Convert unknown caught values with `error instanceof Error ? error.message : "Fallback message"`.
- Keep catch blocks narrow. Do not swallow failures unless the best fallback is obvious and safe.

## Naming

- Files use existing domain names: `allowlist`, `capture`, `draft`, `settings`, `providers`, `context`.
- User-facing copy should call the top-level engagement container a **Project**. Existing internal contracts may keep `LocalProfile` and `LocalWorkspace`; use **Workspace** for the internal local storage scope and **Session** for the evidence ledger under a project.
- React components use PascalCase.
- Hooks start with `use`.
- Types use PascalCase and describe the domain object, not implementation details.
- IPC channels use lowercase `domain:action`.
- Test names should describe behavior: `blocks preview without captures`, `normalizes method and strips hop-by-hop headers`.

## Future Development Checklist

Before considering a change complete:

- Shared contracts are updated first if data crosses renderer/main boundaries.
- Core behavior is expressed as small, functional helpers instead of class-based abstractions.
- Manual-First usage is complete, and AI-First tool-calling impact has been implemented or explicitly ruled out.
- No new `: any` annotations are introduced; untrusted values use `unknown` and are narrowed before use.
- Electron handlers validate, clamp, and normalize untrusted inputs.
- Renderer code remains Electron-free except for `window.radar`.
- User actions are explicit and reversible where practical.
- Security-sensitive defaults fail closed.
- Tests cover new behavior and the most likely failure path.
- New UI uses Tailwind utilities and shadcn-style components; theme tokens stay in `@theme`, not ad-hoc CSS classes.
- `pnpm lint`, `pnpm test:unit`, and `pnpm build` pass, or any inability to run them is documented.
