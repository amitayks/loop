## Why

Continuing feature-module extraction. The editor **output-mode + zoom/crop** geometry cluster (the `editorState`-coupled functions deferred from Change 2, now safe to extract post-state-container) is back-imported by `compositing` and `section-editing` from `app.js`. Extracting it makes those imports explicit and resolves the back-imports.

## What Changes

- Add `src/renderer/features/editor/zoom-crop.ts` and move from `app.ts`: `clampSectionZoom`, `formatSectionZoom`, `setOutputMode`, `updateOutputModeUI`, `getZoomCropBounds`, `resolveZoomCrop`, `panToFocusCoord`, `focusToPanCoord`.
- The module consumes `state.js`, `elements.js`, `shared/domain/canvas.js`, `features/keyframe/mode-state.js`, `features/geometry/section-geometry.js`, `features/section/section-editing.js`, `features/drawing/compositing.js`.
- `app.ts`: delete the moved definitions; import the entry points it calls. `compositing.ts` and `section-editing.ts` repoint their `clampSectionZoom`/`resolveZoomCrop`/`panToFocusCoord`/`formatSectionZoom` back-imports to `zoom-crop.js`.

Behavior-preserving — bodies unchanged. The pure pan/clamp math stays in `features/geometry/*`.

## Capabilities

### New Capabilities
- `renderer-zoom-crop-module`: The editor output-mode switching and section zoom/crop geometry (clamp/format zoom, zoom-crop bounds, focus/pan conversion, mode switch + UI) live in `src/renderer/features/editor/zoom-crop.ts`, consuming `state.js`/`elements.js`/`canvas`/`mode-state`/geometry/`section-editing`/`compositing`; `app.ts` and sibling modules import its entry points. Behavior-preserving; validated by the renderer-health e2e gate.

### Modified Capabilities
<!-- None at the spec/requirement level. Mechanical relocation; no product behavior change. -->

## Impact

- **New file**: `src/renderer/features/editor/zoom-crop.ts`.
- **Renderer**: `app.ts` loses the cluster bodies, gains a named import; `compositing.ts`/`section-editing.ts` repoint their zoom/crop back-imports to `zoom-crop.js`.
- **Build/boundaries**: bundled by esbuild; circular imports resolved in-bundle.
- **Tests**: no new logic → no required unit test; `tsc` proves import completeness, the renderer-health e2e gate proves boot, full `npm run check` is the release gate.
- **Docs**: `docs/production/target-architecture.md` adds the module.
- **Deferred (later changes)**: render/export, drag-interactions, keyframe/camera-visibility, waveform, background-image, workspace, take/media helpers, `appendTakeToTimeline`, `enterEditor`.
- **Risk**: low. Mechanical relocation behind the proven keystone; typecheck-guided reconciliation; the gate is the behavioral proof.
