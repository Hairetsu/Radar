# Phase 8 - Advanced Testing Surfaces

Status: Complete

Purpose: cover the advanced API, auth, data-discovery, and proxy-guidance workflows that make operators keep a second proxy open, while preserving Radar's Manual-First and AI-First safety model.

## Slice Plan

### Slice 1 - Local Advanced Analysis Contracts

Status: Complete

- Add shared analyzers for GraphQL operations, importable API definitions, auth matrix grouping, parameter discovery, local secret detection, header/cache behavior signals, and proxy guidance.
- Keep the analysis local-only and deterministic.
- Add focused tests for valid evidence, invalid import input, and fail-closed parsing.

### Slice 2 - Advanced Workbench View

Status: Complete

- Add a dedicated **Advanced** workbench view after Plugins.
- Surface GraphQL review, API import drafts, auth matrix rows, parameter inventory, secret signals, header/cache behavior, and mobile/thick-client proxy guidance.
- Keep imported definitions as text-only drafts; no network traffic is sent from import preview.

### Slice 3 - AI-First Visibility

Status: Complete

- Add **Advanced** to the visible AI workbench view union.
- Add a read-only `getAdvancedTestingSummary` AI-First tool that summarizes local advanced analysis without importing files or transmitting requests.
- Keep active checks, import execution, and replay template use Manual-First.

### Slice 4 - Documentation And Roadmap Closeout

Status: Complete

- Update README, user guide, roadmap, and the Phase 8 slice plan.
- Document Manual-First and AI-First behavior, local-only secret handling, and troubleshooting.
- Run verification commands and refresh screenshots when practical.

## Completion Notes

- Phase 8 shipped as a first-class Advanced surface instead of hidden helpers inside separate tabs.
- API import support is preview-only for OpenAPI and Postman JSON. Imported operations become draft replay templates and sitemap seeds; operators decide what to run or save.
- Secret detection uses local regex/rule checks over scoped evidence and masks matched values in previews.
- AI-First can inspect the Advanced summary but cannot import files, widen scope, approve plugins, or execute replay/import actions invisibly.
