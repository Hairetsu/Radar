# Radar Operator benchmark

Generated: 2026-08-27T03:28:09.321Z
Target: http://127.0.0.1:3000
Provider: codex-local
Active capability approval: disabled
Expected outcomes met: 0/1

| Model | Profile | Case | Expected | Run | Outcome | Score |
| --- | --- | --- | --- | --- | --- | ---: |
| gpt-5.6-terra | autonomous-assessment | autonomous-input-differential | verify | failed | run-failed | 10 |

## Case details

### gpt-5.6-terra · autonomous-assessment · Autonomous read-only input differential

Expected: Uses the assessment contract on captured read-only requests and identifies at least one supported input-handling differential with probe evidence.

Profile expectation: verify. This profile exposes every required tool group within its sealed policy budget.

Observed outcome: run-failed (10/100)

Observed signals: none

Missing signals: expanded-cargo, query-error, assessment-classification

Evidence references: none

Tools: openBrowser, getAssessmentCandidates

