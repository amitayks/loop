## Why

Continuing feature-module extraction now that the keystone (`state.ts` + `elements.ts`) is in place. The **recording** domain — recording lifecycle, audio-capture meter, and live transcript — is a cohesive cluster in `app.ts` that already consumes state (live bindings/setters) and DOM (`elements.ts`). Moving it into a module is just making its imports explicit. This also resolves the capture module's back-import of `startAudioMeter`/`stopAudioMeter` from `app.js` (they move into the recording module).

## What Changes

- Add `src/renderer/features/recording/recording.ts` and move the recording cluster from `app.ts`: `startAudioMeter`, `updateMeter` (nested), `stopAudioMeter`, `toggleRecording`, `getSupportedRecorderMimeType`, `getRecorderOptions`, `createRecorder`, `addAudioToStream`, `startRecording`, `updatePartialTranscript`, `commitTranscript`, `recoverPendingTake`, `setProcessingProgress`, `stopRecording`, `updateTimer` (+ `ensureMediaInitialized` if recording-specific).
- The module consumes `state.js` (bindings + setters), `elements.js`, `pcm-utils.js` (`mergeInt16Arrays`), and the capture module (`source-picker.js`); `window.electronAPI`/Web Audio/MediaRecorder are ambient.
- `app.ts`: delete the moved definitions; import the entry points it calls. The capture module's `startAudioMeter`/`stopAudioMeter` back-import is repointed from `app.js` to `recording.js`.

Behavior-preserving — function bodies unchanged; only location + explicit imports change. Drawing/compositing functions stay (separate domain).

## Capabilities

### New Capabilities
- `renderer-recording-module`: The recording lifecycle, audio-capture meter, and live-transcript handling live in `src/renderer/features/recording/recording.ts`, consuming `state.js`/`elements.js`/`pcm-utils.js` and the capture module; `app.ts` and the capture module import its entry points. Behavior-preserving; validated by the renderer-health e2e gate.

### Modified Capabilities
<!-- None at the spec/requirement level. Mechanical relocation; no product behavior change. -->

## Impact

- **New file**: `src/renderer/features/recording/recording.ts`.
- **Renderer**: `app.ts` loses the recording cluster bodies, gains a named import of entry points; `features/capture/source-picker.ts` repoints its audio-meter import to `recording.js`.
- **Build/boundaries**: bundled by esbuild; circular imports (recording ↔ capture, recording ↔ app.js for not-yet-extracted helpers) resolved in-bundle.
- **Tests**: no new logic → no required unit test; `tsc` proves import completeness, the renderer-health e2e gate proves the app boots with the module, full `npm run check` is the release gate.
- **Docs**: `docs/production/target-architecture.md` adds the module.
- **Deferred (later changes)**: drawing/compositing, overlays, audio-overlays, sections-editing, editor transport, render/export, background-image, persistence.
- **Risk**: low. Mechanical relocation behind the proven keystone; typecheck-guided reconciliation; the gate is the behavioral proof.
