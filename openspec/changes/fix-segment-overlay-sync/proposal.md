## Why

Timeline segment operations (split/delete) do not properly synchronize overlay and audio overlay times. When a section is deleted, `recalculateTimelinePositions()` collapses the gap for sections, but overlay `startTime`/`endTime` values remain at their original absolute positions — leaving ghost overlays past the timeline end and visual gaps where deleted content still renders. Additionally, the multi-window capture feature introduced silent audio (`anullsrc`) for wallpaper-based sections instead of using the actual take's audio stream, breaking audio in rendered output.

## What Changes

- **Section delete cascades to overlays**: When a section is deleted, overlays and audio overlays fully within the section's time range are deleted, partially overlapping overlays are trimmed at the section boundary, and all remaining overlays after the gap are time-shifted by the removed duration — mirroring the existing `remapManualKeyframesAfterSectionDelete()` pattern.
- **Section delete replaces deleteAllAtPlayhead as the primary path**: Plain `Delete` (with section selected) now performs the full cascade (section + overlays + keyframes). `Cmd+Delete` becomes an alias for the same behavior (delete section at playhead). The separate `deleteAllAtPlayhead()` function is consolidated into `deleteSelectedSection()`.
- **Independent overlay operations preserved**: `Delete` with an overlay selected (no Cmd) still deletes only that overlay. `S` with an overlay selected still splits only that overlay. This gives users surgical control when needed.
- **Keyboard model simplified**:
  - `Cmd+S` → split ALL at playhead (sections + overlays + audio overlays)
  - `S` (overlay selected) → split only selected overlay
  - `S` (nothing selected) → split section at playhead + cascade to overlays
  - `Delete` (section selected) → delete section + cascade delete/trim/shift overlays
  - `Delete` (overlay selected) → delete only selected overlay
  - `Cmd+Delete` → delete section at playhead + cascade (same as section delete)
- **Fix audio rendering for wallpaper-based sections**: When `screenIdx < 0` (window-only captures using wallpaper base), extract audio from the take's screen or camera recording file instead of generating silent `anullsrc`. Only generate silence when no audio source exists at all.
- **Fix invalid FFmpeg index fallback**: The `else` branch at render-service.ts:470-475 references `[-1:v]` and `[-1:a]` when screenIdx < 0 — replace with proper wallpaper video + take audio extraction.

## Capabilities

### New Capabilities
- `segment-overlay-sync`: Defines the cascade behavior when timeline sections are split or deleted — how overlays, audio overlays, and keyframes are remapped to maintain timeline integrity. Covers the `remapOverlaysAfterSectionDelete()` and `remapAudioOverlaysAfterSectionDelete()` functions, overlay trimming at section boundaries, and the unified keyboard model for split/delete operations.

### Modified Capabilities
- `unified-overlay-timeline`: Split/delete keyboard bindings change — section delete now cascades to overlays; `Cmd+Delete` becomes alias for section delete at playhead rather than a separate "delete all" operation.
- `audio-overlay-timeline`: Audio overlay delete/shift now happens automatically on section delete, not only via explicit `Cmd+Delete`.
- `audio-overlay-render`: Fix silent audio generation for wallpaper-based sections — use take audio source instead of `anullsrc`. Fix invalid `[-1:a]` FFmpeg index in fallback branch.

## Impact

- **`src/renderer/app.ts`**: `deleteSelectedSection()` gains overlay cascade logic. `deleteAllAtPlayhead()` consolidated into it. New `remapOverlaysAfterSectionDelete()` and `remapAudioOverlaysAfterSectionDelete()` functions added. Keyboard handler simplified.
- **`src/main/services/render-service.ts`**: Fix audio filter generation in the `wallpaperIdx >= 0` branch (lines 461-469) and the invalid `else` fallback (lines 470-475). Requires access to take audio file path when screen recording is absent.
- **`src/main/services/render-filter-service.ts`**: May need adjustment if audio label plumbing changes.
- **No API/IPC changes**: All changes are internal to renderer state management and main-process render pipeline.
- **No data model changes**: `Section`, `Overlay`, `AudioOverlay` interfaces remain unchanged. Behavior changes only.
