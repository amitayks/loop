## 1. Overlay Remapping Functions

- [x] 1.1 Implement `remapOverlaysAfterSectionDelete(overlays, removedSection)` in `src/renderer/app.ts` — three-phase logic (delete fully-contained, trim partial overlaps with sourceStart/sourceEnd adjustment for video/window types, shift post-gap times). Handle image overlays without source adjustment. Apply 0.1s minimum duration check on trimmed overlays. Return `{ kept: Overlay[], removed: Overlay[] }` so the caller can handle file cleanup on removed items.
- [x] 1.2 Implement `remapAudioOverlaysAfterSectionDelete(audioOverlays, removedSection)` in `src/renderer/app.ts` — same three-phase logic as 1.1 but always adjusts sourceStart/sourceEnd (audio is always time-based). Return `{ kept: AudioOverlay[], removed: AudioOverlay[] }`.

## 2. Cascade Section Delete

- [x] 2.1 Update `deleteSelectedSection()` in `src/renderer/app.ts` to call `remapOverlaysAfterSectionDelete()` and `remapAudioOverlaysAfterSectionDelete()` after removing the section from the sections array. Apply file cleanup rules to removed overlays: saved overlays → savedOverlays, unsaved non-window overlays → stage media file if unreferenced, window overlays → no staging. Apply same cleanup for removed audio overlays: saved → savedAudioOverlays, unsaved → stage if unreferenced.
- [x] 2.2 Remove `deleteAllAtPlayhead()` function from `src/renderer/app.ts`. Its overlay deletion + section deletion logic is now handled entirely by the cascade in `deleteSelectedSection()`.
- [x] 2.3 Update keyboard handler for Delete/Backspace in `src/renderer/app.ts` (~line 7290-7300): When `Cmd+Delete` is pressed, find the section at playhead via `findSectionForTime()`, set `editorState.selectedSectionId` to that section's id, then call `deleteSelectedSection()`. When Delete is pressed without Cmd: if overlay selected → `deleteSelectedOverlay()`, else if audio overlay selected → `deleteSelectedAudioOverlay()`, else → `deleteSelectedSection()` (with cascade).
- [x] 2.4 Add `renderOverlayMarkers()`, `renderAudioOverlayMarkers()`, and `renderOverlayList()` calls to `deleteSelectedSection()` after the cascade completes (these UI refreshes were previously only in `deleteAllAtPlayhead()` and need to be in the consolidated function).

## 3. Fix Audio Rendering for Wallpaper-Based Sections

- [x] 3.1 In `src/main/services/render-service.ts` (`buildInputPlan` or render loop ~line 443-476), when `screenIdx < 0` and `wallpaperIdx >= 0`: look up the section's `takeId` to find the take's screen or camera recording file path. Add that file as an FFmpeg input (audio-only) and extract audio with `atrim=start={sourceStart}:end={sourceEnd},asetpts=PTS-STARTPTS`. Only fall back to `anullsrc` if no audio source file exists for the take.
- [x] 3.2 Eliminate the invalid `else` fallback at ~line 470-475 that references `[-1:v]` and `[-1:a]`. Replace with: generate a color/blank video source + `anullsrc` audio, or skip if this branch should never be reached (add a guard with error logging).

## 4. Overlay Sync on Section Trim (source-delta approach)

- [x] 4.1 Add `OverlayTrimSnapshot` interface and extend `TrimDragState` with `overlaySnapshots` and `audioOverlaySnapshots` fields.
- [x] 4.2 Update `startTrimDrag()` to snapshot ALL overlays overlapping the section (not just edge-aligned) — needed for shortening.
- [x] 4.3 Remove overlay sync from `updateTrimDrag()` — overlays are only adjusted in `finishTrimDrag` after `recalculateTimelinePositions()`.
- [x] 4.4 Rewrite `finishTrimDrag()` with source-delta logic: SHORTEN cuts any overlay past the new boundary (bulldozer), EXTEND only extends edge-aligned overlays by source delta. Shift non-snapshotted overlays by durationDelta. Render overlay markers after.

## 5. Verification

- [ ] 5.1 Test split+delete flow: record with window captures, Cmd+S to split at playhead, then Delete the middle section. Verify: overlays shrink with timeline, no ghost overlay past timeline end, no blank gap in the middle.
- [ ] 5.2 Test independent overlay operations: select a single overlay, press S to split only it (section untouched), press Delete to remove only it (section untouched, no timeline remapping).
- [ ] 5.3 Test audio rendering: export a project with window-only captures (wallpaper base). Verify the output video has audio from the take's recording, not silence.
- [ ] 5.4 Test partial overlap trimming: manually drag an overlay to span multiple sections, delete one section in the middle. Verify the overlay is trimmed at the section boundary and the remaining part is shifted correctly.
- [ ] 5.5 Test undo/redo
- [ ] 5.6 Test section trim shorten: trim section edge inward, verify overlays in the way get cut (bulldozer).
- [ ] 5.7 Test section trim extend aligned: trim section edge outward, verify only edge-aligned overlays extend (with source delta). Non-aligned overlays stay put.
- [ ] 5.8 Test section trim extend then re-shorten: extend section, then shorten again. Verify overlays that became aligned after shorten now extend on re-extend.
