# renderer-editor-interactions-module Specification

## Purpose
TBD - created by archiving change extract-editor-interactions-module. Update Purpose after archive.
## Requirements
### Requirement: Editor-interactions cluster lives in a feature module

The editor timeline/canvas interaction functions (`computeWaveformPeaksFromCache`, `refreshWaveform`, `extractWaveformPeaks`, `renderWaveform`, `startTrimDrag`, `updateTrimDrag`, `finishTrimDrag`, `getMutableCameraKeyframe`, `toggleCameraVisibility`, `toggleCameraFullscreen`, `canvasToEditorCoords`, `seekFromTimeline`, `applyTimelineZoom`, `scrollTimelineToPlayhead`, `initScrubDrag`, `setCropPreset`) SHALL be defined in `src/renderer/features/editor/interactions.ts`, consuming renderer state from `../../state.js`, DOM from `../dom/elements.js`, and sibling feature modules. `app.ts` SHALL import the entry points it invokes and SHALL NOT redefine these functions.

#### Scenario: Cluster moved with explicit imports
- **WHEN** the renderer needs an editor-interaction function
- **THEN** it is imported from `./features/editor/interactions.js`, and `app.ts` contains no local definition of it

#### Scenario: Sibling back-imports resolve to the interactions module
- **WHEN** any feature module needs `refreshWaveform`/`renderWaveform`/`initScrubDrag`/`canvasToEditorCoords`/etc.
- **THEN** it imports them from `../editor/interactions.js` (not from `app.js`)

### Requirement: Relocation is behavior-preserving

Moving the cluster SHALL NOT change behavior. Function bodies SHALL be unchanged; only their location and explicit imports change. Take/media helpers, workspace, background, and `enterEditor` SHALL remain in `app.ts`.

#### Scenario: App boots cleanly with the module loaded
- **WHEN** the renderer-health e2e smoke runs against the build
- **THEN** it observes `[renderer-loaded]` with no `[renderer:3]` / `[renderer-uncaught]` / `[renderer-gone]` markers

#### Scenario: Type system proves import completeness
- **WHEN** `npm run typecheck` (`tsc --build`, strict) runs
- **THEN** it succeeds — the module imports every state binding, element, and sibling it references, and every consumer imports each interaction entry point it calls

