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
- `src/hooks/`: Stateful renderer workflows such as `useRadarWorkbench`.
- `src/lib/`: Renderer-facing utility re-exports and presentation helpers (including `cn()`).
- `src/components/ui/`: shadcn-style form and action primitives (`Button`, `Input`, `Select`, `Textarea`).
- `src/components/radar/`: Radar-specific presentation primitives (labels, status badges, pills, empty states).
- `src/ai/`: AI command palette UI and renderer metadata.
- `src/test/`: Shared renderer test setup.

When adding a feature, start with the shared types and pure helpers, then wire Electron IPC, then expose the typed preload API, then update hooks/UI, then tests.

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
- Keep high-level composition in `App.tsx`. Move workflow state into hooks, as `useRadarWorkbench` does.
- Use local component state for isolated UI surfaces, as `CommandPalette` does.
- Wrap async workflows in `useCallback` and `useAsyncAction` when the UI needs pending state.
- Use `useMemo` for derived values that are reused by render.
- Use `useEffect` for subscriptions, polling, keyboard shortcuts, and startup loads. Always return cleanup functions for timers and listeners.
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
- AI output is prepare-only. It may load drafts or prepare navigation, but it must not transmit requests or navigate without user confirmation.
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
- Reserve `src/styles.css` for tokens, base element styles, the bureau shell texture (`.radar-shell`), scrollbars, and shared keyframes. Do not add new page-level or component selector blocks there.
- Use `@layer base` and `@layer components` sparingly — only for truly global concerns that cannot live in a component.

### shadcn-style components

- Use `cn()` from `src/lib/utils.ts` (`clsx` + `tailwind-merge`) to merge class names.
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
- React components use PascalCase.
- Hooks start with `use`.
- Types use PascalCase and describe the domain object, not implementation details.
- IPC channels use lowercase `domain:action`.
- Test names should describe behavior: `blocks preview without captures`, `normalizes method and strips hop-by-hop headers`.

## Future Development Checklist

Before considering a change complete:

- Shared contracts are updated first if data crosses renderer/main boundaries.
- Core behavior is expressed as small, functional helpers instead of class-based abstractions.
- No new `: any` annotations are introduced; untrusted values use `unknown` and are narrowed before use.
- Electron handlers validate, clamp, and normalize untrusted inputs.
- Renderer code remains Electron-free except for `window.radar`.
- User actions are explicit and reversible where practical.
- Security-sensitive defaults fail closed.
- Tests cover new behavior and the most likely failure path.
- New UI uses Tailwind utilities and shadcn-style components; theme tokens stay in `@theme`, not ad-hoc CSS classes.
- `pnpm lint`, `pnpm test:unit`, and `pnpm build` pass, or any inability to run them is documented.
