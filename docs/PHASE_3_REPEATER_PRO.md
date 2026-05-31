# Phase 3 - Repeater Pro

Phase status: Complete

This plan slices roadmap Phase 3 into shippable increments. Each slice should leave Manual-First usable, keep AI-First bounded through the same contracts when exposed, and include focused tests plus user-facing documentation.

## Slice 1 - Multi-Tab Repeater Foundation

Status: Complete

- [x] Add shared `replay_tabs` contracts: tab id, name, pinned flag, draft, active environment id, timestamps.
- [x] Persist repeater tab state per workspace with migrations and validation.
- [x] Replace single global repeater draft with tab bar UI: create, rename, close, select, pin.
- [x] Keep clone-to-repeater and AI draft loads targeting the active tab.
- [x] Add IPC, preload, hook, UI, and persistence tests.

Exit check: an operator can maintain separate auth, API, and edge-case replay tabs without losing each tab's draft when switching.

## Slice 2 - Replay History Per Tab

Status: Complete

- [x] Add shared `ReplayHistoryEntry` records with request snapshot, response, and sent timestamp.
- [x] Append history on successful single replay and burst final result; cap history per tab.
- [x] Render per-tab history list with load-into-editor and compare selection hooks.
- [x] Persist history with tab state and survive app restart.
- [x] Add focused tests for history caps, tab isolation, and load-back behavior.

Exit check: an operator can replay a request, switch tabs, return, and reload a prior attempt from that tab's history.

## Slice 3 - Response Diff Engine

Status: Complete

- [x] Add pure diff helpers for status, latency, headers, body length, text body diff, and JSON diff.
- [x] Compare two history entries or the latest two attempts in the active tab.
- [x] Render a diff panel in Repeater with clear changed/added/removed markers.
- [x] Add focused tests for JSON diff, header diff, and identical-response no-op cases.

Exit check: response diffs make auth bypass, cache, and validation changes obvious between two replay attempts.

## Slice 4 - Variables And Environments

Status: Complete

- [x] Add shared environment contracts with named variable sets scoped to the workspace.
- [x] Support `{{variable}}` substitution in URL, headers, and body through one normalization path.
- [x] Apply variables in Manual-First replay, burst replay, and AI-First `sendReplay`.
- [x] Add environment editor UI and per-tab active environment selector.
- [x] Add IPC, persistence, substitution, and scope-safe validation tests.

Exit check: variables work in Manual-First replay and AI-First replay through the same normalization path.

## Slice 5 - Collections

Status: Complete

- [x] Add shared collection contracts for reusable request groups with named items.
- [x] Persist collections per workspace with create, rename, delete, and reorder flows.
- [x] Save current tab draft to a collection and load collection items into a new or active tab.
- [x] Add IPC, UI, and normalization tests.

Exit check: an operator can save a useful replay request into a collection and reopen it later without retyping from capture history.

## Slice 6 - Request Transformations

Status: Complete

- [x] Add pure transformation helpers: URL encode/decode, JSON format/minify, base64 encode/decode, JWT decode, cookie parse.
- [x] Expose transformation actions on the active selection or whole editor fields in Repeater.
- [x] Keep transformations local-only and non-destructive until the operator applies them.
- [x] Add focused helper tests for malformed input and round-trip cases.

Exit check: an operator can format a JSON body, decode a JWT from a header, or parse cookies without leaving Repeater.

## Slice 7 - WebSocket Replay v1

Status: Complete

- [x] Add shared WebSocket replay draft contracts derived from selected frames.
- [x] Load sent/received frame payloads into an editable WebSocket replay draft from the WebSocket view.
- [x] Send one bounded WebSocket message on a fresh connection where handshake metadata allows it.
- [x] Record resulting handshake and frame evidence in the active session.
- [x] Add policy tests for scope, payload caps, and unsupported frame types.

Exit check: an operator can edit a captured WebSocket payload and send one scoped replay attempt with visible session evidence.

## Slice 8 - AI-First Repeater Pro Tools

Status: Complete

- [x] Add bounded tools to load repeater drafts into visible tabs, select history entries, and summarize replay diffs.
- [x] Expose active tab, environment, and recent replay context read-only to AI-First within scope.
- [x] Let AI-First compare two replay results and draft findings from replay evidence without bypassing caps.
- [x] Record timeline entries when AI loads tabs, environments, or diff selections into visible controls.
- [x] Add policy tests ensuring AI cannot exceed replay budgets or mutate collections silently.

Exit check: AI-First can load visible repeater drafts, compare replay evidence, and draft findings, but cannot bypass scope, caps, or operator-confirmed replay policy.

## Phase Exit Criteria

From `docs/ROADMAP.md`:

- A tester can maintain a set of replay tabs for auth, API, and edge-case testing without losing history.
- Response diffs make auth bypass, cache, and validation changes obvious.
- Variables work in Manual-First replay and AI-First replay through the same normalization path.

## Suggested Implementation Order

1. Slice 1 - Multi-Tab Repeater Foundation
2. Slice 2 - Replay History Per Tab
3. Slice 3 - Response Diff Engine
4. Slice 4 - Variables And Environments
5. Slice 5 - Collections
6. Slice 6 - Request Transformations
7. Slice 7 - WebSocket Replay v1
8. Slice 8 - AI-First Repeater Pro Tools

Shared contracts and persistence land before UI for each slice. Response diff depends on replay history. Variables should land before collections and AI tools so replay normalization stays unified.

## Release Mapping

This phase corresponds to roadmap milestone **0.4 - Repeater Pro**:

- Multi-tab repeater
- Replay history
- Response diffing
- Variables and environments
- Collections
