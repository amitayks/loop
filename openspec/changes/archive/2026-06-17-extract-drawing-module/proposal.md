## Why

Continuing feature-module extraction. The canvas **drawing/compositing** domain is a cohesive cluster in `app.ts` (preview compositing, PiP, camera rect, background, fit/fill, zoom) that consumes state (live bindings) and the canvas 2D contexts from `elements.ts`. Moving it into a module makes its imports explicit and resolves the capture module's back-import of `updatePreview` from `app.js`.

## What Changes

- Add `src/renderer/features/drawing/compositing.ts` and move from `app.ts`: `getEffectiveCanvasDimensions`, `drawPip`, `drawCameraRect`, `drawBackground`, `updatePreview`, `drawComposite`, `drawFit`, `drawFitRounded`, `drawFill`, `drawEditorScreenWithZoom`.
- The module consumes `state.js`, `elements.js` (canvas contexts), `features/geometry/*` + `shared/domain/canvas.js`, `features/timeline/overlay-utils.js`, `features/timeline/mouse-trail.js`; not-yet-extracted helpers (e.g. `getStateAtTime`) are imported from `../../app.js` (exported there) until their domains extract.
- `app.ts`: delete the moved definitions; import the entry points it calls. The capture module's `updatePreview` import is repointed from `app.js` to `compositing.js`.

`drawWaveformOnCanvas` stays (waveform/audio domain). Behavior-preserving — bodies unchanged.

## Capabilities

### New Capabilities
- `renderer-drawing-module`: The canvas drawing/compositing functions live in `src/renderer/features/drawing/compositing.ts`, consuming `state.js`/`elements.js`/geometry/`overlay-utils`/`mouse-trail`; `app.ts` and the capture module import its entry points. Behavior-preserving; validated by the renderer-health e2e gate.

### Modified Capabilities
<!-- None at the spec/requirement level. Mechanical relocation; no product behavior change. -->

## Impact

- **New file**: `src/renderer/features/drawing/compositing.ts`.
- **Renderer**: `app.ts` loses the drawing cluster bodies, gains a named import; `features/capture/source-picker.ts` repoints its `updatePreview` import to `compositing.js`.
- **Build/boundaries**: bundled by esbuild; circular imports (drawing ↔ app.js for not-yet-extracted helpers, drawing ↔ capture) resolved in-bundle.
- **Tests**: no new logic → no required unit test; `tsc` proves import completeness, the renderer-health e2e gate proves boot, full `npm run check` is the release gate.
- **Docs**: `docs/production/target-architecture.md` adds the module.
- **Deferred (later changes)**: overlays, audio-overlays, waveform, sections-editing, editor transport, render/export, background-image, persistence.
- **Risk**: low. Mechanical relocation behind the proven keystone; typecheck-guided reconciliation; the gate is the behavioral proof.
