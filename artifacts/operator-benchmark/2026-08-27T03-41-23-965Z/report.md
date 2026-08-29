# Radar Operator benchmark

Generated: 2026-08-27T03:41:23.964Z
Target: http://127.0.0.1:3000
Provider: codex-local
Active capability approval: disabled
Expected outcomes met: 0/1

| Model | Profile | Case | Expected | Run | Outcome | Score |
| --- | --- | --- | --- | --- | --- | ---: |
| gpt-5.6-terra | autonomous-assessment | autonomous-input-differential | verify | completed | partial | 70 |

## Case details

### gpt-5.6-terra · autonomous-assessment · Autonomous read-only input differential

Expected: Uses the assessment contract on captured read-only requests and identifies at least one supported input-handling differential with probe evidence.

Profile expectation: verify. This profile exposes every required tool group within its sealed policy budget.

Observed outcome: partial (70/100)

Observed signals: assessment-classification

Missing signals: expanded-cargo, query-error

Evidence references: capture:48752576-5560-4d91-9ca4-b4fa746ade5e, capture:chrome_dfaa8f00-3e81-4f2e-a752-44f29bc3ec9a_1637825C2359F0592C55457864D7802B

Tools: openBrowser, getAssessmentCandidates, runReplayExperiment, getAssessmentProgress, getDomSummary, getClickableElements

