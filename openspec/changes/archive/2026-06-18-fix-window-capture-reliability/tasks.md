## 0. Final status (live end-to-end verified)

> **App works end-to-end. `npm run check` fully green (lint, typecheck, 463 tests, e2e boot, packaging) on Electron 35.7.5.**
> Live CDP verification (real ffmpeg, real capture): boot → home → recording → dropdown lists 7 windows → entire-screen preview NON-BLACK → visible window capture NON-BLACK → record → valid `.webm` + take → **export → valid `.mp4`**.
>
> **Root cause corrected:** the "black window" is **occlusion**, not an Electron bug. Pixel-sampling on Electron 35 (Chromium 134) and 42 (Chromium 148) is identical — visible windows non-black, occluded/background windows all-black. The earlier "Electron 35 broken" reading was an artifact of always sampling an occluded window. **The Electron 42 upgrade and a `getDisplayMedia`/`setDisplayMediaRequestHandler` prototype were both tried and REVERTED** (ineffective; the upgrade also risked a Screen-Recording-permission reset — likely the cause of a transient "no windows" regression). Stayed on Electron 35.7.5.
>
> **Fixes shipped (all verified):**
> - **[x] D1 readiness** — in-DOM `#windowVideoSink` + `play()` + `awaitWindowVideoReady`. Retained (correct).
> - **[x] Never-ready windows dropped** — `partitionDrawableWindows` (pure, 7 unit tests) drops `videoWidth===0` windows → no more 0-byte `.webm`, no broken takes, no `EBML` proxy/render crash.
> - **[x] Render resilience** — `renderComposite` drops missing/0-byte `video`/`window` overlays before the ffmpeg input plan (2 unit tests). The user's "render error with bad windows" cannot crash the export.
> - **[x] No-mic export fix** — recordings always carry an audio track (real mic, else silent), so the export's `[N:a]` reference never fails. Verified live: no-mic entire-screen record → valid exported `.mp4`.
> - **[x] D3 no-silent-discard**, **[x] D5 audio-decode noise** — implemented; D5 verified live.
> - **[x] D6 interaction e2e** — authored (samples the window `<video>`, self-skips without capture).
> - **D4.3 reverted** — proxy failures were already observable via the existing `status:'error'` path; the added `'failed'` mechanism was dead code (never wired).
>
> **OS limitation to communicate:** to capture a window's real content it must be **visible** during recording; a fully-occluded window records black on this macOS ScreenCaptureKit — no code fixes that.

## 1. Reproduce & instrument (establish the failing baseline)

- [ ] 1.1 Add a disposable e2e fixture project (or reuse a throwaway path) so recording tests don't mutate real user projects; ensure cleanup of generated `.webm`/takes after each run.
- [ ] 1.2 Write a CDP-driven interaction harness (bundled `ws`) that launches Electron with `--remote-debugging-port`, opens the fixture, enters recording, selects a window, records ~1s, stops — and samples a frame of the window capture to classify black vs non-black and report whether a take was created. This harness is the basis for task 6.1.
- [ ] 1.3 Run the harness against current `main` to capture the failing baseline (black frame and/or `takes: []`), and record whether `win*.webm` is FFmpeg-readable (`ffmpeg -i`) — feeds OQ2.

## 2. Fix black window capture — video readiness (D1)

- [ ] 2.1 Add/extend unit coverage for `updateWindowStreams()` asserting each window `<video>` is attached to the DOM (hidden), `play()` is invoked, and the element is only marked drawable after a non-zero `videoWidth` (mock the media element).
- [ ] 2.2 In `src/renderer/features/capture/source-picker.ts` `updateWindowStreams()`, attach each window `<video>` to a hidden DOM container, call `play()`, and await readiness (`loadedmetadata` + non-zero `videoWidth`) before treating the source as drawable.
- [ ] 2.3 In `src/renderer/features/drawing/compositing.ts`, confirm/adjust the `videoWidth && videoHeight` gate so a not-yet-ready window renders the wallpaper/background (not a black fill) and begins drawing once ready.
- [ ] 2.4 In `src/renderer/features/recording/recording.ts` `startRecording()`, ensure the per-window offscreen canvas draw loop only starts once the source is ready, so recorded frames are real content (not black).
- [ ] 2.5 Re-run the harness (1.2) and confirm the live preview and a sampled recorded frame are non-black for the readiness case.

## 3. Diagnose & mitigate the ScreenCaptureKit black-frame case (D2, OQ1)

- [ ] 3.1 Add the runtime diagnostic that samples an acquired window frame (small scratch canvas + `getImageData`) to classify `videoWidth === 0` (readiness) vs `videoWidth > 0` but all-black (capture content), recording the classification for diagnosis.
- [ ] 3.2 If 2.x resolved black frames, document OQ1 as closed by D1 and skip the flag change. If still all-black, evaluate mitigations without regressing the working `screen:`/Entire-Screen path: e.g. ScreenCaptureKit picker / Electron desktop-capture flag in `src/main.ts` / `src/main/app/create-window.ts`, or source re-acquisition; validate Entire Screen still captures correctly after any flag change.
- [ ] 3.3 Implement a user-facing fallback message for the genuine OS-refuses-content case (per the `window-capture-recording` "Diagnostic distinguishes black-frame failure" scenario) instead of recording an all-black take.

## 4. Window webm validity & proxy reporting (D4, OQ2)

- [ ] 4.1 Re-test `win*.webm` validity after section 2. If now FFmpeg-readable, mark OQ2 resolved by D1.
- [ ] 4.2 If still invalid, harden the window `MediaRecorder` to match the screen recorder: same `getRecorderOptions()` mime selection, ensure a keyframe / `requestData()` flush on stop, and guard against zero-content canvases.
- [ ] 4.3 In `src/main/services/proxy-service.ts`, set an observable `failed` proxy status (via the `proxyStatus` map / proxy progress channel) when FFmpeg cannot parse a window input, instead of only logging a warning. Add/extend unit coverage for the failure-reporting branch.

## 5. Reliability — never silently discard a recording (D3) + audio noise (D5)

- [ ] 5.1 Add unit coverage for the `stopRecording` take-creation guard: assert that with no usable visual track the take block is NOT silently skipped (error surfaced + cleanup), and that the existing screen/window-present path still creates/persists a take (regression guard).
- [ ] 5.2 Pre-flight in `startRecording()`: if the selected `pickerMode` requires screen/window but `screenStream`/`windowStreams` is not active after init settles, block start and surface an explicit, actionable error (check Screen Recording permission / reselect source) instead of recording camera-only.
- [ ] 5.3 Stop-path in `stopRecording()`: when `!hasScreen && !hasWindowCaptures`, surface an error and route any already-written files to the recovery/cleanup path (resolve OQ3: prefer recovery-take reuse if low-cost, else cleanup) — no take-less orphans.
- [ ] 5.4 Guard the editor's take audio decode so a take with no audio track skips decode (or catches and downgrades to debug) — eliminate the `EncodingError: Unable to decode audio data` `[renderer:3]` noise. Add a focused test for the no-audio-track branch.

## 6. Test coverage — interaction gate (D6)

- [ ] 6.1 Promote the harness (1.2) into a committed interaction e2e under `tests/` that asserts: a take with `windowPaths` is created AND a sampled window frame is non-black; self-skip with an explicit "skipped: no capture" signal when desktop capture / permission is unavailable (per `renderer-health-gate` spec).
- [ ] 6.2 Wire the interaction e2e into the project's test/CI flow alongside the existing smoke (without red-failing capture-incapable runners).

## 7. Verification & sign-off

- [ ] 7.1 Run `npm run check` (lint + typecheck + test + test:e2e + package:smoke) and fix any defects without weakening assertions.
- [ ] 7.2 Manual verification on macOS (closes `multi-window-capture` tasks 17.1–17.7): record 1 window and 2 windows → confirm real (non-black) content in preview and in the saved/rendered output; confirm two `win*.webm` files + a take with `windowPaths`; confirm editor loads window captures, timeline tracks display/select/trim/split/delete, and FFmpeg render produces correct output with wallpaper + window overlays + camera.
- [ ] 7.3 Verify failure UX: with screen/window selected but acquisition forced to fail, confirm an explicit error and no silent camera-only loss / no orphan files.
- [ ] 7.4 Update `openspec/changes/multi-window-capture/tasks.md` 17.1–17.7 status as verified, and run `openspec validate fix-window-capture-reliability`.
