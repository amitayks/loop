## 1. Create the drawing module

- [x] 1.1 Confirm current lines of the cluster (getEffectiveCanvasDimensions, drawPip, drawCameraRect, drawBackground, updatePreview, drawComposite, drawFit, drawFitRounded, drawFill, drawEditorScreenWithZoom). Confirm drawWaveformOnCanvas is EXCLUDED.
- [x] 1.2 Create `src/renderer/features/drawing/compositing.ts`: move the 10 functions verbatim (bodies unchanged); export each one app.ts/other modules call. Add imports: state bindings+setters from `../../state.js`; canvas contexts + DOM from `../dom/elements.js`; geometry from `../geometry/*.js` + `../../shared/domain/canvas.js`; overlay-state from `../timeline/overlay-utils.js`; smoothed-mouse from `../timeline/mouse-trail.js`; remaining helpers from `../../app.js` (export them from app.ts); types from shared/state. Keep canvas/Image/Video APIs ambient.

## 2. Rewire app.ts and capture

- [x] 2.1 `app.ts`: delete the moved definitions; add a named import from `./features/drawing/compositing.js` for the entry points it calls. Keep call sites unchanged.
- [x] 2.2 `features/capture/source-picker.ts`: repoint its `updatePreview` import from `../../app.js` to `../drawing/compositing.js`.
- [x] 2.3 Reconcile (typecheck-guided): `npm run typecheck` → add missing imports; iterate to 0 errors. `npm run lint --max-warnings=0` → prune unused imports across app.ts, compositing.ts, source-picker.ts.

## 3. Verification & docs

- [x] 3.1 `npm run build` — completes; bundle rebuilt.
- [x] 3.2 `npm run typecheck` + `npm run lint` (`--max-warnings=0`) — green.
- [x] 3.3 `npm run test:e2e` — renderer-health smoke PASSES (`[renderer-loaded]`, no error markers). Run twice.
- [x] 3.4 Full `npm run check` — green end to end.
- [x] 3.5 Update `docs/production/target-architecture.md`: add `features/drawing/compositing.js`.

## 4. Hand-off

- [x] 4.1 Summarize: functions moved; capture updatePreview repointed; back-imports needed; commands run; gate green; next domain.
