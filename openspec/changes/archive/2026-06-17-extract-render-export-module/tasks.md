## 1. Create the render module

- [ ] 1.1 Confirm current lines of the ~11 functions (handleRenderProgress, updateProxyProgressBars, getRenderKeyframes, getRenderSections, showThumbnailToast, setRenderBtnState, captureThumbnailFrame, renderVideo, selectSegment, applySegmentDeletedStyle, updateSegmentBadge).
- [ ] 1.2 Create `src/renderer/features/render/render.ts`: move the functions verbatim (bodies unchanged); export each one called externally. Add imports: state bindings+setters from `../../state.js`; DOM from `../dom/elements.js`; siblings (`getStateAtTime` from `../editor/transport.js`, `drawComposite`/`updatePreview` from `../drawing/compositing.js`, section helpers from `../section/section-editing.js`) as needed; remaining helpers from `../../app.js` (export them); types from shared/state. Keep `window.electronAPI`/canvas APIs ambient.

## 2. Rewire app.ts and repoint siblings

- [ ] 2.1 `app.ts`: delete the moved definitions; add a named import from `./features/render/render.js` for the entry points it calls. Keep the `onRenderProgress` registration in app.ts bootstrap (importing `handleRenderProgress`). Keep call sites unchanged.
- [ ] 2.2 Repoint: grep `src/renderer/features/` for any moved name imported from `../../app.js` (esp. getRenderSections/getRenderKeyframes) and repoint to `../render/render.js`.
- [ ] 2.3 Reconcile (typecheck-guided): `npm run typecheck` → add missing imports; iterate to 0 errors. `npm run lint --max-warnings=0` → prune unused imports across all touched files.

## 3. Verification & docs

- [ ] 3.1 `npm run build` — completes; bundle rebuilt.
- [ ] 3.2 `npm run typecheck` + `npm run lint` (`--max-warnings=0`) — green.
- [ ] 3.3 `npm run test:e2e` — renderer-health smoke PASSES (`[renderer-loaded]`, no error markers). Run twice.
- [ ] 3.4 Full `npm run check` — green end to end.
- [ ] 3.5 Update `docs/production/target-architecture.md`: add `features/render/render.js`.

## 4. Hand-off

- [ ] 4.1 Summarize: functions moved; back-imports repointed; commands run; gate green; next domain.
