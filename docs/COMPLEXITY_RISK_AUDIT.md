# Radar Complexity Refactor And Residual Risk Audit

Baseline audit date: 2026-07-28  
Refactor execution update: 2026-07-31

## Purpose

This document records the 2026-07-31 refactor and ranks the complexity that remains after execution. The current residual ranking appears immediately after the change ledger. The detailed findings later in the document preserve the pre-execution evidence that motivated the work.

This report supersedes the old audit's ranking. The old audit remains useful as historical before/after context, but many of its baseline statements no longer describe the current code.

The ranking is intentionally not based on line count alone. A long fixture or schema can be easier and safer to maintain than a short function that normalizes untrusted model output or grants network authority.

## Refactor Execution Status

This audit is now also the change ledger for the 2026-07-31 execution pass. The ranked evidence below remains the baseline that motivated the work; use this section for current status.

Completed in this pass:

- Corrected architecture documentation in `README.md`, `docs/CODE_CONVENTIONS.md`, and the historical `docs/REFACTOR_AUDIT.md`.
- Preserved the original 90% broad-domain coverage gate and added a separate staged high-risk gate in `vitest.critical.config.ts`. It now instruments agent execution/planning, managed-browser and Playwright lifecycle, scoped Playwright actions and inspection, browser capture adapters, CDP, capture ledgers, intercept, proxy, and renderer agent hooks. The verified result is 75.55% statements, 57.20% branches, 78.82% functions, and 76.79% lines across 21 files and 105 tests, with enforced floors of 73/55/77/74.
- Removed both type-only agent execution cycles by moving `AgentExecutionLifecycle` to `runtimeTypes.ts`.
- Reduced `electron/main.ts` from 2,917 to 1,342 lines. HTTP capture, WebSocket capture, causal attribution, intercept, proxy/CA, Electron debugger capture, managed-Chrome lifecycle/observation, Playwright behavior, and reusable CDP command state now live in focused controllers or ledgers with direct tests.
- Reduced `electron/agent/planner.ts` from 656 lines to a 21-line provider facade. Prompt text, trusted context compaction, and untrusted decision normalization have separate owners, and planner decisions call the canonical runtime tool normalizer.
- Replaced the planner/runtime normalization duplication with one authoritative path. Every public tool-registry descriptor now exposes its schema, safety label, and canonical normalization function together. The 626-line `tools.ts` mixed surface is now a 60-line public registry facade over a 292-line metadata catalog and a 285-line normalization boundary.
- Added a pure, tested agent-timeline-to-renderer-intent projection and split run lifecycle, governance, and run memory into focused hooks. `useAgentDomain.ts` fell from 618 to a 42-line composition hook and no longer interprets raw tool results, performs lifecycle commands, changes governance state, or persists memory itself. The extracted 248-line lifecycle hook has direct main/failure-path tests and 92.43% line coverage in the staged gate.
- Completed the first security-domain decomposition: `shared/agentMission.ts` is a 21-line compatibility barrel over constants, normalization, updates/patches, steering, and validation; `shared/agentCapabilities.ts` is a 25-line compatibility barrel over risk, normalization, leases, receipts, and authorization.
- Reduced `electron/playwrightBrowser.ts` from 595 to 348 lines by extracting constants, scoped actions, and DOM/cookie/storage inspection. Thirteen focused Playwright tests cover helpers, lifecycle, failure paths, scoped actions, and inspection.
- Moved Identity Lab matrix, causal-ledger, and comparison derivation into a pure presentation model, and moved form mutation/submission into a focused hook. `IdentityLab.tsx` fell from 552 to 442 lines.

Still open after this pass:

- `electron/main.ts` still owns window lifecycle, local-context activation, controller construction, finding/report composition, global search assembly, and registrar composition. Browser, proxy, intercept, capture, and causal-attribution feature state no longer live there; the next useful seam is application-context/window lifecycle rather than another browser extraction.
- Agent tool metadata and input normalization now have separate owners behind the public registry facade. The authoritative normalizer remains one exhaustive switch; splitting it by browser, evidence, testing, and project family is a lower-risk follow-up if the tool catalog grows materially.
- The remaining P1 shared domains and broad presentation components retain the current residual ranking below. Mission and capabilities are closed as monolith findings; Identity Lab has completed its logic/state seams but can still be split into named visual panels.
- Store/controller/renderer coverage should continue entering the staged gate as focused tests are added; the new floor is a regression baseline, not the final target.

No `docs/USER_GUIDE.md` update was needed because this pass changed internal architecture and verification only; operator workflows and visible behavior are unchanged.

## Current Residual Ranking After Execution

No residual item is rated P0. The security-boundary duplication, misleading coverage, type-only cycles, browser/proxy/capture global state, and documentation drift that created the original P0 group were addressed in this pass.

| Rank | Priority | Current file | Current evidence and reason | Next seam |
| ---: | :---: | --- | --- | --- |
| 1 | P1 | `electron/main.ts` | 1,342 lines. It is now a composition root, but local-context activation, window lifecycle, report/search assembly, controller construction, and 13 registrar dependency objects still demand broad repository knowledge. | Extract application context/window lifecycle and project search/report operation builders; keep controller composition explicit. |
| 2 | P1 | `shared/workflows.ts` | 1,282 lines and 32 exports. Definition parsing, built-ins, graphs, revisions, passive evaluation, active results, run records, and finding promotion remain coupled. | Split definition/parser, catalog/graph, validation/revisions, passive checks, active results, runs, and promotion. |
| 3 | P1 | `shared/advancedTesting.ts` | 1,298 lines and 39 exports. Independent GraphQL, API import, auth, parameter, secret, header, proxy, and draft-building analyses share one catalog. | One module per analysis family plus a summary composer. |
| 4 | P1 | `shared/identityLab.ts` | 918 lines and 33 exports. Identity/resource normalization, evidence, matrices, invariants, sequences, and comparisons remain a security-sensitive mixed surface. | Split normalization, evidence, matrix, invariants, sequences, and comparison. |
| 5 | P1 | `shared/automate.ts` | 873 lines and 38 exports. Marker parsing, payload sets, rules, results, clustering, and sessions change for different reasons. | Split markers, payloads, rules, results, clusters, and sessions. |
| 6 | P1 | `shared/findings.ts` | 864 lines and 29 exports. Normalization/templates, evidence, merge/filter logic, retest, redaction, Markdown, and HTML reporting share one raw-evidence review surface. | Split core finding state, evidence, retest, redaction, and report renderers. |
| 7 | P1 | `shared/globalSearch.ts` | 866 lines. Query parsing and candidate construction for nearly every domain share one owner, so every searchable feature increases fan-out. | Keep parser/matcher core and move candidate builders beside their domains. |
| 8 | P1 | `electron/agent/toolRegistry/normalization.ts` | 285 lines at the untrusted model-output boundary. It is canonical, directly exercised through the registry, and currently has 93.22% line coverage, but adding a tool still changes one exhaustive family-wide switch plus the 292-line metadata catalog. | Split browser, evidence, testing, and project descriptor families only when catalog growth makes the shared switch hard to review. |
| 9 | P1 | `electron/localStore.ts` | 529 lines and an 83-method flattened facade. Repository extraction succeeded, but context CRUD and facade composition remain one closure. | Extract local-context repository operations and return named repository groups internally. |
| 10 | P1 | `electron/agent/runtime.ts` | 550 lines. Start, pause/resume/stop, steering, capability mutation, and recovery remain in one compatibility class. | Separate lifecycle commands from governance/recovery while retaining the facade. |
| 11 | P1 | `electron/project/projectArtifactController.ts` | 530 lines with export, import/conflict application, dialog/filesystem writing, and handoff packaging in one factory; focused controller coverage is still absent. | Separate bundle export, import application, and handoff writer controllers. |
| 12 | P1 | `src/hooks/workbench/useProjectArtifactsDomain.ts` | 500 lines. Notes, saved views, bundles, imports, and handoffs share 14 state values and 14 callbacks. | Split notes, saved views, project bundles, and handoff hooks. |
| 13 | P1 | `src/components/views/FindingsView.tsx` | 732 lines. List/filter/editor/evidence/retest/report layouts remain one render function even though state has moved to a hook. | Named list, editor, evidence, retest, and report panels. |
| 14 | P1 | `src/components/views/AutomateView.tsx` | 651 lines with 46 destructured props, the broadest component API. | Group marker, payload, run, rule, result, and promotion models; extract panels. |
| 15 | P1 | `src/components/shell/AiOperationsDrawer.tsx` | 569 lines and 42 props. Setup, history, mission, capabilities, tutorial, memory, recovery, and transcript remain one view. | Drawer shell plus named workflow sections with grouped models. |
| 16 | P1 | `src/components/shell/ProjectArtifactsOverlay.tsx` | 540 lines and a workbench prop exposing more than 40 members across four workflows. | Notes, Saved Views, Bundle, and Handoff panels. |
| 17 | P1 | `src/components/IdentityLab.tsx` | 442 presentation lines after pure model and editor-hook extraction. It is behavior-thin now, but roster/editor, matrix, comparison, and causal ledger are still one render tree. | Split four named visual panels; no further business-logic extraction is needed first. |
| 18 | P1 | `src/components/views/WorkflowsView.tsx` | 476 lines. Catalog, editor, graph, dry run, revisions, history, and results remain coupled in presentation. | One panel per operator task. |
| 19 | P2 | `src/components/views/TrafficView.tsx` | 514 lines and 34 props. Presentation-only, but filter/bulk/list/detail/annotation concerns cross one render surface. | Filter bar, bulk actions, list, detail, and annotation editor. |
| 20 | P2 | `src/components/views/RepeaterView.tsx` | 504 lines and 40 props. Presentation-only with a near-workflow-wide prop API. | Group request, response, history, burst, diff, collection, and WebSocket models. |
| 21 | P2 | `electron/screenshotPreload.ts` | 957 lines. Screenshot fixtures and a mutable 134-method bridge implementation still duplicate API maintenance. | Domain fixture modules and a screenshot-specific typed stub factory. |
| 22 | P2 | `src/components/views/PluginsView.tsx` | 449 lines across install, validation, approval, registry, panel rendering, API console, and audit tasks. | One panel per operator task. |
| 23 | P2 | `src/components/views/AdvancedView.tsx` | 461 lines spanning several unrelated analysis families. | API Import, GraphQL, Auth, Parameters, Secrets, Headers, and Proxy panels. |
| 24 | P2 | `src/styles.css` | 828 lines. Theme/global ownership is valid, but Traffic-specific layout selectors still violate the current component-styling convention. | Move only page-specific layout/responsive rules into component utilities. |
| 25 | P2 | `shared/domain.ts` | 867 type-only lines and 105 importers. Runtime risk is low; navigation and merge-conflict risk are high. | Feature type modules with a compatibility barrel. |
| 26 | P2 | `shared/agent-types.ts` | 871 type-only lines and 50 importers. Agent tool, run, mission, capability, tutorial, and memory contracts share one navigation bottleneck. | Split contract families behind a compatibility barrel. |
| 27 | P2 | `src/App.test.tsx` | 2,226 lines. Shell/cross-view tests and feature behavior remain centralized. | Keep composition tests here; move feature behavior beside hooks/views. |
| 28 | P2 | `electron/agent/runtime.test.ts` | 1,742 lines. Lifecycle, governance, browser, evidence, workflow, mission, and memory behavior share one suite. | Split alongside runtime responsibility boundaries. |
| 29 | P2 | `electron/localStore.test.ts` | 1,736 lines. Schema, migration, context, and all repository behaviors remain one suite. | Migration/context suite plus repository-family suites. |
| 30 | P2 | `src/test/radarApiStub.ts` | 729 lines. A complete typed safe default is valuable, but every IPC addition still edits one object. | Compose domain stub factories matching the six shared API contracts. |

## Scope And Method

The review covered the current repository while excluding dependencies and generated `dist`, `coverage`, and regression artifact output.

- 503 current files outside generated/dependency directories
- 424 TypeScript and TSX files across `src/`, `electron/`, and `shared/`
- 55,850 production TypeScript, TSX, and CSS lines in `src/`, `electron/`, and `shared/`
- 21,280 test, test-support, and regression-fixture lines
- 1,690 TypeScript import statements reviewed as a navigation and fan-in/fan-out signal
- Function length, decision-point count, hook count, mutable top-level state, import fan-in/fan-out, exported surface size, component prop count, and test ownership were measured
- Every high-ranked file was inspected at its responsibility boundaries

The approximate branch score below is the number of decision points in a function plus one. It is a review signal, not a formal correctness metric.

## Baseline Executive Summary Before Execution

The previous refactor successfully removed the worst renderer, persistence, agent-runtime, IPC, API-contract, primitive, and test-setup monoliths. The current highest concerns are:

1. `electron/main.ts` still owns most stateful main-process orchestration.
2. Agent tool calls are normalized through two separate, branch-heavy switches in `planner.ts` and `tools.ts`.
3. `useAgentDomain.ts` mirrors agent timeline events into almost every renderer domain through one large effect.
4. The documented architecture no longer matches the refactored architecture.
5. The reported coverage percentage excludes most of the files now carrying the greatest risk.
6. Several shared security domains remain broad algorithm catalogs with high change radius.
7. Large components are mostly presentation-only now, but several still have excessively broad prop surfaces or component-local workflow logic.

## Concern Levels

- **P0 — address first:** Security boundary, broad mutable orchestration, duplicated normalization, misleading verification, or architectural guidance that can cause regressions.
- **P1 — address next:** High-coupling domain or feature module where normal changes require understanding several unrelated concerns.
- **P2 — opportunistic:** Readable today, but the next material feature should begin with an extraction.
- **Keep:** Large or central by design; splitting would currently reduce clarity.

## Baseline Ranked Findings Before Execution

### 1. `electron/main.ts` — P0, highest concern

Evidence:

- 2,917 lines
- 49 imports
- 26 top-level mutable variables
- 285 function-like bodies including callbacks
- Highest function branch score: 57
- `handleChromeObserverEvent`: 134 lines, branch score 57
- Electron debugger message callback: 147 lines, branch score 56
- No focused unit test imports this module

Why it ranks first:

The file is the remaining shared-mutable-state center for the application. It still coordinates:

- Active profile, workspace, and session context
- Hot HTTP capture and WebSocket ledgers
- Capture-to-session and causal attribution
- Request and response intercept queues
- Match/replace rules
- Proxy CA generation and MITM proxy lifecycle
- Managed Chrome process lifecycle
- CDP connection, commands, event observation, and response-body collection
- Electron debugger capture
- Browser/window lifecycle
- Active agent, navigation, action, identity, and activation context
- Construction of every domain controller
- Dependency objects for all 13 IPC registrars
- Global project search and finding report assembly

The IPC calls were moved into registrars, but the operations passed to those registrars are still assembled inline around the same global state. A change in browser or capture behavior can therefore affect intercept, identity, agent attribution, replay, proxying, search, persistence, and shutdown.

Recommended boundary:

```text
electron/app/
  runtimeState.ts
  windowLifecycle.ts
  registerApplicationIpc.ts
electron/capture/
  captureLedger.ts
  websocketLedger.ts
  electronDebuggerCapture.ts
electron/intercept/
  interceptController.ts
  proxyController.ts
electron/browser/
  managedBrowser.ts
  cdpClient.ts
  cdpObserver.ts
```

Start by creating explicit state objects for capture, intercept, browser, and causal attribution. Then move behavior with its state. Do not replace the globals with a generic service container.

Acceptance target:

- `main.ts` should initialize state, create windows, register IPC domains, and shut down resources.
- Capture, intercept, proxy, and browser behavior should be directly testable without importing Electron application startup.
- No controller should read unrelated main-module variables.

### 2. `electron/agent/planner.ts` — P0

Evidence:

- 656 lines
- `normalizeToolCall`: 200 lines, branch score 90
- `compactToolResult`: 176 lines, branch score 24
- Mixes system prompting, context compaction, tool-result compaction, untrusted decision parsing, mission patches, capability requests, tutorial guidance, and provider invocation

Why it ranks second:

This is an untrusted model-output boundary. Its largest function converts model JSON into 44 possible tool-call shapes. The same calls are normalized again in `tools.ts`, so a new tool or parameter can drift between planner parsing and runtime enforcement.

The file also combines two different trust directions:

- Trusted Radar state being compacted for the model
- Untrusted model output being normalized for Radar

Those directions should not share one module.

Recommended boundary:

```text
electron/agent/planner/
  prompt.ts
  contextCompaction.ts
  toolResultCompaction.ts
  decisionNormalization.ts
  planner.ts
```

The planner should perform permissive structural parsing and then call the same canonical tool-input normalizer used at execution time. Runtime normalization must remain authoritative.

### 3. `electron/agent/tools.ts` — P0

Evidence:

- 588 lines
- 44 registered tools
- `normalizeAgentToolCall`: 217 lines, branch score 74
- Agent tool behavior currently touches 19 files across registry, planning, policy, profiles, capability accounting, metadata, executors, and tests

Why it ranks third:

The registry, descriptions, schemas, safety labels, and canonical runtime normalization are only partially colocated. Adding one tool can require synchronized edits across several switches and maps. TypeScript helps with the discriminated union, but it cannot guarantee that schema text, planner parsing, runtime normalization, risk classification, capability cost, visible target, and executor registration remain semantically aligned.

Recommended boundary:

Use one definition per tool family:

```ts
type AgentToolDescriptor<TCall> = {
  name: TCall["tool"];
  description: string;
  safety: AgentToolSafety;
  schema: Record<string, unknown>;
  normalize: (input: unknown) => TCall;
};
```

Compose the public registry from browser, evidence, testing, and project descriptors. Keep execution in the existing family executors. Derive available names and schemas from the same descriptors.

### 4. `src/hooks/workbench/useAgentDomain.ts` — P0

Evidence:

- 618 lines
- 31-member `AgentDomainPorts`
- 29 React hook calls
- 547-line hook body
- Timeline mirror effect: 151 lines, branch score 44
- No focused hook test

Why it ranks fourth:

The hook owns normal agent-run state, but it also acts as an event router from agent timeline entries into Traffic, Intercept, Repeater, Automate, Workflows, Sitemap, notices, and selection state. The timeline mirror effect interprets many tool-result variants and performs cross-domain writes through a broad port.

This duplicates part of the agent tool registry in the renderer: every new visible tool effect may require a new branch here.

Recommended boundary:

```text
src/hooks/workbench/agent/
  useAgentRuns.ts
  useAgentRunMemory.ts
  agentTimelineIntents.ts
  useAgentTimelineProjection.ts
```

Convert each timeline entry into a small typed renderer intent such as `show-view`, `select-capture`, `load-replay-draft`, or `load-workflow-draft`. Apply those intents through grouped ports. The pure timeline-to-intent transformation should have direct tests.

### 5. `docs/CODE_CONVENTIONS.md`, `README.md`, and `docs/REFACTOR_AUDIT.md` — P0 documentation drift

Evidence:

- `CODE_CONVENTIONS.md` still says view actions live beside each view.
- It says `electron/main.ts` owns direct `ipcMain.handle` registration.
- It says `electron/localStore.ts` owns the schema and migrations.
- `README.md` still describes `main.ts` as owning IPC handlers.
- `REFACTOR_AUDIT.md` begins with current implementation status, then continues with stale baseline claims such as 135 direct handlers, a 2,749-line store, and unused agent/session hooks.

Why it ranks fifth:

These are the repository's stated source of truth. Following them would actively reverse the new boundaries. The mixed historical/current audit is also difficult for a human to read because resolved findings look active unless the reader carefully distinguishes the status section from the original baseline.

Recommended change:

- Update conventions to name `electron/ipc/`, `electron/store/`, `shared/api/`, separate `*ViewActions` files, and the current store migration owner.
- Update the README project layout.
- Move the old audit's baseline below an explicit historical appendix, or archive it and keep this report as the current ranking.

### 6. `vite.config.ts` coverage configuration — P0 verification gap

Evidence:

Coverage currently includes only:

- `shared/**/*.ts`
- `electron/ai/**/*.ts`
- `src/lib/resultPreview.ts`
- `src/lib/aiProvider.ts`

It does not measure:

- `electron/main.ts`
- `electron/agent/**`
- `electron/store/**` or `electron/localStore.ts`
- Electron controllers and IPC registrars
- Renderer hooks and components

Why it ranks sixth:

The reported line coverage is high, but it is not repository-wide coverage. Several excluded areas do have tests, yet regressions in the highest-ranked files do not affect the coverage threshold. This can create false confidence during another structural refactor.

Recommended change:

Expand coverage in stages rather than dropping every file into the threshold at once:

1. Agent runtime, planner, tools, policy, and capability execution
2. Store facade, migrations, repositories, and controllers
3. Renderer hooks and extracted pure presentation/intent helpers
4. IPC registrars after they receive direct boundary tests

Keep generated screenshot fixtures and Electron bootstrap code excluded until their behavior moves behind testable controllers.

### 7. `shared/agentMission.ts` — P1

Evidence:

- 818 lines
- 13 exported declarations
- Imported by 11 modules
- `normalizeAgentMissionUpdates`: branch score 43
- Combines mission creation, normalization, patches, revision checks, reference validation, evidence validation, open questions, and operator steering

Why:

This is a high-value integrity boundary. Patch application, evidence validation, and steering are independent algorithms with different failure modes, but they share one file and broad mission types.

Recommended split:

```text
shared/agentMission/
  normalization.ts
  updates.ts
  patches.ts
  references.ts
  evidence.ts
  steering.ts
  index.ts
```

### 8. `shared/agentCapabilities.ts` — P1

Evidence:

- 720 lines
- 17 exported declarations
- Imported by 13 modules
- Owns risk mapping, lease normalization, proposal, grant, revoke, expiry, receipt finalization, and authorization

Why:

This module controls active authority. Its algorithms are cohesive as a domain but not as one review surface. Reviewing authorization currently requires navigating normalization, mutation, accounting, and matching logic together.

Recommended split:

- `normalization.ts`
- `risk.ts`
- `leases.ts`
- `receipts.ts`
- `authorization.ts`

Keep the public API behind a compatibility barrel and preserve the authorization sequence in focused tests.

### 9. `electron/playwrightBrowser.ts` — P1

Evidence:

- 595 lines
- `createPlaywrightBrowserController`: 460 lines
- Owns CDP connection/reconnection, page selection, scoped request routing, state synchronization, navigation, DOM summaries, selectors, actions, cookies, and storage

Why:

The file is a platform adapter and a scope boundary. Although branch complexity is moderate, most behavior lives in one factory closure with mutable browser/context/page references. Lifecycle failures and action failures are hard to isolate from each other.

Recommended split:

- `playwrightLifecycle.ts`
- `playwrightPageState.ts`
- `playwrightDomInspection.ts`
- `playwrightActions.ts`
- `playwrightScopeRouting.ts`

The public controller can remain compatible.

### 10. `shared/workflows.ts` — P1

Evidence:

- 1,282 lines
- 32 exported declarations
- Imported by 16 modules
- 106 function-like bodies
- Includes schema normalization, YAML-like parsing, built-ins, graphing, validation, revisions, diffing, passive analysis, active result shaping, run records, and finding promotion

Why:

It is the broadest high-fan-in runtime domain. Changes to workflow syntax and changes to security checks should not require reviewing the same module.

Recommended split:

- `definition.ts`
- `parser.ts`
- `builtins.ts`
- `graph.ts`
- `validation.ts`
- `revisions.ts`
- `passiveEvaluation.ts`
- `activeResults.ts`
- `runs.ts`
- `findingPromotion.ts`

## Baseline Ranking Continuation

| Rank | Priority | File | Evidence and reason | Recommended seam |
| ---: | :---: | --- | --- | --- |
| 11 | P1 | `shared/advancedTesting.ts` | 1,298 lines, 39 exports, 11 importers. GraphQL, API imports, auth matrices, parameters, secret signals, headers, proxy guidance, and workflow drafts are separate analysis families. | One module per analysis family with a small summary composer. |
| 12 | P1 | `shared/identityLab.ts` | 918 lines, 33 exports. Identity/resource normalization, evidence, access matrices, invariants, sequences, and comparisons share one security-sensitive file. | Split normalization, evidence, matrix, invariants, sequences, and comparison. |
| 13 | P1 | `shared/automate.ts` | 873 lines, 38 exports, maximum branch score 28. Marker parsing, payload sets, rule evaluation, result shaping, clustering, and session normalization change for different reasons. | Split markers, payloads, rules, results, clusters, and sessions. |
| 14 | P1 | `shared/findings.ts` | 864 lines, 29 exports, 9 importers. Normalization, templates, evidence, filters, merge logic, retest matrix, redaction, Markdown, and HTML reporting share one module. Raw-evidence reporting increases review sensitivity. | Split normalization/templates, evidence, filtering/merge, retest, redaction, and reports. |
| 15 | P1 | `shared/globalSearch.ts` | 866 lines. One file parses queries and builds candidates for nearly every product domain. Each new searchable feature expands it. | Keep parser/matcher core and move candidate builders into domain modules. |
| 16 | P1 | `electron/localStore.ts` | 529 lines, 20 imports, 471-line `openLocalStore`, 11 importers. The repository split succeeded, but profile/workspace/session SQL and an 83-method composition return still share one closure. | Extract a local-context repository and return named repository groups before flattening for compatibility. |
| 17 | P1 | `electron/agent/runtime.ts` | 550 lines. Much improved, but start, capability updates, recovery, pause/resume/stop, steering, and lifecycle compatibility remain in one class facade. `recover` has branch score 28. | Separate lifecycle commands from recovery/capability commands; retain a thin compatibility class. |
| 18 | P1 | `electron/project/projectArtifactController.ts` | 530 lines with a 425-line factory. Bundle export, bundle import, filesystem dialogs/writes, conflict application, and handoff packaging have different failure and safety paths. No focused controller test. | Separate bundle export, import application, and handoff writer controllers. |
| 19 | P1 | `src/hooks/workbench/useProjectArtifactsDomain.ts` | 500 lines, 14 state values, 14 callbacks, a 17-member port, and a 13-field saved-view snapshot. Notes, saved views, bundles, imports, and handoffs share one hook. | `useProjectNotes`, `useSavedViews`, `useProjectBundles`, and `useHandoffPackages`. |
| 20 | P1 | `src/components/IdentityLab.tsx` | 552 lines, 494-line component, 12 hooks, branch score 35. It still computes identity maps, attribution, matrices, action groups, comparisons, and form submission inside the component. | `useIdentityLabModel` plus ProfileEditor, Roster, AttributionLedger, AccessMatrix, and Comparison panels. |
| 21 | P1 | `electron/automate/automateController.ts`, `electron/identity/identityController.ts`, and `electron/workflows/workflowController.ts` | Factory bodies are 397, 305, and 250 lines. They are cohesive but have no focused controller tests; workflow `run` has branch score 27 and identity draft normalization has branch score 24. | Extract pure command decisions and add direct controller tests before further feature growth. |
| 22 | P1 | `electron/screenshotPreload.ts` | 957 lines. Screenshot fixture data and a complete mutable 134-method `RadarApi` implementation share one file. It duplicates API maintenance outside the reusable renderer stub. | Split screenshot fixtures by domain and build the API from a screenshot-specific typed stub factory. |
| 23 | P1 | `src/components/views/FindingsView.tsx` | 732 lines and a 662-line component. State lives in a hook, but list/filter/editor/evidence/retest/report layouts are still one render function. | FindingsList, FindingEditor, EvidenceEditor, RetestMatrix, and ReportBuilder. |
| 24 | P1 | `src/components/views/AutomateView.tsx` | 651 lines, 576-line component, and 46 destructured props—the broadest component API. | Group props into marker, payload, run, rule, result, and promotion models; extract one panel per group. |
| 25 | P1 | `src/components/shell/AiOperationsDrawer.tsx` | 569 lines, 487-line component, and 42 destructured props. The controller extraction helped, but setup, history, mission, capabilities, tutorial, memory, recovery, and transcript remain one view. | Drawer shell plus Setup, History, Mission, Capability, Memory, and Timeline sections. |
| 26 | P1 | `src/components/shell/ProjectArtifactsOverlay.tsx` | 540 lines and a 455-line component. Its `workbench` prop type exposes more than 40 state/action members for four operator workflows. | Overlay shell with Notes, Saved Views, Bundle, and Handoff panels receiving grouped models. |
| 27 | P1 | `src/components/views/WorkflowsView.tsx` | 476 lines, 430-line component, branch score 24. Catalog, editor, graph, dry run, revisions, history, and results remain coupled in presentation. | Catalog, DefinitionEditor, Graph, DryRun, RevisionHistory, and RunResults. |
| 28 | P2 | `src/components/views/TrafficView.tsx` | 514 lines, 437-line component, 34 props, and five component-local hooks. Filter/bulk/list/detail/annotation state still crosses one render surface. | TrafficFilterBar, BulkActions, TrafficList, TrafficDetail, and AnnotationEditor. |
| 29 | P2 | `src/components/views/RepeaterView.tsx` | 504 lines, 437-line component, and 40 props. It is presentation-only but the prop surface exposes nearly the complete Repeater workflow. | Group request, response, history, burst, diff, collection, and WebSocket panel models. |
| 30 | P2 | `src/components/views/PluginsView.tsx` | 449 lines and a 417-line component. Install, validation, approval, registry, panel rendering, API console, and audit are separate operator tasks. | One panel per operator task. |
| 31 | P2 | `src/components/views/AdvancedView.tsx` | 461 lines and a 410-line component. Several independent analysis families share a single render tree. | API Import, GraphQL, Auth, Parameters, Secrets, Headers, and Proxy panels. |
| 32 | P2 | `src/styles.css` | 828 lines. Most content correctly owns themes and global effects, but Traffic-specific `.radar-traffic-*` and `.radar-detail-pane` selectors remain despite the current convention against page-level global CSS. | Move Traffic layout/responsive styles into component utilities; retain tokens, themes, shared surfaces, and keyframes globally. |
| 33 | P2 | `shared/domain.ts` | 867 type-only lines, 106 exported declarations, and 105 importers. Runtime risk is low, but navigation and merge-conflict risk are high. | Feature type modules with a compatibility re-export barrel. |
| 34 | P2 | `shared/agent-types.ts` | 871 type-only lines, 66 exported declarations, and 50 importers. Agent run, tool, mission, capability, tutorial, and memory contracts share one navigation bottleneck. | Split by agent contract family and retain a compatibility barrel. |
| 35 | P2 | `src/App.test.tsx` | 2,226 lines and 48 tests. App composition, cross-view workflows, and extracted feature behavior remain centralized. | Keep shell/cross-view tests; move feature behavior beside views and hooks. |
| 36 | P2 | `electron/agent/runtime.test.ts` | 1,742 lines and 32 tests. Lifecycle, capability, recovery, browser, evidence, replay, workflow, mission, and memory behavior share one suite. | Split by the production runtime modules. |
| 37 | P2 | `electron/localStore.test.ts` | 1,736 lines and 37 tests. Schema, migrations, local context, and all repositories remain one suite after production was split. | Migration/context suite plus one suite per repository family. |
| 38 | P2 | `src/test/radarApiStub.ts` | 729 lines and a complete default API stub. It is useful and typed, but every IPC addition still changes one large object. | Compose domain stub factories matching the six `shared/api/` contracts. |

## Large Files That Should Not Be Split Merely For Size

| File | Lines | Why it is currently acceptable |
| --- | ---: | --- |
| `electron/store/schema.ts` | 423 | One auditable SQLite DDL owner. A long schema string is cohesive; split only if migrations require independent feature schemas. |
| `electron/demoProject.ts` | 746 | Predominantly deterministic demo fixture data. Split by fixture family only when editing collisions become common. |
| `src/styles.css` theme/token sections | Most of 828 | Theme variables, base focus/selection rules, shared textures, and keyframes intentionally have one global owner. Only page-specific selectors should move. |
| `src/test/radarApiStub.ts` default values | Most of 729 | A full safe default bridge is valuable. The concern is maintenance organization, not runtime complexity. |
| `electron/preload.ts` | 141 | A flat one-to-one bridge map is easier to audit than several indirect preload layers. |
| `shared/radar-api.ts` | 22 | The compatibility intersection is now appropriately thin. |
| `src/components/radar/primitives.ts` | 7 | A small compatibility barrel is the right shape. |

## Improvements Since The Previous Audit

These files are no longer primary refactor targets:

| Area | Current result |
| --- | --- |
| `src/hooks/useRadarWorkbench.ts` | 291-line composition root with no duplicated feature state |
| `src/App.tsx` | 228-line shell composition root |
| `electron/localStore.ts` | Schema, migrations, row mappers, and feature repositories extracted |
| `electron/agent/runtime.ts` | Execution loop, planning step, recovery, capabilities, evidence, and tool families extracted |
| `electron/main.ts` IPC | Zero direct `ipcMain.handle` calls; 135 handlers live in 13 registrars |
| `shared/radar-api.ts` | Six domain API contracts composed through a thin compatibility type |
| Renderer primitives/actions | One primitive and one retained `*ViewActions` component per file |
| `src/test/setup.ts` | Nine-line setup using a reusable typed API stub |
| Import boundaries | No renderer-to-Electron, Electron-to-renderer, or shared-to-runtime boundary violations |
| Unsafe escapes | No `: any`, `as any`, TypeScript suppression, or ESLint suppression markers |

## Baseline Import Graph Findings

- No runtime import cycles were found.
- Two type-only cycles exist around `executionLoop.ts`, `planningStep.ts`, and `executionPostTool.ts`.
- Both cycles are caused by importing `AgentExecutionLifecycle` from `executionLoop.ts`.
- Move `AgentExecutionLifecycle` to `runtimeTypes.ts` to make dependency direction unambiguous.

This is low runtime risk because `import type` is erased, but resolving it would make the agent execution module graph easier to understand.

## Baseline Verification At Audit Time

- `pnpm lint`: passed with zero warnings and zero errors
- `pnpm test:unit`: passed, 85 files and 657 tests
- Configured-subset coverage: 95.17% statements, 85.43% branches, 96.84% functions, and 95.61% lines
- `pnpm build`: passed renderer TypeScript, Electron TypeScript, and Vite production builds
- Largest renderer chunk: 427.58 kB with no Vite chunk-size warning
- `git diff --check`: passed

The coverage numbers above describe only the include patterns listed in finding 6. They should not be interpreted as repository-wide coverage.

## Original Recommended Refactor Order

### Phase 1 — Restore Accurate Boundaries And Verification

1. Update `CODE_CONVENTIONS.md`, the README project layout, and the historical audit.
2. Expand coverage to agent, store, controller, and extracted renderer logic in staged thresholds.
3. Move `AgentExecutionLifecycle` to `runtimeTypes.ts`.

### Phase 2 — Finish Main-Process Decomposition

1. Extract capture and WebSocket ledgers.
2. Extract intercept state and queue resolution.
3. Extract proxy/CA lifecycle.
4. Extract CDP client and observer.
5. Extract managed-browser lifecycle.
6. Leave `main.ts` as bootstrap, window lifecycle, controller construction, and registrar composition.

### Phase 3 — Unify Agent Tool Definition

1. Split prompt/context compaction from decision normalization.
2. Create capability-family tool descriptors.
3. Make one canonical runtime normalizer authoritative.
4. Derive schemas and tool names from descriptors.
5. Replace the renderer timeline mirror switch with typed visible intents.

### Phase 4 — Split Security-Critical Shared Domains

Recommended order:

1. Agent mission
2. Agent capabilities
3. Workflows
4. Identity Lab
5. Automate
6. Findings
7. Advanced testing
8. Global search

Move each domain with its tests and retain compatibility barrels during migration.

### Phase 5 — Split Presentation By Operator Workflow

Start with the components that still own local derivation or exceptionally broad prop APIs:

1. Identity Lab
2. Automate
3. AI Operations Drawer
4. Project Artifacts
5. Findings
6. Workflows
7. Traffic
8. Repeater
9. Plugins
10. Advanced

## Suggested Guardrails

- Treat model-output normalization, capability authorization, scope checks, replay normalization, import application, and raw-evidence export as explicit security boundaries.
- One tool descriptor should own its schema and canonical normalization.
- A renderer effect should not interpret dozens of domain events directly.
- Main-process feature state should live beside its controller, not in a shared bootstrap module.
- Composition roots may be broad, but should not own feature algorithms.
- Components above roughly 300 lines should be composed from named visual panels when more than one operator workflow is present.
- Component props above roughly 20 fields should be grouped into domain models or panel props.
- Shared modules above 500 lines should demonstrate one cohesive algorithm family.
- Coverage summaries should state which directories are excluded.
- Keep runtime import cycles at zero and eliminate type-only cycles when a shared type module is the natural owner.
- Do not split schemas, fixtures, barrels, or preload maps solely to satisfy a line-count target.

## Definition Of Done

The remaining refactor program is complete when:

- `electron/main.ts` is a bootstrap and composition root rather than the owner of browser, proxy, intercept, capture, and attribution state.
- Agent tool schema, normalization, safety metadata, and registration cannot drift across parallel switches.
- Agent timeline events become tested renderer intents instead of one broad cross-domain effect.
- Code conventions and architecture documentation match the actual module boundaries.
- Coverage thresholds measure agent, persistence, controllers, and extracted renderer logic.
- Security-critical shared domains have focused modules and tests.
- Large components are composed from named operator panels with grouped props.
- Runtime imports remain cycle-free.
- `pnpm lint`, `pnpm test:unit`, and `pnpm build` remain green throughout the work.
