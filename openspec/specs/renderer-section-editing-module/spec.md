# renderer-section-editing-module Specification

## Purpose
TBD - created by archiving change extract-section-editing-module. Update Purpose after archive.
## Requirements
### Requirement: Section-editing cluster lives in a feature module

The stateful section/timeline editing functions (`recalculateTimelinePositions`, `toggleSectionSaved`, `readdSavedSection`, `findSectionForTime`, `getSelectedSection`, `getSectionBackgroundZoom`, `getSectionBackgroundPan`, `updateSectionZoomControls`, `getSectionAnchorKeyframe`, `syncSectionAnchorKeyframes`, `selectEditorSection`, `applyStyleToFutureSections`, `renderSectionTranscriptList`, `switchSidebarTab`, `renderSectionMarkers`, `remapManualKeyframesAfterSectionDelete`, `remapOverlaysAfterSectionDelete`, `remapAudioOverlaysAfterSectionDelete`, `deleteSelectedSection`, `splitSectionAtPlayhead`, `splitAllAtPlayhead`, `setSelectedSectionBackgroundZoom`, `setSectionBackgroundPan`, `commitSectionZoomChange`) SHALL be defined in `src/renderer/features/section/section-editing.ts`, consuming renderer state from `../../state.js`, DOM from `../dom/elements.js`, the pure timeline utils, and sibling feature modules. `app.ts` SHALL import the entry points it invokes and SHALL NOT redefine these functions.

#### Scenario: Cluster moved with explicit imports
- **WHEN** the renderer needs a section-editing function
- **THEN** it is imported from `./features/section/section-editing.js`, and `app.ts` contains no local definition of it

#### Scenario: Sibling back-imports resolve to the section module
- **WHEN** any already-extracted feature module needs `getSelectedSection`/`findSectionForTime`/`recalculateTimelinePositions`/`renderSectionMarkers`/etc.
- **THEN** it imports them from `../section/section-editing.js` (not from `app.js`)

### Requirement: Relocation is behavior-preserving

Moving the section-editing cluster SHALL NOT change behavior. Function bodies SHALL be unchanged; only their location and explicit imports change. The pure section math SHALL remain in `features/timeline/section-utils.ts`; render/persistence/undo/drag domains SHALL remain in `app.ts`.

#### Scenario: App boots cleanly with the module loaded
- **WHEN** the renderer-health e2e smoke runs against the build
- **THEN** it observes `[renderer-loaded]` with no `[renderer:3]` / `[renderer-uncaught]` / `[renderer-gone]` markers

#### Scenario: Type system proves import completeness
- **WHEN** `npm run typecheck` (`tsc --build`, strict) runs
- **THEN** it succeeds — the module imports every state binding, element, util, and sibling it references, and every consumer imports each section entry point it calls

