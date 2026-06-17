## Why

Continuing feature-module extraction. The editor **playback transport** — draw-loop scheduling, play/pause/seek/speed, section/camera/overlay playback sync, and visual-state-at-time — is a cohesive cluster in `app.ts`. Extracting it makes its imports explicit and resolves the drawing module's back-import of `getStateAtTime`/`getOverlayStateAtTime` from `app.js`.

## What Changes

- Add `src/renderer/features/editor/transport.ts` and move from `app.ts`: `hasPendingEditorDraw`, `cancelEditorDrawLoop`, `scheduleEditorDrawLoop`, `getStateAtTime`, `getOverlayStateAtTime`, `getTimelineBoundaries`, `updateEditorTimeDisplay`, `switchPlaybackSection`, `syncCameraPlayback`, `editorPlay`, `editorPause`, `editorTogglePlay`, `cyclePlaybackSpeed`, `editorSeek`, `syncOverlayVideo`, `updateScrubberPosition`, `editorDrawLoop`.
- The module consumes `state.js`, `elements.js`, `features/drawing/compositing.js`, `features/timeline/overlay-utils.js`, `features/timeline/camera-sync.js`; not-yet-extracted helpers are imported from `../../app.js` until their domains extract.
- `app.ts`: delete the moved definitions; import the entry points it calls (incl. from `enterEditor` and the play/seek event handlers). The drawing module's `getStateAtTime`/`getOverlayStateAtTime` back-import is repointed to `transport.js`.

`enterEditor` stays in `app.ts` as the editor orchestrator. Behavior-preserving — bodies unchanged.

## Capabilities

### New Capabilities
- `renderer-editor-transport-module`: The editor playback transport lives in `src/renderer/features/editor/transport.ts`, consuming `state.js`/`elements.js`/drawing/`overlay-utils`/`camera-sync`; `app.ts` and the drawing module import its entry points. Behavior-preserving; validated by the renderer-health e2e gate.

### Modified Capabilities
<!-- None at the spec/requirement level. Mechanical relocation; no product behavior change. -->

## Impact

- **New file**: `src/renderer/features/editor/transport.ts`.
- **Renderer**: `app.ts` loses the transport cluster bodies, gains a named import; `features/drawing/compositing.ts` repoints its `getStateAtTime`/`getOverlayStateAtTime` import to `transport.js`.
- **Build/boundaries**: bundled by esbuild; circular imports (transport ↔ drawing, transport ↔ app.js) resolved in-bundle.
- **Tests**: no new logic → no required unit test; `tsc` proves import completeness, the renderer-health e2e gate (the draw loop runs continuously) proves runtime correctness, full `npm run check` is the release gate.
- **Docs**: `docs/production/target-architecture.md` adds the module.
- **Deferred (later changes)**: `enterEditor`, overlays, audio-overlays, waveform, sections-editing, render/export, background-image, persistence, undo/redo.
- **Risk**: low–moderate (the draw loop is hot/continuous, so the e2e gate strongly exercises it). Mechanical relocation behind the proven keystone; typecheck-guided reconciliation.
