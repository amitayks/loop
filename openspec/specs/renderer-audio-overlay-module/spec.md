# renderer-audio-overlay-module Specification

## Purpose
TBD - created by archiving change extract-audio-overlay-module. Update Purpose after archive.
## Requirements
### Requirement: Audio-overlay cluster lives in a feature module

The audio-overlay functions (`toggleAudioOverlaySaved`, `readdSavedAudioOverlay`, `selectAudioOverlay`, `renderAudioOverlayMarkers`, `startAudioOverlayTrimDrag`, `updateAudioOverlayTrimDrag`, `splitAudioOverlayAtPlayhead`, `deleteSelectedAudioOverlay`, `placeAudioOverlayAtTime`, `getAudioOverlayContext`, `decodeAndCacheAudioBuffer`, `extractPeakData`, `drawWaveformOnCanvas`, `startAudioOverlayPlayback`, `stopAudioOverlayPlayback`, `clearAudioBufferCache`) SHALL be defined in `src/renderer/features/audio-overlay/audio-overlay.ts`, consuming renderer state from `../../state.js`, DOM from `../dom/elements.js`, and shared helpers (`generateAudioOverlayId`, section utils). `app.ts` SHALL import the entry points it invokes and SHALL NOT redefine these functions.

#### Scenario: Cluster moved with explicit imports
- **WHEN** the renderer needs an audio-overlay function
- **THEN** it is imported from `./features/audio-overlay/audio-overlay.js`, and `app.ts` contains no local definition of it

#### Scenario: Waveform rendering relocated
- **WHEN** the audio-overlay waveform is drawn
- **THEN** `drawWaveformOnCanvas` is defined in the audio-overlay module (no longer in `app.ts`)

### Requirement: Relocation is behavior-preserving

Moving the audio-overlay cluster SHALL NOT change behavior. Function bodies SHALL be unchanged; only their location and explicit imports change. Visual-overlay functions and other domains SHALL remain in `app.ts`.

#### Scenario: App boots cleanly with the module loaded
- **WHEN** the renderer-health e2e smoke runs against the build
- **THEN** it observes `[renderer-loaded]` with no `[renderer:3]` / `[renderer-uncaught]` / `[renderer-gone]` markers

#### Scenario: Type system proves import completeness
- **WHEN** `npm run typecheck` (`tsc --build`, strict) runs
- **THEN** it succeeds — the module imports every state binding, element, and shared/sibling helper it references, and `app.ts` imports every audio-overlay entry point it calls

