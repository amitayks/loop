## ADDED Requirements

### Requirement: Visual-overlay cluster lives in a feature module

The image/video overlay editing functions (`getOverlayImageElement`, `getOverlayVideoElement`, `selectOverlay`, `updateOverlaySizeControl`, `buildVolumeHeartStack`, `renderOverlayList`, `toggleOverlaySaved`, `readdSavedOverlay`, `renderOverlayMarkers`, `startOverlayTrimDrag`, `updateOverlayTrimDrag`, `splitOverlayAtPlayhead`, `deleteSelectedOverlay`, `placeOverlayAtTime`, `handleOverlayDrop`, `centerSelectedOverlay`) SHALL be defined in `src/renderer/features/overlay/overlay.ts`, consuming renderer state from `../../state.js`, DOM from `../dom/elements.js`, and shared/sibling helpers (`generateOverlayId`, `overlay-utils`, `format-utils`, `compositing`). `app.ts` SHALL import the entry points it invokes and SHALL NOT redefine these functions.

#### Scenario: Cluster moved with explicit imports
- **WHEN** the renderer needs a visual-overlay function
- **THEN** it is imported from `./features/overlay/overlay.js`, and `app.ts` contains no local definition of it

#### Scenario: Audio-overlay back-imports resolve to the overlay module
- **WHEN** the audio-overlay module needs `renderOverlayList`/`renderOverlayMarkers`
- **THEN** it imports them from `../overlay/overlay.js` (not from `app.js`)

### Requirement: Relocation is behavior-preserving

Moving the visual-overlay cluster SHALL NOT change behavior. Function bodies SHALL be unchanged; only their location and explicit imports change. Sections-editing and other domains SHALL remain in `app.ts`.

#### Scenario: App boots cleanly with the module loaded
- **WHEN** the renderer-health e2e smoke runs against the build
- **THEN** it observes `[renderer-loaded]` with no `[renderer:3]` / `[renderer-uncaught]` / `[renderer-gone]` markers

#### Scenario: Type system proves import completeness
- **WHEN** `npm run typecheck` (`tsc --build`, strict) runs
- **THEN** it succeeds — the module imports every state binding, element, and shared/sibling helper it references, and `app.ts`/audio-overlay import every overlay entry point they call
