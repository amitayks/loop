## Why

The `multi-window-capture` change shipped its feature code but never completed its own verification tasks (`17.1–17.7` remain unchecked), and live-app investigation on this branch confirmed it is broken in three ways: individual **window captures render as a black shape** (no real content), recordings whose screen/window streams failed to acquire are **silently discarded** (camera `.webm` lands on disk but no take, no timeline entry, no error), and the recorded window `.webm` files are **unreadable by FFmpeg** so proxy generation fails. None of this was caught because the renderer-health gate only validates an *idle boot* — no interaction flow (source pick → record → take → timeline) is exercised by any test.

## What Changes

- **Fix black window capture (primary):** the per-window preview/record `<video>` elements are created off-DOM with `autoplay = true` only — they are never `.play()`'d, never appended to the document, and their `loadedmetadata` is never awaited. The compositing draw gates on `vid.videoWidth && vid.videoHeight`, so an element that never starts decoding stays `videoWidth = 0` and draws nothing (or a black rect). Make window video elements reliably begin playback and be ready before they are drawn to the preview canvas or the offscreen recording canvas — so window captures show real content instead of black.
- **Investigate & mitigate the macOS ScreenCaptureKit black-frame case:** distinguish the `videoWidth = 0` (never drawn) failure from the `videoWidth > 0` but **all-black-pixels** failure. The build runs with `ScreenCaptureKitPickerScreen` / `ScreenCaptureKitStreamPickerSonoma` enabled; window capture by `chromeMediaSourceId` on macOS Sonoma can return black frames. Capture the real failure mode and apply the appropriate mitigation (capture configuration / Electron flag / source-id strategy), with a documented fallback.
- **Stop silently discarding recordings (reliability):** `stopRecording` only builds/saves/appends a take when `hasScreen || hasWindowCaptures`. When neither acquired, the camera recorder still wrote a file but the take block is skipped entirely — no take, no timeline entry, no error. Surface stream-acquisition failure to the user explicitly, and do not lose a recording that produced files.
- **Make window recording files valid (proxy):** window `.webm` proxy generation logs `EBML header parsing failed` / `Invalid data found when processing input`. Ensure window captures produce valid, FFmpeg-readable webm (and that proxy generation reports rather than silently swallows unreadable inputs).
- Reduce the noisy `EncodingError: Unable to decode audio data` warning for takes recorded without an audio track (no-mic / permission-denied recordings).
- **Close the test-coverage gap:** add interaction-level e2e coverage that drives source-pick → record → stop → take → timeline and asserts (a) a take is created and (b) window-capture content is non-black, so these regressions fail CI instead of reaching the user.

## Capabilities

### New Capabilities
<!-- None. All fixes modify behavior of existing window-capture capabilities; new requirements are added as deltas within the existing capabilities below. -->

### Modified Capabilities

- `window-capture-source`: when macOS Screen Recording permission is not granted (common when launched from a CLI/terminal that lacks the grant), the source picker MUST show an actionable message rather than a silently-empty source list.
- `window-capture-recording`: window preview/record `<video>` elements MUST begin playback and reach a drawable ready state before being composited (fixes black-shape rendering); recordings whose screen/window streams failed to acquire MUST surface an explicit error and MUST NOT be silently discarded; window recording files MUST be valid, playable webm.
- `window-capture-render`: the video export MUST NOT hard-fail because a window/video overlay's media file is missing or 0-byte — such inputs MUST be dropped (with a warning) before the FFmpeg input plan is built, so a bad window file never crashes the render.
- `take-proxy-files`: window-capture proxy generation operates on valid FFmpeg-readable inputs; proxy failures are already observable via the existing `status:'error'` path (the redundant `'failed'` mechanism added earlier is reverted).
- `renderer-health-gate`: the e2e gate MUST add an interaction-level check beyond idle boot that exercises source-pick → record → take → timeline and asserts a take is created and window-capture content is non-black.

## Update — root cause corrected during implementation (live-verified)

- **The "black window" is OCCLUSION, not an Electron bug.** Live CDP pixel-sampling on BOTH Electron 35 (Chromium 134) and Electron 42 (Chromium 148) shows the identical pattern: entire-screen capture is non-black, **visible/foreground windows capture real content (non-black)**, and **occluded/background/off-screen windows return `videoWidth>0` with all-black pixels**. macOS ScreenCaptureKit on this OS does not deliver live content for fully-occluded windows. An Electron 35→42 upgrade was prototyped and **reverted** — it fixed nothing the existing version didn't already do (the earlier "black" readings were a measurement artifact of always sampling an occluded window), and the major version jump risked a Screen-Recording-permission reset. A `getDisplayMedia` + `setDisplayMediaRequestHandler` migration was likewise prototyped and reverted as unnecessary. **Implication for the user:** to capture a window's real content, that window must be visible (not fully hidden behind the recorder/other windows) during recording.
- **D1 readiness retained** — explicit `play()` + readiness await (in-DOM `#windowVideoSink`) is still correct and necessary so a slow-to-decode window isn't drawn black before its first frame.
- **Never-ready windows must be dropped, not recorded.** A degenerate window whose `videoWidth` never reaches >0 (e.g. "App Icon Window") produced a **0-byte** `.webm` — this (not malformed encoding) is the source of the `EBML / Invalid data` proxy error, and it **crashes the video render/export** because the render service feeds the 0-byte file to FFmpeg unvalidated. Fix: drop never-ready windows at capture time (no bad file created) AND validate/skip invalid window overlay inputs in the render service so export never hard-fails on a bad window.
- **D4.3 reverted** — proxy failures were already observable via the existing `status:'error'` path; the added `'failed'` mechanism was dead code.
- **Empty source list now explains itself (Screen Recording permission).** When launched via `npm run dev`, macOS attributes Screen Recording permission to the **responsible parent process (the terminal)**, not to the CLI-spawned Electron — so an ungranted terminal makes `desktopCapturer.getSources()` return no windows and the picker looks empty/broken. The picker now queries `systemPreferences.getMediaAccessStatus('screen')` (new `getScreenAccessStatus` IPC) and, when not granted, shows an actionable message ("Enable Screen Recording for your terminal in System Settings → Privacy & Security → Screen Recording, then fully quit and reopen") instead of a blank list. Verified: granted context lists windows with no warning.
- **Export no longer crashes when there is no microphone.** Live end-to-end testing of the export revealed a separate crash: a recording made without a mic (mic not selected / permission denied) had no audio track, but the render filter graph unconditionally references the recording's audio (`[N:a]`), so FFmpeg failed with `Stream specifier ':a' matches no streams`. Fix: recordings now always carry an audio track — the real mic when present, otherwise a silent track — so every recording is exportable. Verified end-to-end: record entire-screen with no mic → export produces a valid `.mp4`.

## Impact

- **Renderer code:**
  - `src/renderer/features/capture/source-picker.ts` — `updateWindowStreams()` (window `<video>` creation/playback/readiness).
  - `src/renderer/features/drawing/compositing.ts` — window draw gating (`videoWidth`/`videoHeight`).
  - `src/renderer/features/recording/recording.ts` — `startRecording()` window canvas draw loop; `stopRecording()` `hasScreen || hasWindowCaptures` take-creation guard and failure surfacing.
- **Main process:** `src/main/services/proxy-service.ts` (window webm proxy generation/error reporting); `src/main.ts` / `src/main/app/create-window.ts` if a ScreenCaptureKit / Electron-flag mitigation is required.
- **Capture stack / platform:** macOS Sonoma ScreenCaptureKit window-capture behavior; Electron desktop-capture feature flags.
- **Tests:** `tests/e2e/smoke-electron.test.ts` (extend beyond idle boot) and/or a new interaction e2e; existing unit coverage for the touched renderer modules.
- **Data model:** no `Take` / `project.json` schema change expected; behavior-and-reliability fixes only. The verbatim-extracted module architecture is preserved (this is not a re-refactor).
- **Related:** unblocks the `multi-window-capture` change's verification tasks `17.1–17.7`.
