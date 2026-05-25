# Radar

Radar is a local-first defensive web security workbench. The MVP embeds Chromium, captures browser traffic through Electron's DevTools protocol, and lets you replay scoped requests through a controlled repeater.

## MVP Surface

- Real Chrome/Chrome Canary launch path using an isolated Radar browser profile.
- Network capture history with request and response headers/body previews.
- Clone captured requests into a repeater.
- Single replay plus capped burst replay for hardening checks.
- Target allowlist enforced before replaying requests.
- Optional local HTTPS proxy mode for external browsers, with a generated Radar CA.
- Reserved agent dock and architecture notes for later AI provider integration.

## Run

```bash
npm install
npm run dev
```

## Scope Model

Replay is intentionally blocked unless the target matches the allowlist. Defaults are local development origins:

```text
http://localhost:*
http://127.0.0.1:*
http://[::1]:*
```

Add project origins in the Targets panel before replaying captured production or staging traffic you are authorized to test.

## SSL And Proxying

Radar has two HTTPS paths:

- Real Chrome mode: Radar launches Chrome/Chrome Canary with a dedicated profile, remote debugging on `127.0.0.1:9223`, and the Radar proxy attached.
- External browser proxy: start the proxy from the SSL tab, set your browser proxy to `http://127.0.0.1:8088`, then manually trust the generated `radar-ca.pem` certificate shown in the UI.

Radar does not install a root certificate automatically. Remove the Radar CA from your trust store when you are done with proxy testing.

## AI Integration Later

The MVP keeps AI out of the request path for now. When it is time to add agents, the clean boundary is:

- Provider adapters: OpenAI, Anthropic, local OpenAI-compatible servers, and other hosted APIs.
- Tool permissions: browser navigation, capture search, request drafting, replay execution, report writing.
- Scope gates: agents inherit the same target allowlist and replay caps as manual actions.
- Audit trail: every agent action should produce an inspectable event with prompt, tool call, target, and result metadata.

This keeps the first version useful while leaving room for provider-agnostic agent work without coupling it to the UI too early.
