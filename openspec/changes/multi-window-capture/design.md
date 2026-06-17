## Context

Loop is an Electron + React + TypeScript screen recording app that uses Chromium's `desktopCapturer` API to capture screens/windows and records to webm via `MediaRecorder`. The current architecture supports a single screen source selected from a `<select>` dropdown, with an optional camera PIP and audio stream. Recordings are edited in a timeline editor with keyframe-driven pan/zoom/PIP positioning and rendered to MP4 via FFmpeg filter graphs.

macOS ScreenCaptureKit has a known limitation: capturing the entire screen causes FPS to drop to ~1 FPS for up to 30 seconds when the user switches desktop spaces. Individual window capture does not suffer from this penalty — window streams maintain stable 30 FPS regardless of space switching.

The existing codebase already has a mature overlay system (media overlays and audio overlays) with drag/resize on canvas, timeline tracks with trim/split, position keyframes with easeInOut transitions, and FFmpeg filter graph generation. This change extends those proven patterns to window captures.

### Current Recording Pipeline
1. User selects one screen source from dropdown (`desktopCapturer.getSources()`)
2. `getUserMedia()` acquires one screen stream with `chromeMediaSource: 'desktop'`
3. Screen stream drawn to an offscreen canvas at 30fps via `setInterval`
4. `canvas.captureStream(30)` + `MediaRecorder` → webm file
5. Camera stream recorded to a separate webm file
6. Both stored on `Take` as `screenPath` and `cameraPath`

### Current Editor Pipeline
1. Sections reference takes by `takeId`
2. Keyframes control camera PIP position/visibility, background zoom/pan
3. Media overlays (images/videos) are draggable/resizable objects on canvas with timeline tracks
4. Audio overlays are timeline-positioned audio clips with waveform visualization
5. FFmpeg composites: screen → overlays (sorted by trackIndex, startTime) → camera PIP

## Goals / Non-Goals

**Goals:**
- Bypass macOS entire-screen FPS penalty by capturing individual windows
- Support up to 2 simultaneous window captures recorded as separate streams
- Treat window captures as overlay-like objects in the editor (drag, resize, split, trim)
- Render window captures with wallpaper background via FFmpeg
- Maintain backward compatibility with existing single-screen recording workflow
- Reuse existing overlay interaction patterns (canvas drag/resize, timeline trim/split)

**Non-Goals:**
- Auto-layout algorithms (windows placed at default positions, user adjusts manually)
- Real-time window position tracking from the OS (no native code needed)
- More than 2 simultaneous window captures (can be extended later)
- Dynamic wallpaper support (static wallpaper image loaded once at recording start)
- Window capture on non-macOS platforms (this is a macOS-specific workaround)
- Merging window captures into the existing screen source concept (they are a new, separate track type)

## Decisions

### 1. Window captures as first-class overlay objects, not a screen source variant

**Decision**: Window captures are a new overlay type parallel to media overlays, not a modification of the existing screen source pipeline.

**Rationale**: The existing screen source is the base layer of the canvas with its own zoom/pan/keyframe system. Window captures need independent positioning per-window, which maps naturally to the overlay pattern (per-object x/y/width/height, drag/resize on canvas, timeline tracks). Trying to shoehorn multiple windows into the single-screen-source concept would require reworking the entire keyframe system.

**Alternative considered**: Treating window captures as multiple screen sources. Rejected because it would require parallel keyframe tracks for background zoom/pan per window, conflicting with the existing single-screen keyframe model.

### 2. Hybrid source picker with single-select and multi-select zones

**Decision**: Replace the `<select>` dropdown with a custom dropdown panel that has three zones:
- **Single-select zone**: "None" and "Entire Screen" (radio-button behavior)
- **Multi-select zone**: Individual windows from `desktopCapturer` (checkbox behavior, max 2)
- **Capture device zone**: USB cameras/devices (single-select, radio-button behavior)

Selecting any checkbox auto-deselects "None"/"Entire Screen". Selecting "None" or "Entire Screen" clears all window checkboxes. Capture devices in this dropdown behave as they do today (mutually exclusive with window/screen selection).

**Rationale**: The current `<select>` element cannot mix radio and checkbox behaviors. A custom dropdown is required. Keeping "Entire Screen" as an option preserves backward compatibility for users who don't switch spaces.

**Alternative considered**: Two separate dropdowns (one for mode, one for windows). Rejected as it fragments a conceptually unified choice.

### 3. Separate webm file per window capture

**Decision**: Each selected window produces its own webm file via a dedicated `MediaRecorder`, following the same canvas-capture pattern used for the screen recording (draw video frame to offscreen canvas at 30fps → `captureStream(30)` → `MediaRecorder`).

File naming: `{takeId}-win{index}.webm` (e.g., `take-001-win0.webm`, `take-001-win1.webm`).

**Rationale**: Recording each window independently preserves full resolution per window and allows independent positioning/sizing in the editor. Compositing at recording time would lock in the layout.

**Trade-off**: More files per take (up to 4: win0 + win1 + camera + mouse trail). Disk usage increases but webm compression keeps it manageable.

### 4. WindowCapture data model with segments

**Decision**: Introduce new types:

```typescript
interface WindowCapturePosition {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface WindowCaptureSegment {
  id: string;
  startTime: number;        // timeline time (tied to recording)
  endTime: number;           // timeline time
  visible: boolean;          // can hide segments
  landscape: WindowCapturePosition;
  reel: WindowCapturePosition;
}

interface WindowCapture {
  id: string;
  trackIndex: 0 | 1;        // max 2 window tracks
  sourceName: string;        // display name ("VS Code", "Loop")
  mediaPath: string;         // relative path to webm file
  sourceWidth: number;       // original capture resolution
  sourceHeight: number;
  segments: WindowCaptureSegment[];
  saved: boolean;
}
```

`ProjectTimeline` gains `windowCaptures: WindowCapture[]` and `savedWindowCaptures: WindowCapture[]`.

`Take` gains `windowPaths: Array<{ name: string; path: string }> | null` alongside existing `screenPath`/`cameraPath`.

**Rationale**: Segments are created by split operations. Each segment holds independent position/size per output mode (landscape/reel), following the dual-mode pattern from `Overlay.landscape`/`Overlay.reel`. The segment model avoids a separate keyframe system — position changes are discrete per-segment with easeInOut transitions between adjacent segments.

**Alternative considered**: Using the Keyframe system for window positions. Rejected because keyframes are section-anchored and control global camera state, while window captures need per-object, per-segment positioning independent of section boundaries.

### 5. Timeline tracks as thin colored lines

**Decision**: Two thin track rows rendered above the existing media overlay tracks. Each row corresponds to a `trackIndex` (0 or 1). Window capture segments are rendered as colored bands within their track row, similar to audio overlay bands but thinner.

- Track 0 color: `#3B82F6` (blue)
- Track 1 color: `#22C55E` (green)

Selection model: Clicking a window capture segment selects it (deselects any section, media overlay, or audio overlay). The selected segment's window overlay becomes interactive on the canvas (drag handles, resize corners).

**Rationale**: Follows the established pattern from audio overlay tracks. Thin lines distinguish window tracks from media overlay tracks visually. Color coding makes it immediately clear which track line maps to which canvas overlay.

### 6. Canvas interaction reuses overlay patterns

**Decision**: Window capture overlays on the editor canvas use the same interaction patterns as media overlays:
- Corner-based resize with aspect ratio lock (40px hit areas)
- Center drag for repositioning
- Position stored per output mode (landscape/reel)
- Overflow visualization at alpha 0.3 for out-of-bounds portions
- 0.3s fade-in/out transitions at segment boundaries
- easeInOut position interpolation between adjacent segments

**Rationale**: Users already know these interactions from media overlays. No new concepts to learn. Implementation can share significant code with the existing canvas overlay interaction handlers.

### 7. Wallpaper as canvas background

**Decision**: When window captures are present, the canvas background is the user's macOS desktop wallpaper instead of black. Retrieved via:
```bash
osascript -e 'tell application "Finder" to get POSIX path of (get desktop picture as alias)'
```

The wallpaper image is loaded once when entering recording view (or when window captures are first selected) and cached as an `Image` element. It's drawn as the first layer of both the recording preview canvas and the editor canvas. For FFmpeg rendering, the wallpaper image is used as the base input with `-loop 1`.

**Rationale**: Black background looks broken when windows don't cover the full canvas. The wallpaper creates a realistic "virtual desktop" look.

**Trade-off**: Some users may have dynamic wallpapers (time-shifting). We load the static image once and don't update — acceptable for v1.

**Fallback**: If wallpaper retrieval fails (permissions, non-macOS), fall back to a solid dark gray (`#1E1E1E`) background.

### 8. FFmpeg filter graph ordering

**Decision**: The render filter chain becomes:
```
wallpaper (base, -loop 1)
  → scale to output resolution
  → overlay(win0 segments, per-segment position/scale, enable windows)
  → overlay(win1 segments, per-segment position/scale, enable windows)
  → overlay(camera PIP, existing keyframe logic)
  → overlay(media overlays, existing logic)
  → output
```

Window overlays are composited BEFORE camera PIP and media overlays, so PIP and overlays always appear on top of windows (matching the visual editing hierarchy).

**Rationale**: This matches the visual layering in the editor: wallpaper → windows → camera → media overlays. The existing `buildOverlayFilter()` already handles positioned video overlays with enable windows and fade transitions — window segments use the same filter pattern.

### 9. Recording preview compositing

**Decision**: During live recording, the preview canvas composites:
1. Wallpaper image (full canvas, cached)
2. Window 0 video frame (at original aspect ratio, positioned left-of-center or centered if alone)
3. Window 1 video frame (at original aspect ratio, positioned right-of-center)
4. Camera PIP (existing logic, on top)

Initial layout is side-by-side centered at natural aspect ratios. This same layout becomes the default position when entering the editor. Users can adjust from there using drag/resize.

**Rationale**: No auto-layout algorithms. Side-by-side centered is a sensible default that shows both windows clearly. The editor provides full repositioning control.

### 10. Backward compatibility

**Decision**: When `windowCaptures` is empty/undefined, the entire system behaves exactly as before — single screen source fills the canvas, no wallpaper background, existing keyframe zoom/pan controls work normally.

`normalizeProjectTimeline()` initializes missing `windowCaptures`/`savedWindowCaptures` to empty arrays. Old projects load without modification.

**Rationale**: This is purely additive. No existing functionality is changed or removed.

## Risks / Trade-offs

**[Multiple simultaneous getUserMedia streams may hit Chromium limits]**
→ Mitigation: Cap at 2 window streams. Test empirically with 2 windows + 1 camera + 1 audio (4 simultaneous streams). Chromium generally handles this, but memory/CPU usage increases. May need to reduce canvas capture rate to 24fps if 30fps causes frame drops with 3 video recorders active.

**[Window closed during recording]**
→ Mitigation: When a window stream's video track fires `ended` event, stop recording that stream gracefully. The webm file will be shorter than the other. In the editor, treat the missing tail as a hidden segment. Display a visual indicator (dimmed track section) where capture data is missing.

**[Wallpaper retrieval may fail]**
→ Mitigation: Wrap `osascript` call in try/catch. On failure, use solid `#1E1E1E` background. Cache the result for the session — don't re-query on every recording.

**[Increased file count per take]**
→ Mitigation: Up to 5 files per take (win0, win1, camera, mouse, proxy). File cleanup already handles multiple paths per take. The `windowPaths` array on Take follows the same pattern as `screenPath`/`cameraPath`.

**[Complex FFmpeg filter graphs]**
→ Mitigation: The filter graph chain is deeper (5+ overlays) but each overlay filter is the same pattern. FFmpeg handles long overlay chains efficiently. Test with 2 windows + camera + 2 media overlays to verify render times stay reasonable.

**[Selection exclusivity gets more complex]**
→ Mitigation: Extend the existing mutual-exclusion model: section OR media overlay OR audio overlay OR **window capture segment**. Only one thing selected at a time, same as today but with one more category.

## Open Questions

- Should the "Entire Screen" option remain in the hybrid picker, or should we encourage window-only capture exclusively? (Keeping it for now for backward compat and use cases where space-switching isn't needed.)
- Should window capture segments support per-segment volume control (like audio overlays) for window-sourced audio? (Deferring — audio comes from the mic stream, not from windows.)
