# renderer-editor-transport-module Specification

## Purpose
TBD - created by archiving change extract-editor-transport-module. Update Purpose after archive.
## Requirements
### Requirement: Editor playback-transport cluster lives in a feature module

The editor playback-transport functions (`hasPendingEditorDraw`, `cancelEditorDrawLoop`, `scheduleEditorDrawLoop`, `getStateAtTime`, `getOverlayStateAtTime`, `getTimelineBoundaries`, `updateEditorTimeDisplay`, `switchPlaybackSection`, `syncCameraPlayback`, `editorPlay`, `editorPause`, `editorTogglePlay`, `cyclePlaybackSpeed`, `editorSeek`, `syncOverlayVideo`, `updateScrubberPosition`, `editorDrawLoop`) SHALL be defined in `src/renderer/features/editor/transport.ts`, consuming renderer state from `../../state.js`, DOM from `../dom/elements.js`, drawing from `../drawing/compositing.js`, overlay-state from `../timeline/overlay-utils.js`, and camera-sync from `../timeline/camera-sync.js`. `app.ts` SHALL import the entry points it invokes and SHALL NOT redefine these functions.

#### Scenario: Cluster moved with explicit imports
- **WHEN** the renderer needs a transport function
- **THEN** it is imported from `./features/editor/transport.js`, and `app.ts` contains no local definition of it

#### Scenario: Drawing's state-at-time import resolves to transport
- **WHEN** the drawing module needs `getStateAtTime`/`getOverlayStateAtTime`
- **THEN** it imports them from `../editor/transport.js` (not from `app.js`)

### Requirement: Relocation is behavior-preserving

Moving the transport cluster SHALL NOT change behavior. Function bodies SHALL be unchanged; only their location and explicit imports change. `enterEditor` and other domains SHALL remain in `app.ts`.

#### Scenario: App boots and the draw loop runs cleanly
- **WHEN** the renderer-health e2e smoke runs against the build
- **THEN** it observes `[renderer-loaded]` with no `[renderer:3]` / `[renderer-uncaught]` / `[renderer-gone]` markers (the continuously-running editor draw loop exercises the module)

#### Scenario: Type system proves import completeness
- **WHEN** `npm run typecheck` (`tsc --build`, strict) runs
- **THEN** it succeeds — the module imports every state binding, element, drawing/overlay/camera helper, and sibling it references, and `app.ts`/drawing import every transport entry point they call

