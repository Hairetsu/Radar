# Radar Example Plugins

These examples are local-first plugin fixtures for Phase 7. Install an example by opening **Plugins** in Radar and previewing the example folder path, such as:

```text
plugins/examples/jwt-helper
```

Each example uses the same `.radar-plugin/plugin.json` manifest format as third-party local plugins. The JavaScript entry files are intentionally minimal; SDK calls must go through Radar's approved plugin API and permission checks.

## Examples

- `jwt-helper`: reads scoped captures and renders a token review panel.
- `graphql-helper`: reads scoped captures and prepares replay drafts for GraphQL request variants.
- `openapi-importer`: reads operator-selected files and registers workflow definitions.
- `parameter-miner`: reads scoped captures and WebSocket frames, then proposes workflow definitions.
- `report-exporter`: reads scoped evidence and renders a report export panel.
