# Radar Font Assets

Radar's production typography is bundled locally through exact, lockfile-pinned Fontsource `5.3.0` packages. Vite resolves the package CSS during the production build and emits the referenced WOFF2 files under `dist/assets/`; Radar does not contact Google Fonts or another font CDN at runtime.

| Theme | Role | Family | Package |
| --- | --- | --- | --- |
| Bureau | Display | Antonio | `@fontsource/antonio` |
| Bureau | Sans | Saira | `@fontsource/saira` |
| Bureau | Mono | JetBrains Mono | `@fontsource/jetbrains-mono` |
| Vellum | Display | Instrument Serif | `@fontsource/instrument-serif` |
| Vellum | Sans | Hanken Grotesk | `@fontsource/hanken-grotesk` |
| Vellum | Mono | DM Mono | `@fontsource/dm-mono` |
| Specter | Display | Unbounded | `@fontsource/unbounded` |
| Specter | Sans | Sora | `@fontsource/sora` |
| Specter | Mono | Space Mono | `@fontsource/space-mono` |

The imported `latin.css` files include the available normal weights. Italic CSS is included for JetBrains Mono, Instrument Serif, Hanken Grotesk, DM Mono, and Space Mono because those styles are part of Radar's declared typography contract.

All nine families are distributed under the SIL Open Font License 1.1. The exact license text and upstream metadata ship inside each installed package as `LICENSE` and `metadata.json`. `pnpm-lock.yaml` pins the resolved package integrity. Font changes require re-running `REG-UI-002`, `REG-UI-003`, `REG-UI-017`, `REG-UI-020`, and `REG-UI-022`, then reviewing every theme anchor.

The UI regression run verifies that every required family has a loaded `FontFace`, resolves on a representative role, and loads without any non-loopback external resource request.
