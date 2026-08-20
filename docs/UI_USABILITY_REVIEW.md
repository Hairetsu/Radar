# Radar UI usability release review

This is the release-candidate review record consumed by `REG-UI-024`. Complete it on a normal desktop monitor, replace every `TBD`, check every item, and set `Decision: PASS` only when the UI is fit to release. Run the gate with `RADAR_UI_HUMAN_REVIEW=1 pnpm test:regression:ui`.

Reviewer: TBD  
Date: TBD  
Commit: TBD  
OS: TBD  
Display: TBD  
Scale factor: TBD  
Radar window profile: TBD  

## Required review

- [ ] Bureau, Vellum, Specter, Aperture, Verdigris, and Aegis are readable at the default window size.
- [ ] Bureau remains operable at the minimum window size.
- [ ] All themes preserve hierarchy and legibility at 90% zoom.
- [ ] Traffic, Intercept, Repeater, Automate, Findings, Workflows, Scope, Project Artifacts, and AI-First preserve critical evidence/actions at 80% zoom.
- [ ] One evidence-inspection workflow remains usable at 125% and 150% zoom.
- [ ] Empty, demo, dense, and stress-copy states have no misleading or unreachable controls.
- [ ] Keyboard-only global search opens, traverses, closes, and restores focus.
- [ ] Keyboard-only appearance or settings traversal closes and restores focus.
- [ ] Traffic supports filter, select, read, and copy without losing evidence context.
- [ ] Repeater supports edit, review, and response inspection without accidental transmission.
- [ ] AI-First supports start, inspect, and stop with the deterministic provider while state remains visible.
- [ ] Scope, capability, intercept, report, destructive-action, and raw-context warnings are immediately readable.
- [ ] Active view, selected evidence, primary action, and destructive actions are distinguishable within five seconds.
- [ ] No tiny-text, fatigue, ambiguity, excessive-truncation, hierarchy, or scroll-trap issue remains.

## Notes

TBD

Decision: TBD
