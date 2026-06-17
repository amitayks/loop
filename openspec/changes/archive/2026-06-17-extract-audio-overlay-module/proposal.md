## Why

Continuing feature-module extraction. The **audio-overlay** domain — audio-overlay timeline editing (select/trim/split/delete/place, saved toggles) plus Web Audio decode/waveform/playback — is a cohesive cluster in `app.ts`. Extracting it makes its imports explicit and moves `drawWaveformOnCanvas` (left behind by the drawing change) to where it belongs.

## What Changes

- Add `src/renderer/features/audio-overlay/audio-overlay.ts` and move ~16 functions from `app.ts`: `toggleAudioOverlaySaved`, `readdSavedAudioOverlay`, `selectAudioOverlay`, `renderAudioOverlayMarkers`, `startAudioOverlayTrimDrag`, `updateAudioOverlayTrimDrag`, `splitAudioOverlayAtPlayhead`, `deleteSelectedAudioOverlay`, `placeAudioOverlayAtTime`, `getAudioOverlayContext`, `decodeAndCacheAudioBuffer`, `extractPeakData`, `drawWaveformOnCanvas`, `startAudioOverlayPlayback`, `stopAudioOverlayPlayback`, `clearAudioBufferCache`.
- The module consumes `state.js`, `elements.js`, `shared/domain/project-fields.js` (`generateAudioOverlayId`), `features/timeline/section-utils.js`; not-yet-extracted helpers (undo/persistence/section) are imported from `../../app.js` until their domains extract.
- `app.ts`: delete the moved definitions; import the entry points it calls.

Visual overlays stay (separate next change). Behavior-preserving — bodies unchanged.

## Capabilities

### New Capabilities
- `renderer-audio-overlay-module`: The audio-overlay timeline editing and Web Audio decode/waveform/playback (incl. `drawWaveformOnCanvas`) live in `src/renderer/features/audio-overlay/audio-overlay.ts`, consuming `state.js`/`elements.js`/shared; `app.ts` imports its entry points. Behavior-preserving; validated by the renderer-health e2e gate.

### Modified Capabilities
<!-- None at the spec/requirement level. Mechanical relocation; no product behavior change. -->

## Impact

- **New file**: `src/renderer/features/audio-overlay/audio-overlay.ts`.
- **Renderer**: `app.ts` loses the audio-overlay cluster bodies (incl. `drawWaveformOnCanvas`), gains a named import.
- **Build/boundaries**: bundled by esbuild; circular imports (audio-overlay ↔ app.js) resolved in-bundle.
- **Tests**: no new logic → no required unit test; `tsc` proves import completeness, the renderer-health e2e gate proves boot, full `npm run check` is the release gate.
- **Docs**: `docs/production/target-architecture.md` adds the module.
- **Deferred (later changes)**: visual overlays, sections-editing, render/export, persistence, undo/redo, drag-interactions, background-image, keyframe/camera.
- **Risk**: low. Mechanical relocation behind the proven keystone; typecheck-guided reconciliation; the gate is the behavioral proof.
