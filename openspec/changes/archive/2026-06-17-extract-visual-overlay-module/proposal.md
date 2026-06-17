## Why

Continuing feature-module extraction. The **visual-overlay** domain (image/video overlay editing) is a cohesive cluster in `app.ts` — the sibling of the already-extracted audio-overlay and window-overlay modules. Extracting it makes its imports explicit and lets the audio-overlay module's back-imports of `renderOverlayList`/`renderOverlayMarkers` resolve to it.

## What Changes

- Add `src/renderer/features/overlay/overlay.ts` and move ~16 functions from `app.ts`: `getOverlayImageElement`, `getOverlayVideoElement`, `selectOverlay`, `updateOverlaySizeControl`, `buildVolumeHeartStack`, `renderOverlayList`, `toggleOverlaySaved`, `readdSavedOverlay`, `renderOverlayMarkers`, `startOverlayTrimDrag`, `updateOverlayTrimDrag`, `splitOverlayAtPlayhead`, `deleteSelectedOverlay`, `placeOverlayAtTime`, `handleOverlayDrop`, `centerSelectedOverlay`.
- The module consumes `state.js`, `elements.js`, `shared/domain/project-fields.js` (`generateOverlayId`), `features/timeline/overlay-utils.js`, `features/format/format-utils.js` (`hexToRgba`/`getVolumeSvg`/`formatTime`), `features/drawing/compositing.js` (`updatePreview`); not-yet-extracted helpers from `../../app.js`.
- `app.ts`: delete the moved definitions; import the entry points it calls. The audio-overlay module's `renderOverlayList`/`renderOverlayMarkers` back-imports are repointed to `overlay.js`.

Behavior-preserving — bodies unchanged.

## Capabilities

### New Capabilities
- `renderer-visual-overlay-module`: The image/video overlay editing (list/markers rendering, select/trim/split/delete/place, drag-drop import, center, saved toggles, volume UI, media-element pool) lives in `src/renderer/features/overlay/overlay.ts`, consuming `state.js`/`elements.js`/`overlay-utils`/`format-utils`/shared; `app.ts` and sibling modules import its entry points. Behavior-preserving; validated by the renderer-health e2e gate.

### Modified Capabilities
<!-- None at the spec/requirement level. Mechanical relocation; no product behavior change. -->

## Impact

- **New file**: `src/renderer/features/overlay/overlay.ts` (sibling of `window-overlays.ts`).
- **Renderer**: `app.ts` loses the visual-overlay cluster bodies, gains a named import; `features/audio-overlay/audio-overlay.ts` repoints its `renderOverlayList`/`renderOverlayMarkers` back-imports to `overlay.js`.
- **Build/boundaries**: bundled by esbuild; circular imports resolved in-bundle.
- **Tests**: no new logic → no required unit test; `tsc` proves import completeness, the renderer-health e2e gate proves boot, full `npm run check` is the release gate.
- **Docs**: `docs/production/target-architecture.md` adds the module.
- **Deferred (later changes)**: sections-editing, render/export, persistence, undo/redo, drag-interactions, background-image, keyframe/camera, workspace/view.
- **Risk**: low. Mechanical relocation behind the proven keystone; typecheck-guided reconciliation; the gate is the behavioral proof.
