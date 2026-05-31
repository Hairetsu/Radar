# Phase 2 - Traffic Intelligence And Sitemap

Phase status: Complete

This plan slices roadmap Phase 2 into shippable increments. Each slice should leave Manual-First usable, keep AI-First bounded through the same contracts when exposed, and include focused tests plus user-facing documentation.

## Slice 1 - Traffic Query Language v1

Status: Complete

- [x] Add shared query AST, parser, and evaluator tailored to Radar's capture model.
- [x] Support scoped predicates for method, host, path, status, status family, MIME type, source, initiator, request header, response header, request body, and response body.
- [x] Add fail-closed parse errors with operator-readable messages.
- [x] Evaluate queries in the main process for the active session with indexed fields where practical.
- [x] Replace traffic substring search with the query bar while keeping a simple fallback mode.
- [x] Add syntax help, example queries, and focused parser/evaluator tests.

Exit check: an operator can answer "show POST JSON endpoints returning 401/403 under `/api` from this session" with one query and see only scoped matching captures.

## Slice 2 - WebSocket Query Integration

Status: Complete

- [x] Extend the shared query language to WebSocket frame fields: direction, host, URL, opcode, payload, request/response headers, and error text.
- [x] Apply the same query bar, parse errors, and main-process evaluation path to the WebSocket view.
- [x] Keep frame queries scope-aware and session-scoped.
- [x] Add focused tests for frame-only predicates and mixed evidence queries where useful.

Exit check: an operator can filter WebSocket frames with the same query language used for HTTP/S traffic, including payload and direction predicates.

## Slice 3 - Saved Filters And Filter Chips

Status: Complete

- [x] Add per-workspace saved filter records with name, query text, target surface (`traffic`, `websocket`, or `both`), and created/updated timestamps.
- [x] Persist saved filters locally with migrations and validation.
- [x] Render active query as removable filter chips in traffic and WebSocket views.
- [x] Add save, rename, delete, and apply flows for saved filters.
- [x] Add keyboard shortcuts for focus-search, apply-last-filter, and clear-filters.
- [x] Add IPC, preload, hook, UI, and persistence tests.

Exit check: an operator can save a useful query, reapply it later from the workbench, and clear or edit it without retyping the full expression.

## Slice 4 - Tags And Comments

Status: Complete

- [x] Add shared `capture_tags` contracts for tags and comments on captures and WebSocket frames.
- [x] Persist tags/comments per workspace with stable evidence references.
- [x] Add tag and comment editors in traffic and WebSocket detail panels.
- [x] Show tags in list rows and make tags queryable through the query language.
- [x] Keep all tag writes scoped to allowed evidence only.
- [x] Add focused tests and user-guide coverage for annotation workflows.

Exit check: an operator can tag a suspicious login request, add a comment, filter traffic by that tag, and still see the annotation after app restart.

## Slice 5 - Bulk Actions

Status: Complete

- [x] Extend existing multi-select in traffic and WebSocket views to operate on the current filtered result set.
- [x] Add bulk tag, bulk comment append, bulk delete, and bulk export for scoped selections.
- [x] Require explicit confirmation for destructive bulk actions.
- [x] Record bulk action metadata where it affects evidence integrity.
- [x] Add tests for selection boundaries, scope enforcement, and empty/partial selections.

Exit check: an operator can select ten scoped captures from a saved filter, bulk-tag them as `review`, and export the selection without touching out-of-scope traffic.

## Slice 6 - Sitemap v1

Status: Complete

- [x] Add shared `sitemap_nodes` contracts for host/path endpoint inventory.
- [x] Build or refresh sitemap nodes from scoped session captures with first/last seen timestamps.
- [x] Add a Sitemap workbench view with host tree and path tree navigation.
- [x] Aggregate methods, status families, MIME types, and request counts per node.
- [x] Let node selection apply a traffic query or jump to the newest matching capture.
- [x] Add persistence or rebuild strategy, IPC, UI, and performance tests for large sessions.

Exit check: the sitemap can become the primary way to browse discovered hosts and paths for the active session instead of scrolling the capture table.

## Slice 7 - Endpoint Inventory

Status: Complete

- [x] Derive endpoint inventory details from captures: query params, JSON body keys, form fields, content types, and auth-related signals.
- [x] Attach inventory metadata to sitemap nodes and expose it in the sitemap detail panel.
- [x] Normalize parameter names and preserve first/last seen examples without storing secrets beyond existing capture evidence.
- [x] Make inventory fields searchable through the query language where practical.
- [x] Add pure helper tests for extraction edge cases and UI tests for inventory display.

Exit check: an operator can open a sitemap node and see discovered params, body keys, and auth signals for that endpoint without manually reading every capture.

## Slice 8 - Session Diff

Status: Complete

- [x] Add shared session diff contracts for endpoint-level comparison between two scoped sessions in the same workspace.
- [x] Detect new endpoints, removed endpoints, changed status, changed headers, and changed response shape.
- [x] Add a diff mode in the sitemap or a dedicated comparison panel with clear before/after evidence links.
- [x] Keep comparisons local-only and bounded with progress/status for large sessions.
- [x] Add focused tests for diff classification and regression cases around renamed paths and status-only changes.

Exit check: an operator can compare a retest session against an earlier session and see changed attack surface with links back to supporting captures.

## Slice 9 - AI-First Passive Mapping Tools

Status: Complete

- [x] Expose read-only sitemap, saved-filter, and coverage context to AI-First within scope.
- [x] Add bounded tools to summarize host/path coverage and suggest next manual paths.
- [x] Keep suggestions prepare-only; do not auto-navigate or mutate evidence without visible operator action.
- [x] Record timeline entries when AI inspects sitemap coverage or loads a suggested filter into visible controls.
- [x] Add policy tests ensuring AI cannot widen scope, mutate tags/comments, or run unbounded cross-session scans.

Exit check: AI-First can summarize what has been mapped in the current session and suggest scoped next steps, but cannot change evidence or scope silently.

## Phase Exit Criteria

From `docs/ROADMAP.md`:

- A tester can answer "show POST JSON endpoints returning 401/403 under `/api` from this session" quickly.
- The sitemap can become the main navigation surface for discovered hosts and endpoints.
- Radar can compare a retest session against an earlier session and show changed attack surface.

## Suggested Implementation Order

1. Slice 1 - Traffic Query Language v1
2. Slice 2 - WebSocket Query Integration
3. Slice 3 - Saved Filters And Filter Chips
4. Slice 4 - Tags And Comments
5. Slice 5 - Bulk Actions
6. Slice 6 - Sitemap v1
7. Slice 7 - Endpoint Inventory
8. Slice 8 - Session Diff
9. Slice 9 - AI-First Passive Mapping Tools

Shared contracts and persistence land before UI for each slice. Sitemap and session diff depend on stable query/filter semantics but not on tags or bulk actions.

## Release Mapping

This phase corresponds to roadmap milestone **0.3 - Traffic Intelligence**:

- Query language
- Saved filters
- Tags and comments
- Sitemap v1
- Session diff
