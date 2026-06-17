## 1. Create the recording module

- [x] 1.1 Confirm current lines of the cluster (startAudioMeter, updateMeter nested, stopAudioMeter, toggleRecording, getSupportedRecorderMimeType, getRecorderOptions, createRecorder, addAudioToStream, startRecording, updatePartialTranscript, commitTranscript, recoverPendingTake, setProcessingProgress, stopRecording, updateTimer). Decide on `ensureMediaInitialized` by its call sites (recording-only → move; shared → leave in app.ts and import).
- [x] 1.2 Create `src/renderer/features/recording/recording.ts`: move the cluster verbatim (bodies unchanged); export each function app.ts/capture calls. Add imports: state bindings+setters from `../../state.js`; DOM from `../dom/elements.js`; `mergeInt16Arrays` from `./pcm-utils.js`; capture fns from `../capture/source-picker.js`; remaining helpers from `../../app.js` (minimize); types from `../../shared/types` / `../../state.js`. Keep Web Audio / MediaRecorder / `window.electronAPI` ambient.

## 2. Rewire app.ts and capture

- [x] 2.1 `app.ts`: delete the moved definitions; add a named import from `./features/recording/recording.js` for the entry points it calls. Keep call sites unchanged.
- [x] 2.2 `features/capture/source-picker.ts`: repoint its `startAudioMeter`/`stopAudioMeter` import from `../../app.js` to `../recording/recording.js`.
- [x] 2.3 Reconcile (typecheck-guided): run `npm run typecheck`; add missing imports to recording.ts and app.ts; iterate to 0 errors. Then `npm run lint --max-warnings=0`; prune unused imports across app.ts, recording.ts, source-picker.ts.

## 3. Verification & docs

- [x] 3.1 `npm run build` — completes; bundle rebuilt.
- [x] 3.2 `npm run typecheck` + `npm run lint` (`--max-warnings=0`) — green.
- [x] 3.3 `npm run test:e2e` — renderer-health smoke PASSES (`[renderer-loaded]`, no error markers). Run twice.
- [x] 3.4 Full `npm run check` — green end to end.
- [x] 3.5 Update `docs/production/target-architecture.md`: add `features/recording/recording.js`.

## 4. Hand-off

- [x] 4.1 Summarize: functions moved; `ensureMediaInitialized` decision; capture back-import repointed; imports added; commands run; gate green; next domain.
