# Radar threat model

Radar runs two Chromium renderers, an Electron main process, a local HTTP/S proxy, and optional AI provider calls. The operator is trusted. The target, captured content, plugins, imported bundles, and model output are not.

## Assets

- Project SQLite databases and exported bundles
- Captured request and response bodies, cookies, and storage snapshots
- The local proxy CA and private key
- Pasted AI API keys
- Capability leases and assessment contracts
- Plugin code and granted SDK permissions

## Trust boundary

Renderer code cannot touch the filesystem, proxy, browser, replay, or providers directly. Preload APIs expose typed IPC. Main-process handlers validate every payload and apply Scope, replay caps, and capability grants before side effects.

The workspace window does not enable `<webview>`. Both windows receive a renderer Content Security Policy that blocks unexpected script sources.

## Surfaces

| Surface | Failure | Mitigation |
| --- | --- | --- |
| Electron windows | A renderer XSS reaches privileged APIs | CSP, no `webviewTag`, preload allowlists, IPC validation |
| Preload IPC | A crafted invoke bypasses Scope or replay limits | Fail-closed handlers, clamped numbers, serializable contracts |
| Proxy CA | A stolen CA signs attacker certificates | Local-only CA, no automatic OS install, operator-controlled trust |
| AI context | A prompt leak of cookies or tokens | Raw context off by default, redaction in planner compaction |
| Assessment tools | The model invents a family, origin, or mutation | Contract, family registry, capability lease, probe ledger |
| Bundles | Import writes unexpected origins or plugins | Preview, conflict skip, Scope stays operator-committed |
| Plugins | Unsigned script runs with host privileges | Manifest validation, explicit approval, no-script panel, bounded SDK |
| Workflows | An imported workflow sends unbounded traffic | Dry run, request caps, Scope, visible save/run |

## Residual risk

Electron 42 still documents a sandbox exception for these windows. AI keys remain in a mode-`0600` JSON file instead of OS secret storage. Unsigned installers can be swapped if the operator skips checksums. Manual Repeater can send outside Scope because it is an operator tool.

These are known. They are not silent exceptions.
