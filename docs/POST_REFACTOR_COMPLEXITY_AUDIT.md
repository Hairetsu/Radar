# Radar Post-Refactor Complexity Audit

Audit date: 2026-08-01  
State reviewed: working tree after the 2026-07-31 complexity refactor

## Executive Assessment

The refactor succeeded. Radar no longer has a P0 complexity finding.

The original risks were broad stateful monoliths, duplicated agent normalization, browser/proxy/capture globals, misleading coverage, and documentation that described an older architecture. Those problems are now either removed or isolated behind focused modules.

The remaining work has a different shape:

- a large but substantially thinner Electron composition root;
- a few branch-heavy security and privacy boundaries;
- two CDP capture adapters that still encode similar event semantics independently;
- one dormant parallel Identity Lab model that is not part of the shipped execution path;
- broad, well-tested shared domain catalogs that should become compatibility barrels;
- renderer components that are behavior-thin but still too large to scan comfortably;
- persistence, project-artifact, and renderer surfaces that are not yet included in either coverage gate.

This is now a targeted maintainability backlog, not an emergency rewrite. Refactors should preserve the current public APIs and move one responsibility at a time.

## Current Verification Baseline

The completed refactor is green on the repository's required commands:

- `pnpm lint`
- `pnpm test:unit`
- `pnpm build`
- `git diff --check`

Current verified test and coverage results:

- broad unit suite: 101 test files and 710 tests;
- broad coverage: 95.15% statements, 85.43% branches, 96.84% functions, and 95.59% lines;
- staged critical suite: 21 test files and 105 tests;
- staged critical coverage: 75.55% statements, 57.20% branches, 78.82% functions, and 76.79% lines.

The broad percentage is strong but covers `shared/**`, `electron/ai/**`, and two renderer helpers. The critical gate adds agent, browser, capture, intercept, proxy, Playwright, and renderer-agent hooks. `electron/main.ts`, store/controller code, most renderer hooks, and the large view components are still outside both coverage reports.

## Scope And Method

The audit inspected the current working tree and excluded dependencies plus generated `dist`, `coverage`, and regression artifact output.

- 504 files outside generated and dependency directories, including this audit;
- 424 TypeScript and TSX files across `src/`, `electron/`, and `shared/`;
- 55,850 production TypeScript, TSX, and CSS lines;
- 19,594 test-source lines;
- 1,690 TypeScript import statements reviewed as coupling signals;
- function length, approximate decision count, imports, exports, top-level mutation, hook calls, prop width, direct-test ownership, coverage, security-boundary role, and production fan-in were measured;
- every P1 file below was inspected at its responsibility boundaries.

The decision score is the number of branches, loops, cases, catches, and short-circuit expressions in a function plus one. It is a review heuristic rather than formal cyclomatic complexity.

## Priority Definitions

- **P0 — immediate:** unsafe or unverified security boundary, broken ownership, or architecture likely to cause correctness failures. None remain.
- **P1 — next refactor tranche:** high change radius, branch-heavy boundary, parallel domain ownership, filesystem/network authority, or a module that still requires unrelated knowledge.
- **P2 — opportunistic:** readable and safe enough today, but the next meaningful feature should begin with the named extraction.
- **Keep:** large by purpose; splitting it now would add indirection without improving ownership.

## Fresh Ranking: Highest Concern To Lowest

| Rank | Priority | Current file or cluster | Current evidence and reason | Recommended seam |
| ---: | :---: | --- | --- | --- |
| 1 | P1 | `electron/main.ts` | 1,342 lines, 53 imports, six top-level mutable values, roughly 200 function-like bodies, 13 IPC registrar calls, and no focused test import. Individual functions are now bounded, but context activation, window lifecycle, controller construction, report/search assembly, and dependency wiring still share one file. | Extract application-context/window lifecycle and project search/report operations. Retain explicit controller and registrar composition in `main.ts`. |
| 2 | P1 | `electron/browser/chromeCaptureObserver.ts` and `electron/browser/electronDebuggerCapture.ts` | Both translate CDP Network events into Radar HTTP/WebSocket evidence. `handleEvent` has an approximate decision score of 50; the Electron debugger callback scores 56. Critical coverage is only 59.37% lines / 32.00% branches for the Chrome observer and 33.84% lines / 9.32% branches for the Electron adapter. Their similar mappings can drift. | Introduce one pure CDP network-event reducer with adapter-specific body loading and persistence ports. Add the same table-driven event corpus to both adapters. |
| 3 | P1 | `electron/agent/planner/contextCompaction.ts` | 314 lines. `compactToolResult` is 179 lines and branches across raw-bearing tool results. This is the privacy boundary deciding what reaches a configured AI provider, but critical coverage is 29.03% lines and 11.49% branches. | Use a typed per-tool compactor registry and add raw-disabled/raw-enabled tests for every result that can contain headers, bodies, cookies, storage, payloads, or notes. |
| 4 | P1 | `electron/agent/toolRegistry/normalization.ts` | 285 lines. Its 217-line authoritative switch has an approximate decision score of 74 at the untrusted model-output boundary. Coverage is strong at 93.22% lines, but adding a tool still requires coordinated edits to this switch and the separate 292-line definition catalog. | Compose browser, evidence, testing, and project descriptor arrays; keep each descriptor's schema and normalizer together. Preserve the 60-line public `tools.ts` facade. |
| 5 | P1 | `electron/agent/runtime.ts` | 550 lines. The compatibility class still owns start, pause/resume/stop, steering, capability mutation, queuing, and recovery. `recover` is 115 lines with a decision score of 28. Critical coverage is 61.80% lines and 55.78% branches, while its test suite is a 1,742-line monolith. | Extract lifecycle commands and recovery/governance services behind the existing `AgentRuntime` facade; split tests by those boundaries. |
| 6 | P1 | `electron/intercept/interceptController.ts` | 453 lines. The factory spans 334 lines and `resolveItem` scores 24 decisions while applying request/response edits, forwarding/dropping traffic, rule transforms, scope checks, queue state, and audit effects. Critical coverage is 67.66% lines and 45.31% branches. | Separate queue ledger, pure mutation/rule application, and operator resolution. Keep network dispatch at the controller edge. |
| 7 | P1 | `shared/identityLab.ts` | 918 lines and 33 exports. All eleven exported runtime functions have no production consumer outside this module and its tests; only two types are imported by `identityProfiles.ts`. The shipped Identity Lab instead uses `identityProfiles`, captured evidence, and renderer presentation helpers. This is a dormant parallel domain model, not merely a long file. | Decide ownership before refactoring: either adopt it as the canonical shared Identity Lab engine and wire the product to it, or remove the unused runtime model while retaining any required types. Do not split both models in parallel. |
| 8 | P1 | `electron/project/projectArtifactController.ts` | 530 lines. A 425-line factory owns bundle export, filesystem/dialog writing, import parsing, conflict application, and handoff packaging. No focused test imports the controller. These operations accept external files and write local artifacts. | Split bundle exporter, import applicator, and handoff writer; put filesystem/dialog behavior behind injected ports and add focused malformed-input and write-failure tests. |
| 9 | P1 | `electron/localStore.ts` | 529 lines, 23 imports, and a 471-line `openLocalStore` closure returning an 83-method flattened facade. Feature repositories are extracted and store behavior is heavily tested, but context CRUD, transaction setup, repository composition, and facade flattening still share one owner. | Extract local-context repository operations and compose named repository groups internally while keeping the current public facade compatible. Add store/controller files to a staged coverage gate. |
| 10 | P1 | `shared/workflows.ts` | 1,282 lines, 32 exports, 106 function-like bodies, and 12 production/test consumers. Parsing, built-ins, graphs, validation, revisions, passive evaluation, active results, run records, and finding promotion coexist. Functions are individually bounded and line coverage is 93.51%, so the concern is navigation and change radius rather than local algorithm quality. | Create parser, catalog/graph, validation/revision, evaluation, run-record, and promotion modules behind a compatibility barrel. |
| 11 | P1 | `shared/automate.ts` | 873 lines and 37 exports across markers, payload sets, limits, rules, results, clustering, and sessions. `normalizeAutomateRule` scores 28 decisions. Coverage is 98.36% lines, but this domain controls bounded active traffic and changes for several independent reasons. | Split markers/payloads, limits/rules, results/clustering, and session normalization behind `shared/automate.ts`. |
| 12 | P1 | `shared/findings.ts` | 864 lines and 29 exports. Finding normalization/templates, evidence creation, filtering/merging, retest matrices, redaction, and Markdown/HTML reports share one module. `buildFindingReport` is 71 lines with a decision score of 22. Coverage is 95.55% lines. | Split core state, evidence adapters, merge/retest, redaction, and report renderers behind a barrel. |
| 13 | P1 | `shared/advancedTesting.ts` | 1,298 lines, 39 exports, and 105 function-like bodies. GraphQL, API import, auth, parameters, secrets, headers, proxy guidance, workflow drafting, and summary composition are independent analysis families. Coverage is 97.46% lines, so this is a human-navigation problem more than a correctness gap. | One module per analysis family, one workflow-draft adapter module, and a summary composer. |
| 14 | P1 | `shared/globalSearch.ts` | 866 lines. Parsing and candidate construction for most Radar domains share one module. `advancedCandidates` is 141 lines; every new searchable feature expands this central owner. Coverage is 97.38% lines and the feature is read-only, lowering runtime risk. | Keep parser/matcher/ranker core together; move candidate builders beside their domains and compose them through typed providers. |
| 15 | P1 | `src/hooks/workbench/useProjectArtifactsDomain.ts` | 500 lines; its hook body is 442 lines with approximately 40 hook calls. Notes, saved views, bundle export/import, and handoff state share one hook, and no focused test imports it. | Compose `useProjectNotes`, `useSavedViews`, `useProjectBundles`, and `useHandoffPackage`; keep the current aggregate return type during migration. |
| 16 | P1 | `src/components/views/FindingsView.tsx` | 732 lines; the main render function is 662 lines with 23 destructured inputs. State already lives in a hook, so the remaining cost is scanning list, editor, evidence, retest, merge, and report markup together. | Extract named visual panels with narrow view models. Keep finding behavior in existing hooks/shared helpers. |
| 17 | P1 | `src/components/views/AutomateView.tsx` | 651 lines; the main component is 576 lines and destructures 46 props, the widest component API in the renderer. | Group marker, payload, run-control, rule, result, and promotion models; render one panel per operator task. |
| 18 | P1 | `src/components/shell/AiOperationsDrawer.tsx` | 569 lines; the main component is 487 lines with 42 props. Setup, history, mission, capabilities, tutorial, recovery, transcript, and memory remain one view despite controller extraction. | Introduce grouped drawer models and named sections under a small drawer shell. |
| 19 | P1 | `src/components/shell/ProjectArtifactsOverlay.tsx` | 540 lines. Its three top-level props hide a `workbench` object with more than 40 members spanning four separate workflows. | Notes, Saved Views, Bundle, and Handoff panels with explicit, narrow models. Align these panels with the four hook/controller seams. |
| 20 | P1 | `src/components/IdentityLab.tsx` | 442 lines after model/editor extraction. Its 390-line render function still has the highest presentation decision score in the large-component set at 30. It does have a focused component suite. | Split roster/editor, access matrix, differential comparison, and causal ledger panels; keep derivation in the existing model. |
| 21 | P1 | `src/components/views/WorkflowsView.tsx` | 476 lines. The 430-line render function scores 24 decisions across catalog, editor, graph, dry run, revisions, history, results, and promotion. No focused test imports the view. | One visual panel per operator task, with the editor hook remaining the state owner. |
| 22 | P2 | `src/components/views/TrafficView.tsx` and `src/components/views/RepeaterView.tsx` | 514/504 lines with 34/40 inputs. Both are presentation-heavy and rely on extracted domain hooks, so their risk is comprehension rather than hidden behavior. | Split task-oriented panels when either view next changes materially. |
| 23 | P2 | `src/components/views/PluginsView.tsx` and `src/components/views/AdvancedView.tsx` | 449/461 lines across several panels. They are readable enough today but will become awkward with another feature family. | Extract one panel per operator task during the next feature addition. |
| 24 | P2 | `src/styles.css` | 828 lines. Theme tokens, shared keyframes, selection, and shell atmosphere belong here, but Traffic-specific layout selectors still mix global and view ownership. | Move only view-specific layout/responsive rules into component utilities; keep shared tokens and motion global. |
| 25 | P2 | `shared/domain.ts` and `shared/agent-types.ts` | 867/871 type-only lines with 68/47 importers. Runtime risk is low, but navigation, merge conflicts, and ownership are broad. | Split feature contract families behind compatibility barrels. Avoid a repository-wide import rewrite in one change. |
| 26 | P2 | `electron/screenshotPreload.ts` and `src/test/radarApiStub.ts` | 957/729 lines. Both intentionally provide broad fixture/stub surfaces, but every preload API addition still changes one large object. | Compose typed domain stub factories matching the shared API contracts. |
| 27 | P2 | `src/App.test.tsx`, `electron/agent/runtime.test.ts`, and `electron/localStore.test.ts` | 2,226/1,742/1,736 lines. Coverage is valuable, but feature behavior, composition behavior, and many failure modes share three navigation bottlenecks. | Keep only cross-feature composition tests in these files; colocate behavior with extracted hooks, services, and repositories. |
| 28 | Keep | `electron/store/schema.ts` | 423 lines in one schema application function. Most of the size is declarative SQL and ordered migration work; splitting by arbitrary line count could obscure transaction order. | Keep until a new schema version requires explicit numbered migrations, then extract migrations by version rather than table. |
| 29 | Keep | `electron/demoProject.ts` | 746 lines, mostly deterministic local demo fixtures and seeding. Its size does not imply broad runtime authority. | Keep; extract fixture families only if normal demo maintenance becomes conflict-prone. |
| 30 | Keep | `electron/playwrightBrowser.ts` | 348-line lifecycle facade after scoped actions and inspection were extracted. It has focused lifecycle/failure tests and a clear ownership boundary. | Keep the facade; add future actions to the existing action/inspection modules. |

## Detailed Conclusions

### 1. The main-process problem is now composition density, not hidden feature state

`electron/main.ts` was reduced from 2,917 to 1,342 lines and from 26 mutable top-level values to six. Browser, proxy, intercept, capture, and causal-attribution state now have owners. That is a substantial architectural improvement.

The remaining file still requires knowledge of almost every Electron domain because it constructs controllers and supplies 13 registrar dependency objects. The correct next extraction is not another generic service layer. It is two concrete owners:

1. application context plus window lifecycle;
2. project-level report and global-search operations.

Controller creation and IPC registration should remain visible in `main.ts`; hiding those edges behind a container would reduce traceability.

### 2. CDP event mapping is the highest correctness-specific seam

Radar currently maps Network events twice: once for managed Chrome over a WebSocket CDP connection and once for Electron `webContents.debugger`. Both paths construct captures, TLS details, response bodies, and WebSocket lifecycle evidence.

The transport adapters are legitimately different. The evidence semantics are not. A pure reducer should accept a normalized CDP event and current request/socket state, then emit typed evidence mutations and optional body-load commands. This would make both transports share one event corpus and eliminate semantic drift without merging their lifecycle code.

### 3. Planner context compaction needs coverage before structural polish

The context compactor enforces raw-context opt-in by redacting headers, bodies, cookies, storage, and Automate payloads. It also caps arrays and text before provider dispatch. Its low coverage is more important than its 314-line size.

The next change should first add a fixture for every raw-bearing tool result and assert both `allowRawContext: false` and `true`. Once the matrix exists, converting the switch to a typed compactor registry becomes low risk.

### 4. Identity Lab currently has two models

The active product path uses `shared/identityProfiles.ts`, attributed `CapturedRequest` records, `electron/identity/identityController.ts`, and renderer presentation/model helpers. `shared/identityLab.ts` defines a separate project-scoped identity/resource/evidence/matrix/invariant/sequence model.

Its runtime functions are tested but not called by production code. This creates conceptual cost: a maintainer cannot tell which Identity Lab rules are authoritative. The team should make an explicit product decision before decomposing either model.

### 5. Shared domain catalogs are healthy code with poor navigation

The large shared files have high coverage, immutable inputs, bounded functions, and no mutable module state. They are not god objects. Their issue is that unrelated subdomains share one export surface and one merge-conflict zone.

Compatibility barrels are the right technique because they improve ownership without forcing simultaneous import churn. `agentMission` and `agentCapabilities` demonstrate the intended pattern.

### 6. Large renderer files mostly need visual sections, not more business abstractions

The renderer refactor already moved most state and derivation into hooks and pure helpers. The next component pass should extract named panels that correspond to operator tasks. It should not create generic card, section, or field abstractions solely to reduce line counts.

The highest-value API improvement is grouped view models for Automate, AI Operations, and Project Artifacts. Their current prop surfaces make it easy to accidentally couple unrelated workflows.

## Recommended Execution Order

### Tranche A — correctness and privacy boundaries

1. Create a shared pure CDP network-event reducer and reuse it from both capture adapters.
2. Add complete raw-context compaction fixtures, then split compaction by tool family.
3. Colocate agent tool schemas and normalizers by family.
4. Extract agent recovery and lifecycle services behind `AgentRuntime`.
5. Split intercept mutation decisions from queue/network side effects.

### Tranche B — ownership decisions and external I/O

6. Decide whether `shared/identityLab.ts` becomes canonical or is retired.
7. Extract application context/window lifecycle and project operations from `electron/main.ts`.
8. Split and directly test project bundle import/export and handoff writing.
9. Decompose `useProjectArtifactsDomain` and its overlay along the same four workflows.
10. Extract local-context persistence while retaining the public store facade.

### Tranche C — navigation and presentation

11. Convert `workflows`, `automate`, `findings`, `advancedTesting`, and `globalSearch` to compatibility barrels one domain at a time.
12. Split the six P1 renderer components into named task panels with grouped view models.
13. Split type barrels, stubs, styles, and test monoliths only when adjacent feature work makes the change useful.

## Definition Of Done For The Next Pass

A follow-up refactor should be considered complete only when:

- the public API of each compatibility facade remains stable or migrations are explicit;
- Manual-First and AI-First paths still call the same scoped operations;
- raw-context, scope, replay caps, capability checks, and audit visibility remain fail-closed;
- every extracted security or I/O boundary has a focused main-path and failure-path test;
- newly covered high-risk files enter the staged coverage gate without lowering its floors;
- `pnpm lint`, `pnpm test:unit`, `pnpm build`, and `git diff --check` pass;
- documentation describes any changed ownership;
- no generated regression artifacts are rewritten unless the user-visible surface actually changed.

## Bottom Line

Radar's architecture is materially healthier after the refactor. The next pass should focus on five correctness boundaries and one product-model decision, then address shared-domain and presentation readability incrementally. A repository-wide mechanical split would now create more risk than value.
