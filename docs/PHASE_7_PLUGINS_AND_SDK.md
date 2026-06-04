# Phase 7 - Plugins And SDK

Phase status: Complete

This plan slices roadmap Phase 7 into shippable increments. Manual-First must keep plugin install, permission review, SDK access, and local API actions visible to the operator. AI-First may only use approved plugin capabilities through the same typed contracts, scope checks, replay caps, raw-context policy, workflow limits, audit logging, and visible state as the manual workflow.

## Slice 1 - Manifest And Permission Contracts

Status: Complete

- [x] Add shared plugin contracts for manifests, install previews, installed plugin records, panels, statuses, and granular permissions.
- [x] Normalize local plugin manifests with schema versioning, id/version validation, path safety, permission dedupe, panel caps, and operator-readable permission summaries.
- [x] Add approval helpers that only grant requested permissions and fail closed for disabled, pending, or malformed plugins.
- [x] Add focused tests for malformed manifests, unsafe paths, permission warnings, install normalization, and permission checks.

Exit check: Radar can parse a local plugin manifest, explain requested permissions, and represent an approved plugin without allowing it to execute or access data yet.

## Slice 2 - Local Plugin Install Registry

Status: Complete

- [x] Add Electron-side local plugin discovery from operator-selected directories containing `.radar-plugin/plugin.json` or `plugin.json`.
- [x] Persist installed plugin records per workspace with pending, approved, disabled, and blocked states.
- [x] Add IPC/preload methods for preview, install, approve, disable, remove, and list operations.
- [x] Add tests proving plugin registry state is workspace-local and malformed manifests fail closed.

Exit check: an operator can install, review, approve, disable, and remove a local plugin without Radar executing plugin code.

## Slice 3 - TypeScript SDK And Local API

Status: Complete

- [x] Add a first-party TypeScript SDK package surface for scoped evidence reads, draft finding creation, workflow definition registration, workflow execution requests, and panel messaging.
- [x] Add a constrained local API adapter that maps SDK calls onto existing Radar contracts rather than duplicating capture, replay, finding, or workflow logic.
- [x] Enforce plugin permission checks, scope filtering, replay caps, raw-context policy, and workflow caps at every SDK/local API boundary.
- [x] Add tests for permission denial, scoped capture filtering, finding evidence validation, and workflow/replay cap enforcement.

Exit check: a developer can build a local extension against typed SDK helpers, and every SDK action routes through Radar's existing safety model.

## Slice 4 - Plugin Management And Panels UI

Status: Complete

- [x] Add a Plugins workbench surface or settings panel for install previews, permission prompts, status changes, and installed plugin details.
- [x] Render approved plugin panel inventory with explicit panel permissions; live iframe/webview execution stays behind the SDK permission boundary.
- [x] Surface plugin actions, errors, and permission denials through visible workbench notices and registry state.
- [x] Add renderer tests for install preview, approval, disable/remove, panel listing, and permission copy.

Exit check: operators can manage local plugins and see plugin-provided panels without granting invisible access.

## Slice 5 - First-Party Example Plugins

Status: Complete

- [x] Add example local plugins for JWT helper, GraphQL helper, OpenAPI importer, parameter miner, and report exporter.
- [x] Keep examples minimal, documented, and wired through the same manifest and SDK permissions as third-party local plugins.
- [x] Add smoke tests or fixtures proving examples load and request only the permissions they need.
- [x] Document how extension authors copy, run, and install the examples locally.

Exit check: a developer can start from a working local plugin example without modifying Radar core.

## Slice 6 - AI-First Plugin Visibility

Status: Complete

- [x] Expose approved plugin inventory and permission summaries to AI-First as read-only context.
- [x] Keep AI-First plugin SDK action execution unavailable until live plugin execution is intentionally enabled through visible controls.
- [x] Keep plugin inventory results tied to visible timeline entries; findings and workflows still require existing SDK/API permission boundaries.
- [x] Add policy/runtime tests proving AI cannot approve plugins, widen plugin permissions, bypass scope, or run hidden plugin actions.

Exit check: AI-First can reason about approved local plugins but cannot install, approve, or secretly execute plugin behavior.

## Phase Exit Criteria

From `docs/ROADMAP.md`:

- A developer can build a local extension without modifying Radar core.
- Plugin permissions are visible and enforceable.
- Plugins cannot bypass scope, replay caps, raw-context policy, or local data boundaries.

## Suggested Implementation Order

1. Slice 1 - Manifest And Permission Contracts
2. Slice 2 - Local Plugin Install Registry
3. Slice 3 - TypeScript SDK And Local API
4. Slice 4 - Plugin Management And Panels UI
5. Slice 5 - First-Party Example Plugins
6. Slice 6 - AI-First Plugin Visibility

Manifest validation and permission helpers land before persistence, UI, or execution. The SDK/local API should wrap existing Radar evidence, findings, workflow, and replay contracts instead of creating plugin-only behavior. AI-First stays last so it can only use the same visible plugin registry and approved SDK boundaries as Manual-First.

## Release Mapping

This phase corresponds to roadmap milestone **0.8 - Plugins And SDK**:

- Local plugin manifests and permissions
- Workspace-local plugin install registry
- TypeScript SDK and constrained local API
- Plugin management UI and panels
- First-party example plugins
- AI-First plugin visibility through approved capabilities
