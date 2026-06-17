# renderer-capture-source-module Specification

## Purpose
TBD - created by archiving change extract-capture-source-module. Update Purpose after archive.
## Requirements
### Requirement: Capture source cluster lives in a feature module

The source-picker UI and capture-stream management functions (`updatePickerButtonText`, `renderPickerPanel`, `createPickerRadioRow`, `createPickerCheckboxRow`, `applyPickerSelection`, `populatePickerSources`, `enumerateDevices`, `updateScreenStream`, `updateCameraStream`, `updateAudioStream`, `updateWindowStreams`, `cleanupWindowStreams`) SHALL be defined in `src/renderer/features/capture/source-picker.ts`, consuming renderer state from `../../state.js` (live bindings + setters) and DOM from `../dom/elements.js`. `app.ts` SHALL import the entry points it invokes and SHALL NOT redefine these functions.

#### Scenario: Cluster moved with explicit imports
- **WHEN** the renderer needs a picker/stream function
- **THEN** it is imported from `./features/capture/source-picker.js`, and `app.ts` contains no local definition of it

#### Scenario: Module consumes shared state and elements
- **WHEN** a moved function reads/writes capture state or touches the source-picker DOM
- **THEN** it does so via imports from `state.js` (bindings/setters) and `elements.js`, with the same behavior as before

### Requirement: Relocation is behavior-preserving

Moving the cluster SHALL NOT change behavior. Function bodies SHALL be unchanged; only their location and explicit imports change. Background-image and other domains SHALL remain in `app.ts`.

#### Scenario: App boots cleanly with the module loaded
- **WHEN** the renderer-health e2e smoke runs against the build
- **THEN** it observes `[renderer-loaded]` with no `[renderer:3]` / `[renderer-uncaught]` / `[renderer-gone]` markers

#### Scenario: Type system proves import completeness
- **WHEN** `npm run typecheck` (`tsc --build`, strict) runs
- **THEN** it succeeds — the module imports every state binding, setter, DOM element, and type it references, and `app.ts` imports every moved entry point it calls

