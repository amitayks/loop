## Why

Continuing feature-module extraction. The stateful **section/timeline editing** cluster (~24 functions) is the largest remaining domain in `app.ts` and the most depended-upon — sibling feature modules currently back-import `getSelectedSection`, `findSectionForTime`, `recalculateTimelinePositions`, `renderSectionMarkers`, etc. from `app.js`. Extracting it makes those imports explicit and resolves a large part of the back-import web.

## What Changes

- Add `src/renderer/features/section/section-editing.ts` and move ~24 functions from `app.ts`: `recalculateTimelinePositions`, `toggleSectionSaved`, `readdSavedSection`, `findSectionForTime`, `getSelectedSection`, `getSectionBackgroundZoom`, `getSectionBackgroundPan`, `updateSectionZoomControls`, `getSectionAnchorKeyframe`, `syncSectionAnchorKeyframes`, `selectEditorSection`, `applyStyleToFutureSections`, `renderSectionTranscriptList`, `switchSidebarTab`, `renderSectionMarkers`, `remapManualKeyframesAfterSectionDelete`, `remapOverlaysAfterSectionDelete`, `remapAudioOverlaysAfterSectionDelete`, `deleteSelectedSection`, `splitSectionAtPlayhead`, `splitAllAtPlayhead`, `setSelectedSectionBackgroundZoom`, `setSectionBackgroundPan`, `commitSectionZoomChange`.
- The module consumes `state.js`, `elements.js`, the pure timeline utils (`section-utils`, `keyframe-ops`, `overlay-utils`), and sibling modules (`overlay`, `audio-overlay`, `transport`, `compositing`); remaining helpers (undo/persistence) from `../../app.js`.
- `app.ts`: delete the moved definitions; import the entry points it calls. Every sibling module that back-imported these from `app.js` is repointed to `section-editing.js`.

Behavior-preserving — bodies unchanged. The pure section math stays in `features/timeline/section-utils.ts`.

## Capabilities

### New Capabilities
- `renderer-section-editing-module`: The stateful section/timeline editing (split/delete/remap, markers + transcript-list rendering, anchor keyframes, background zoom/pan controls, saved toggles, sidebar tabs, timeline-position recalculation) lives in `src/renderer/features/section/section-editing.ts`, consuming `state.js`/`elements.js`/timeline-utils/sibling modules; `app.ts` and sibling modules import its entry points. Behavior-preserving; validated by the renderer-health e2e gate.

### Modified Capabilities
<!-- None at the spec/requirement level. Mechanical relocation; no product behavior change. -->

## Impact

- **New file**: `src/renderer/features/section/section-editing.ts`.
- **Renderer**: `app.ts` loses ~24 function bodies, gains a named import; `overlay.ts`/`audio-overlay.ts`/`transport.ts`/`compositing.ts` repoint their back-imports of section helpers from `app.js` to `section-editing.js`.
- **Build/boundaries**: bundled by esbuild; the section-editing ↔ overlay/audio-overlay/transport circular imports resolve in-bundle.
- **Tests**: no new logic → no required unit test; `tsc` proves import completeness, the renderer-health e2e gate proves boot, full `npm run check` is the release gate.
- **Docs**: `docs/production/target-architecture.md` adds the module.
- **Deferred (later changes)**: render/export, persistence, undo/redo, drag-interactions, background-image, keyframe/camera-visibility, waveform, workspace, `enterEditor`.
- **Risk**: low–moderate (largest cluster + broad repoint). Mechanical relocation behind the proven keystone; typecheck-guided reconciliation guarantees completeness; the gate is the behavioral proof.
