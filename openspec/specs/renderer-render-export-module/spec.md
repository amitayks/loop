# renderer-render-export-module Specification

## Purpose
TBD - created by archiving change extract-render-export-module. Update Purpose after archive.
## Requirements
### Requirement: Render/export cluster lives in a feature module

The render/export functions (`handleRenderProgress`, `updateProxyProgressBars`, `getRenderKeyframes`, `getRenderSections`, `showThumbnailToast`, `setRenderBtnState`, `captureThumbnailFrame`, `renderVideo`, `selectSegment`, `applySegmentDeletedStyle`, `updateSegmentBadge`) SHALL be defined in `src/renderer/features/render/render.ts`, consuming renderer state from `../../state.js`, DOM from `../dom/elements.js`, sibling feature modules, and `window.electronAPI`. `app.ts` SHALL import the entry points it invokes and SHALL NOT redefine these functions.

#### Scenario: Cluster moved with explicit imports
- **WHEN** the renderer needs a render/export function
- **THEN** it is imported from `./features/render/render.js`, and `app.ts` contains no local definition of it

#### Scenario: Render progress registration imports the handler
- **WHEN** app.ts bootstrap registers the `onRenderProgress` IPC listener
- **THEN** it imports `handleRenderProgress` from `./features/render/render.js`

### Requirement: Relocation is behavior-preserving

Moving the render/export cluster SHALL NOT change behavior. Function bodies SHALL be unchanged; only their location and explicit imports change. Other domains SHALL remain in `app.ts`.

#### Scenario: App boots cleanly with the module loaded
- **WHEN** the renderer-health e2e smoke runs against the build
- **THEN** it observes `[renderer-loaded]` with no `[renderer:3]` / `[renderer-uncaught]` / `[renderer-gone]` markers

#### Scenario: Type system proves import completeness
- **WHEN** `npm run typecheck` (`tsc --build`, strict) runs
- **THEN** it succeeds — the module imports every state binding, element, and sibling it references, and `app.ts` imports every render entry point it calls

