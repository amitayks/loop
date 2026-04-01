## Why

The codebase maintains two parallel overlay systems — media overlays and window captures — that duplicate interaction logic (drag, resize, split, trim, delete, selection, timeline rendering, canvas rendering, FFmpeg compositing). Window captures lack features that media overlays already have (Size button, keyboard split, timeline-first selection), and adding them means building every feature twice. Unifying window captures into the existing overlay system eliminates ~465 lines of duplicate code, gives windows all existing overlay interactions for free, and ensures every future feature is built once.

## What Changes

- **BREAKING**: Remove `WindowCapture` and `WindowCaptureSegment` types entirely — no migration, greenfield approach
- **BREAKING**: Remove all window-capture-specific state, selection, drag, resize, split, trim, delete, and timeline rendering code from `app.ts`
- **BREAKING**: Remove `editorWindowTrack0` / `editorWindowTrack1` dedicated DOM elements from `index.html`
- Extend `Overlay.mediaType` to include `'window'` alongside `'image'` and `'video'`
- Add optional fields to `Overlay`: `sourceName`, `sourceWidth`, `sourceHeight` for window metadata
- Expand `MAX_OVERLAY_TRACKS` from 2 to 4 — tracks 0-1 for window overlays (auto-created from recording), tracks 2-3 for media overlays (user imported)
- Update recording flow: `createWindowCapturesFromTake()` replaced by logic that creates standard `Overlay` objects with `mediaType: 'window'`
- Extend proxy generation to ALL video-type overlays (not just window captures)
- Unify canvas rendering: single overlay loop (track 0 → 3), remove the `hasWindowCapturesInEditor` branching
- Apply rounded-corner clipping to all overlays uniformly
- Move camera PIP to always render last (top of z-order, above all overlays)
- Unify FFmpeg render pipeline: single overlay filter builder handles all types, z-order by track index
- Remove `selectedWindowCaptureId` / `selectedWindowSegmentId` from editor state — use existing `selectedOverlayId`
- Fix canvas interaction: overlays only respond to drag/resize when selected via timeline first (remove canvas-click-to-select for all types)
- Size control, "S" split key, Delete key all work uniformly for any selected overlay regardless of type

## Capabilities

### New Capabilities
- `unified-overlay-data`: Unified overlay data model with `mediaType: 'image' | 'video' | 'window'`, 4-track system, and window metadata fields. Replaces both `Overlay` and `WindowCapture` types.
- `unified-overlay-canvas`: Single canvas rendering pipeline for all overlay types — track-ordered drawing, rounded corners, selection-required interaction (drag/resize only when selected on timeline), camera PIP always on top.
- `unified-overlay-timeline`: 4-track timeline with color-coded tracks (blue/green for windows, indigo for media), unified selection/trim/split/delete, always-visible tracks.
- `unified-overlay-render`: Single FFmpeg overlay filter builder for all types — z-order by track, wallpaper base when window overlays present, proxy support for all video overlays.
- `window-overlay-creation`: Converting recorded window captures into standard overlay objects during the recording-to-editor transition, with auto-positioning and proxy generation.

### Modified Capabilities
- `media-overlay-canvas`: Interaction model changes — overlays no longer selectable by clicking on canvas, must be selected on timeline first. Camera PIP moves to top z-order (above overlays instead of between windows and overlays).
- `media-overlay-data`: Track count expands from 2 to 4. `Overlay` type gains `mediaType: 'window'` and optional window metadata fields.
- `media-overlay-timeline`: Timeline expands from 2 to 4 tracks. Track assignment semantics change (0-1 for windows, 2-3 for media).
- `media-overlay-render`: Render pipeline now handles window-type overlays with wallpaper base detection and proxy file usage.
- `media-overlay-playback`: Playback loop iterates 4 tracks instead of 2. Video element pool expands. Proxy file fallback for window overlays.
- `overlay-center-on-click`: Size button now works for all overlay types including windows.
- `take-proxy-files`: Proxy generation extends to all video-type overlays (media videos and windows), not just screen recordings.
- `pip-overlay`: PIP z-order changes to always-on-top (rendered after all overlay tracks).

## Impact

- **Types**: `domain.ts` — remove `WindowCapture`, `WindowCaptureSegment`, `WindowCapturePosition`; extend `Overlay` and `OverlayMediaType`; update `MAX_OVERLAY_TRACKS`
- **Renderer**: `app.ts` — delete ~465 lines of window-capture-specific code; modify overlay rendering to handle 4 tracks, unified selection, canvas interaction gating
- **HTML**: `index.html` — replace 2 window track elements with 4 unified overlay track elements
- **IPC**: `ipc.ts`, `preload.ts`, `register-handlers.ts` — remove window-capture-specific channels if any; extend overlay channels
- **Services**: `render-service.ts` — unify filter builder; `project-service.ts` — remove window capture normalization; `thumbnail-service.ts` — update overlay handling
- **Domain**: `project.ts` — remove window capture helpers; update overlay normalization for new fields
- **Tests**: Update `project-domain.test.ts`, `project-service.test.ts`, `thumbnail-service.test.ts` for new data model
- **Cleanup**: `media-cleanup.ts` — extend reference counting to window-type overlay files
