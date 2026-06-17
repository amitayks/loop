## Context

Module systems in this repo:
- Renderer: `tsconfig.renderer` `module: ES2022`, loaded by the browser as native ESM via `<script type="module">`. **No bundler.**
- Main + preload + shared: `module: NodeNext` with `package.json` (no `"type"`) → **CommonJS** output. Preload is sandboxed and must stay CJS.

Change 1/2 introduced renderer→`shared/domain` runtime imports (`easeInOut`, `generateOverlayId`, `roundMs`/`buildMergedSegments`/`remapToTimeline`, canvas constants/`getContentWidth`). Because shared emits CJS and the renderer is unbundled ESM, the browser cannot load them → `SyntaxError` on boot. Verified: `dist/shared/domain/easing.js` = `"use strict"; exports.easeInOut = …` (CJS); `dist/renderer/.../section-utils.js` = `import { buildMergedSegments } from '…/section-math.js'` (ESM). esbuild 0.27.4 is already available (via vitest). Electron 35.7.5.

## Goals / Non-Goals

**Goals:**
- The renderer can consume CJS `shared/domain` modules (and any future shared imports) without crashing.
- Main process and preload untouched.
- The e2e health gate goes green; full `npm run check` passes including packaging smoke.

**Non-Goals:**
- No migration of main/preload/shared to ESM.
- No change to `src/renderer/app.ts` or renderer source.
- No new runtime dependency (esbuild is a devDependency / build-time only).

## Decisions

### D1 — Bundle the renderer with esbuild (vs the alternatives)
**Decision:** keep shared as CJS; bundle the renderer entry with esbuild so CJS shared is inlined into one ESM file the browser loads. esbuild's CJS↔ESM interop maps `import { x } from './cjs-module.js'` correctly.

*Alternatives considered:*
- **Make `shared` emit ESM.** Then the CJS main process must `require()` an ESM module (works only via Node ≥22.12 `require(esm)`) and, more importantly, `tsc` under `NodeNext` errors when a CJS module imports an ESM one — a compile-time interop hazard across many main-process call sites. Rejected: touches main, fragile.
- **Migrate everything to ESM.** Breaks the **sandboxed preload**, which must be CJS (Electron sandbox can't `import` ESM); also drags in `electron-reload`/`__dirname` migration. Rejected: high risk, out of proportion.
- **Bundle the renderer.** Standard Electron practice, no new dependency, main untouched, and **recurrence-proof** for every future renderer→shared import in the ongoing `app.ts` decomposition. Chosen.

### D2 — Bundle the tsc OUTPUT, not the TS source
**Decision:** esbuild bundles `dist/renderer/app.js` (the `tsc`-emitted entry), not `src/renderer/app.ts`. In `dist`, the `.js` import specifiers point at real `.js` files, so esbuild resolution is unambiguous; bundling source would require resolving `.js` specifiers back to `.ts`. `tsc` remains the type-checker and the compiler of record; esbuild only links the already-emitted graph.

Output is `dist/renderer/app.bundle.js` (a distinct path from the entry, so esbuild never reads and writes the same file), and `index.html` points at it.

### D3 — Worklet stays separate
`audioWorklet.addModule('audio-processor.js')` loads the worklet by URL at runtime; it is not a static import, so esbuild does not pull it into the bundle. `tsc` + `build:copy` continue to emit/copy `dist/audio-processor.js`. Unchanged.

### D4 — Guarantee a fresh bundle for e2e and packaging
`check`/CI run `test:e2e` and `package:smoke` after only `typecheck` (not a full `build`), relying on a pre-built `dist`. A stale/missing bundle would make the gate test old code. **Decision:** add npm pre-hooks `pretest:e2e: npm run build` and `prepackage:smoke: npm run build`. `tsc --build` is incremental, so the extra build is cheap, and both steps now always run against a complete freshly-bundled `dist`. CI also gets an explicit build step. This additionally fixes a latent pre-existing gap.

### D6 — Renderer-consumed shared modules must be browser-safe (the `path` discovery)
While bundling, esbuild surfaced a second fault: `src/shared/domain/project.ts` imports the Node built-in `path` (for `toProjectAbsolutePath`/`toProjectRelativePath`/`normalizeWindowPaths`), and the renderer imported four browser-safe helpers from it (`generateOverlayId`, `generateAudioOverlayId`, `normalizePipScale`, `normalizeExportAudioPreset`). Because the CJS shared modules are bundled **whole** (no tree-shaking), the renderer pulling any symbol from `project.ts` drags in `path`, which the browser can't resolve.

**Decision:** extract the four browser-safe helpers into a new `src/shared/domain/project-fields.ts` (no Node deps). `project.ts` imports and re-exports them (main process and existing tests unchanged) and keeps `path`; the renderer imports them from `project-fields.ts`. This establishes the invariant: **any `shared/**` module the renderer reaches must be free of Node built-ins.** The other renderer-consumed shared modules (`easing`, `section-math`, `canvas`, `mouse-trail`) are already clean.

*Alternative considered:* reimplement `path.isAbsolute/join/relative` with pure strings to make `project.ts` browser-safe. Rejected — cross-platform path logic is exactly what `path` exists for; AGENTS.md flags cross-platform correctness. Extraction is safer and smaller.

### D5 — Prove it with the gate + a built-artifact test
The renderer-health e2e gate is the primary functional proof (renderer loads → `[renderer-loaded]`, no error markers). Add a deterministic test asserting that, after build, `dist/renderer/app.bundle.js` exists, contains no top-level CJS tokens (`require(`, `exports.`) — i.e. is self-contained ESM — and that `dist/index.html` references `app.bundle.js`.

## Risks / Trade-offs

- **[A shared module references a Node global]** (`process`, `Buffer`) → would break the browser bundle. `shared/domain` is pure logic; none expected. Caught immediately by the e2e gate at validation. Mitigation: if found, that symbol doesn't belong in a renderer-consumed shared module.
- **[Stale bundle masks a renderer error]** → D4 pre-hooks rebuild before e2e/package; the gate then tests current code.
- **[Bundle size / dead unbundled files shipped]** → cosmetic; packaging still works. Pruning dead `dist/renderer/**` from the package is deferred.
- **[Source map / CSP]** → external `.map` is fine under `script-src 'self'`; no inline eval introduced.
- **[Build orchestration regressions]** → full `npm run check` (incl. packaging smoke) plus the built-artifact test guard it; CI updated to match.

## Migration Plan

Build-only change; no data migration, no flag. Implement scripts + wiring, run `npm run build`, then `npm run check` (e2e gate must be green). Rollback = revert the commit and point `index.html` back at `app.js` (which only works once the underlying CJS/ESM issue is otherwise resolved — so rollback implies also reverting the renderer→shared imports). CI updated so the gate runs against the bundle.

## Open Questions

- None blocking. Whether to also prune dead unbundled renderer files from packaging is left as a minor follow-up.
