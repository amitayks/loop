## 1. Create the visual-overlay module

- [x] 1.1 Confirm current lines of the ~16 visual-overlay functions (getOverlayImageElement, getOverlayVideoElement, selectOverlay, updateOverlaySizeControl, buildVolumeHeartStack, renderOverlayList, toggleOverlaySaved, readdSavedOverlay, renderOverlayMarkers, startOverlayTrimDrag, updateOverlayTrimDrag, splitOverlayAtPlayhead, deleteSelectedOverlay, placeOverlayAtTime, handleOverlayDrop, centerSelectedOverlay). Move ONLY the non-Audio overlay functions.
- [x] 1.2 Create `src/renderer/features/overlay/overlay.ts`: move the functions verbatim (bodies unchanged); export each one called externally. Add imports: state bindings+setters from `../../state.js`; DOM from `../dom/elements.js`; `generateOverlayId` from `../../shared/domain/project-fields.js`; trim/state from `../timeline/overlay-utils.js`; `hexToRgba`/`getVolumeSvg`/`formatTime` from `../format/format-utils.js`; `updatePreview` from `../drawing/compositing.js`; remaining helpers from `../../app.js` (export them); types from shared/state. Keep Image/Video/canvas APIs ambient.

## 2. Rewire app.ts and audio-overlay

- [x] 2.1 `app.ts`: delete the moved definitions; add a named import from `./features/overlay/overlay.js` for the entry points it calls. Keep call sites unchanged.
- [x] 2.2 `features/audio-overlay/audio-overlay.ts`: repoint its `renderOverlayList`/`renderOverlayMarkers` imports from `../../app.js` to `../overlay/overlay.js`. Repoint any other already-extracted module referencing the moved functions.
- [x] 2.3 Reconcile (typecheck-guided): `npm run typecheck` → add missing imports; iterate to 0 errors. `npm run lint --max-warnings=0` → prune unused imports across app.ts, overlay.ts, audio-overlay.ts.

## 3. Verification & docs

- [x] 3.1 `npm run build` — completes; bundle rebuilt.
- [x] 3.2 `npm run typecheck` + `npm run lint` (`--max-warnings=0`) — green.
- [x] 3.3 `npm run test:e2e` — renderer-health smoke PASSES (`[renderer-loaded]`, no error markers). Run twice.
- [x] 3.4 Full `npm run check` — green end to end.
- [x] 3.5 Update `docs/production/target-architecture.md`: add `features/overlay/overlay.js`.

## 4. Hand-off

- [x] 4.1 Summarize: functions moved; audio-overlay back-imports repointed; back-imports needed; commands run; gate green; next domain.
