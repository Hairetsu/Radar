# Security

Radar is a local-first security workbench. Treat it as an untrusted desktop app that can send traffic, hold captured evidence, and talk to an AI provider you configure.

## Supported versions

Only the latest GitHub Release and the current `main` source tree receive security fixes. Older installers and local checkouts are unsupported.

## Report a vulnerability

Email the maintainer privately or open a GitHub security advisory. Do not file a public issue for an exploitable Electron, IPC, proxy, plugin, or AI-context leak.

Include the Radar version or commit, the operating system, and enough steps to reproduce without live customer data.

Expect an acknowledgement within a week when the report is actionable. Fixes ship in the next release that can take them.

## What Radar will not do

Radar does not install its system proxy CA. It does not send project data to a cloud service unless you export it or you send selected context to an AI provider you configured. AI-First cannot expand Scope, invent destructive actions, or run an unsigned plugin.

## Local data

Project evidence lives in the Radar user-data directory documented in the user guide. API keys are stored in a local settings file with restrictive permissions. Operating-system secret storage is still outstanding work.

See [docs/THREAT_MODEL.md](docs/THREAT_MODEL.md) for the trust boundary.
