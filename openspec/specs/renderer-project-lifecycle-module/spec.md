# renderer-project-lifecycle-module Specification

## Purpose
TBD - created by archiving change extract-project-lifecycle-module. Update Purpose after archive.
## Requirements
### Requirement: Project-lifecycle cluster lives in a feature module

The project persistence, undo/redo, take-staging, activation, and recent-projects functions (`getActiveProjectSession`, `matchesActiveProjectSession`, `getProjectTimelineSnapshot`, `buildProjectSavePayload`, `persistProjectNow`, `saveRecoveryTake`, `completeRecoveryTake`, `scheduleProjectSave`, `flushScheduledProjectSave`, `clearEditorState`, `isTakeReferenced`, `stageTakeIfUnreferenced`, `unstageTakeById`, `snapshotTimeline`, `restoreSnapshot`, `pushUndo`, `editorUndo`, `editorRedo`, `updateUndoRedoButtons`, `renderRecentProjects`, `clearProjectHomeMessage`, `showProjectHomeMessage`, `refreshRecentProjects`, `activateProject`, `openProjectByPath`) SHALL be defined in `src/renderer/features/project/project-lifecycle.ts`, consuming renderer state from `../../state.js`, DOM from `../dom/elements.js`, shared project domain, and sibling feature modules. `app.ts` SHALL import the entry points it invokes and SHALL NOT redefine these functions.

#### Scenario: Cluster moved with explicit imports
- **WHEN** the renderer needs a project-lifecycle/undo function
- **THEN** it is imported from `./features/project/project-lifecycle.js`, and `app.ts` contains no local definition of it

#### Scenario: Sibling back-imports resolve to the project module
- **WHEN** any already-extracted feature module needs `pushUndo`/`snapshotTimeline`/`scheduleProjectSave`/`persistProjectNow`/`clearEditorState`/etc.
- **THEN** it imports them from `../project/project-lifecycle.js` (not from `app.js`)

### Requirement: Relocation is behavior-preserving

Moving the project-lifecycle cluster SHALL NOT change behavior. Function bodies SHALL be unchanged; only their location and explicit imports change. Default parameters referencing state (`= activeProjectPath`) SHALL read the imported live-binding at call time, preserving behavior. Render/drag/background/`enterEditor` SHALL remain in `app.ts`.

#### Scenario: App boots cleanly with the module loaded
- **WHEN** the renderer-health e2e smoke runs against the build
- **THEN** it observes `[renderer-loaded]` with no `[renderer:3]` / `[renderer-uncaught]` / `[renderer-gone]` markers

#### Scenario: Type system proves import completeness
- **WHEN** `npm run typecheck` (`tsc --build`, strict) runs
- **THEN** it succeeds — the module imports every state binding, element, shared, and sibling it references, and every consumer imports each project-lifecycle entry point it calls

