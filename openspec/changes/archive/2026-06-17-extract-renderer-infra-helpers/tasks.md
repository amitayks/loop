## 1. Create the three modules

- [x] 1.1 `src/renderer/features/media/take-media.ts`: move `getOrCreateTakeVideos`, `cleanupVideoPool`, `resolveTimeToSource`, `pathToFileUrl`, `loadMouseTrail`, `getMouseTrailForTake`, `ensureMediaInitialized`, `syncContentProtection` verbatim; export each one called externally. Imports: state from `../../state.js`; DOM from `../dom/elements.js`; mouse-trail from `../timeline/mouse-trail.js`/`../../shared/domain/mouse-trail.js`; remaining helpers from `../../app.js`. Keep `window.electronAPI` ambient.
- [x] 1.2 `src/renderer/features/workspace/workspace.ts`: move `setToggleButtonState`, `updateWorkspaceHeader`, `setWorkspaceView` verbatim; export those called externally. Imports: state, DOM, `enterEditor` from `../../app.js` if referenced, sibling helpers as needed.
- [x] 1.3 `src/renderer/features/background/background-image.ts`: move `pickAndLoadBackground`, `loadBackgroundFromPath` verbatim; export them. Imports: state, DOM, `updatePreview` from `../drawing/compositing.js`, `window.electronAPI` ambient.

## 2. Rewire app.ts and repoint siblings

- [x] 2.1 `app.ts`: delete the moved definitions; add named imports from the three new modules for the entry points it calls. Keep `enterEditor`/`appendTakeToTimeline` and the bootstrap. Keep call sites unchanged.
- [x] 2.2 Repoint: grep `src/renderer/features/` for any moved name imported from `../../app.js` (pathToFileUrl, getOrCreateTakeVideos, resolveTimeToSource, getMouseTrailForTake, ensureMediaInitialized, syncContentProtection, setWorkspaceView, updateWorkspaceHeader, loadBackgroundFromPath, pickAndLoadBackground) and repoint each to the correct new module.
- [x] 2.3 Reconcile (typecheck-guided): `npm run typecheck` → add missing imports; iterate to 0 errors. `npm run lint --max-warnings=0` → prune unused imports across all touched files.

## 3. Verification & docs

- [x] 3.1 `npm run build` — completes; bundle rebuilt.
- [x] 3.2 `npm run typecheck` + `npm run lint` (`--max-warnings=0`) — green.
- [x] 3.3 `npm run test:e2e` — renderer-health smoke PASSES (`[renderer-loaded]`, no error markers). Run twice.
- [x] 3.4 Full `npm run check` — green end to end.
- [x] 3.5 Update `docs/production/target-architecture.md`: add the three modules.

## 4. Hand-off

- [x] 4.1 Summarize: functions moved per module; back-imports repointed; what remains in app.ts (bootstrap + enterEditor + appendTakeToTimeline); commands run; gate green.
