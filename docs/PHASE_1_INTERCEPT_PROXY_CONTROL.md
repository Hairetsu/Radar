# Phase 1 - Intercept And Proxy Control

Phase status: Complete

This plan slices the roadmap Phase 1 into shippable increments. Each slice should leave Manual-First usable, keep AI-First bounded through the same contracts when exposed, and include focused tests plus user-facing documentation.

## Slice 1 - Request Intercept Queue

Status: Complete

- [x] Add shared intercept queue types and IPC contracts.
- [x] Add request interception state in the Electron main process.
- [x] Queue scoped HTTP/S proxy requests when request interception is enabled.
- [x] Support forward, drop, edit, and resume-all request actions.
- [x] Record intercept action metadata on captured request evidence.
- [x] Add an Intercept workbench view with queue, editor, controls, and visible state.
- [x] Add focused tests and documentation for the Manual-First workflow.

Exit check: an operator can enable request interception, pause a scoped request, edit headers or body, forward or drop it, and see the action reflected in HTTP history evidence metadata.

## Slice 2 - Response Intercept Queue

Status: Complete

- [x] Queue scoped HTTP/S responses after upstream response headers/body are available.
- [x] Support forward, drop, edit status, edit headers, edit body, and resume-all response actions.
- [x] Preserve request and response action metadata on the final capture.
- [x] Add response mode controls and focused tests.

Exit check: an operator can pause a login response, edit a response header/body, forward it, and inspect the final response in HTTP history.

## Slice 3 - Interception Rules

Status: Complete

- [x] Add normalized rules for method, host, path, content type, status, initiator, request header, response header, and body search.
- [x] Add rule persistence per workspace.
- [x] Add rule editor and rule hit explanations in the Intercept view.
- [x] Add fail-closed validation and tests for rule matching.

Exit check: an operator can enable intercept only for a targeted login/API pattern and see which rule queued each item.

## Slice 4 - Match And Replace V1

Status: Complete

- [x] Add scoped request and response rewrite rules for headers and bodies.
- [x] Apply rewrites in the proxy pass-through path.
- [x] Record each fired rewrite as evidence metadata.
- [x] Add UI controls, rule explanations, and tests.

Exit check: scoped header/body rewrite rules run without touching out-of-scope traffic and explain which rule fired.

## Slice 5 - Proxy Profiles

Status: Complete

- [x] Add per-workspace proxy profile notes for Radar Browser, external browser, CLI, and mobile/device clients.
- [x] Persist proxy profile metadata locally.
- [x] Surface setup hints in the SSL/proxy view.
- [x] Keep profiles local-only and scoped to the active workspace.

Exit check: an operator can save setup notes for different client types and retrieve them with the active project/workspace.

## Slice 6 - AI-First Prepare-Only Intercept Tools

Status: Complete

- [x] Expose read-only queued item context to AI-First.
- [x] Let AI prepare request/response edits into visible controls.
- [x] Keep forward/drop/send actions operator-confirmed.
- [x] Add timeline entries and tests showing visible state changes.

Exit check: AI-First can inspect queued items and prepare edits, but cannot forward or drop queued traffic without operator action.
