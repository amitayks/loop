# renderer-zoom-crop-module Specification

## Purpose
TBD - created by archiving change extract-zoom-crop-module. Update Purpose after archive.
## Requirements
### Requirement: Zoom/crop + output-mode cluster lives in a feature module

The editorState-coupled zoom/crop/output-mode functions (`clampSectionZoom`, `formatSectionZoom`, `setOutputMode`, `updateOutputModeUI`, `getZoomCropBounds`, `resolveZoomCrop`, `panToFocusCoord`, `focusToPanCoord`) SHALL be defined in `src/renderer/features/editor/zoom-crop.ts`, consuming renderer state from `../../state.js`, DOM from `../dom/elements.js`, and shared/sibling helpers (`canvas` constants, `mode-state`, geometry, `section-editing`, `compositing`). `app.ts` SHALL import the entry points it invokes and SHALL NOT redefine these functions.

#### Scenario: Cluster moved with explicit imports
- **WHEN** the renderer needs a zoom/crop/output-mode function
- **THEN** it is imported from `./features/editor/zoom-crop.js`, and `app.ts` contains no local definition of it

#### Scenario: Sibling back-imports resolve to the zoom-crop module
- **WHEN** `compositing` or `section-editing` needs `clampSectionZoom`/`resolveZoomCrop`/`panToFocusCoord`/`formatSectionZoom`
- **THEN** it imports them from `../editor/zoom-crop.js` (not from `app.js`)

### Requirement: Relocation is behavior-preserving

Moving the cluster SHALL NOT change behavior. Function bodies SHALL be unchanged; only their location and explicit imports change. The pure geometry math SHALL remain in `features/geometry/*`; other domains SHALL remain in `app.ts`.

#### Scenario: App boots cleanly with the module loaded
- **WHEN** the renderer-health e2e smoke runs against the build
- **THEN** it observes `[renderer-loaded]` with no `[renderer:3]` / `[renderer-uncaught]` / `[renderer-gone]` markers

#### Scenario: Type system proves import completeness
- **WHEN** `npm run typecheck` (`tsc --build`, strict) runs
- **THEN** it succeeds — the module imports every state binding, element, constant, and sibling it references, and every consumer imports each zoom-crop entry point it calls

