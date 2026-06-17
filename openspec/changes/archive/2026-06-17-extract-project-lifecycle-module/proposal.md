## Why

Continuing feature-module extraction. The **project-lifecycle** cluster (~25 functions) — persistence (save/recovery/scheduling), undo/redo, take staging, project activation/open, recent-projects UI — is the next cohesive domain and resolves the remaining widely-used back-imports to `app.js` (`pushUndo`, `snapshotTimeline`, `scheduleProjectSave`, `persistProjectNow`, `clearEditorState`, `stageTakeIfUnreferenced`).

## What Changes

- Add `src/renderer/features/project/project-lifecycle.ts` and move ~25 functions from `app.ts`: `getActiveProjectSession`, `matchesActiveProjectSession`, `getProjectTimelineSnapshot`, `buildProjectSavePayload`, `persistProjectNow`, `saveRecoveryTake`, `completeRecoveryTake`, `scheduleProjectSave`, `flushScheduledProjectSave`, `clearEditorState`, `isTakeReferenced`, `stageTakeIfUnreferenced`, `unstageTakeById`, `snapshotTimeline`, `restoreSnapshot`, `pushUndo`, `editorUndo`, `editorRedo`, `updateUndoRedoButtons`, `renderRecentProjects`, `clearProjectHomeMessage`, `showProjectHomeMessage`, `refreshRecentProjects`, `activateProject`, `openProjectByPath`.
- The module consumes `state.js`, `elements.js`, shared project domain, `section-editing.js`, and transport/overlay/audio-overlay siblings; remaining helpers (`enterEditor`, `setWorkspaceView`, …) from `../../app.js`.
- `app.ts`: delete the moved definitions; import the entry points it calls. Sibling modules that back-imported `pushUndo`/`scheduleProjectSave`/etc. from `app.js` are repointed to `project-lifecycle.js`.

Behavior-preserving — bodies unchanged.

## Capabilities

### New Capabilities
- `renderer-project-lifecycle-module`: Project persistence (save/recovery/scheduling), undo/redo (snapshot/restore/push/buttons), take staging, project activation/open, and recent-projects UI live in `src/renderer/features/project/project-lifecycle.ts`, consuming `state.js`/`elements.js`/shared/`section-editing`/siblings; `app.ts` and sibling modules import its entry points. Behavior-preserving; validated by the renderer-health e2e gate.

### Modified Capabilities
<!-- None at the spec/requirement level. Mechanical relocation; no product behavior change. -->

## Impact

- **New file**: `src/renderer/features/project/project-lifecycle.ts`.
- **Renderer**: `app.ts` loses ~25 function bodies, gains a named import; sibling modules repoint their `pushUndo`/`scheduleProjectSave`/`snapshotTimeline`/etc. back-imports to `project-lifecycle.js`.
- **Build/boundaries**: bundled by esbuild; circular imports resolved in-bundle.
- **Tests**: no new logic → no required unit test; `tsc` proves import completeness, the renderer-health e2e gate proves boot, full `npm run check` is the release gate.
- **Docs**: `docs/production/target-architecture.md` adds the module.
- **Deferred (later changes)**: render/export, drag-interactions, background-image, keyframe/camera-visibility, waveform, workspace, `enterEditor`.
- **Risk**: low–moderate (large cluster + broad repoint). Mechanical relocation behind the proven keystone; typecheck-guided reconciliation; the gate is the behavioral proof. One nuance: default-param `= activeProjectPath` now reads the imported state live-binding at call time (same behavior).
