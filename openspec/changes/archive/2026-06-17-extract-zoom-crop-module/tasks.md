## 1. Create the zoom-crop module

- [x] 1.1 Confirm current lines of the ~8 functions (clampSectionZoom, formatSectionZoom, setOutputMode, updateOutputModeUI, getZoomCropBounds, resolveZoomCrop, panToFocusCoord, focusToPanCoord).
- [x] 1.2 Create `src/renderer/features/editor/zoom-crop.ts`: move the functions verbatim (bodies unchanged); export each one called externally. Add imports: state bindings+setters from `../../state.js`; DOM from `../dom/elements.js`; constants from `../../shared/domain/canvas.js`; mode-state from `../keyframe/mode-state.js`; geometry from `../geometry/section-geometry.js`; section-editing entry points from `../section/section-editing.js`; `updatePreview` from `../drawing/compositing.js`; remaining helpers from `../../app.js` (export them); types from shared/state. Keep DOM/canvas APIs ambient.

## 2. Rewire app.ts and repoint siblings

- [x] 2.1 `app.ts`: delete the moved definitions; add a named import from `./features/editor/zoom-crop.js` for the entry points it calls. Keep call sites unchanged.
- [x] 2.2 Repoint: grep `src/renderer/features/` for clampSectionZoom/formatSectionZoom/resolveZoomCrop/panToFocusCoord/focusToPanCoord/getZoomCropBounds/setOutputMode imported from `../../app.js` (esp. compositing.ts, section-editing.ts) and repoint each to `../editor/zoom-crop.js`.
- [x] 2.3 Reconcile (typecheck-guided): `npm run typecheck` → add missing imports; iterate to 0 errors. `npm run lint --max-warnings=0` → prune unused imports across all touched files.

## 3. Verification & docs

- [x] 3.1 `npm run build` — completes; bundle rebuilt.
- [x] 3.2 `npm run typecheck` + `npm run lint` (`--max-warnings=0`) — green.
- [x] 3.3 `npm run test:e2e` — renderer-health smoke PASSES (`[renderer-loaded]`, no error markers). Run twice.
- [x] 3.4 Full `npm run check` — green end to end.
- [x] 3.5 Update `docs/production/target-architecture.md`: add `features/editor/zoom-crop.js`.

## 4. Hand-off

- [x] 4.1 Summarize: functions moved; sibling back-imports repointed; commands run; gate green; next domain.
