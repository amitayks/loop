## 1. esbuild bundling step

- [x] 1.1 Add `esbuild` to `devDependencies` in `package.json` (pin the version already installed, ^0.27.4). Run `npm install` if needed so it is recorded in the lockfile.
- [x] 1.2 Create `scripts/bundle-renderer.mjs`: import esbuild; call `build({ entryPoints: ['dist/renderer/app.js'], outfile: 'dist/renderer/app.bundle.js', bundle: true, format: 'esm', platform: 'browser', target: 'es2022', sourcemap: true, logLevel: 'info' })`; on failure print the error and `process.exit(1)`. No `external` entries (renderer has no bare imports). Do not bundle/replace `audio-processor.js`.

- [x] 1.3 Browser-safe split (discovered during bundling — `project.ts` imports Node `path`): extract the four renderer-consumed browser-safe helpers (`generateOverlayId`, `generateAudioOverlayId`, `normalizePipScale`, `normalizeExportAudioPreset`) into new `src/shared/domain/project-fields.ts` (no Node deps); `project.ts` imports+re-exports them (main/tests unchanged) and keeps `path`; repoint renderer imports (`app.ts`, `features/overlay/window-overlays.ts`) to `project-fields.js`; remove the now-unused `MIN_PIP_SCALE`/`MAX_PIP_SCALE`/`EXPORT_AUDIO_PRESET_OFF` value imports from `project.ts`.

## 2. Wire the build pipeline

- [x] 2.1 `package.json` scripts: add `"build:bundle": "node scripts/bundle-renderer.mjs"`; change `"build"` to `"npm run build:ts && npm run build:bundle && npm run build:copy && npm run build:styles"`.
- [x] 2.2 `package.json` scripts: add `"pretest:e2e": "npm run build"` and `"prepackage:smoke": "npm run build"` so the e2e gate and packaging always run against a complete, freshly-bundled `dist`.
- [x] 2.3 `src/index.html`: change the renderer script tag to `<script type="module" src="./renderer/app.bundle.js"></script>`. Keep the strict CSP unchanged.

## 3. CI

- [x] 3.1 `.github/workflows/ci.yml`: add an explicit `npm run build` step before the `test:e2e` and `package:smoke` steps (the pre-hooks also cover this; the explicit step makes CI intent clear and ensures `build:copy`/`build:bundle` ran). Keep all existing gates (lint, typecheck, test, e2e, package smoke).

## 4. Built-artifact test

- [x] 4.1 Add a deterministic test (e.g. `tests/integration/renderer-bundle.test.ts`) that runs the build (or assumes a prior build in CI) and asserts: `dist/renderer/app.bundle.js` exists; its contents contain no top-level `require(` or `exports.` (self-contained ESM with CJS shared inlined); and `dist/index.html` references `app.bundle.js`. Keep it deterministic — if it builds within the test, build only what's needed (`build:ts` + `build:bundle` + `build:copy`); otherwise guard on the artifact existing and skip with a clear message. Prefer asserting against a real built artifact.

## 5. Verification (primary proof: the gate flips green)

- [x] 5.1 `npm run build` — completes; confirm `dist/renderer/app.bundle.js` and its `.map` exist and `dist/index.html` points at `app.bundle.js`.
- [x] 5.2 `npm run test:e2e` — the renderer-health smoke now PASSES: observes `[renderer-loaded]`, and no `[renderer:3]` / `[renderer-uncaught]` / `[renderer-gone]`. (This is the core proof the CJS/ESM crash is fixed.) Run twice to confirm non-flakiness.
- [x] 5.3 `npm run typecheck` and `npm run lint` (`--max-warnings=0`) — green.
- [x] 5.4 `npm run test` — all suites pass, including the new built-artifact test.
- [x] 5.5 Full `npm run check` — green end to end (lint → typecheck → test → e2e smoke → package smoke).
- [x] 5.6 Sanity: confirm the audio worklet still loads (separate `dist/audio-processor.js` present and referenced by URL), and the main process is unchanged (still `require()`s shared).

## 6. Docs & hand-off

- [x] 6.1 Update `docs/production/target-architecture.md` and `docs/production/runbook.md`: document the renderer bundling step (esbuild, `build:bundle`, `app.bundle.js` entry), why it exists (CJS shared consumed by ESM renderer), and the e2e/package build pre-hooks.
- [x] 6.2 Hand-off: state the root cause (CJS shared imported by unbundled ESM renderer, introduced by Change 1/2, caught by the new health gate), the fix, exact commands run, that the e2e gate flipped RED→GREEN, and the deferred minor item (prune dead unbundled renderer files from packaging).
