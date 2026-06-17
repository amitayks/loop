## ADDED Requirements

### Requirement: Recording cluster lives in a feature module

The recording lifecycle, audio-capture meter, and live-transcript functions (`startAudioMeter`, `stopAudioMeter`, `toggleRecording`, `getSupportedRecorderMimeType`, `getRecorderOptions`, `createRecorder`, `addAudioToStream`, `startRecording`, `updatePartialTranscript`, `commitTranscript`, `recoverPendingTake`, `setProcessingProgress`, `stopRecording`, `updateTimer`) SHALL be defined in `src/renderer/features/recording/recording.ts`, consuming renderer state from `../../state.js`, DOM from `../dom/elements.js`, `mergeInt16Arrays` from `./pcm-utils.js`, and capture functions from `../capture/source-picker.js`. `app.ts` SHALL import the entry points it invokes and SHALL NOT redefine these functions.

#### Scenario: Cluster moved with explicit imports
- **WHEN** the renderer needs a recording/meter/transcript function
- **THEN** it is imported from `./features/recording/recording.js`, and `app.ts` contains no local definition of it

#### Scenario: Capture audio-meter import resolves to recording
- **WHEN** the capture module needs `startAudioMeter`/`stopAudioMeter`
- **THEN** it imports them from `../recording/recording.js` (not from `app.js`)

### Requirement: Relocation is behavior-preserving

Moving the recording cluster SHALL NOT change behavior. Function bodies SHALL be unchanged; only their location and explicit imports change. Drawing/compositing and other domains SHALL remain in `app.ts`.

#### Scenario: App boots cleanly with the module loaded
- **WHEN** the renderer-health e2e smoke runs against the build
- **THEN** it observes `[renderer-loaded]` with no `[renderer:3]` / `[renderer-uncaught]` / `[renderer-gone]` markers

#### Scenario: Type system proves import completeness
- **WHEN** `npm run typecheck` (`tsc --build`, strict) runs
- **THEN** it succeeds — the module imports every state binding, setter, element, sibling, and helper it references, and `app.ts`/capture import every recording entry point they call
