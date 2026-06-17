## 1. Create the audio-overlay module

- [x] 1.1 Confirm current lines of the ~16 audio-overlay functions (toggleAudioOverlaySaved, readdSavedAudioOverlay, selectAudioOverlay, renderAudioOverlayMarkers, startAudioOverlayTrimDrag, updateAudioOverlayTrimDrag, splitAudioOverlayAtPlayhead, deleteSelectedAudioOverlay, placeAudioOverlayAtTime, getAudioOverlayContext, decodeAndCacheAudioBuffer, extractPeakData, drawWaveformOnCanvas, startAudioOverlayPlayback, stopAudioOverlayPlayback, clearAudioBufferCache). Confirm the VISUAL-overlay functions are EXCLUDED.
- [x] 1.2 Create `src/renderer/features/audio-overlay/audio-overlay.ts`: move the functions verbatim (bodies unchanged); export each one called externally. Add imports: state bindings+setters from `../../state.js`; DOM from `../dom/elements.js`; `generateAudioOverlayId`/normalizers from `../../shared/domain/project-fields.js`/`project.js`; section utils from `../timeline/section-utils.js`; remaining helpers from `../../app.js` (export them from app.ts); types from shared/state. Keep Web Audio / canvas APIs ambient.

## 2. Rewire app.ts

- [x] 2.1 `app.ts`: delete the moved definitions; add a named import from `./features/audio-overlay/audio-overlay.js` for the entry points it calls. Keep call sites unchanged. Repoint any already-extracted module that referenced these (likely none).
- [x] 2.2 Reconcile (typecheck-guided): `npm run typecheck` → add missing imports; iterate to 0 errors. `npm run lint --max-warnings=0` → prune unused imports.

## 3. Verification & docs

- [x] 3.1 `npm run build` — completes; bundle rebuilt.
- [x] 3.2 `npm run typecheck` + `npm run lint` (`--max-warnings=0`) — green.
- [x] 3.3 `npm run test:e2e` — renderer-health smoke PASSES (`[renderer-loaded]`, no error markers). Run twice.
- [x] 3.4 Full `npm run check` — green end to end.
- [x] 3.5 Update `docs/production/target-architecture.md`: add `features/audio-overlay/audio-overlay.js`.

## 4. Hand-off

- [x] 4.1 Summarize: functions moved (incl. drawWaveformOnCanvas); visual overlays stayed; back-imports needed; commands run; gate green; next domain.
