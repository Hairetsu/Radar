# Contributing

Radar is a local Electron workbench. Keep renderer, main-process, and shared contracts on their existing sides of the trust boundary.

## Setup

You need Node.js, pnpm, and a local Chrome, Edge, Brave, or Chromium build.

```bash
pnpm install
pnpm dev
```

Read `docs/CODE_CONVENTIONS.md` before changing code. `docs/USER_GUIDE.md` is the operator workflow. `docs/ROADMAP.md` is the only active plan.

## Pull requests

Open a PR against `main`. Follow `docs/BRANCHING.md`. Do not force-push protected branches.

Every user-facing change needs Manual-First controls and, where the feature is appropriate, AI-First tools that reuse the same typed contracts. If AI-First should not get the feature, say why in the PR.

Update `README.md` and `docs/USER_GUIDE.md` in the same change when operators will see new behavior. Update `docs/CODE_CONVENTIONS.md` when you add a convention.

## Tests

Add focused tests next to the behavior, especially for Scope, IPC, replay limits, provider normalization, and assessment contracts.

Before you consider a change done:

```bash
pnpm lint
pnpm test:unit
pnpm build
```

Refresh screenshots with `pnpm screenshots` when the UI surface changes.

## Safety

Electron IPC is the trust boundary. Validate, clamp, and fail closed there. Do not introduce cloud behavior except where the operator explicitly configures AI. Do not add a general HTTP client, shell, or unsigned plugin path for AI-First.

Paid macOS notarization and Windows Authenticode signing are deferred until certificates exist. Do not add a signing pipeline that pretends those certificates are present.
