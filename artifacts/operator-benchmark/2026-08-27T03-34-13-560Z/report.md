# Radar Operator benchmark

Generated: 2026-08-27T03:34:13.560Z
Target: http://127.0.0.1:3000
Provider: codex-local
Active capability approval: disabled
Expected outcomes met: 0/1

| Model | Profile | Case | Expected | Run | Outcome | Score |
| --- | --- | --- | --- | --- | --- | ---: |
| gpt-5.6-terra | autonomous-assessment | autonomous-input-differential | verify | completed | partial | 65 |

## Case details

### gpt-5.6-terra · autonomous-assessment · Autonomous read-only input differential

Expected: Uses the assessment contract on captured read-only requests and identifies at least one supported input-handling differential with probe evidence.

Profile expectation: verify. This profile exposes every required tool group within its sealed policy budget.

Observed outcome: partial (65/100)

Observed signals: assessment-classification

Missing signals: expanded-cargo, query-error

Evidence references: capture:795efb76-0f05-4014-8be8-9eac8d16773e, replay:history-2026-08-27T033411108Z, replay:history-2026-08-27T033411361Z, replay:history-2026-08-27T033411613Z

Tools: openBrowser, getDomSummary, getClickableElements, getAssessmentCandidates, runReplayExperiment

