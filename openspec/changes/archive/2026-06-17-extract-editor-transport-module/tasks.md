## 1. Create the transport module

- [x] 1.1 Confirm current lines of the 17 cluster functions (hasPendingEditorDraw, cancelEditorDrawLoop, scheduleEditorDrawLoop, getStateAtTime, getOverlayStateAtTime, getTimelineBoundaries, updateEditorTimeDisplay, switchPlaybackSection, syncCameraPlayback, editorPlay, editorPause, editorTogglePlay, cyclePlaybackSpeed, editorSeek, syncOverlayVideo, updateScrubberPosition, editorDrawLoop). Confirm enterEditor is EXCLUDED.
- [x] 1.2 Create `src/renderer/features/editor/transport.ts`: move the 17 functions verbatim (bodies unchanged); export each one called externally. Add imports: state bindings+setters from `../../state.js`; DOM from `../dom/elements.js`; drawComposite/updatePreview from `../drawing/compositing.js`; overlay-state from `../timeline/overlay-utils.js`; camera-sync from `../timeline/camera-sync.js`; remaining helpers from `../../app.js` (export them from app.ts); types from shared/state. Keep requestAnimationFrame/video APIs ambient.

## 2. Rewire app.ts and drawing

- [x] 2.1 `app.ts`: delete the moved definitions; add a named import from `./features/editor/transport.js` for the entry points it calls (incl. those `enterEditor` and play/seek event handlers invoke). Keep call sites unchanged.
- [x] 2.2 `features/drawing/compositing.ts`: repoint its `getStateAtTime`/`getOverlayStateAtTime` import (if present) from `../../app.js` to `../editor/transport.js`.
- [x] 2.3 Reconcile (typecheck-guided): `npm run typecheck` → add missing imports; iterate to 0 errors. `npm run lint --max-warnings=0` → prune unused imports across app.ts, transport.ts, compositing.ts.

## 3. Verification & docs

- [x] 3.1 `npm run build` — completes; bundle rebuilt.
- [x] 3.2 `npm run typecheck` + `npm run lint` (`--max-warnings=0`) — green.
- [x] 3.3 `npm run test:e2e` — renderer-health smoke PASSES (`[renderer-loaded]`, no error markers). Run twice.
- [x] 3.4 Full `npm run check` — green end to end.
- [x] 3.5 Update `docs/production/target-architecture.md`: add `features/editor/transport.js`.

## 4. Hand-off

- [x] 4.1 Summarize: functions moved; enterEditor stayed; drawing back-import repointed; back-imports needed; commands run; gate green; next domain.
