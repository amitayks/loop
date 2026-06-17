## 1. Create the project-lifecycle module

- [x] 1.1 Confirm current lines of the ~25 functions (list in proposal).
- [x] 1.2 Create `src/renderer/features/project/project-lifecycle.ts`: move the functions verbatim (bodies unchanged); export each one called externally. Add imports: state bindings+setters from `../../state.js`; DOM from `../dom/elements.js`; shared project domain from `../../shared/domain/project.js`/`project-fields.js`; section render/query from `../section/section-editing.js`; transport/overlay/audio-overlay siblings for `restoreSnapshot`; remaining helpers (enterEditor, setWorkspaceView, ensureMediaInitialized, etc.) from `../../app.js` (export them); types from shared/state. Keep `window.electronAPI` ambient. Keep default-param `= activeProjectPath` referencing the imported state binding.

## 2. Rewire app.ts and repoint siblings

- [x] 2.1 `app.ts`: delete the moved definitions; add a named import from `./features/project/project-lifecycle.js` for the entry points it calls. Keep call sites unchanged.
- [x] 2.2 Repoint: grep `src/renderer/features/` for any moved name imported from `../../app.js` (esp. pushUndo, snapshotTimeline, scheduleProjectSave, persistProjectNow, clearEditorState, stageTakeIfUnreferenced, updateUndoRedoButtons) and repoint each to `../project/project-lifecycle.js`.
- [x] 2.3 Reconcile (typecheck-guided): `npm run typecheck` → add missing imports; iterate to 0 errors. `npm run lint --max-warnings=0` → prune unused imports across all touched files.

## 3. Verification & docs

- [x] 3.1 `npm run build` — completes; bundle rebuilt.
- [x] 3.2 `npm run typecheck` + `npm run lint` (`--max-warnings=0`) — green.
- [x] 3.3 `npm run test:e2e` — renderer-health smoke PASSES (`[renderer-loaded]`, no error markers). Run twice.
- [x] 3.4 Full `npm run check` — green end to end.
- [x] 3.5 Update `docs/production/target-architecture.md`: add `features/project/project-lifecycle.js`.

## 4. Hand-off

- [x] 4.1 Summarize: functions moved; sibling back-imports repointed; remaining app.js back-imports; commands run; gate green; next domain.
