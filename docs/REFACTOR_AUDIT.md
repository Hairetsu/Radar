# Radar Repository Refactor Audit

Date: 2026-07-26

## Purpose

This audit identifies files whose size, responsibility count, state surface, or coupling makes Radar harder for a human to understand safely. The goal is not to split files mechanically. The goal is to make each file answer one clear question.

For renderer code, the preferred end state is:

- A `.tsx` file contains one exported React component, its props type, and component-specific variants only.
- Pure transformations and formatters live in a sibling `.model.ts`, `.presentation.ts`, or `shared/` module.
- Stateful workflows and async actions live in a focused hook.
- A large view is composed from named panel components instead of one long JSX function.
- Cross-domain coordination happens in a thin composition root through typed ports.

Small shadcn-style primitives are a reasonable exception when a `cva` definition is inseparable from the component it styles.

## Implementation Status

Updated: 2026-07-26

This document began as a baseline audit. The refactor has now been executed across the highest-risk composition roots while preserving the existing `RadarApi`, IPC channel names, Manual-First workflows, and AI-First safety boundaries.

### Completed In This Pass

| Area | Before | Current result |
| --- | ---: | --- |
| Workbench composition | `useRadarWorkbench.ts` was 2,611 lines with duplicated agent/session implementations | 291-line composition root; feature state lives in focused browser, identity, search, sitemap, project, advanced, saved-filter, session, polling, hydration, and agent hooks |
| App composition | `App.tsx` was 702 lines and owned view routing, overlays, menus, and selection workflows | 228-line shell composed from `WorkbenchViewRouter`, `WorkbenchActionBar`, `WorkbenchOverlays`, `GlobalSearchOverlay`, and focused interaction hooks |
| Local persistence | `localStore.ts` was a 2,749-line schema/repository closure | 529-line compatibility facade over schema, migrations, row mappers, transactions, and 11 feature repositories in `electron/store/` |
| Agent runtime | `runtime.ts` was 2,434 lines; `callTool` was 680 lines and `execute` was 387 lines | 550-line lifecycle facade; execution, planning, recovery, evidence, capability accounting, run state, and capability-family tool dispatch live in dedicated modules; no major runtime function exceeds roughly 150 lines |
| Electron IPC | 135 handlers were declared directly in `electron/main.ts` | All 135 handlers live in 13 domain registrars under `electron/ipc/`, each receiving an explicit operations object |
| Electron controllers | Automate, workflow, plugin, artifact, identity, replay, and page-inspection logic lived in `electron/main.ts` | Dedicated functional controllers under their feature directories; `electron/main.ts` reduced from 4,735 to 2,917 lines |
| Renderer API contract | One 134-method `RadarApi` interface | 22-line compatibility intersection over six domain interfaces in `shared/api/` |
| Test bridge setup | `src/test/setup.ts` contained a 731-line inline API implementation | 9-line setup using reusable typed `createRadarApiStub(overrides)` support |
| Component support logic | Presentation helpers, local workflow state, and header actions lived beside large views | Presentation/model helpers and stateful controllers moved to sibling modules and hooks; every retained `*ViewActions` component has its own file |
| Shared primitives | Seven exported components shared `primitives.tsx` | One component per file with a compatibility barrel |
| Presentation utilities | `src/lib/presentation.ts` contained 33 cross-domain exports | Compatibility barrel over seven domain presentation modules |
| Repository hygiene | Competing stale npm lockfile and a completed local-path Cursor plan | Removed `package-lock.json`, ignored accidental regeneration, archived the cleaned plan, and added `docs/README.md` |
| Build output | One 660.09 kB renderer chunk emitted a Vite size warning | Stable `react`, `icons`, and `radar-domain` chunks; largest application chunk is 427.58 kB with no size warning |

The large renderer view files that remain are now predominantly presentation components. They were not split solely to satisfy a line-count target: state and transformations were extracted where that produced a named responsibility, while cohesive operator layouts were kept intact.

### Intentionally Remaining Follow-Up

The following findings remain valid but are not required to preserve the new architectural boundaries:

- `electron/main.ts` is substantially smaller and contains no direct IPC handlers, but it still owns application/window lifecycle, hot capture ledgers, intercept/proxy lifecycle, managed Chrome/CDP observation, and browser process state. The next safe extractions are `captureLedger`, `interceptController`, `proxyController`, `managedBrowser`, and `cdpObserver`; these should move with focused controller tests rather than through a mechanical line split.
- Large presentation-only views can be divided into named visual panels when those panels next change. The main candidates remain Findings, Automate, Identity Lab, Traffic, Repeater, Workflows, Advanced, Plugins, AI Operations, and Project Artifacts.
- The broad P1 shared algorithm files (`advancedTesting`, `workflows`, `identityLab`, `automate`, `globalSearch`, `findings`, `agentMission`, and `agentCapabilities`) remain coherent compatibility modules. Split one domain and its tests at a time to avoid a repository-wide import rewrite.
- `electron/agent/planner.ts`, `electron/agent/tools.ts`, `electron/playwrightBrowser.ts`, and `electron/screenshotPreload.ts` remain the next Electron P1 candidates.
- The largest test suites still need behavior-based file splits. Their production seams now exist, so this is organizational follow-up rather than a prerequisite for safe feature work.
- `shared/domain.ts` and `shared/agent-types.ts` remain type-only navigation bottlenecks. Feature type files with compatibility re-export barrels are still recommended.

No README or `docs/USER_GUIDE.md` change is required: this pass is internal-only and does not change installation, navigation, operator controls, product behavior, or the Manual-First/AI-First contract.

### Verification

- `pnpm lint`: passed with zero warnings and zero errors
- `pnpm test:unit`: passed, 85 files and 657 tests
- Unit coverage: 95.17% statements, 85.43% branches, 96.84% functions, and 95.61% lines
- `pnpm build`: passed TypeScript app compilation, Electron compilation, and the Vite production build
- Focused agent-runtime verification: passed, 32 tests
- Production renderer chunks: 427.58 kB application, 142.93 kB React, 75.60 kB Radar domain, and 30.98 kB icons; no Vite chunk-size warning

## Scope And Method

The review covered the complete tracked repository:

- 325 tracked files, excluding `.git`, dependency folders, and generated build/coverage output
- 156 production TypeScript, TSX, and CSS files
- 52,358 production lines in `src/`, `electron/`, and `shared/`
- 103 unit, regression, and test-support files totaling 21,524 lines
- Root configuration, CI, scripts, plugin examples, and documentation

The audit used repository-wide file and line inventories, TypeScript AST outlines, function-size and branch counts, hook/state counts, import-graph analysis, call-site searches, and focused inspection of every large or high-coupling file.

Baseline verification:

- `pnpm test:unit`: passed, 85 files and 657 tests
- `pnpm build`: passed
- `pnpm lint`: completed with 52 warnings and no errors
- Internal import cycles: none
- Renderer imports of Electron or Node APIs: none
- New or existing `: any`, `as any`, `ts-ignore`, or ESLint suppression markers: none

The test coverage and runtime boundaries are strong. The refactor should preserve them rather than redesign behavior.

## Executive Summary

The repository has four immediate refactor targets:

1. `src/hooks/useRadarWorkbench.ts` is still a monolithic application controller despite a recent partial domain-hook extraction.
2. `electron/main.ts` owns almost every main-process responsibility and all 135 IPC handlers.
3. `electron/localStore.ts` contains the entire schema, mapping layer, and 83-method public persistence API in one closure.
4. `electron/agent/runtime.ts` combines the agent state machine, policy/capability accounting, tool dispatch, evidence analysis, and execution loop.

The renderer split was only partially completed. `useAgentDomain.ts` and `useSessionOrchestrator.ts` are exported but never called. Every one of their direct bindings still exists in `useRadarWorkbench.ts`:

- `useAgentDomain.ts`: 33 of 33 bindings duplicated
- `useSessionOrchestrator.ts`: 28 of 28 bindings duplicated

This is the first issue to resolve because it creates parallel implementations and is the source of all 52 current lint warnings.

The next tier is composed of large UI files and broad shared-domain modules. Most have good internal naming and test coverage, so they should be split along their existing domain seams without changing behavior.

## Priority Definitions

- **P0 — refactor first:** A central source of duplicated behavior, unsafe change radius, or severe coordination complexity.
- **P1 — refactor next:** A large multi-responsibility feature file that regularly slows comprehension and review.
- **P2 — opportunistic:** Coherent today, but large enough that the next feature should begin with an extraction.
- **Keep:** The file is small, focused, generated data, a deliberate boundary map, or otherwise clearer as one unit.

## P0 Findings

### 1. Finish The Workbench Extraction

Files:

- `src/hooks/useRadarWorkbench.ts` — 2,611 lines
- `src/hooks/workbench/useSessionOrchestrator.ts` — 695 lines
- `src/hooks/workbench/useAgentDomain.ts` — 607 lines

Evidence:

- `useRadarWorkbench` is a 2,450-line function.
- It contains 52 `useState`, 68 `useCallback`, 15 `useMemo`, 7 `useEffect`, and 1 `useRef` calls.
- Its return object has 171 direct entries, including domain spreads.
- Lint reports all 52 repository warnings in this file.
- `useAgentDomain` has no runtime call site; it is only re-exported from `src/hooks/workbench/index.ts`.
- `useSessionOrchestrator` has no runtime call site; it is only re-exported from the same barrel.
- `SessionOrchestratorPorts` has 67 setter-oriented members, so using it unchanged would move the monolith rather than remove it.
- `AgentDomainPorts` has 29 members.

Refactor:

1. Replace the duplicated agent section in `useRadarWorkbench` with `useAgentDomain`.
2. Divide the current session orchestrator before integrating it:
   - `useProjectSessionDomain` owns project/profile/session state and explicit user actions.
   - `useWorkbenchHydration` applies a loaded context through domain-level `hydrate` or `reset` ports.
   - `useWorkbenchPolling` owns capture, browser, proxy, intercept, run, and evidence refresh intervals.
3. Add focused domains for the state still directly owned by the root:
   - `useBrowserDomain`
   - `useGlobalSearchDomain`
   - `useProjectArtifactsDomain`
   - `useAdvancedDomain`
   - `useIdentityDomain`
   - `useSitemapDomain`
4. Return grouped controllers such as `workbench.traffic`, `workbench.agent`, and `workbench.project` instead of continuing to expand one flat 171-entry object.
5. Leave `useRadarWorkbench` responsible only for instantiating domains, connecting typed ports, and exposing the composed public model.

Acceptance:

- No duplicated agent or project/session implementation remains.
- `useRadarWorkbench.ts` is ideally below 300 lines and contains no feature-owned `useState`.
- `SessionOrchestratorPorts` is replaced by small domain operations rather than dozens of raw setters.
- `pnpm lint` has zero hook-dependency warnings.
- Existing App, domain, and regression tests remain green.

### 2. Make Electron Main A Bootstrap And Registration Root

File: `electron/main.ts` — 4,735 lines

Evidence:

- 135 `ipcMain.handle` registrations
- 152 top-level functions
- 26 top-level mutable variables
- 46 imports
- Responsibilities include window lifecycle, local context, HTTP capture, CDP observation, WebSocket capture, intercept, proxy/CA, managed Chrome, Playwright actions, legacy auth snapshots, Identity Lab, Automate, replay, workflow execution, plugins, findings, bundles, handoff, AI, agent construction, and every IPC boundary.
- High-risk functions include `attachDebugger` at 170 lines, `applyBundleImport` at 138 lines, `handleChromeObserverEvent` at 134 lines, and `runAutomateSession` at 119 lines.

Refactor into functional modules:

```text
electron/
  main.ts
  app/
    createWindow.ts
    runtimeState.ts
  browser/
    managedBrowser.ts
    cdpObserver.ts
    pageInspection.ts
  capture/
    captureLedger.ts
    websocketLedger.ts
  intercept/
    interceptController.ts
    proxyController.ts
  automate/
    automateRunner.ts
  identity/
    identityController.ts
  workflows/
    workflowRunner.ts
  project/
    bundleController.ts
    handoffController.ts
  ipc/
    registerLocalIpc.ts
    registerBrowserIpc.ts
    registerEvidenceIpc.ts
    registerTestingIpc.ts
    registerProjectIpc.ts
    registerAiIpc.ts
```

Each registrar should receive an explicit dependency object. Validation and normalization must remain in the IPC registrar or a boundary normalizer, not drift into the renderer or become implicit inside a controller.

Acceptance:

- `electron/main.ts` initializes application state, registers domain IPC modules, creates windows, and handles shutdown.
- Domain operations are callable directly in focused tests without booting the whole main module.
- No registrar reaches into unrelated module-level mutable state.
- IPC channel names and the `RadarApi` contract remain unchanged during the structural refactor.

### 3. Split The Local Store By Schema, Mapping, And Repository

File: `electron/localStore.ts` — 2,749 lines

Evidence:

- `openLocalStore` is a 2,002-line closure.
- It declares 100 local functions and returns 83 public methods.
- Schema creation/migration, row types, JSON parsing, row-to-domain mapping, transaction handling, project/session context, and every feature repository share one file.
- Changes to an isolated feature require navigating the entire database surface.

Refactor:

```text
electron/store/
  localStore.ts
  schema.ts
  migrations.ts
  transactions.ts
  rowMappers/
    captures.ts
    agentRuns.ts
    identity.ts
  repositories/
    projects.ts
    evidence.ts
    repeater.ts
    automate.ts
    findings.ts
    workflows.ts
    plugins.ts
    agents.ts
```

Keep a functional `openLocalStore` facade that composes repository functions over one `DatabaseSync` instance. Do not introduce repository classes or a service container. Preserve `runImmediateTransaction` as the common transaction boundary.

Acceptance:

- The schema version and ordered migrations have one owner.
- Row parsing is separated from SQL mutations.
- Each repository accepts the database handle and returns named functions.
- The public `LocalStore` facade can remain compatible while callers migrate.
- Existing migration, rollback, identity isolation, and performance tests continue to pass.

### 4. Divide The Agent Runtime State Machine From Tool Execution

File: `electron/agent/runtime.ts` — 2,434 lines

Evidence:

- `AgentRuntime.callTool` is 680 lines.
- `AgentRuntime.execute` is 387 lines.
- The file mixes run lifecycle, durable checkpoints, capability leases and receipts, auth drift, tool dispatch, browser result correction, evidence analysis, finding normalization, tutorial pacing, and planner-loop control.
- `AgentRuntime` is a broad application class even though the repository conventions prefer functional code and thin edge wrappers.

Refactor:

```text
electron/agent/
  runtime.ts                 thin public facade
  executionLoop.ts
  runLifecycle.ts
  checkpoint.ts
  capabilityRuntime.ts
  evidenceContext.ts
  toolExecution/
    browserTools.ts
    evidenceTools.ts
    interceptTools.ts
    repeaterTools.ts
    automateTools.ts
    workflowTools.ts
    projectTools.ts
```

`callTool` should become a small registry dispatch to independently tested executors. The execution loop should consume an executor result without knowing the implementation of each tool. Pure header/cookie/CORS observations should move to shared analyzers or a focused runtime evidence module.

The class can remain temporarily as a compatibility facade, but it should stop owning domain algorithms.

Acceptance:

- No single runtime function exceeds roughly 150 lines.
- Tool executors are grouped by capability family and tested directly.
- Capability authorization, reservation, finalization, and revocation remain a single explicit sequence.
- Retry and mutation rules remain fail-closed.

## Renderer Component Findings

### Target Component Shape

Every view currently exports its header action component from the same file as the view. For a strict component-only layout, move each `*ViewActions` component into its own file. Split `src/components/radar/primitives.tsx` into one component per file with an `index.ts` barrel.

Large component findings:

| Priority | File | Lines | Main readability problem | Suggested extraction |
| --- | ---: | ---: | --- | --- |
| P1 | `src/components/views/FindingsView.tsx` | 907 | 781-line component, 16 local state values, list/filter/editor/retest/report concerns | `FindingsList`, `FindingFilters`, `FindingEditor`, `FindingEvidenceEditor`, `FindingMergeQueue`, `FindingReportBuilder`; move report state to `useFindingReportDraft` |
| P1 | `src/ai/CommandPalette.tsx` | 818 | 732-line component combines task controller, skill CRUD, context selection, keyboard lifecycle, audit, and three steps | `useCommandPaletteController`, `TaskStep`, `PacketPicker`, `PreviewStep`, `ResultStep`, `SkillEditor`, `AuditPanel`; move class helpers to presentation module |
| P1 | `src/components/IdentityLab.tsx` | 741 | 494-line component plus 15 data/format helpers | Move request comparison and matrix presentation to `identityLabPresentation.ts`; split profile form, roster, attribution ledger, matrix, and comparison panels |
| P1 | `src/components/views/AutomateView.tsx` | 671 | 576-line component and about 46 workbench fields | Marker editor, payload library, run controls, rule editor, result table, result detail, cluster summary |
| P1 | `src/components/shell/AiOperationsDrawer.tsx` | 640 | 522-line component; resize hook is declared in the component file; run setup/history/memory/recovery/timeline all share one render | Move `useAiOperationsDrawerLocalState` to hooks; split drawer header, run setup, history, budget strip, recovery, memory, and timeline sections |
| P1 | `src/components/views/WorkflowsView.tsx` | 585 | 502-line component combines catalog, definition editor, graph, dry run, revisions, run history, and results | One component per panel plus a small `useWorkflowEditorDraft` hook |
| P1 | `src/components/views/TrafficView.tsx` | 546 | 437-line component combines filter bar, bulk actions, list, detail, annotations, and evidence actions | `TrafficFilterBar`, `TrafficBulkActions`, `TrafficList`, `TrafficDetail`, `EvidenceAnnotationEditor` |
| P1 | `src/components/views/RepeaterView.tsx` | 540 | 437-line component with about 40 workbench fields | `RepeaterTabs`, `RequestEditor`, `ReplayControls`, `BurstPanel`, `ReplayResponse`, `ReplayHistory`, `ReplayDiff`, `WebSocketReplayPanel` |
| P1 | `src/components/shell/ProjectArtifactsOverlay.tsx` | 540 | Notes, saved views, bundle import/export, and handoff packaging in one component | Four feature panels with an overlay shell; state/actions should come from `useProjectArtifactsDomain` |
| P1 | `src/components/views/AdvancedView.tsx` | 503 | One view renders several unrelated advanced-analysis families | GraphQL, API import, auth matrix, parameter, secret, header, proxy, and Identity Lab panels |
| P1 | `src/components/views/PluginsView.tsx` | 481 | Install preview, registry, permissions, panel rendering, SDK console, developer validation, and audit | One component per operator workflow |
| P1 | `src/components/AgentMissionGraph.tsx` | 427 | Graph transformation, glyph selection, editing controls, and visualization in one file | Move graph-node derivation to a pure model; split node list, coverage, questions, and steering editor |
| P2 | `src/components/views/WebSocketView.tsx` | 381 | Selection, filters, frame list, details, annotations, replay, and finding action | Frame filter/list/detail/annotation components and `useWebSocketSelection` |
| P2 | `src/components/views/InterceptView.tsx` | 369 | Rule editors, queue, request editor, response editor, and resolution controls | Rules panel, queue list, request editor, response editor |
| P2 | `src/components/ProfileSessionPanel.tsx` | 301 | Profile management and session management share one long component | `ProfileManager` and `SessionManager` |
| P2 | `src/ai/AiSettingsPanel.tsx` | 278 | Provider configuration, presets, model selection, status, and actions | Provider fields and connection actions as named subcomponents |
| P2 | `src/components/AgentCapabilityLedger.tsx` | 247 | Lease templates, expiry formatting, request editor, ledger, and receipt details | Move template data/formatting out; split proposal form from ledger |

Small component-only cleanups:

- `src/components/AgentThoughtstream.tsx`: move four timeline formatting helpers to a presentation module.
- `src/components/AgentTutorialGuide.tsx`: move disposition, lesson, and readiness helpers to a presentation module.
- `src/components/shell/Sidebar.tsx`: move view icons/groups into `viewMeta.ts` or a sibling navigation model.
- `src/components/radar/primitives.tsx`: split its seven exported components and keep a barrel.
- Every `src/components/views/*View.tsx`: move `*ViewActions` to its own component file.

Files that are already appropriately focused:

- `src/components/AppearanceSettingsPanel.tsx`
- `src/components/NewSessionDialog.tsx`
- `src/components/shell/AgentMissionDock.tsx`
- `src/components/shell/AiFirstChrome.tsx`
- `src/components/shell/BrowserToolbar.tsx`
- `src/components/shell/ConsoleControls.tsx`
- `src/components/shell/PanelHeader.tsx`
- `src/components/shell/TelemetryTicker.tsx`
- `src/components/shell/WorkspaceHeader.tsx`
- `src/components/views/ScopeView.tsx`
- `src/components/views/SitemapView.tsx`
- `src/components/views/SslView.tsx`
- `src/components/ui/button.tsx`
- `src/components/ui/input.tsx`
- `src/components/ui/select.tsx`
- `src/components/ui/textarea.tsx`

`RequestContextMenu.tsx` is near the upper end at 190 lines but remains one coherent component.

## App Composition Finding

File: `src/App.tsx` — 702 lines

`App.tsx` technically contains only one component, but that component still owns too many UI workflows:

- Global search state handoff and the complete global search overlay markup
- Request context-menu state and clipboard/delete/scope actions
- Header action routing for every view
- View routing for all twelve views
- WebSocket selection state
- Finding report and workflow action refs
- Every application overlay and settings dialog
- The complete AI drawer prop adapter

Refactor into:

- `GlobalSearchOverlay.tsx`
- `WorkbenchActionBar.tsx`
- `WorkbenchViewRouter.tsx`
- `WorkbenchOverlays.tsx`
- `useRequestContextMenu.ts`
- `useWebSocketSelection.ts`

Then `App` should only compose shell, active view, AI chrome, overlays, and telemetry.

All views are eagerly imported. The production build currently emits a 660.09 KB JavaScript chunk and warns about the 500 KB threshold. Lazy-loading large view modules and heavy AI/Identity surfaces after the component split should reduce the initial chunk without changing the local-first model.

## Renderer Hook Findings

| Priority | File | Lines | Finding |
| --- | ---: | ---: | --- |
| P0 | `src/hooks/useRadarWorkbench.ts` | 2,611 | Central monolith and duplicated partial extraction; detailed above |
| P0 redesign | `src/hooks/workbench/useSessionOrchestrator.ts` | 695 | Unused, duplicates root logic, and accepts a 67-member setter port |
| P0 integrate | `src/hooks/workbench/useAgentDomain.ts` | 607 | Unused; all 33 direct bindings remain duplicated in root |
| P2 | `src/hooks/workbench/useAutomateDomain.ts` | 426 | Coherent domain but owns marker editing, payload storage, session lifecycle, filtering, and promotion; split if the next Automate feature lands |
| P2 | `src/hooks/workbench/useRepeaterDomain.ts` | 333 | Coherent but broad; separate tab persistence from request execution/history if extended |
| P2 | `src/hooks/workbench/useTrafficDomain.ts` | 330 | Separate query/filter state from bulk evidence mutations if extended |
| P2 | `src/hooks/workbench/useFindingsDomain.ts` | 266 | Keep for now; report/export state belongs in its own hook rather than being added here |
| P2 | `src/hooks/workbench/useInterceptDomain.ts` | 255 | Keep for now; rule editing can split from queue/draft control when changed |
| P2 | `src/hooks/useAiConnection.ts` | 211 | Separate settings persistence from live probe/connect/model discovery if more providers are added |
| P2 | `src/hooks/workbench/usePluginsDomain.ts` | 208 | Separate install lifecycle from runtime/audit if plugin features grow |

The smaller shell, scope, SSL/proxy, WebSocket, and workflow hooks are focused enough today.

## Electron And Runtime Findings

| Priority | File | Lines | Finding and extraction |
| --- | ---: | ---: | --- |
| P0 | `electron/main.ts` | 4,735 | Bootstrap, state, controllers, domain operations, and 135 IPC handlers; detailed above |
| P0 | `electron/localStore.ts` | 2,749 | Schema, mappers, transactions, and 83-method facade; detailed above |
| P0 | `electron/agent/runtime.ts` | 2,434 | Agent state machine and all tool execution; detailed above |
| P1 | `electron/agent/planner.ts` | 656 | `compactToolResult` is 176 lines and `normalizeToolCall` is 200; split prompt/context compaction from untrusted decision normalization |
| P1 | `electron/agent/tools.ts` | 588 | Tool schemas and a 217-line normalizer switch; use one schema/normalizer module per tool family and compose the registry |
| P1 | `electron/playwrightBrowser.ts` | 595 | A coherent adapter, but its 460-line controller factory should delegate page scripts, lifecycle/reconnect, and action methods to focused modules |
| P1 | `electron/screenshotPreload.ts` | 957 | Screenshot data and a full mutable `RadarApi` implementation are combined; extract screenshot fixtures and reuse a typed Radar API stub builder |
| P2 | `electron/demoProject.ts` | 746 | Mostly fixture data, not algorithmic complexity; split by evidence/findings/workflows/agent fixture only when editing becomes painful |
| P2 | `electron/ai/cursorCli.ts` | 398 | Duplicates process-buffer, executable-discovery, and timeout mechanics from `codexCli.ts`; extract a provider-neutral CLI process runner |
| P2 | `electron/ai/codexCli.ts` | 256 | Keep Codex-specific arguments/prompts here after extracting shared process mechanics |

The remaining Electron AI, plugin, browser discovery, certificate, and capture attribution modules are reasonably focused.

`electron/preload.ts` is intentionally a thin one-to-one IPC map. Its 141 lines should not be split merely for size; keeping one auditable map is useful.

## Shared Domain Findings

### Broad Utility Modules To Split

| Priority | File | Lines | Existing responsibilities | Suggested modules |
| --- | ---: | ---: | --- | --- |
| P1 | `shared/advancedTesting.ts` | 1,298 | GraphQL, OpenAPI/Postman, auth matrix, parameter discovery, sensitive data, header behavior, proxy guidance, workflow drafts | `advanced/graphql.ts`, `apiImport.ts`, `authMatrix.ts`, `parameters.ts`, `sensitiveData.ts`, `headerBehavior.ts`, `workflowDrafts.ts` |
| P1 | `shared/workflows.ts` | 1,282 | Normalize/parse, built-ins, graph, validation, diff, passive checks, active results, run records, finding promotion | `workflows/definition.ts`, `parser.ts`, `builtins.ts`, `validation.ts`, `diff.ts`, `passiveEvaluation.ts`, `activeResults.ts`, `runs.ts` |
| P1 | `shared/identityLab.ts` | 918 | Contract normalization, evidence normalization, matrix, invariants, sequences, comparison | `identityLab/normalization.ts`, `matrix.ts`, `invariants.ts`, `sequences.ts`, `comparison.ts` |
| P1 | `shared/automate.ts` | 873 | Markers, payload sets, rule normalization/evaluation, result shaping, clustering, sessions | `automate/markers.ts`, `payloadSets.ts`, `rules.ts`, `results.ts`, `clusters.ts`, `sessions.ts` |
| P1 | `shared/globalSearch.ts` | 866 | Query parser, filter matcher, candidate builders for every product domain, final search | `globalSearch/query.ts`, `match.ts`, domain candidate modules, `search.ts` |
| P1 | `shared/findings.ts` | 864 | Normalization, templates, evidence refs, filtering, merges, retest, Markdown/HTML reports | `findings/normalization.ts`, `templates.ts`, `evidence.ts`, `filtering.ts`, `merge.ts`, `retest.ts`, `report.ts` |
| P1 | `shared/agentMission.ts` | 818 | Mission normalization, update patches, evidence validation, steering | `agentMission/normalization.ts`, `patches.ts`, `evidence.ts`, `steering.ts` |
| P1 | `shared/agentCapabilities.ts` | 720 | Normalization, proposal/grant/revoke, receipts, authorization | `agentCapabilities/normalization.ts`, `leases.ts`, `receipts.ts`, `authorization.ts` |
| P2 | `shared/trafficQuery.ts` | 591 | Tokenizer, parser, evaluator, filtering, examples | `trafficQuery/tokenize.ts`, `parse.ts`, `evaluate.ts`, plus a barrel |
| P2 | `shared/causalEvidence.ts` | 556 | Sanitization, action windows, capture/DOM classification, chain construction | `causalEvidence/sanitize.ts`, `classify.ts`, `chains.ts` |
| P2 | `shared/projectBundle.ts` | 517 | Bundle construction/serialization and import parsing/preview | Separate export and import modules |
| P2 | `shared/plugins.ts` | 469 | Manifest normalization, permissions, compatibility, install-state normalization | Separate manifest/schema from permissions and installed-state logic |
| P2 | `src/lib/presentation.ts` | 384 | 33 presentation exports across most domains | Domain presentation files re-exported from `src/lib/index.ts` |

### Type Contract Files

`shared/domain.ts` is 867 lines and is imported by 45 internal modules. `shared/agent-types.ts` is 871 lines and is imported by 20 internal modules. They are type-only files and therefore not runtime-complex, but they are navigation bottlenecks.

Split them by feature while preserving compatibility barrels:

```text
shared/types/
  evidence.ts
  local.ts
  browser.ts
  intercept.ts
  repeater.ts
  automate.ts
  findings.ts
  workflows.ts
  plugins.ts

shared/agent/
  runTypes.ts
  toolTypes.ts
  missionTypes.ts
  capabilityTypes.ts
  tutorialTypes.ts
  memoryTypes.ts
```

Keep `shared/domain.ts` and `shared/agent-types.ts` temporarily as type-only re-export barrels so the split does not force one enormous import rewrite.

`shared/radar-api.ts` is only 228 lines, but its single interface has 134 methods. Divide it into domain interfaces and define `RadarApi` as their intersection. This will make IPC ownership clearer and enable domain-sized mocks.

The smaller pure shared helpers are already appropriately scoped. In particular, allowlist, URL, headers, draft, replay variables/transforms, redaction, evidence tags, endpoint inventory, session diff, and WebSocket replay modules should remain small standalone files.

## Test And Fixture Findings

| Priority | File | Lines | Refactor |
| --- | ---: | ---: | --- |
| P1 | `src/App.test.tsx` | 2,226 | Split by visible feature. Move view behavior to colocated view tests after the components are extracted; keep only shell composition and cross-view workflows in `App.test.tsx` |
| P1 | `electron/agent/runtime.test.ts` | 1,742 | Split into lifecycle, capability, recovery, browser tools, evidence tools, replay/Automate, workflows, and context suites |
| P1 | `electron/localStore.test.ts` | 1,736 | Split along the repository boundaries proposed for `localStore.ts`; keep migrations and transaction rollback in dedicated suites |
| P1 | `src/test/setup.ts` | 731 | Replace the 134-method inline API object with `createRadarApiStub(overrides)` and domain fixture builders |
| P2 | `tests/regression/target-lab.ts` | 556 | Split HTTP routes, WebSocket proxy helpers, HTTPS lab, and request client helpers |
| P2 | `shared/globalSearch.test.ts` | 513 | Split with the production candidate modules |
| P2 | `shared/advancedTesting.test.ts` | 483 | Split with GraphQL/import/auth/parameter/header modules |
| P2 | `shared/agentMission.test.ts` | 480 | Split normalization, patching, evidence, and steering tests |

`src/test/setup.ts` and `electron/screenshotPreload.ts` independently implement nearly the full `RadarApi`. A typed stub builder is the highest-value test-support extraction because every future IPC addition currently expands both monoliths.

Most Playwright regression specs are already divided by workflow and remain below 300 lines. Keep that organization.

## CSS And Presentation

File: `src/styles.css` — 828 lines

Most of this file correctly owns theme tokens, global focus/selection rules, shared texture, and keyframes. It should not be split just because it is large; the repository convention explicitly gives those concerns to this file.

There is a smaller mismatch with the convention: component/page-specific selectors such as `.radar-traffic-row`, `.radar-traffic-filter`, `.radar-detail-pane`, and related responsive rules still live globally.

Refactor opportunistically:

- Keep theme variables, base rules, label roles, shell texture, shared surface gradients, focus behavior, and keyframes in `styles.css`.
- Move Traffic-specific grids and responsive behavior into `TrafficView`/`TrafficList` Tailwind utilities or a focused layout constant.
- Move modal-specific classes into the modal components when they can be expressed with existing tokens.
- Do not duplicate theme-specific values in component JSX; components should continue to consume CSS variables.

`src/components/shell/layoutClasses.ts` is a reasonable home for truly shared layout/focus class compositions, but it should not become a second global stylesheet encoded as strings.

## Repository Hygiene And Documentation

### Package Manager Lockfiles

Both `pnpm-lock.yaml` and `package-lock.json` are tracked, while README and CI use pnpm exclusively. The npm lockfile is stale: its root package entry does not include current direct dependencies such as `playwright-core`, `http-proxy-agent`, and `https-proxy-agent`.

Recommendation: keep `pnpm-lock.yaml`, remove `package-lock.json`, and optionally ignore `package-lock.json` to prevent accidental regeneration.

### Completed Planning Documents

`.cursor/plans/ai_first_autonomy_9fba8350.plan.md` is marked complete and describes an earlier, narrower AI-First surface. It includes absolute local paths and now functions as historical material.

Recommendation: remove it or move a cleaned version into `docs/archive/`.

The completed `docs/PHASE_1_*` through `docs/PHASE_8_*` documents are valuable history, but they compete with active roadmaps. Add a short `docs/README.md` that separates:

- Current operator documentation
- Current engineering conventions
- Active roadmap/public-readiness plans
- Completed phase history

`docs/USER_GUIDE.md` is 2,193 lines. It is canonical and internally well-sectioned, so it is not an urgent refactor. If navigation becomes painful, retain it as the canonical index and split detailed chapters into `docs/user-guide/` pages rather than creating competing guides.

### Generated And Example Assets

The following do not need refactoring:

- `docs/screens/*`
- `resources/*`
- `public/favicon.png`
- Plugin example manifests and ten-line panels
- `scripts/build-icon.sh`
- Root TypeScript/Vite/Playwright configurations
- CI and release workflows

## Positive Architecture Findings To Preserve

- No internal import cycles were found.
- Renderer code does not import Electron, filesystem, process, or Node built-ins.
- `electron/preload.ts` remains a thin typed bridge.
- Strict TypeScript is enabled.
- No unsafe `any` annotations or suppression comments were found.
- Shared security helpers are generally pure and well tested.
- Scope, replay normalization, local-first storage, and AI capability checks have focused tests.
- The regression suite is already grouped by operator workflow.
- Unit coverage is high enough to support incremental structural changes.

## Recommended Refactor Sequence

### Phase 1 — Complete The Existing Renderer Split

1. Add direct tests for the existing agent and project/session hooks.
2. Redesign the 67-member session port into project/session, hydration, and polling boundaries.
3. Compose `useAgentDomain` and the redesigned project/session hooks in `useRadarWorkbench`.
4. Extract the remaining root-owned domains.
5. Group the public workbench model by domain.
6. Reach zero lint warnings before moving on.

### Phase 2 — Thin App And Component Files

1. Extract `App` overlays, action routing, view routing, and context-menu state.
2. Split the P1 component files one workflow panel at a time.
3. Move `*ViewActions` into separate files.
4. Introduce lazy imports for large views/AI surfaces and check the production chunk report.
5. Move relevant App tests next to the extracted component or hook.

### Phase 3 — Split Electron Main

1. Extract IPC registrars without changing channel names.
2. Pass explicit dependency objects to registrars.
3. Extract browser/CDP, intercept/proxy, Automate, workflow, plugin, and project-artifact controllers.
4. Keep validation at the IPC boundary and add direct registrar tests for likely failure paths.

### Phase 4 — Split Persistence

1. Extract schema/migrations and row mappers.
2. Extract repositories by workspace/session ownership.
3. Keep the existing `LocalStore` facade until all callers and tests are stable.
4. Split the local-store tests to match repository ownership.

### Phase 5 — Split Agent Runtime

1. Extract tool-family executors from `callTool`.
2. Extract capability runtime and checkpoint handling.
3. Extract the planner execution loop.
4. Keep the existing `AgentRuntime` API as a thin compatibility facade.

### Phase 6 — Split Shared Domain Modules

Split one domain and its colocated tests per change. Preserve barrel exports initially. Avoid a repository-wide import rewrite in the same commit as logic movement.

## Suggested Guardrails

Use these as review signals, not absolute correctness rules:

- One exported component per `.tsx` file, excluding tiny primitive families during migration.
- Component functions above 250–300 lines should require a named-panel extraction discussion.
- Hooks should own one domain and should not expose dozens of raw setters.
- Composition roots should not own feature state.
- IPC registration files should contain boundary normalization and delegation, not full feature implementations.
- Shared files above roughly 500 lines should have one demonstrably cohesive domain.
- Tests above roughly 600 lines should be split by behavior or domain.
- Keep the internal import graph cycle-free.
- Treat hook-dependency warnings as failures; the current warning count should return to zero.

Do not use line limits as a reason to create meaningless fragments. Each extracted file must gain a stable name, responsibility, and test boundary.

## Definition Of Done For This Refactor Program

- `useRadarWorkbench` and `App` are thin composition roots.
- Component files contain presentation rather than domain algorithms or async orchestration.
- `electron/main.ts` is an application bootstrap plus explicit IPC registration.
- `LocalStore` is a composed facade over focused functional repositories.
- Agent tool families are independently readable and testable.
- Shared contracts and algorithms are discoverable by feature.
- Duplicate hook implementations and stale lockfiles are removed.
- `pnpm lint`, `pnpm test:unit`, and `pnpm build` pass without warnings attributable to the refactor.
- Manual-First and AI-First continue to use the same contracts, validation, scope checks, persistence, and visible state.
