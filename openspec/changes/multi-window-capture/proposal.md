## Why

macOS ScreenCaptureKit imposes a severe FPS penalty when recording the entire screen: swiping to another desktop/space drops the frame rate to ~1 FPS for up to 30 seconds. However, capturing individual windows via `desktopCapturer` maintains a stable 30 FPS regardless of space switching. By capturing up to two windows independently and compositing them on a wallpaper-backed canvas, users get full-screen-quality recordings without the macOS FPS penalty — while gaining new creative control over window layout, sizing, and visibility across the timeline.

## What Changes

- **Multi-source selection UI**: Replace the single `<select>` dropdown for screen sources with a hybrid picker that supports single-select for "None" / "Entire Screen" / capture devices, and multi-select checkboxes (max 2) for individual windows.
- **Multi-window capture pipeline**: Acquire up to 2 simultaneous `getUserMedia()` window streams, each recorded to its own webm file alongside the existing camera and audio streams.
- **Window capture overlays in editor**: Each recorded window stream becomes an overlay-like object on the canvas — draggable, resizable (aspect-ratio-locked), with position/size keyframes and easeInOut transitions, reusing the existing overlay interaction patterns.
- **Window capture timeline tracks**: Two thin, color-coded track lines above the existing timeline tracks. Each line represents a window capture and supports click-to-select, trim (adjust visibility start/end), and split-at-playhead (to create segments with independent canvas positions).
- **Wallpaper background**: When window captures are active, the canvas base layer is the user's macOS desktop wallpaper instead of black, giving a clean, realistic backdrop.
- **Take data model extension**: `Take` gains a `windowFiles` array to store per-window recording metadata (source name, file path) alongside existing `screenPath` and `cameraPath`.
- **FFmpeg render pipeline update**: The render filter graph composites wallpaper → window overlays (with per-segment position/scale keyframes) → camera PIP → media overlays, extending the existing `buildOverlayFilter()` pattern.
- **Recording preview update**: The live preview canvas composites multiple window streams side-by-side (at original aspect ratios, centered) on a wallpaper background during recording.

## Capabilities

### New Capabilities
- `window-capture-source`: Multi-window source selection UI — hybrid single/multi-select picker replacing the screen source dropdown, with checkbox selection for individual windows (max 2) and single-select for "None", "Entire Screen", and capture devices.
- `window-capture-recording`: Multi-window capture pipeline — simultaneous acquisition and recording of up to 2 window streams as separate webm files, with live preview compositing on a wallpaper background.
- `window-capture-overlay`: Window capture overlay editing — recorded window streams as draggable, resizable, aspect-locked overlay objects on the editor canvas, with per-segment position/size state, visibility control, and easeInOut transitions between segments.
- `window-capture-timeline`: Window capture timeline tracks — two thin color-coded track lines with click-to-select, trim handles, and split-at-playhead, each linked to a window capture overlay for canvas selection.
- `window-capture-render`: Window capture FFmpeg rendering — filter graph compositing wallpaper background + window overlays with per-segment position/scale + fade transitions, integrated into the existing render pipeline.

### Modified Capabilities
- `media-stream-lifecycle`: Stream cleanup must handle multiple window capture streams (up to 2 additional `getUserMedia` sessions) alongside existing screen/camera/audio streams.
- `take-file-cleanup`: File staging/cleanup must handle the new `windowFiles` array on Take, staging unreferenced window capture webm files alongside screen/camera files.

## Impact

- **Domain types** (`src/shared/types/domain.ts`): New `WindowCapture` and `WindowSegment` interfaces; `Take` gains `windowFiles` array; `ProjectTimeline` gains `windowCaptures`/`savedWindowCaptures` arrays; new constants for max window tracks, colors.
- **Renderer** (`src/renderer/app.ts`): Source selection UI rewrite (dropdown → hybrid picker), multi-stream acquisition, preview canvas compositing loop, editor draw loop for window overlays, timeline track rendering, canvas drag/resize handlers, split/trim logic.
- **Render service** (`src/main/services/render-service.ts`, `render-filter-service.ts`): Input plan extended for window files, new filter graph stage for wallpaper + window overlays with position keyframes, integrated before existing camera/media overlay stages.
- **IPC handlers** (`src/main/ipc/register-handlers.ts`): Wallpaper path retrieval (macOS `osascript`), extended take save/load for window files.
- **Project normalization** (`src/shared/domain/project.ts`): Normalize/validate `windowCaptures` array, backward-compatible defaults for projects without window captures.
- **Preload bridge** (`src/preload.ts`): New IPC channel for wallpaper retrieval.
