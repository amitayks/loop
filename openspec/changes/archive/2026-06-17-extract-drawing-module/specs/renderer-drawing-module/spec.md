## ADDED Requirements

### Requirement: Drawing/compositing cluster lives in a feature module

The canvas drawing/compositing functions (`getEffectiveCanvasDimensions`, `drawPip`, `drawCameraRect`, `drawBackground`, `updatePreview`, `drawComposite`, `drawFit`, `drawFitRounded`, `drawFill`, `drawEditorScreenWithZoom`) SHALL be defined in `src/renderer/features/drawing/compositing.ts`, consuming renderer state from `../../state.js`, canvas contexts/DOM from `../dom/elements.js`, geometry from `../geometry/*.js` and `../../shared/domain/canvas.js`, overlay-state from `../timeline/overlay-utils.js`, and smoothed-mouse from `../timeline/mouse-trail.js`. `app.ts` SHALL import the entry points it invokes and SHALL NOT redefine these functions.

#### Scenario: Cluster moved with explicit imports
- **WHEN** the renderer needs a drawing/compositing function
- **THEN** it is imported from `./features/drawing/compositing.js`, and `app.ts` contains no local definition of it

#### Scenario: Capture updatePreview import resolves to drawing
- **WHEN** the capture module needs `updatePreview`
- **THEN** it imports it from `../drawing/compositing.js` (not from `app.js`)

### Requirement: Relocation is behavior-preserving

Moving the drawing cluster SHALL NOT change behavior. Function bodies SHALL be unchanged; only their location and explicit imports change. `drawWaveformOnCanvas` and other domains SHALL remain in `app.ts`.

#### Scenario: App boots cleanly with the module loaded
- **WHEN** the renderer-health e2e smoke runs against the build
- **THEN** it observes `[renderer-loaded]` with no `[renderer:3]` / `[renderer-uncaught]` / `[renderer-gone]` markers

#### Scenario: Type system proves import completeness
- **WHEN** `npm run typecheck` (`tsc --build`, strict) runs
- **THEN** it succeeds — the module imports every state binding, context, geometry helper, and sibling it references, and `app.ts`/capture import every drawing entry point they call
