# Phase C - AI-First Observation Console

This spec is the prerequisite slice for Roadmap 2 Phase C. Before Radar adds more AI-First profiles or deeper autonomous behavior, the operator needs a full, durable view of what the agent is doing and a recoverable path when a tool fails.

## Implementation Status

Shipped in Roadmap 2 Phase C. Radar now stores full AI-First timelines, renders a non-truncated Observation Console, shows profile and budget state, records visible targets, highlights tool/provider failures, offers recovery actions, supports redacted local context summaries, quality-gates draft findings, loads review-first workflow drafts, and stores project-scoped run memory.

## Problem

Today the AI-First console can feel like a clipped status widget. The run history is persisted, but the visible console only shows a small tail of timeline entries. When a tool returns a generic failure, the operator can lose the exact sequence that led there, including prior storage/cookie reads, captured evidence, selected tool rationale, and visible browser state.

The failure case to design against:

1. AI-First calls `getStorageState`.
2. AI-First selects `analyzeSecurityHeaders` based on captured landing, RSC, static asset, and sign-in redirect evidence.
3. `analyzeSecurityHeaders` returns `Run failed`.
4. The UI must not stop at a generic failure. It should show the full action stream, highlight the failed step, preserve the evidence and visible browser/workbench state, and let the operator retry, continue, or stop intentionally.

## Product Contract

- AI-First opens a docked chat/transcript console, not just a short timeline preview.
- The transcript is durable local session state. Rendering may use virtualization, paging, or collapsed cards for performance, but the saved and inspectable history is never truncated.
- The transcript includes user prompts, agent decision summaries, tool calls, tool results, policy blocks, provider errors, app/browser visible effects, evidence refs, draft findings, and run completion state.
- Agent decision entries show operator-facing rationale summaries: why the agent selected a tool, what evidence it relied on, and what it expected to inspect or change. Radar should not expose raw hidden chain-of-thought.
- Every tool call has a status: `queued`, `running`, `succeeded`, `failed`, `policy-blocked`, `cancelled`, or `skipped`.
- Every failed step remains inspectable after the run ends or is resumed.
- Stop remains globally visible and immediate.

## Console UX

- Layout: a right-side or bottom dock that can expand to full height without covering evidence panes permanently.
- Header: run goal, profile, status, elapsed time, budgets, current tool, and Stop.
- Chat stream: user messages and agent summaries with timestamps.
- Action cards: one card per tool call with tool name, status, input summary, result summary, evidence refs, visible target, and expandable raw structured detail with redaction applied.
- Failure cards: high-contrast error state with last successful action, failed input summary, error text, likely recovery options, and affected refs.
- Controls on failure: retry same tool, retry after refreshing evidence, skip and continue, stop run, or copy details into a draft finding/note.
- Search/filter: filter transcript by tool, error, evidence ref, status, or text.
- Resume: opening a saved AI-First run should restore the full transcript, selected failed card, and linked evidence where possible.

## Visible Action Choreography

AI-First should visibly use the app and browser in front of the operator. Each tool contract should declare a `visibleTarget` object so the renderer knows what to show while the tool is running.

Examples:

```ts
type AgentVisibleTarget =
  | { kind: "view"; view: RadarViewId }
  | { kind: "capture"; captureId: string; view?: "traffic" | "sitemap" }
  | { kind: "repeaterDraft"; tabId: string }
  | { kind: "interceptItem"; itemId: string }
  | { kind: "workflowRun"; runId: string }
  | { kind: "browserPage"; url: string; elementLabel?: string; selectorHint?: string };
```

Renderer behavior:

- Switch to the relevant Radar view before or as the tool begins.
- Select and scroll the relevant evidence row or draft control into view.
- Apply a short pulse/highlight ring to the active pane, row, form control, or browser target.
- Keep a compact "Agent is doing..." banner tied to the same visible target.
- Clear or downgrade the highlight when the tool succeeds, fails, or is cancelled.
- If the controlled browser is not visible or the CDP connection drops, show recovery state before retrying browser inspection.

## Failure Recovery

Tool and provider failures should be structured results, not opaque terminal states.

Required failure fields:

- Tool name and call id.
- Input summary with secrets and raw context redacted by policy.
- Error category: provider, policy, validation, scope, timeout, browser, replay, workflow, parser, persistence, or unknown.
- Error message suitable for the operator.
- Last successful action id.
- Linked evidence refs used by the failed decision.
- Last visible app target and browser URL.
- Suggested recovery actions that are allowed by policy.

Recovery rules:

- Do not silently repeat active replay, workflow, or browser-mutating actions unless the profile budget and operator policy allow it.
- Retrying a passive analysis tool may reuse the same evidence or refresh scoped evidence first.
- Skipping a failed tool records an explicit `skipped` transcript entry with the operator or agent reason.
- Continuing after failure keeps the failed card in the transcript and marks downstream findings as uncertain if they depended on that failed evidence.
- Stopping a failed run preserves the transcript and can create a local note or draft finding from selected entries.

## Data And Contracts

Extend shared agent timeline contracts before renderer work:

- Add stable `callId`, `parentId`, `status`, `startedAt`, `completedAt`, `durationMs`, `visibleTarget`, `inputSummary`, `resultSummary`, `errorCategory`, `errorMessage`, `evidenceRefs`, and `recoveryActions`.
- Keep raw tool payloads behind explicit redaction policy and size caps.
- Store transcript entries in the existing local AI run history path, with migrations and crash-safe writes.
- Expose preload/IPC reads for paged transcript loading and active transcript updates.
- Keep all payloads serializable and cross-runtime safe.

## Implementation Slices

1. Shared transcript model: typed statuses, visible targets, recovery actions, redacted summaries, and tests for normalization/failure cases.
2. Agent runtime events: emit queued/running/result/failure/skipped entries for every tool and provider call.
3. Persistence: migrate and store full transcript entries without truncation; add large-run read tests.
4. Renderer console: docked transcript, action cards, filters, expandable details, failure cards, and restore-on-open behavior.
5. Visible target highlighting: view switching, selected evidence focus, draft-control highlighting, browser target banner, and cleanup.
6. Recovery controls: retry, refresh-and-retry, skip, continue, stop, and draft-note/finding creation through existing safe contracts.
7. QA and docs: update README, user guide, manual QA checklist, screenshots, and Roadmap 2 execution status when shipped.

## Tests And Verification

- Unit tests for transcript normalization, status transitions, redaction, visible target validation, and recovery action policy.
- Agent runtime tests showing a failed `analyzeSecurityHeaders` after `getStorageState` produces a durable failed action card with recoverable state.
- Persistence tests for long transcripts and crash-safe writes.
- Renderer tests proving the console renders more than the last six entries, supports filtering, highlights failed entries, and restores a saved failed run.
- Browser/workbench integration tests proving active tool calls switch to the expected view and highlight the expected target.
- Manual QA: run AI-First against seeded demo data, force one passive tool failure, verify the transcript remains complete, then retry or continue without losing context.

## Out Of Scope

- Raw hidden chain-of-thought display.
- Background AI actions that bypass the visible workbench.
- Unbounded transcript payload storage.
- Automatic replay/workflow retries without profile budget and policy checks.
- Hosted or shared run transcripts.

## Exit Criteria

- The AI-First console shows a full, searchable, durable transcript for the active and saved run.
- A failed passive analysis tool never collapses to a context-free `Run failed`.
- The operator can tell what the agent is doing now by looking at the app/browser, not just by reading text.
- The operator can retry, refresh-and-retry, skip, continue, or stop from a failed step without losing evidence or state.
- Documentation and manual QA cover the complete failure-recovery flow.
