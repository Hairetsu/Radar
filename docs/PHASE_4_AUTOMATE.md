# Phase 4 - Automate

Phase status: Complete

This plan slices roadmap Phase 4 into shippable increments. Manual-First now includes bounded Automate runs, result analysis, persistence, and promotion to Repeater. AI-First can prepare visible controls and analyze existing results, but it cannot start invisible attack sessions.

## Slice 1 - Payload Position Foundation

Status: Complete

- [x] Add shared Automate marker syntax and payload-position detection helpers.
- [x] Detect explicit markers in repeater URLs, header values, and bodies.
- [x] Add an Automate workbench surface that inventories marked positions from the active repeater draft.
- [x] Add a materialized preview that replaces markers with an inline payload without transmitting.
- [x] Add focused tests and documentation for the marker workflow.

Exit check: an operator can mark payload positions in a scoped request draft, see each position, preview the first materialized request, and load the preview back into Repeater without running an attack session.

## Slice 2 - Payload Sets

Status: Complete

- [x] Add inline payload sets with normalization, caps, duplicate handling, and empty-line policy.
- [x] Add local wordlist import metadata without copying secrets into app logs.
- [x] Persist payload sets per workspace.
- [x] Add payload-set picker and editor controls in Automate.
- [x] Add tests for payload caps, malformed inputs, and persistence.

Exit check: an operator can save and reuse bounded inline payload sets or local wordlist references for marked request positions.

## Slice 3 - Attack Session Runtime

Status: Complete

- [x] Add shared attack session contracts for draft, positions, payload set, environment, limits, and status.
- [x] Add Electron runtime controls for start, stop, pause, resume, and retry.
- [x] Apply scope checks, replay normalization, environment variables, timeout, delay, concurrency, and hard caps before each request.
- [x] Persist partial sessions and survive immediate stop.
- [x] Add runtime and pure-helper tests for caps, scope failures, persistence, and session normalization.

Exit check: an operator can run a controlled payload pass against a scoped endpoint, stop it immediately, and preserve partial results.

## Slice 4 - Result Table

Status: Complete

- [x] Persist per-attempt results with payload, status, length, latency, word count, error, redirect, and match markers.
- [x] Render a sortable result table with filters for failures, matches, and outliers.
- [x] Add result detail preview plus copy/export controls.
- [x] Keep table updates incremental for long-running sessions through persisted polling.
- [x] Add UI and persistence tests for session start, saved sessions, and result metadata.

Exit check: an operator can sort and filter Automate results by meaningful response deltas instead of reading each response manually.

## Slice 5 - Clustering And Similarity

Status: Complete

- [x] Add response similarity fingerprints for status family, body length bands, header shape, and text digest.
- [x] Group results into clusters with representative attempts.
- [x] Surface outliers and status-family deltas.
- [x] Keep clustering deterministic and bounded for large result sets.
- [x] Add pure helper tests for stable cluster assignment.

Exit check: Radar groups repetitive responses and makes anomalous payload results obvious.

## Slice 6 - Match And Extract Rules

Status: Complete

- [x] Add scoped match rules for status, headers, body text, regex, redirects, length, and latency thresholds.
- [x] Add extract rules for response snippets and named regex captures.
- [x] Apply rules during runs and when persisted sessions are normalized.
- [x] Surface matched/extracted values in the result table and detail pane.
- [x] Add validation and tests that fail closed on malformed regex and unsafe rule payloads.

Exit check: an operator can define what makes a response interesting and see those markers attached to matching attempts.

## Slice 7 - Promotion And Evidence Links

Status: Complete for Phase 4

- [x] Promote interesting results into Repeater tabs with the exact materialized request.
- [ ] Promote results into draft findings once the Phase 5 findings model exists.
- [x] Link Automate results back to source payload sets and durable Automate session records.
- [x] Add export-friendly result JSON without leaking out-of-scope data.
- [x] Add tests for persistence and promotion boundaries.

Exit check: a useful Automate hit can become a replay tab or finding draft without losing the payload and response evidence that produced it.

## Slice 8 - AI-First Automate Tools

Status: Complete

- [x] Expose read-only Automate context to AI-First within saved scope.
- [x] Let AI propose payload drafts, payload sets, match rules, and result analyses in visible controls.
- [x] Keep AI-First execution unavailable for Automate runs until an explicitly stricter execution profile exists.
- [x] Keep Manual-First execution visible, bounded, and stoppable; reject unbounded fuzzing.
- [x] Add policy tests proving AI cannot widen scope or run invisible attack sessions.

Exit check: AI can help prepare and analyze Automate sessions, but execution remains capped, visible, and governed by the same safety model as Manual-First.

## Phase Exit Criteria

From `docs/ROADMAP.md`:

- A tester can run a controlled payload pass against a scoped endpoint and sort results by meaningful deltas.
- Radar can stop immediately and preserve partial results.
- AI can propose payload positions and analyze results, but execution remains capped and visible.

## Suggested Implementation Order

1. Slice 1 - Payload Position Foundation
2. Slice 2 - Payload Sets
3. Slice 3 - Attack Session Runtime
4. Slice 4 - Result Table
5. Slice 5 - Clustering And Similarity
6. Slice 6 - Match And Extract Rules
7. Slice 7 - Promotion And Evidence Links
8. Slice 8 - AI-First Automate Tools

Shared contracts and marker parsing land before UI execution. Payload-set persistence should land before attack sessions so runtime inputs are durable and testable. AI-First tools stay late until Manual-First contracts, caps, and visible state are stable.

## Release Mapping

This phase corresponds to roadmap milestone **0.5 - Automate**:

- Payload positions
- Payload sets and wordlists
- Controlled attack sessions
- Result sorting, clustering, and matching
- Promotion to Repeater; finding promotion follows the Phase 5 findings model
