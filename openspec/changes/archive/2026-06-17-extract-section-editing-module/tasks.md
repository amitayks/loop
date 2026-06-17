## 1. Create the section-editing module

- [x] 1.1 Confirm current lines of the ~24 section-editing functions (list in proposal). Move the STATEFUL ones only; pure section math stays in features/timeline/section-utils.ts + keyframe-ops.ts.
- [x] 1.2 Create `src/renderer/features/section/section-editing.ts`: move the functions verbatim (bodies unchanged); export each one called externally. Add imports: state bindings+setters from `../../state.js`; DOM from `../dom/elements.js`; pure utils from `../timeline/section-utils.js`/`keyframe-ops.js`/`overlay-utils.js`; sibling entry points from `../overlay/overlay.js`/`../audio-overlay/audio-overlay.js`/`../editor/transport.js`/`../drawing/compositing.js`; remaining helpers (snapshotTimeline/pushUndo/scheduleProjectSave/enterEditor) from `../../app.js` (export them); types from shared/state. Keep DOM/canvas APIs ambient.

## 2. Rewire app.ts and repoint siblings

- [x] 2.1 `app.ts`: delete the moved definitions; add a named import from `./features/section/section-editing.js` for the entry points it calls. Keep call sites unchanged.
- [x] 2.2 Repoint: grep `src/renderer/features/` for any of the moved function names imported from `../../app.js` (esp. getSelectedSection, findSectionForTime, recalculateTimelinePositions, renderSectionMarkers, getSectionAnchorKeyframe, syncSectionAnchorKeyframes) and repoint each to `../section/section-editing.js` (correct relative depth per module).
- [x] 2.3 Reconcile (typecheck-guided): `npm run typecheck` → add missing imports; iterate to 0 errors. `npm run lint --max-warnings=0` → prune unused imports across all touched files.

## 3. Verification & docs

- [x] 3.1 `npm run build` — completes; bundle rebuilt.
- [x] 3.2 `npm run typecheck` + `npm run lint` (`--max-warnings=0`) — green.
- [x] 3.3 `npm run test:e2e` — renderer-health smoke PASSES (`[renderer-loaded]`, no error markers). Run twice.
- [x] 3.4 Full `npm run check` — green end to end.
- [x] 3.5 Update `docs/production/target-architecture.md`: add `features/section/section-editing.js`.

## 4. Hand-off

- [x] 4.1 Summarize: functions moved; sibling back-imports repointed; remaining app.js back-imports; commands run; gate green; next domain.
