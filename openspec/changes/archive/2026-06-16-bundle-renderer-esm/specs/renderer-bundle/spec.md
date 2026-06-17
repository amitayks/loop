## ADDED Requirements

### Requirement: Renderer is bundled into a self-contained ESM file

The build SHALL bundle the renderer entry into a single self-contained ES module so the browser-loaded renderer can consume CommonJS `shared/domain` modules. A `build:bundle` step SHALL run esbuild over `dist/renderer/app.js` and emit `dist/renderer/app.bundle.js` (`format: 'esm'`, `platform: 'browser'`, bundled, with a source map), and `build` SHALL run it after `build:ts`. The bundle SHALL inline the CommonJS shared modules (no unresolved `require`/`exports` at runtime). `esbuild` SHALL be an explicit devDependency.

#### Scenario: Build produces a self-contained ESM bundle
- **WHEN** `npm run build` completes
- **THEN** `dist/renderer/app.bundle.js` exists, is ES-module formatted, and contains no top-level CommonJS `require(`/`exports.` tokens (the CJS shared modules are inlined)

#### Scenario: Bundle errors fail the build
- **WHEN** esbuild cannot resolve or bundle a renderer import
- **THEN** `build:bundle` exits non-zero and the overall build fails

### Requirement: Renderer-consumed shared modules are browser-safe

Every `src/shared/**` module that the renderer imports (directly or transitively) SHALL be free of Node.js built-in dependencies (`path`, `fs`, etc.) so it can be bundled for the browser. Because the CommonJS shared modules are included whole (no tree-shaking), a single Node import anywhere in a renderer-reachable shared module breaks the bundle. The browser-safe project field helpers (`generateOverlayId`, `generateAudioOverlayId`, `normalizePipScale`, `normalizeExportAudioPreset`) SHALL live in `src/shared/domain/project-fields.ts` (no Node deps); `src/shared/domain/project.ts` (which imports `path` for project-file resolution) SHALL re-export them so the main process is unchanged, and the renderer SHALL import them from `project-fields.ts`.

#### Scenario: Renderer bundle has no Node built-in imports
- **WHEN** `npm run build:bundle` runs
- **THEN** esbuild resolves every renderer import without requiring a Node built-in (no "Could not resolve 'path'" errors), because no renderer-reachable shared module imports one

#### Scenario: project.ts API unchanged for the main process
- **WHEN** the main process or existing tests import `generateOverlayId` / `normalizePipScale` / etc. from `shared/domain/project.js`
- **THEN** the imports still resolve (project.ts re-exports them from `project-fields.ts`) and behavior is unchanged

### Requirement: The app loads the bundled renderer

`src/index.html` SHALL load `./renderer/app.bundle.js` as the renderer entry (`<script type="module">`). The audio worklet SHALL continue to load by URL (`audioWorklet.addModule('audio-processor.js')`) from its separate, non-bundled file. The main process SHALL continue to consume shared modules as CommonJS, unchanged.

#### Scenario: Renderer boots without module errors
- **WHEN** the app starts
- **THEN** the renderer health gate observes `[renderer-loaded]` and no `[renderer:3]` / `[renderer-uncaught]` / `[renderer-gone]` markers (the previous CJS-in-ESM SyntaxError is gone)

#### Scenario: index.html references the bundle
- **WHEN** `dist/index.html` is produced
- **THEN** its renderer `<script>` `src` is `./renderer/app.bundle.js`

### Requirement: e2e and packaging run against a freshly built bundle

The e2e smoke and packaging smoke SHALL always execute against a complete, freshly-built `dist` (including the renderer bundle), not a possibly-stale one. `pretest:e2e` and `prepackage:smoke` SHALL run a full `build`, and CI SHALL build before those steps.

#### Scenario: Gate tests current renderer code
- **WHEN** `npm run test:e2e` or `npm run package:smoke` runs
- **THEN** a full `build` (including `build:bundle` and `build:copy`) runs first so the bundle and `index.html` reflect the current source

#### Scenario: Full check passes end to end
- **WHEN** `npm run build` then `npm run check` run
- **THEN** lint, typecheck, tests, the renderer-health e2e smoke, and packaging smoke all pass
