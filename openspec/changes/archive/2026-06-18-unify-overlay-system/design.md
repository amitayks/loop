## Context

The editor has two independent overlay systems that evolved separately:

1. **Media overlays** — user-imported images/videos layered on the canvas with full interaction support (drag, resize, split, trim, delete, Size button, timeline selection)
2. **Window captures** — auto-created from recording, with a parallel implementation of the same interactions but missing features (no Size button, no keyboard split, broken timeline visibility, canvas-click-to-select instead of timeline-first)

Both systems share nearly identical patterns: per-mode positioning (landscape/reel), fade transitions (0.3s), aspect-locked resize, timeline band rendering, FFmpeg overlay compositing, and split/trim/delete operations. The window capture system adds ~465 lines of duplicate code in `app.ts` alone.

**Current z-order:** wallpaper → window track 0 → window track 1 → camera PIP → media overlay track 0 → media overlay track 1

**Current data model divergence:**
- `Overlay`: flat object, one per timeline span, `mediaType: 'image' | 'video'`
- `WindowCapture`: container with `segments[]` array, each segment independently positioned

After splitting a media overlay, you get two `Overlay` objects sharing the same `mediaPath` — functionally identical to window capture segments. The segment model is an unnecessary abstraction.

## Goals / Non-Goals

**Goals:**
- Eliminate `WindowCapture` and `WindowCaptureSegment` types entirely
- Make window recordings produce standard `Overlay` objects with `mediaType: 'window'`
- Single code path for all overlay interactions (drag, resize, split, trim, delete, Size button, selection)
- Expand to 4 overlay tracks (0-1 for windows, 2-3 for media)
- Camera PIP always rendered on top of all overlays
- Overlays only respond to canvas drag/resize when selected on timeline first
- Proxy generation for all video-type overlays (not just screen recordings)
- Rounded-corner clipping on all overlay types
- Timeline tracks always visible when overlays exist (no conditional show/hide based on canvas clicks)

**Non-Goals:**
- Data migration from old WindowCapture format (greenfield, clean break)
- Mixing screen recording and window captures in the same project (remains mutually exclusive)
- Changing the audio overlay system (stays separate — no visual position)
- Changing the recording/source-picker flow (window selection UI stays the same)
- Adding more than 4 overlay tracks
- Changing the wallpaper system

## Decisions

### Decision 1: Flat overlay model (no segments)

**Choice:** Each window recording span is a separate `Overlay` object, not a segment within a container.

**Why:** After splitting, media overlays already produce multiple objects sharing the same `mediaPath`. This is functionally identical to segments. The flat model means split/trim/delete/selection code works without any adaptation. One `selectedOverlayId` handles everything.

**Alternative considered:** Keep segment grouping with a `parentId` field on overlays that share the same source window. Rejected — adds complexity with no user-facing benefit. The timeline already groups visually by track.

### Decision 2: Dedicated track ranges by type

**Choice:** Tracks 0-1 are reserved for `mediaType: 'window'`, tracks 2-3 for `mediaType: 'image' | 'video'`. This is enforced at creation time, not rendering time.

**Why:** Window overlays need to render below media overlays in z-order (they're the "content layer"). Track index directly determines z-order in the canvas draw loop and FFmpeg filter chain. Dedicated ranges keep the logic simple and predictable.

**Alternative considered:** Generic tracks with explicit z-order property. Rejected — adds a z-order field to every overlay, complicates the FFmpeg filter chain ordering, and creates ambiguity when users drag overlays between tracks.

### Decision 3: Canvas interaction gated by timeline selection

**Choice:** Overlays only respond to drag/resize on the canvas when `selectedOverlayId` is set (selected on timeline). Clicking directly on an overlay on the canvas does NOT select it.

**Why:** This matches the existing media overlay behavior and prevents the z-order confusion where clicking on the canvas selects the wrong overlay (e.g., a window underneath when a media overlay was already selected on the timeline). It creates a consistent mental model: timeline for selection, canvas for positioning.

**Alternative considered:** Canvas click selects, but only if nothing is already selected. Rejected — still confusing when overlays overlap, and inconsistent with the media overlay model.

### Decision 4: Wallpaper as implicit base detection

**Choice:** The canvas rendering checks `editorState.overlays.some(o => o.mediaType === 'window')` to decide whether to draw wallpaper background or screen recording as the base layer. No explicit "mode" flag.

**Why:** Simplest approach. If window overlays exist, wallpaper is the base. If not, screen recording is the base. These are already mutually exclusive (a take has either `screenPath` or `windowPaths`, never both).

### Decision 5: Unified proxy generation

**Choice:** Extend the existing proxy generation pipeline to handle all video-type overlays (`'video'` and `'window'`). Proxy settings: same as screen proxies (H264, 960x540, CRF 23, fast preset).

**Why:** Window recordings are `.webm` files that benefit from proxy conversion for smooth scrubbing, same as screen recordings. The proxy pipeline already handles queuing and concurrency. Overlay video files imported by users may also benefit.

### Decision 6: Overlay creation from recording

**Choice:** After recording finishes and the take includes `windowPaths`, create `Overlay` objects:
- One per window, `mediaType: 'window'`, assigned to tracks 0-1
- `startTime: 0`, `endTime: duration` (full span)
- `sourceStart: 0`, `sourceEnd: duration`
- Auto-positioned: 1 window = centered on canvas, 2 windows = side-by-side
- `sourceName`, `sourceWidth`, `sourceHeight` populated from take metadata
- Proxy generation queued immediately

**Why:** Same flow as if the user imported the window recording as a video overlay, but automated. The overlay system handles everything from there.

### Decision 7: Camera PIP always on top

**Choice:** Camera PIP renders after ALL overlay tracks in both canvas and FFmpeg output. Z-order: base → track 0 → track 1 → track 2 → track 3 → camera PIP.

**Why:** Camera is the presenter's face — it should never be hidden behind an overlay. This is a change from the current behavior where camera renders between windows and media overlays.

### Decision 8: Rounded corners on all overlays

**Choice:** Apply rounded-corner clipping (macOS-style corner radius) to all overlay types uniformly, scaled proportionally to overlay dimensions.

**Why:** Creates visual consistency. Currently only window captures have rounded corners. Applying to all types creates a polished, uniform look and eliminates a rendering code branch.

## Risks / Trade-offs

**[Risk] Existing projects break** → Greenfield approach. Users must re-record or re-import for projects using window captures. This is acceptable given the project is in active development, not production.

**[Risk] 4 tracks may feel cluttered in timeline** → Mitigated by only showing tracks that have overlays. Empty window tracks (0-1) stay hidden. Visual separator between window and media track groups.

**[Risk] Performance with 4 simultaneous video overlays** → Proxy files help. Max 4 video elements + 1 camera in editor playback. Modern hardware handles this. If needed, can lazy-load video elements only for tracks with active overlays.

**[Risk] FFmpeg complexity with 4 overlay inputs** → The existing overlay filter builder already handles multiple overlay inputs sequentially. Adding more inputs is linear complexity, not exponential. Track-index sorting keeps the chain predictable.

**[Trade-off] Losing segment visibility toggle** → Window capture segments had a `visible` boolean. In the unified model, hiding a segment means deleting or splitting+deleting the overlay span. This is actually more intuitive (delete what you don't want) and matches the media overlay model.

**[Trade-off] No canvas-click selection** → Users must click on the timeline to select overlays before interacting on canvas. This adds one click but prevents z-order confusion and creates consistency across all overlay types.
