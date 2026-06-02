# Phase 6 - Workflows

Phase status: Complete

This plan slices roadmap Phase 6 into shippable increments. Manual-First gets repeatable operator-run checks with durable results. AI-First may choose from saved workflows and built-ins, but it must run through the same typed contracts, scope policy, caps, evidence records, and visible run history.

## Slice 1 - Workflow Model And Declarative Parser

Status: Complete

- [x] Add shared workflow contracts for inputs, scope policy, steps, conditions, limits, result records, evidence outputs, and run status.
- [x] Support declarative JSON and a constrained YAML-like syntax that normalizes into the same workflow model.
- [x] Reject malformed workflows, empty steps, unknown step kinds, unsafe active settings, and missing evidence bindings.
- [x] Add pure helper tests for parsing, normalization, caps, conditions, and built-in workflow loading.

Exit check: an operator can paste a bounded workflow definition and Radar can explain exactly what it would run before any request is sent.

## Slice 2 - Built-In Passive Checks

Status: Complete

- [x] Add built-in workflows for security headers, cookie flags, CORS, cache control, and metadata exposure.
- [x] Evaluate passive steps over scoped captures without sending traffic.
- [x] Produce explainable pass/warn/fail results with evidence references back to matching captures.
- [x] Add tests for header parsing, redaction, and no-evidence behavior.

Exit check: a tester can run standard passive checks over current session traffic and see evidence-backed results.

## Slice 3 - Scoped Active Workflow Runtime

Status: Complete

- [x] Add active replay/browser step support through existing scoped, capped runtime paths.
- [x] Enforce workflow limits for replay count, timeout, delay, and result volume.
- [x] Persist workflow run history per session.
- [x] Add runtime tests for scope failure, cap enforcement, partial failures, and history persistence.

Exit check: an active workflow can run only inside saved scope, record each bounded action, and preserve results when a step fails.

## Slice 4 - Manual Workflows Surface

Status: Complete

- [x] Add a Workflows workbench view for built-ins, saved definitions, editor, run controls, run history, and result details.
- [x] Let operators save, rerun, and delete workflows.
- [x] Show passive vs active behavior and scope policy before execution.
- [x] Add renderer tests for selecting a built-in workflow, saving a custom definition, running it, and reviewing results.

Exit check: operators can save and rerun checks across projects without leaving the Radar console.

## Slice 5 - Finding Promotion And Evidence Links

Status: Complete

- [x] Convert workflow results into stable `workflow` evidence references.
- [x] Promote failed or warning workflow results into draft findings.
- [x] Preserve source workflow, run, step, result, and capture evidence metadata.
- [x] Include workflow evidence in report appendices.

Exit check: a workflow result can become a draft finding without losing the evidence trail that produced it.

## Slice 6 - AI-First Workflow Planning

Status: Complete

- [x] Expose workflow inventory and recent run summaries to AI-First as read-only context.
- [x] Let AI-First request existing workflows by id instead of inventing hidden checks.
- [x] Keep active execution bounded by the same workflow runtime and visible in run history.
- [x] Add policy tests proving AI cannot create unbounded hidden workflow behavior.

Exit check: AI-First can choose from operator-visible workflows and runs through the same manual contracts.

## Phase Exit Criteria

From `docs/ROADMAP.md`:

- Operators can save and rerun checks across projects.
- Workflow results are explainable, bounded, and tied to evidence.
- The same workflow can run manually, from AI-First, or from a future SDK.

## Suggested Implementation Order

1. Slice 1 - Workflow Model And Declarative Parser
2. Slice 2 - Built-In Passive Checks
3. Slice 3 - Scoped Active Workflow Runtime
4. Slice 4 - Manual Workflows Surface
5. Slice 5 - Finding Promotion And Evidence Links
6. Slice 6 - AI-First Workflow Planning

Shared contracts and passive evaluation land first. Active runtime and AI-First integration stay behind the same persistence, scope checks, caps, and visible run history.

## Release Mapping

This phase corresponds to roadmap milestone **0.7 - Workflows**:

- Declarative workflow definitions
- Built-in passive checks
- Scoped active workflow execution
- Run history
- Result promotion to Findings
- AI-First workflow selection
