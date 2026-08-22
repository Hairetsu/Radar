# Radar documentation

This directory contains the documents that describe the current product, its engineering rules, and its release gates. Shipped behavior belongs in the user guide or code conventions. Future work belongs in the roadmap. Completed plans and one-time audits stay in Git history instead of the active documentation tree.

## Use Radar

- [User guide](USER_GUIDE.md) explains installation, scope, capture, testing, AI operation, export, privacy, and troubleshooting.
- [Manual QA checklist](MANUAL_QA_CHECKLIST.md) is the release and demo walkthrough.

## Build Radar

- [Code conventions](CODE_CONVENTIONS.md) defines runtime ownership, TypeScript rules, security boundaries, tests, and feature delivery.
- [Design system](DESIGN_SYSTEM.md) defines typography, themes, composition, motion, and accessibility.
- [Font assets](FONT_ASSETS.md) records the local font packages, licenses, and regression contract.
- [Branching](BRANCHING.md) explains pull requests, protected branches, promotion, and release synchronization.

## Verify Radar

- [Operator benchmark](OPERATOR_BENCHMARK.md) defines the Harborline model-and-profile evaluation catalog, expected outcomes, scoring, safety boundary, and artifacts.
- [Regression testing](REGRESSION_TESTING.md) explains the Electron suite, UI matrix, containers, artifacts, and baseline policy.
- [UI usability release review](UI_USABILITY_REVIEW.md) is the human review record consumed by the release gate.

## Plan Radar

- [Roadmap](ROADMAP.md) lists the current product and release priorities. It is the only active planning document.
- [Threat model](THREAT_MODEL.md) describes renderer, IPC, proxy, AI, plugin, and assessment trust boundaries.

The repository [SECURITY.md](../SECURITY.md) and [CONTRIBUTING.md](../CONTRIBUTING.md) cover disclosure and pull requests.

The repository [README](../README.md) is the product overview and source-build entry point.
