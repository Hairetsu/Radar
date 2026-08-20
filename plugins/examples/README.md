# Radar example plugins

These local packages show the manifest, entry, panel, and permission shapes accepted by Radar.

To inspect one, open **08 Plugins** and preview its folder:

```text
plugins/examples/jwt-helper
```

Install creates a pending record. It does not execute code. Review the requested permissions, entry file, panel, compatibility warning, and trust label before approval.

Each example contains `.radar-plugin/plugin.json`, `dist/index.js`, and `panel.html`. SDK actions still pass through Radar's Scope, replay, workflow, finding, and audit checks.

## Examples

- `jwt-helper` reads scoped captures and prepares token review notes or draft findings.
- `graphql-helper` reads scoped HTTP/S and WebSocket evidence and prepares GraphQL request drafts.
- `openapi-importer` reads an operator-selected file and prepares workflow definitions.
- `parameter-miner` reads scoped captures and frames and prepares parameter-oriented workflows.
- `report-exporter` reads scoped evidence and renders a report companion panel.

Validate an example without installing it:

```bash
pnpm plugin:validate -- plugins/examples/jwt-helper
```
