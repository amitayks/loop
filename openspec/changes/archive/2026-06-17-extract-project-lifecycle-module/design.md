## Context

Post-keystone, `app.ts` project-lifecycle functions reference state via `state.ts` and DOM via `elements.ts`. They are widely back-imported (`pushUndo`, `snapshotTimeline`, `scheduleProjectSave`, `persistProjectNow`, `clearEditorState`, `stageTakeIfUnreferenced`) by sibling modules. The renderer is esbuild-bundled; the renderer-health e2e gate exists.

## Goals / Non-Goals

**Goals:** move the project persistence + undo/redo + take-staging + activation + recents cluster into one module; resolve the remaining widely-used back-imports.

**Non-Goals:** no behavior change; no body edits; leave render/drag/background/workspace/`enterEditor`.

## Decisions

### D1 — Cluster boundary: project lifecycle + undo + recents
Persistence, undo/redo, take staging, activation/open, and recents form one cohesive "project lifecycle" domain (undo snapshots and persistence both operate over the timeline/project). Move them together.

### D2 — Consume state, elements, shared, section-editing, siblings
Imports: state from `../../state.js`; DOM from `../dom/elements.js`; shared project domain from `../../shared/domain/project.js`/`project-fields.js`; section render/query from `../section/section-editing.js`; transport/overlay/audio-overlay siblings for `restoreSnapshot`'s re-render. `window.electronAPI` stays ambient.

### D3 — Broad repoint of undo/persistence back-imports
Grep `features/` for `pushUndo`/`snapshotTimeline`/`scheduleProjectSave`/`persistProjectNow`/`clearEditorState`/`stageTakeIfUnreferenced`/`updateUndoRedoButtons` imported from `app.js` and repoint each to `../project/project-lifecycle.js`.

### D4 — Default-param state binding
`completeRecoveryTake(projectPath = activeProjectPath)` and `openProjectByPath` use default params referencing module state. Default params evaluate at call time, so `= activeProjectPath` referencing the imported live-binding preserves behavior exactly. Keep as-is.

### D5 — Back-imports for orchestrators; circular-safe; typecheck-guided
`activateProject`/`openProjectByPath`/`restoreSnapshot` call `enterEditor`/`setWorkspaceView`/`ensureMediaInitialized` still in `app.ts` (import from `../../app.js`). The `project-lifecycle ↔ section-editing ↔ …` cycles are esbuild-safe. Iterate `tsc --build` to 0 errors, then `lint --max-warnings=0`. The gate proves runtime health.

## Risks / Trade-offs

- **[Large cluster + broad repoint]** → typecheck guarantees completeness; one careful pass; the gate proves runtime.
- **[restoreSnapshot re-renders everything]** → it calls sibling render entry points (overlay/audio-overlay/section markers); bodies unchanged; imports made explicit.
- **[Default-param live binding]** → behavior preserved (call-time evaluation).

## Migration Plan

Behavior-preserving; single implementer creates the module, moves the cluster, repoints sibling back-imports, reconciles imports, rewires `app.ts`; full `npm run build` + `npm run check`. Rollback = revert.

## Open Questions

- None blocking.
