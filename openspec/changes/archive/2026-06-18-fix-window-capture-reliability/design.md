## Context

This change fixes reliability bugs in the `multi-window-capture` feature (branch `feat/multi-window-capture`), discovered by driving the built app live over the Chrome DevTools Protocol this session. Established facts (not assumptions):

- **Backend is healthy.** `window.electronAPI.getSources()` returns real sources (11, incl. `screen:` + multiple `window:`); macOS Screen Recording permission is granted (`getUserMedia({video:{mandatory:{chromeMediaSource:"desktop"}}})` succeeds); the picker populates; and a clean CDP-driven window recording produced `win0/win1/camera.webm`, created a take, and navigated to the timeline. So the picker, source enumeration, take pipeline, and timeline navigation all work when streams carry real frames.
- **The picker rewrite moved screen/window selection off the old `<select id="screenSource">`** (now a "dead hidden element") onto the hybrid picker panel; **camera still uses its own legacy `<select id="cameraSource">`**. This is why camera can record while screen/window fails — they are independent paths.
- **Window `<video>` elements are off-DOM and never started.** `updateWindowStreams()` (`source-picker.ts:370–374`) does `document.createElement('video')`, sets `autoplay/muted/playsInline` and `srcObject`, but never appends to the DOM, never calls `.play()`, and never awaits `loadedmetadata`. The working screen path uses the in-DOM `<video id="screenVideo">` from `index.html`. Compositing (`compositing.ts:148,155`) and the recording draw loop (`recording.ts:254–256`) only draw when `vid.videoWidth && vid.videoHeight`. An element that never decodes stays `videoWidth = 0` → black/empty.
- **`stopRecording` silently discards camera-only recordings.** `recording.ts:616` gates the entire take-build/save/append block on `hasScreen || hasWindowCaptures`. When neither acquired, the camera recorder's `onstop` already wrote a `.webm`, but the take block is skipped — no take, no timeline entry, no error. Reproduced: project folders contain `recording-*-camera.webm` with `takes: []`.
- **Window `.webm` failed FFmpeg proxy generation** with `EBML header parsing failed` / `Invalid data found when processing input` for `recording-*-win0.webm`. This may be a *symptom* of the same root cause (a degenerate all-black / zero-content capture stream) rather than an independent bug — to be confirmed once frames are real.
- **Audio decode warning** `EncodingError: Unable to decode audio data` fires for takes recorded without an audio track (no-mic / permission-denied).
- The build enables Electron flags `ScreenCaptureKitPickerScreen` / `ScreenCaptureKitStreamPickerSonoma`; on macOS Sonoma, window capture by `chromeMediaSourceId` can return all-black frames in some conditions (e.g., another app holding ScreenCaptureKit, hardware-accelerated windows).

Constraint: **preserve the verbatim-extracted module architecture** from the renderer decomposition. These are behavior/reliability fixes plus test coverage, not a re-refactor.

## Goals / Non-Goals

**Goals:**
- Window captures display their real content (not a black shape) in both live preview and recorded output.
- A recording can never be *silently* lost: if the selected visual source(s) failed to acquire, the user is told explicitly and no take-less orphan files are left dangling.
- Window recording files are valid, FFmpeg-readable webm; proxy generation reports unreadable inputs instead of swallowing them.
- The record → take → timeline path and non-black window content are covered by an automated interaction test, so these regressions fail CI.

**Non-Goals:**
- Re-refactoring renderer modules or changing the `Take` / `project.json` schema.
- Changing the picker UX, the 2-window limit, wallpaper compositing layout, or the render filter-graph design (covered by existing `window-capture-*` specs).
- Supporting a brand-new "camera-only take" product flow as a feature (camera-only is treated as an error/recovery case, not a first-class output).
- Fixing non-macOS capture paths (the feature is macOS-targeted today).

## Decisions

### D1 — Make window `<video>` elements deterministically ready before drawing
**Choice:** In `updateWindowStreams()`, after assigning `srcObject`, explicitly `await video.play()` and await readiness (`loadedmetadata`, then a non-zero `videoWidth`/first frame) before the element is considered drawable; mirror the in-DOM approach by attaching window videos to the DOM hidden (e.g., a visually-hidden container) the way `#screenVideo` is, so Chromium reliably decodes frames.
**Why:** Off-DOM `<video autoplay muted>` with a `MediaStream` does not reliably begin decoding in Chromium; the in-DOM `#screenVideo` works precisely because it is connected. Explicit `play()` + readiness await removes the race that leaves `videoWidth = 0`.
**Alternatives considered:** (a) Only call `.play()` without DOM attach — less reliable across Chromium versions. (b) Poll `videoWidth` with a timeout in the draw loop — papers over the race, still black until ready, and complicates compositing. (c) Use `requestVideoFrameCallback` to drive the canvas draw — a good enhancement but orthogonal; the readiness gate is the core fix.

### D2 — Distinguish "not drawn" from "drawn black", then mitigate the ScreenCaptureKit case
**Choice:** Add a one-time diagnostic that, once a window stream is acquired, samples a frame (draw to a 1×1/8×8 scratch canvas, read pixels) to classify: `videoWidth === 0` (readiness bug → D1) vs `videoWidth > 0` but all-black (SCK capture returning black). For the all-black case, apply the platform mitigation empirically determined to work — candidates in priority order: keep frames flowing via D1; if still black, evaluate disabling `ScreenCaptureKitStreamPickerSonoma` / using the system picker / re-acquiring the source — and document a user-facing fallback message if the OS refuses to provide content.
**Why:** The two failure modes need different fixes; shipping a blind flag flip risks regressing the working `screen:` path. Empirical classification keeps the fix targeted.
**Alternatives considered:** Flip Electron flags up front — risky and may regress entire-screen capture. Do nothing and assume D1 fixes it — plausible (black-but-valid stream may resolve once frames flow), but we must verify, hence the diagnostic.
**Open question:** see OQ1.

### D3 — Never silently discard a recording
**Choice:** Two-layer safety:
1. **Pre-flight at record start:** if the user selected screen/window sources but no corresponding stream is active (`screenStream`/`windowStreams` empty for the selected `pickerMode`), block the start and show an explicit, actionable error (e.g., "Screen/window capture didn't start — check Screen Recording permission and reselect the source") instead of recording camera-only.
2. **At stop:** if recorders ran but produced no usable visual track (`!hasScreen && !hasWindowCaptures`), do not silently skip the take block: surface an error and route the orphaned files to the existing recovery/cleanup path (do not leave take-less `.webm` files accumulating).
**Why:** The failure is upstream (acquisition); the user should learn at record time, not discover an empty timeline later. Camera-only output is not a desired product, so we treat it as an error/recovery case rather than fabricating a take the user didn't ask for.
**Alternatives considered:** Always create a camera-only take — avoids data loss but produces takes with no visual base layer that the render/timeline path doesn't model, risking downstream breakage. Keep current silent skip but add a toast — still leaves orphan files. The chosen approach surfaces the problem *and* avoids orphans.

### D4 — Treat window-webm validity as verify-after-D1, then harden the recorder + proxy reporting
**Choice:** After D1 lands, re-verify whether `win*.webm` is FFmpeg-readable. If still invalid, harden the window recorder to match the proven screen recorder (same `getRecorderOptions` mime selection, ensure a keyframe/`requestData` flush on stop, guard against zero-frame canvases). Independently, make proxy generation set an observable `failed` status for unreadable inputs instead of only logging a warning.
**Why:** The EBML error most likely stems from a degenerate stream; fixing frames first avoids chasing a phantom. Observable proxy failure prevents the next silent gap.
**Alternatives considered:** Add an FFmpeg `-f matroska` input hint — masks rather than fixes a malformed file. Re-mux post-hoc — extra complexity if the source recorder is simply made correct.

### D5 — Quiet the no-audio decode path
**Choice:** Where the editor decodes a take's audio for the waveform, skip decode (or catch and downgrade to debug) when the take/source has no audio track.
**Why:** A no-mic recording is valid; the `EncodingError` is noise that also trips the renderer-health error scan (`[renderer:3]`).
**Alternatives considered:** Always require audio — wrong; mic is optional.

### D6 — Interaction-level e2e via CDP (proven this session)
**Choice:** Add an automated interaction test that launches Electron with `--remote-debugging-port`, connects over the bundled `ws` dependency, opens a fixture project, enters the recording view, selects a window, records ~1s, stops, then asserts: (a) a take with `windowPaths` exists, and (b) a sampled window-capture frame is non-black. Keep it gated/skippable in headless CI where desktop capture is unavailable, but runnable locally and on a capture-capable runner.
**Why:** The current gate only proves an idle boot (`[renderer-loaded]` is `did-finish-load`, not app success) and `renderer-bundle.test.ts` never executes the bundle — so every interaction flow is untested. The CDP+`ws` approach is already proven to drive this exact flow this session; Playwright `_electron` is not installed.
**Alternatives considered:** Pure unit tests of `updateWindowStreams`/`stopRecording` — necessary but insufficient (they can't catch black frames or real capture). Add Playwright — new heavy dependency. Manual verification only — is exactly how this shipped broken.

## Risks / Trade-offs

- **[SCK black frames are an OS-level limitation that code can't fully fix]** → D2 diagnostic + documented user-facing fallback; D1 may resolve the common case. Do not regress the working `screen:` path: any Electron-flag change must be validated against entire-screen capture.
- **[Interaction e2e needs real desktop capture + permission, flaky/unavailable in headless CI]** → make the capture-asserting test self-skip when sources/permission are absent and emit a clear "skipped: no capture" marker, so it runs on capable machines without red-failing CI. Keep the deterministic unit tests as the always-on guard.
- **[D3 pre-flight could false-positive and block legitimate recordings during the brief async stream-init window]** → gate the block on the *selected* `pickerMode` and only after init has settled; allow camera+audio-only intentional recordings only if that is an explicit selection (not an acquisition failure).
- **[Changing the take-creation guard risks the render/timeline path that assumes a visual base layer]** → D3 does not create camera-only takes; it errors and cleans up, preserving existing downstream invariants.
- **[Test recording side effects]** this session's diagnostics added 1 take + 3 `.webm` files to the `test` fixture project; implementation should use a disposable fixture and clean up.

## Migration Plan

No data migration. Roll out as a normal renderer/main build (`npm run build`). Rollback is reverting the change; no persisted schema is altered. Existing take-less orphan `.webm` files from prior broken recordings are not auto-migrated, but D4's proxy reporting and D3's cleanup prevent new orphans; an optional one-time cleanup may be offered via the existing `cleanupUnusedTakes` path.

## Open Questions — RESOLVED (live-verified this session)

- **OQ1 — RESOLVED (corrected): the black window is OCCLUSION, not an Electron/Chromium bug.** Pixel-sampling on BOTH Electron 35 (Chromium 134) and Electron 42 (Chromium 148) shows the same result: **visible** windows capture non-black; **occluded/background** windows return `videoWidth>0` all-black. The earlier "Electron 35 is broken" reading was an artifact of always sampling an occluded window ("app.ts — loop"). The Electron upgrade and the `getDisplayMedia`+`setDisplayMediaRequestHandler` prototype were BOTH reverted as ineffective/unnecessary. D1 readiness is retained. There is no code fix that makes a fully-occluded window non-black on this macOS ScreenCaptureKit; the window must be visible during capture.
- **OQ2 — RESOLVED.** The `EBML / Invalid data` failure was NOT a malformed encoder output — it was a **0-byte** file produced when a window's `<video>` never reached `videoWidth>0` (degenerate/occluded source) and the recording canvas had no frames. Fix is to drop never-ready windows at capture time (no file created) rather than harden the recorder. New, related discovery: that same 0-byte file is fed to FFmpeg unvalidated by the render service (`render-service.ts:645`) and **crashes the export** — so the render service must validate/skip invalid window overlay inputs.
- **OQ3 — RESOLVED.** D3 routes orphaned camera-only files through the existing `.deleted` cleanup path (`stageTakeFiles`), not the recovery-take mechanism (which requires a `screenPath` a camera-only orphan lacks).

## New decisions (added during implementation)

- **D7 — Electron upgrade REJECTED (reverted).** A bump to 42.4.1 was tried and reverted: it did not change capture behavior (occlusion, not version, is the cause), and a 7-major jump risks a macOS Screen-Recording-permission reset and other regressions. Stay on the committed Electron 35.x. The black-window experience is addressed by (a) D8/D9 graceful handling and (b) documenting that the target window must be visible during capture — not by an upgrade.
- **D8 — Drop never-ready windows.** In `updateWindowStreams`, after the readiness await, remove any window still at `videoWidth===0` (stop its stream, detach its video, filter the aligned `windowStreams/windowVideos/windowSourceNames`). Prevents 0-byte recordings and broken takes; D3's pre-flight then surfaces an error if nothing visual remains.
- **D9 — Render resilience.** In `renderComposite`, after `outputFolder` is known, drop `video`/`window` overlays whose resolved media file is missing or 0-byte (before index/filter computation, so FFmpeg input indices stay aligned). An export must never hard-fail because one window file is bad.
