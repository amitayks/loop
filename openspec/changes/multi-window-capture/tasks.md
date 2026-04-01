## 1. Domain Types & Data Model

- [x] 1.1 Add `WindowCapturePosition` interface to `domain.ts` with `x`, `y`, `width`, `height` fields
- [x] 1.2 Add `WindowCaptureSegment` interface to `domain.ts` with `id`, `startTime`, `endTime`, `visible`, `landscape: WindowCapturePosition`, `reel: WindowCapturePosition`
- [x] 1.3 Add `WindowCapture` interface to `domain.ts` with `id`, `trackIndex` (0|1), `sourceName`, `mediaPath`, `sourceWidth`, `sourceHeight`, `segments: WindowCaptureSegment[]`, `saved`
- [x] 1.4 Add `windowPaths: Array<{ name: string; path: string }> | null` field to `Take` interface
- [x] 1.5 Add `windowCaptures: WindowCapture[]` and `savedWindowCaptures: WindowCapture[]` fields to `ProjectTimeline` interface
- [x] 1.6 Add constants: `MAX_WINDOW_TRACKS = 2`, `WINDOW_TRACK_COLORS = ['#3B82F6', '#22C55E']`, `MIN_WINDOW_SEGMENT_DURATION = 0.1`
- [x] 1.7 Update `normalizeProjectTimeline()` in `project.ts` to initialize missing `windowCaptures`/`savedWindowCaptures` to empty arrays and validate/normalize existing entries
- [x] 1.8 Update `normalizeProject()` / `normalizeTake()` to handle `windowPaths` field with backward-compatible default (null)

## 2. IPC & Main Process

- [x] 2.1 Add IPC handler `system:getWallpaperPath` in `register-handlers.ts` that executes `osascript -e 'tell application "Finder" to get POSIX path of (get desktop picture as alias)'` and returns the path string (or null on failure)
- [x] 2.2 Expose `getWallpaperPath` in `preload.ts` via `electronAPI`
- [x] 2.3 Update `project:stageTakeFiles` IPC handler to iterate over `windowPaths` entries when staging take files to `.deleted/`
- [x] 2.4 Update `project:unstageTakeFiles` IPC handler to restore window capture files from `.deleted/`

## 3. Source Picker UI

- [x] 3.1 Replace `<select id="screenSource">` with a custom dropdown panel element (button + popover div) in the recording view HTML structure
- [x] 3.2 Implement picker population logic: query `desktopCapturer.getSources()` and `navigator.mediaDevices.enumerateDevices()`, render three zones (single-select: None/Entire Screen, multi-select: windows with checkboxes, single-select: capture devices)
- [x] 3.3 Implement mutual exclusion logic: selecting None/Entire Screen clears window checkboxes; checking a window deselects None/Entire Screen; selecting a capture device clears all others
- [x] 3.4 Enforce max 2 window checkbox selections — disable unchecked checkboxes when 2 are checked, re-enable when count drops below 2
- [x] 3.5 Implement picker trigger button text: display "None", "Entire Screen", single window name, "2 Windows", or device name based on current selection
- [x] 3.6 Implement picker open/close toggle (click button to open, click outside or re-click to close)
- [x] 3.7 Wire picker state changes to call `updateWindowStreams()` / `updateScreenStream()` depending on selection type
- [x] 3.8 Disable picker during recording (`recording === true`)
- [x] 3.9 Refresh picker list on `navigator.mediaDevices.ondevicechange` and on picker reopen

## 4. Multi-Window Stream Acquisition

- [x] 4.1 Add `windowStreams: MediaStream[]` and `windowVideos: HTMLVideoElement[]` state variables in `app.ts`
- [x] 4.2 Implement `updateWindowStreams()` function: acquire `getUserMedia()` for each checked window source ID, store streams in `windowStreams`, create/assign hidden `<video>` elements
- [x] 4.3 Handle stream acquisition failure: catch per-stream errors, uncheck failed window in picker, log warning, keep successful streams
- [x] 4.4 Implement `cleanupWindowStreams()`: stop all tracks on all `windowStreams` entries, clear `windowVideos` srcObject, reset arrays
- [x] 4.5 Add `ended` event listener on each window stream video track: on track ended, stop that window's recorder if recording, remove from preview

## 5. Wallpaper Background

- [x] 5.1 Add `wallpaperImage: HTMLImageElement | null` state variable in `app.ts`
- [x] 5.2 Implement `loadWallpaper()`: call `electronAPI.getWallpaperPath()`, load image from returned path, cache in `wallpaperImage`. On failure, set to null (fallback to solid color)
- [x] 5.3 Call `loadWallpaper()` when entering recording view (inside `ensureMediaInitialized()` or alongside it)
- [x] 5.4 Store wallpaper path in take metadata (or project-level) so it's available at render time

## 6. Recording Preview Compositing

- [x] 6.1 Update `drawComposite()` to detect window capture mode (windowStreams.length > 0)
- [x] 6.2 In window capture mode: draw wallpaper (or `#1E1E1E` fallback) as canvas background instead of black
- [x] 6.3 In window capture mode with 2 windows: draw both window video frames side-by-side centered at original aspect ratios
- [x] 6.4 In window capture mode with 1 window: draw single window centered at original aspect ratio
- [x] 6.5 Draw camera PIP on top (existing logic, unchanged)
- [x] 6.6 Preserve existing `drawComposite()` behavior when no window streams (Entire Screen / capture device mode)

## 7. Multi-Window Recording Pipeline

- [x] 7.1 Update `startRecording()`: for each `windowStreams[i]`, create an offscreen canvas sized to the stream's video dimensions, start a 30fps `setInterval` draw loop, create `MediaRecorder` via `createRecorder(canvasCaptureStream, 'win' + i)`
- [x] 7.2 Mix audio into each window recorder via `addAudioToStream()`
- [x] 7.3 Store window canvas intervals in an array `windowRecIntervals[]` for cleanup
- [x] 7.4 Update `stopRecording()`: stop all window recorders, clear all `windowRecIntervals`, collect blobs
- [x] 7.5 Save window recording blobs via IPC with suffix `win0`, `win1` → files named `{takeId}-win0.webm`, `{takeId}-win1.webm`
- [x] 7.6 Populate `Take.windowPaths` with `[{ name: sourceName, path: savedPath }]` for each window recording
- [x] 7.7 Set `Take.screenPath = null` when recording in window capture mode (no entire-screen file)

## 8. Window Capture Overlay Data in Editor

- [x] 8.1 Implement `createWindowCapturesFromTake(take)`: when a take has `windowPaths`, create `WindowCapture` objects with one segment each spanning full duration, default side-by-side positions calculated from source resolution
- [x] 8.2 Calculate initial default positions: for 2 windows, side-by-side centered with 16px gap scaled to fit within 1920x1080; for 1 window, centered fit
- [x] 8.3 Load window captures into `editorState.timeline.windowCaptures` when entering editor with a window-capture take
- [x] 8.4 Implement `getWindowCaptureStateAtTime(windowCapture, time, outputMode)`: return the active segment's position (landscape/reel) at the given time, with easeInOut interpolation between adjacent segments and fade-in/fade-out at segment boundaries
- [x] 8.5 Add `selectedWindowCaptureId` and `selectedWindowSegmentId` to `editorState`

## 9. Window Capture Canvas Rendering in Editor

- [x] 9.1 In `editorDrawLoop()`: when `windowCaptures` exist, draw wallpaper as base layer instead of screen recording
- [x] 9.2 For each window capture, call `getWindowCaptureStateAtTime()` and draw the window video frame at the returned position/size with opacity
- [x] 9.3 Draw window track 0 before track 1 (z-order: wallpaper → win0 → win1 → camera → media overlays)
- [x] 9.4 Load window capture webm files into `<video>` elements for editor playback, sync currentTime with playhead
- [x] 9.5 Implement overflow visualization: clip and draw out-of-bounds portions at alpha 0.3

## 10. Window Capture Canvas Interaction

- [x] 10.1 Implement hit-testing for window capture overlays on canvas mousedown: check in reverse z-order (media overlays → camera PIP → win1 → win0)
- [x] 10.2 On mousedown hit: select the window capture segment, set `selectedWindowCaptureId` and `selectedWindowSegmentId`, deselect any section/media overlay/audio overlay
- [x] 10.3 Implement corner resize handles (40px hit areas) with aspect-ratio-locked resizing, minimum 50x50px
- [x] 10.4 Implement center-area drag for repositioning, update `segment[outputMode].x/y`
- [x] 10.5 Draw selection indicators (handles, border) on selected window capture overlay

## 11. Window Capture Timeline Tracks

- [x] 11.1 Add DOM elements for window capture track rows: `editorWindowTrack0` and `editorWindowTrack1`, thin rows above media overlay tracks
- [x] 11.2 Implement `renderWindowCaptureMarkers()`: create colored bands for each segment, positioned by percentage of timeline duration, with source name labels
- [x] 11.3 Show track rows only when corresponding window capture exists; hide when empty
- [x] 11.4 Implement click-to-select on window capture segments: set `selectedWindowCaptureId`/`selectedWindowSegmentId`, deselect other items, highlight selected band
- [x] 11.5 Implement trim handles on selected segment: left/right edge drag to adjust `startTime`/`endTime`, clamped by adjacent segments and min 0.1s duration
- [x] 11.6 Implement `splitWindowCaptureAtPlayhead()`: split selected segment at playhead, create two segments inheriting original position, select the first segment
- [x] 11.7 Implement `deleteSelectedWindowCaptureSegment()`: remove segment, create gap, support undo
- [x] 11.8 Ensure window track rows scale/scroll in sync with timeline zoom and horizontal scroll

## 12. Undo/Redo Integration

- [x] 12.1 Include `windowCaptures` and `savedWindowCaptures` in `snapshotTimeline()` for undo snapshots
- [x] 12.2 Include `windowCaptures` and `savedWindowCaptures` in `restoreSnapshot()` for undo restore
- [x] 12.3 Push undo snapshots on: window segment drag/resize, split, delete, trim

## 13. Stream Lifecycle Updates

- [x] 13.1 Update `cleanupAllMedia()` to call `cleanupWindowStreams()` — stop all window stream tracks, clear video elements
- [x] 13.2 Update idle timer cleanup (30s after view switch) to include window streams
- [x] 13.3 Update `ensureMediaInitialized()` to re-acquire window streams based on picker state when re-entering recording view

## 14. File Cleanup Updates

- [x] 14.1 Update `stageTakeIfUnreferenced()` to iterate `take.windowPaths` and stage each window file to `.deleted/`
- [x] 14.2 Update unstage logic to restore window capture files from `.deleted/` on undo
- [x] 14.3 Verify `.deleted/` cleanup on project open/switch includes window capture files (should work automatically if staging is correct)

## 15. FFmpeg Render Pipeline

- [x] 15.1 Update `buildInputPlan()` to include window capture webm files as FFmpeg inputs when `windowCaptures` exist
- [x] 15.2 Implement wallpaper base layer input: add wallpaper image as `-loop 1 -t {duration}` input scaled to output resolution, or `color=c=#1E1E1E` fallback
- [x] 15.3 Implement `buildWindowCaptureFilter()`: generate overlay filter expressions for each window capture — per-segment position/scale, enable windows (`between(t, start, end)`), fade-in/out (0.3s), easeInOut position interpolation between adjacent segments
- [x] 15.4 Handle dual-mode (landscape/reel) position selection in filter expressions
- [x] 15.5 Insert window capture filters into the filter chain: wallpaper → win0 filter → win1 filter → (existing camera PIP) → (existing media overlays)
- [x] 15.6 Update `probeVideoFpsWithFfmpeg()` to probe window capture files when no screen file exists
- [x] 15.7 Skip existing screen filter (`buildScreenFilter`) when rendering in window capture mode (no screen source)

## 16. Project Save/Load

- [x] 16.1 Ensure `windowCaptures`/`savedWindowCaptures` are serialized in project JSON save
- [x] 16.2 Ensure `Take.windowPaths` is serialized in project JSON save
- [x] 16.3 Load and normalize `windowCaptures` on project open (backward compat: default to empty arrays)
- [x] 16.4 Load and normalize `Take.windowPaths` on project open (backward compat: default to null)

## 17. Integration Testing

- [ ] 17.1 Verify recording with 2 windows produces two webm files and a valid take with `windowPaths`
- [ ] 17.2 Verify editor loads window captures as overlay objects at correct default positions
- [ ] 17.3 Verify timeline tracks display, select, trim, split, and delete window capture segments
- [ ] 17.4 Verify canvas drag/resize updates segment position per output mode
- [ ] 17.5 Verify FFmpeg render produces correct output with wallpaper + window overlays + camera + media overlays
- [x] 17.6 Verify backward compatibility: existing projects without window captures load and behave identically
- [ ] 17.7 Verify stream cleanup on window close, view switch, and recording stop
- [x] 17.8 Verify undo/redo preserves window capture state correctly
