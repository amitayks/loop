## 1. Create the interactions module

- [x] 1.1 Confirm current lines of the ~16 functions (computeWaveformPeaksFromCache, refreshWaveform, extractWaveformPeaks, renderWaveform, startTrimDrag, updateTrimDrag, finishTrimDrag, getMutableCameraKeyframe, toggleCameraVisibility, toggleCameraFullscreen, canvasToEditorCoords, seekFromTimeline, applyTimelineZoom, scrollTimelineToPlayhead, initScrubDrag, setCropPreset).
- [x] 1.2 Create `src/renderer/features/editor/interactions.ts`: move the functions verbatim (bodies unchanged); export each one called externally. Add imports: state bindings+setters from `../../state.js`; DOM from `../dom/elements.js`; sibling entry points from `../editor/transport.js`/`../drawing/compositing.js`/`../section/section-editing.js`/`../editor/zoom-crop.js`/`../audio-overlay/audio-overlay.js`/`../project/project-lifecycle.js`; remaining helpers from `../../app.js` (export them); types from shared/state. Keep DOM/canvas/MouseEvent APIs ambient.

## 2. Rewire app.ts and repoint siblings

- [x] 2.1 `app.ts`: delete the moved definitions; add a named import from `./features/editor/interactions.js` for the entry points it calls. Keep call sites unchanged.
- [x] 2.2 Repoint: grep `src/renderer/features/` for any moved name imported from `../../app.js` (esp. refreshWaveform/renderWaveform/initScrubDrag/canvasToEditorCoords/applyTimelineZoom/scrollTimelineToPlayhead/setCropPreset) and repoint to `../editor/interactions.js`.
- [x] 2.3 Reconcile (typecheck-guided): `npm run typecheck` → add missing imports; iterate to 0 errors. `npm run lint --max-warnings=0` → prune unused imports across all touched files.

## 3. Verification & docs

- [x] 3.1 `npm run build` — completes; bundle rebuilt.
- [x] 3.2 `npm run typecheck` + `npm run lint` (`--max-warnings=0`) — green.
- [x] 3.3 `npm run test:e2e` — renderer-health smoke PASSES (`[renderer-loaded]`, no error markers). Run twice.
- [x] 3.4 Full `npm run check` — green end to end.
- [x] 3.5 Update `docs/production/target-architecture.md`: add `features/editor/interactions.js`.

## 4. Hand-off

- [x] 4.1 Summarize: functions moved; back-imports repointed; commands run; gate green; remaining app.ts shell.
