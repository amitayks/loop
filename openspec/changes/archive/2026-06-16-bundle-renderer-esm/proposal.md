## Why

The renderer is loaded as native ESM (`<script type="module" src="./renderer/app.js">`) with **no bundler**, but the `src/shared/domain/*` modules it now imports compile to **CommonJS** (`package.json` has no `"type"` → CJS default; `tsconfig.shared` is `module: NodeNext`; `dist/shared/domain/easing.js` emits `Object.defineProperty(exports, …)`). Chromium's ESM loader cannot bind named imports from a CJS module, so the app throws on load:

```
Uncaught SyntaxError: The requested module ../../../shared/domain/section-math.js
does not provide an export named buildMergedSegments
```

This is a real "app won't start" bug. It was introduced when Change 1 and Change 2 added the **first** renderer→`shared/domain` *runtime* (value) imports — at HEAD the renderer imported only erased *types* from shared — and it was invisible because the old e2e smoke never asserted on renderer errors. The new renderer-health gate caught it on first run. The main process is unaffected (it consumes shared as CJS via `require()`).

## What Changes

- Add `esbuild` to `devDependencies` (already physically present via vitest; pin it explicitly).
- Add `scripts/bundle-renderer.mjs`: esbuild-bundle `dist/renderer/app.js` → `dist/renderer/app.bundle.js` (`bundle`, `format:'esm'`, `platform:'browser'`, `target:'es2022'`, `sourcemap`), inlining the CJS shared modules via esbuild's CJS↔ESM interop. Fail the build on any bundle error.
- Add `build:bundle` script; change `build` to `build:ts && build:bundle && build:copy && build:styles`.
- `src/index.html`: load `./renderer/app.bundle.js` instead of `./renderer/app.js`.
- Add `pretest:e2e` and `prepackage:smoke` hooks that run `npm run build`, so the e2e gate and packaging always exercise a complete, freshly-bundled `dist` (also closes a latent pre-existing gap where those steps ran against a possibly-stale `dist`).
- Update `.github/workflows/ci.yml` to build before the e2e/package steps.
- Add a deterministic test asserting the built bundle exists, is self-contained ESM, and that `index.html` references it.

No `src/renderer/app.ts` change; no main-process change. Behavior-preserving except that it **fixes the crash** (esbuild preserves module execution order).

## Capabilities

### New Capabilities
- `renderer-bundle`: The renderer entry is bundled by esbuild into a single self-contained ESM file (`dist/renderer/app.bundle.js`) so it can consume CommonJS `shared/domain` modules. The build, dev/start, e2e, and packaging pipelines produce and ship the bundle; `index.html` loads it; the main process continues to consume shared as CJS unchanged.

### Modified Capabilities
<!-- None at the spec/requirement level. This is a build-pipeline fix; product behavior is unchanged (the app now loads instead of crashing). -->

## Impact

- **Build**: `package.json` (esbuild devDep; `build:bundle`; reordered `build`; `pretest:e2e`/`prepackage:smoke` hooks); new `scripts/bundle-renderer.mjs`.
- **Renderer entry**: `src/index.html` script `src` → `app.bundle.js`. No `app.ts` change.
- **CI**: `.github/workflows/ci.yml` builds before e2e/package (release-integrity step change per AGENTS.md).
- **Tests**: new built-artifact assertion test (bundle exists, is ESM/self-contained, index.html references it). The renderer-health e2e gate flips RED→GREEN as the primary proof.
- **Main process**: untouched — still `require()`s shared CJS.
- **Worklet**: `audio-processor.js` is loaded by URL (`audioWorklet.addModule`), not statically imported, so it remains a separate dist file and is not bundled.
- **Docs**: `docs/production/target-architecture.md` and `docs/production/runbook.md` document the bundling step and entry change.
- **Deferred (minor, noted)**: pruning the now-dead unbundled `dist/renderer/**` modules from the packaged output (cosmetic/size only; the bundle supersedes them at runtime).
- **Risk**: medium (build/release-integrity). Mitigated by: esbuild's well-established CJS interop, the e2e health gate as direct proof the renderer loads, full `npm run check` including packaging smoke, and the built-artifact test. Edge cases watched during validation: any shared module accidentally referencing Node globals (none expected — shared/domain is pure), and source-map/CSP correctness.
