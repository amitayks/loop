## ADDED Requirements

### Requirement: Remaining infrastructure helpers live in focused feature modules

The take/media helpers (`getOrCreateTakeVideos`, `cleanupVideoPool`, `resolveTimeToSource`, `pathToFileUrl`, `loadMouseTrail`, `getMouseTrailForTake`, `ensureMediaInitialized`, `syncContentProtection`) SHALL live in `src/renderer/features/media/take-media.ts`; the workspace routing helpers (`setToggleButtonState`, `updateWorkspaceHeader`, `setWorkspaceView`) in `src/renderer/features/workspace/workspace.ts`; and the background-image helpers (`pickAndLoadBackground`, `loadBackgroundFromPath`) in `src/renderer/features/background/background-image.ts`, each consuming renderer state from `../../state.js`, DOM from `../dom/elements.js`, and shared/sibling helpers. `app.ts` SHALL import the entry points it invokes and SHALL NOT redefine these functions.

#### Scenario: Helpers moved with explicit imports
- **WHEN** the renderer needs a take/media, workspace, or background helper
- **THEN** it is imported from its feature module, and `app.ts` contains no local definition of it

#### Scenario: Final back-imports resolve to the new modules
- **WHEN** any feature module needs `pathToFileUrl`/`getOrCreateTakeVideos`/`resolveTimeToSource`/`getMouseTrailForTake`/`setWorkspaceView`/etc.
- **THEN** it imports them from the appropriate new module (not from `app.js`)

### Requirement: app.ts is reduced to a thin orchestrator

After this change, `app.ts` SHALL contain only the bootstrap (event wiring, IPC registration, initial render) and the `enterEditor`/`appendTakeToTimeline` orchestrators. Relocation SHALL be behavior-preserving (bodies unchanged; only location + explicit imports change).

#### Scenario: App boots cleanly with the modules loaded
- **WHEN** the renderer-health e2e smoke runs against the build
- **THEN** it observes `[renderer-loaded]` with no `[renderer:3]` / `[renderer-uncaught]` / `[renderer-gone]` markers

#### Scenario: Type system proves import completeness
- **WHEN** `npm run typecheck` (`tsc --build`, strict) runs
- **THEN** it succeeds — each module imports every state binding, element, and sibling it references, and every consumer imports each helper entry point it calls
