# Repository instructions

These instructions apply to the entire Radar repository.

## Required references

- Read and follow `docs/CODE_CONVENTIONS.md` before making code changes.
- Follow the product and design direction documented in `README.md`, especially the Design section.
- Use `docs/USER_GUIDE.md` as the canonical user-facing workflow guide.

## Engineering standards

- Keep renderer, Electron main process, and shared contracts separated by their existing boundaries.
- Put cross-runtime types and pure helpers in `shared/`; keep renderer code in `src/`; keep filesystem, proxy, browser, replay, and AI provider work in `electron/`.
- Treat Electron IPC as the security boundary. Validate, clamp, normalize, and fail closed at boundaries.
- Write strict TypeScript with named exports, `import type`, serializable IPC payloads, and no new `: any` annotations.
- Prefer functional code: small pure helpers, explicit data objects, immutable inputs, early returns, and side effects isolated at the edges.
- Keep Radar local-first. Do not introduce cloud behavior except where the user explicitly configures AI.
- Scope, allowlist, raw-context opt-in, replay caps, and user-confirmed actions are product safety requirements.
- Add or update focused tests in the same change as behavior changes, especially for security, scope, IPC, provider normalization, and user-visible workflows.

## Feature mode contract

- Design every user-facing feature for two paths: Manual-First human operation and AI-First tool calling.
- Manual-First is the human mode. It should remain the direct, operator-driven way to use the app, with clear controls, visible state, and no hidden automation.
- AI-First should use bounded tool calls that reuse the same typed contracts, validation, scope checks, replay caps, audit logging, and user-visible state as the manual workflow.
- When the user prompts AI-First, the agent should use the app in front of the user: switch visible tabs, inspect visible evidence, load drafts into visible controls, record timeline entries, and expose state changes as they happen.
- Avoid invisible background AI workflows for user-facing actions. If a background step is unavoidable, surface its status, result, and next user-visible effect in the AI-First console.
- When adding a feature, decide whether AI-First needs a new tool, a new tool parameter, or read-only context exposure. Do not bolt on separate AI-only behavior that bypasses the normal app model.
- If a feature is not appropriate for AI-First, document why in the change notes and keep Manual-First behavior complete.

## Frontend and design standards

- Build UI that feels specific to Radar's defensive security workbench context, not a generic SaaS template.
- Use distinctive typography. Avoid generic font choices such as Arial, Inter, Roboto, or system font stacks unless maintaining an existing narrow surface that already requires them.
- Commit to a cohesive theme with CSS variables and sharp accent colors. Avoid timid, evenly distributed palettes and overused purple-gradient-on-white aesthetics.
- Keep theme tokens and shared keyframes in `src/styles.css`; style components primarily with Tailwind utilities and the existing shadcn-style primitives.
- Use motion intentionally: page-load reveals, staggered timing, hover/focus states, and high-impact transitions should support operator clarity rather than distract.
- Prefer asymmetric, dense, console-like composition with strong hierarchy, useful negative space, and contextual details such as texture, borders, shadows, and telemetry.
- Do not add decorative effects that obscure evidence, harm selection readability, or make request/response inspection harder.
- Use `lucide-react` icons for actions and status markers when an appropriate icon exists.

## Documentation requirements

After adding or changing a user-facing feature, update documentation in the same change:

- Update `README.md` when the feature changes the product surface, install/run instructions, screenshots, stack, design notes, or high-level workflows.
- Update `docs/USER_GUIDE.md` when the feature changes how a user installs, launches, configures, navigates, captures, replays, scopes, analyzes, exports, or troubleshoots Radar.
- When completing roadmap work, update `README.md`, `docs/ROADMAP.md`, and `docs/USER_GUIDE.md` in the same change so shipped behavior and remaining work stay distinct.
- Update `docs/CODE_CONVENTIONS.md` when the change introduces or modifies an engineering convention.
- If screenshots become outdated, run `pnpm screenshots` and include the refreshed assets.
- If a feature is intentionally internal-only and has no user-facing behavior, note that no README or user-guide change was needed.

## Verification checklist

Before considering a change complete:

- Relevant shared contracts, IPC handlers, preload APIs, hooks/UI, and tests are updated together.
- Manual-First usage is complete, and AI-First tool-calling impact has been implemented or explicitly ruled out.
- New behavior has focused tests for the main path and likely failure path.
- Documentation requirements above are satisfied.
- Run `pnpm lint`, `pnpm test:unit`, and `pnpm build` when practical, or document why a command could not be run.
