## 1. Data Model — Types and Domain

- [x] 1.1 Extend `OverlayMediaType` to `'image' | 'video' | 'window'` in `src/shared/types/domain.ts`
- [x] 1.2 Add optional window metadata fields to `Overlay` type: `sourceName?: string`, `sourceWidth?: number`, `sourceHeight?: number`, `proxyPath?: string`
- [x] 1.3 Update `MAX_OVERLAY_TRACKS` from 2 to 4 in `src/shared/types/domain.ts`
- [x] 1.4 Remove `WindowCapture`, `WindowCaptureSegment`, `WindowCapturePosition` types from `src/shared/types/domain.ts`
- [x] 1.5 Remove `windowCaptures`, `savedWindowCaptures`, `selectedWindowCaptureId`, `selectedWindowSegmentId` from editor state types (both in `domain.ts` and `app.ts` state interfaces)
- [x] 1.6 Update `normalizeProjectData` in `src/shared/domain/project.ts` to handle `mediaType: 'window'`, validate `trackIndex` 0-3, preserve window metadata fields, and remove any WindowCapture normalization code

## 2. Remove Window Capture Code from Renderer

- [x] 2.1 Remove `renderWindowCaptureMarkers()` function and all calls to it in `src/renderer/app.ts`
- [x] 2.2 Remove `selectWindowCapture()` and `deselectWindowCapture()` functions
- [x] 2.3 Remove `splitWindowCaptureAtPlayhead()` function
- [x] 2.4 Remove `deleteSelectedWindowCaptureSegment()` function
- [x] 2.5 Remove `startWindowCaptureTrimDrag()` and all window capture trim drag state/handlers
- [x] 2.6 Remove `getWindowCaptureStateAtTime()` function
- [x] 2.7 Remove window capture drag/resize state variables (`draggingWindowCapture`, `resizingWindowCapture`, `wcDragStartX`, `wcDragStartY`, `wcDragOrigPos`, `wcResizeCorner`, `wcResizeAspect`, `wcDragMoved`)
- [x] 2.8 Remove window capture canvas hit-testing block from mousedown handler (the `editorState.windowCaptures.length > 0` branch at ~line 6232)
- [x] 2.9 Remove window capture mousemove handling (drag/resize updates for `draggingWindowCapture` and `resizingWindowCapture`)
- [x] 2.10 Remove window capture mouseup handling
- [x] 2.11 Remove `createWindowCapturesFromTake()` function
- [x] 2.12 Remove `getOrCreateWindowCaptureVideo()` and window capture video pool management
- [x] 2.13 Remove `syncWindowCaptureVideos()` function
- [x] 2.14 Remove window-capture-specific canvas rendering branch in `editorDrawLoop()` (the `hasWindowCapturesInEditor` conditional)
- [x] 2.15 Remove all window capture references from editor state initialization (`openEditor` function — `windowCaptures`, `savedWindowCaptures`, `selectedWindowCaptureId`, `selectedWindowSegmentId`)
- [x] 2.16 Remove window capture references from undo/redo snapshot save/restore
- [x] 2.17 Remove `editorWindowTrack0` and `editorWindowTrack1` DOM element references from `app.ts`

## 3. Remove Window Capture Code from HTML and IPC

- [x] 3.1 Remove `editorWindowTrack0` and `editorWindowTrack1` elements from `src/index.html`
- [x] 3.2 Add 4 unified overlay track elements to `src/index.html` (tracks 0-3 with appropriate height and background colors)
- [x] 3.3 Remove any window-capture-specific IPC channels from `src/shared/types/ipc.ts`, `src/preload.ts`, and `src/main/ipc/register-handlers.ts`
- [x] 3.4 Remove window capture handling from `src/main/services/project-service.ts` (normalization, save/load of windowCaptures)
- [x] 3.5 Remove window capture handling from `src/main/services/render-service.ts` (separate window capture input plan and filter generation)
- [x] 3.6 Remove window capture handling from `src/main/services/thumbnail-service.ts` if present
- [x] 3.7 Update `src/renderer/features/media-cleanup.ts` to remove window capture references

## 4. Expand Overlay System to 4 Tracks

- [x] 4.1 Update `renderOverlayMarkers()` in `app.ts` to iterate tracks 0-3 with color coding: tracks 0-1 use blue/green (window colors), tracks 2-3 use indigo (media colors)
- [x] 4.2 Update the overlay track DOM elements to reference the new 4 track elements from `index.html`
- [x] 4.3 Update `getOverlayStateAtTime()` or the draw loop to iterate 4 tracks instead of 2
- [x] 4.4 Update overlay video element pool to support 4 tracks (one reusable `<video>` per track)
- [x] 4.5 Update overlay timeline band labels: show `sourceName` for `mediaType: 'window'`, show filename with icon for image/video
- [x] 4.6 Update track visibility logic: show track row only when at least one overlay exists on that track, determined at render time

## 5. Canvas Rendering Unification

- [x] 5.1 Update `editorDrawLoop()` to use single overlay rendering path: iterate tracks 0-3 calling `getOverlayStateAtTime()`, remove the `hasWindowCapturesInEditor` branch
- [x] 5.2 Add wallpaper base detection: if any overlay has `mediaType: 'window'`, draw wallpaper/`#1E1E1E` fallback as base; otherwise draw screen recording
- [x] 5.3 Move camera PIP rendering to AFTER all overlay tracks (currently between windows and media — change to after track 3)
- [x] 5.4 Add rounded-corner clipping to all overlay rendering (apply macOS-style proportional corner radius to all types)
- [x] 5.5 Update overflow visualization (alpha 0.3 out-of-bounds drawing) to work for all overlay types across 4 tracks

## 6. Canvas Interaction — Selection-First Model

- [x] 6.1 Remove canvas-click-to-select logic for overlays in the mousedown handler. Overlays SHALL only be interactive when `selectedOverlayId` is set via timeline click
- [x] 6.2 Update overlay drag logic to only activate when `selectedOverlayId` is set and mouse is within the selected overlay's bounds
- [x] 6.3 Update overlay resize logic to only activate when `selectedOverlayId` is set and mouse is within a corner hit zone of the selected overlay
- [x] 6.4 Ensure clicking on canvas background deselects the overlay (set `selectedOverlayId = null`)

## 7. Keyboard and Button Handlers

- [x] 7.1 Update "S" key handler to check `selectedOverlayId` (which now covers windows too) before falling through to audio/section split. Remove the separate `selectedWindowCaptureId` check
- [x] 7.2 Update Delete/Backspace handler: remove `selectedWindowCaptureId` check, rely on `selectedOverlayId` for all overlay types
- [x] 7.3 Update split button click handler: remove `selectedWindowCaptureId` check
- [x] 7.4 Update `splitOverlayAtPlayhead()` to handle `mediaType: 'window'` — preserve `sourceName`, `sourceWidth`, `sourceHeight` on both halves, adjust `sourceStart`/`sourceEnd`
- [x] 7.5 Update `deleteSelectedOverlay()` to handle `mediaType: 'window'` — skip file staging for window overlays (files managed by take cleanup)
- [x] 7.6 Update Size control (`updateOverlaySizeControl()`) to show for any selected overlay including `mediaType: 'window'`
- [x] 7.7 Update `centerSelectedOverlay()` to work for window overlays (same centering formula)

## 8. Recording → Editor Transition

- [x] 8.1 Create new function to convert `take.windowPaths` into `Overlay` objects with `mediaType: 'window'`, replacing `createWindowCapturesFromTake()`
- [x] 8.2 Implement auto-positioning: single window centered on canvas, two windows side-by-side, with reel mode vertical stacking
- [x] 8.3 Set overlay time fields: `startTime: 0`, `endTime: duration`, `sourceStart: 0`, `sourceEnd: duration`
- [x] 8.4 Populate `sourceName`, `sourceWidth`, `sourceHeight` from take's `windowPaths` metadata
- [x] 8.5 Assign window overlays to tracks 0-1 (first window → track 0, second → track 1)
- [x] 8.6 Queue proxy generation for each window overlay's media file after creation

## 9. Render Service Unification

- [x] 9.1 Update FFmpeg input plan to handle all overlay types in a single pipeline (remove separate window capture input handling)
- [x] 9.2 Update the overlay filter builder to process overlays sorted by `[trackIndex, startTime]` across 4 tracks
- [x] 9.3 Add wallpaper base input when window-type overlays are present in the render input
- [x] 9.4 Move camera PIP filter to after all overlay track filters in the FFmpeg chain
- [x] 9.5 Add rounded-corner clipping filter for all overlay types in FFmpeg output
- [x] 9.6 Use proxy path for window overlay render inputs when available
- [x] 9.7 Update `RenderInput` types to remove window-capture-specific fields and use unified overlay array

## 10. Proxy Generation Extension

- [x] 10.1 Extend proxy generation to queue jobs for `mediaType: 'window'` overlay files after recording
- [x] 10.2 Extend proxy generation on project open to detect window overlay files missing proxies
- [x] 10.3 Store `proxyPath` on overlay objects when proxy generation completes
- [x] 10.4 Update editor video element loading to use `proxyPath` for all video-type overlays (`'video'` and `'window'`)

## 11. Cleanup and Project Persistence

- [x] 11.1 Update project save to persist window overlay fields (`mediaType`, `sourceName`, `sourceWidth`, `sourceHeight`, `proxyPath`)
- [x] 11.2 Update project load to restore window overlay fields
- [x] 11.3 Update `media-cleanup.ts` reference counting to skip file staging for `mediaType: 'window'` overlays (take cleanup handles these files)
- [x] 11.4 Ensure project switch clears all overlay track rows and re-renders from new project state
- [x] 11.5 Remove `windowCaptures` and `savedWindowCaptures` from project save/load paths

## 12. Tests

- [x] 12.1 Update `tests/unit/project-domain.test.ts`: remove WindowCapture tests, add window overlay normalization tests
- [x] 12.2 Update `tests/integration/project-service.test.ts`: remove WindowCapture persistence tests, add window overlay persistence tests
- [x] 12.3 Update `tests/unit/thumbnail-service.test.ts`: update for unified overlay model if window captures were referenced
- [x] 12.4 Add test: split window overlay preserves `mediaType`, `sourceName`, `sourceWidth`, `sourceHeight`, and adjusts `sourceStart`/`sourceEnd`
- [x] 12.5 Add test: delete window overlay does NOT stage media file for cleanup
- [x] 12.6 Add test: overlay normalization validates `trackIndex` 0-3 and preserves window metadata
