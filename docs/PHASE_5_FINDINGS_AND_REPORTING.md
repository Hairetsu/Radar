# Phase 5 - Findings And Reporting

Phase status: Complete

This plan slices roadmap Phase 5 into shippable increments. Manual-First now has a durable findings inbox and report export surface. AI-First can create draft findings through the same model, but findings stay draft until the operator reviews them.

## Slice 1 - Findings Model And Evidence References

Status: Complete

- [x] Add shared findings contracts for severity, confidence, status, affected assets, evidence references, reproduction, impact, remediation, notes, owner, and retest result.
- [x] Normalize stable evidence refs for captures, WebSocket frames, replay history, Automate results, workflow results, and AI timeline entries.
- [x] Add common web finding templates.
- [x] Add pure helper tests for normalization, evidence parsing, and template defaults.

Exit check: a finding can hold stable local evidence references from every current evidence source without accepting malformed or empty draft records.

## Slice 2 - Local Persistence And IPC

Status: Complete

- [x] Persist findings per local session with schema migration support.
- [x] Add IPC and preload methods for list, upsert, delete, and export preview.
- [x] Keep persistence local-only and session-scoped.
- [x] Add focused local-store tests.

Exit check: findings survive app restart and session switches without leaking across workspaces.

## Slice 3 - Manual Findings Inbox

Status: Complete

- [x] Add a Findings workbench view with list, editor, template picker, review controls, evidence refs, and retest fields.
- [x] Add quick finding creation from the selected HTTP/S capture, WebSocket frame, and Automate result.
- [x] Support draft, reviewed, accepted-risk, retest-passed, and retest-failed status changes.
- [x] Add renderer tests for manual creation and editing flows.

Exit check: an operator can create a draft finding from live evidence, review it, add reproduction/impact/remediation, assign ownership, and reopen it later.

## Slice 4 - Report Builder And Evidence Appendix

Status: Complete

- [x] Generate Markdown report output from reviewed or selected findings.
- [x] Generate HTML report output for handoff.
- [x] Generate a redacted evidence appendix by default, with an explicit raw-evidence toggle in the export preview.
- [x] Add copy/download controls and export tests.

Exit check: an operator can produce credible report notes and an evidence appendix from inside Radar without exposing raw bodies unless explicitly requested.

## Slice 5 - AI-First Draft Finding Integration

Status: Complete

- [x] Convert AI-First finish findings into the durable findings inbox as draft findings.
- [x] Preserve source AI run and timeline evidence references.
- [x] Keep AI-generated findings visibly draft until reviewed.
- [x] Add policy/runtime tests proving evidence-less findings are rejected.

Exit check: AI-generated findings land in the same inbox as manual findings, clearly marked draft, and cannot bypass evidence requirements.

## Slice 6 - Retest Mode

Status: Complete

- [x] Add retest status/result fields and session evidence linking.
- [x] Let operators attach current-session evidence to an existing finding.
- [x] Include retest state in Markdown/HTML export.
- [x] Document the retest workflow.

Exit check: a tester can link an old finding to new session evidence and mark the retest result without losing the original evidence trail.

## Phase Exit Criteria

From `docs/ROADMAP.md`:

- A tester can produce credible report notes and evidence appendices from inside Radar.
- AI-generated findings are clearly draft until reviewed.
- Every exported finding has stable local evidence references.

## Suggested Implementation Order

1. Slice 1 - Findings Model And Evidence References
2. Slice 2 - Local Persistence And IPC
3. Slice 3 - Manual Findings Inbox
4. Slice 4 - Report Builder And Evidence Appendix
5. Slice 5 - AI-First Draft Finding Integration
6. Slice 6 - Retest Mode

Shared contracts and export helpers land before persistence and UI. AI-First integration stays late so the agent writes through the same durable model as Manual-First.

## Release Mapping

This phase corresponds to roadmap milestone **0.6 - Findings And Reporting**:

- Findings inbox
- Evidence references
- Templates
- Markdown and HTML report export
- Evidence appendix and retest tracking
