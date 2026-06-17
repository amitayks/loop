## Why

Continuing feature-module extraction. The editor **timeline/canvas interactions** cluster (~16 functions) — section trim drag, timeline scrub/seek/zoom/scroll, crop preset, canvas coordinate mapping, camera-keyframe toggles, and waveform — is the next cohesive domain in `app.ts`.

## What Changes

- Add `src/renderer/features/editor/interactions.ts` and move from `app.ts`: `computeWaveformPeaksFromCache`, `refreshWaveform`, `extractWaveformPeaks`, `renderWaveform`, `startTrimDrag`, `updateTrimDrag`, `finishTrimDrag`, `getMutableCameraKeyframe`, `toggleCameraVisibility`, `toggleCameraFullscreen`, `canvasToEditorCoords`, `seekFromTimeline`, `applyTimelineZoom`, `scrollTimelineToPlayhead`, `initScrubDrag`, `setCropPreset`.
- The module consumes `state.js`, `elements.js`, and sibling modules (`transport`, `compositing`, `section-editing`, `zoom-crop`, `audio-overlay`, `project-lifecycle`); remaining helpers from `../../app.js`.
- `app.ts`: delete the moved definitions; import the entry points it calls. Any sibling that back-imported these is repointed to `interactions.js`.

Behavior-preserving — bodies unchanged.

## Capabilities

### New Capabilities
- `renderer-editor-interactions-module`: The editor timeline/canvas interactions (section trim drag, timeline scrub/seek/zoom/scroll, crop preset, canvas coordinate mapping, camera-keyframe visibility/fullscreen toggles, waveform peak computation + rendering) live in `src/renderer/features/editor/interactions.ts`, consuming `state.js`/`elements.js`/siblings; `app.ts` and sibling modules import its entry points. Behavior-preserving; validated by the renderer-health e2e gate.

### Modified Capabilities
<!-- None at the spec/requirement level. Mechanical relocation; no product behavior change. -->

## Impact

- **New file**: `src/renderer/features/editor/interactions.ts`.
- **Renderer**: `app.ts` loses the cluster bodies, gains a named import; sibling modules repoint their back-imports of waveform/scrub/zoom helpers to `interactions.js`.
- **Build/boundaries**: bundled by esbuild; circular imports resolved in-bundle.
- **Tests**: no new logic → no required unit test; `tsc` proves import completeness, the renderer-health e2e gate proves boot, full `npm run check` is the release gate.
- **Docs**: `docs/production/target-architecture.md` adds the module.
- **Deferred (later changes)**: take/media helpers, workspace/view, background-image, `appendTakeToTimeline`, `enterEditor`.
- **Risk**: low. Mechanical relocation behind the proven keystone; typecheck-guided reconciliation; the gate is the behavioral proof.
