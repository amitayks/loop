## Context

The Loop video editor has a timeline composed of sections (segments) that reference source media (takes). Overlays (window captures, images, videos) and audio overlays sit on separate tracks above the timeline, using absolute `startTime`/`endTime` values. Keyframes (camera PiP position, zoom, crop) are either anchored to a section via `sectionId` or placed manually on the timeline.

When a section is deleted, `recalculateTimelinePositions()` collapses the gap — sections are repositioned contiguously. Keyframes already have remapping logic (`remapManualKeyframesAfterSectionDelete`) that shifts times and removes orphans. However, overlays and audio overlays have **no remapping logic** — their times remain at original absolute positions after section mutations.

This worked before the unified overlay system because overlays were small user-placed media clips. Now that window captures span the full timeline as overlays, the gap between "sections collapse" and "overlays don't" creates visible bugs: ghost video in gaps, overlays extending past timeline end.

Additionally, the multi-window capture feature (commit 052f70b) introduced wallpaper-based sections that generate silent audio (`anullsrc`) instead of extracting audio from the take's actual recording.

### Current Delete Flow (broken)

```
deleteAllAtPlayhead():
  1. Find section at playhead
  2. Delete overlays FULLY within section range  ← only exact matches
  3. Delete audio overlays FULLY within range     ← only exact matches
  4. Delete section                               ← NO overlay time remapping
  5. Remap keyframes                              ← keyframes OK
  6. recalculateTimelinePositions()               ← sections collapse, overlays don't
```

### Current Keyboard Model

```
Cmd+S         → splitAllAtPlayhead() (split section + all overlays + audio)
S + overlay   → splitOverlayAtPlayhead() (only that overlay)
S + audio     → splitAudioOverlayAtPlayhead() (only that audio overlay)
S + nothing   → splitSectionAtPlayhead() (only section)

Cmd+Delete    → deleteAllAtPlayhead() (section + overlays in range, NO remap)
Delete+overlay→ deleteSelectedOverlay() (only that overlay)
Delete+audio  → deleteSelectedAudioOverlay() (only that audio)
Delete+nothing→ deleteSelectedSection() (only section, NO overlay cascade)
```

## Goals / Non-Goals

**Goals:**
- Overlay and audio overlay times are remapped when sections are deleted (mirroring keyframe remapping)
- Section delete always cascades: delete/trim overlays in the removed range, shift remaining overlays
- `splitAllAtPlayhead` remains the Cmd+S behavior (split everything together)
- Independent overlay split/delete preserved when an overlay is explicitly selected
- Audio rendering fixed for wallpaper-based sections (use take audio, not silence)
- Invalid `[-1:a]` FFmpeg fallback eliminated

**Non-Goals:**
- Changing the `Section`, `Overlay`, or `AudioOverlay` data model (no new fields)
- Adding `sectionId` binding to overlays (we use time-range-based remapping instead)
- Changing how overlays are rendered on canvas or how transitions work
- Changing the `splitAllAtPlayhead` behavior (it already works correctly)
- Changing overlay trim handle behavior

## Decisions

### Decision 1: Time-based remapping over sectionId binding

**Choice**: Remap overlay times using the deleted section's time range (same approach as `remapManualKeyframesAfterSectionDelete`), rather than adding a `sectionId` field to overlays.

**Alternatives considered**:
- **sectionId binding**: Each overlay gets a `sectionId` linking it to a section. Deletion removes all overlays with that sectionId. Rejected because: (a) overlays can span multiple sections, (b) user-dragged overlays may not align with section boundaries, (c) requires data model changes and migration.
- **Relative time model**: Store overlay times as offsets relative to their parent section. Rejected because: massive data model change, breaks all existing projects, complicates rendering.

**Rationale**: Time-based remapping is proven (keyframes use it), requires no data model changes, handles partial overlaps naturally, and works for both section-aligned and user-positioned overlays.

### Decision 2: Cascade section delete always (no separate "delete all" command)

**Choice**: `deleteSelectedSection()` always cascades to overlays. `deleteAllAtPlayhead()` is removed as a separate concept — `Cmd+Delete` simply finds the section at playhead and calls the same cascade delete.

**Alternatives considered**:
- **Keep separate commands**: `Delete` = section only, `Cmd+Delete` = section + overlays. Rejected because: deleting a section without adjusting overlays always produces broken state (orphaned overlay times).

**Rationale**: Every section delete MUST adjust overlay times to maintain timeline integrity. There is no valid use case for deleting a section without remapping overlays.

### Decision 3: Three-phase overlay remapping (delete, trim, shift)

**Choice**: On section delete, process overlays in three phases:

```
Phase 1 — DELETE:  Overlays fully within [sectionStart, sectionEnd] → remove
Phase 2 — TRIM:    Overlays partially overlapping → trim at boundary
Phase 3 — SHIFT:   Overlays after sectionEnd → subtract removedDuration from times
```

**Alternatives considered**:
- **Delete only** (no trim/shift): Simple but leaves orphaned times. Rejected.
- **Delete + shift only** (no trim): Simpler but partially-overlapping overlays would jump to wrong positions. Rejected.

**Rationale**: The three-phase approach handles all cases: exact matches, partial overlaps, and post-gap overlays. It mirrors how a non-linear editor (NLE) like Premiere or DaVinci resolves ripple deletes.

### Decision 4: Fix audio by finding take audio source for wallpaper sections

**Choice**: When `screenIdx < 0` (no screen recording for this section), look up the section's `takeId` to find any available audio source file (screen recording or camera recording from the take). Use that file's audio stream. Only generate `anullsrc` when no audio file exists at all.

**Alternatives considered**:
- **Always include screen recording as input even for window-only takes**: Would add unused video input. Heavier but guaranteed audio. Rejected as wasteful.
- **Use camera audio**: Camera might not exist. Not reliable alone.

**Rationale**: The take always has at least one recording (screen or camera). Finding the audio source from the take's files is lightweight and correct.

### Decision 5: Unified delete function replaces two functions

**Choice**: Merge `deleteAllAtPlayhead()` logic into `deleteSelectedSection()`. The keyboard handler for `Cmd+Delete` calls `deleteSelectedSection()` after selecting the section at playhead. Remove `deleteAllAtPlayhead()` as a separate function.

**New keyboard handler**:
```
Delete/Backspace:
  if (overlay selected)     → deleteSelectedOverlay()      // independent
  else if (audio selected)  → deleteSelectedAudioOverlay()  // independent
  else if (Cmd held)        → select section at playhead, then deleteSelectedSection()
  else                      → deleteSelectedSection()       // cascade
```

**New split handler** (unchanged from current, keeping for reference):
```
S key:
  if (Cmd held)             → splitAllAtPlayhead()          // split everything
  else if (overlay selected)→ splitOverlayAtPlayhead()      // independent
  else if (audio selected)  → splitAudioOverlayAtPlayhead() // independent
  else                      → splitSectionAtPlayhead()      // section only
```

Note: `S` without anything selected splits ONLY the section (no cascade to overlays). `Cmd+S` splits everything. This is intentional — splitting a section alone is a valid operation (the user may want to change keyframe state at a point without splitting overlays). But deleting a section alone is NOT valid because it always creates timeline gaps in overlay timing.

## Risks / Trade-offs

**[Risk] Partially-overlapping overlay trimming could produce very short overlay segments**
→ Mitigation: Apply minimum duration check (0.1s) after trim. If a trimmed overlay would be < 0.1s, delete it entirely instead of keeping a sliver.

**[Risk] Undo/redo must capture overlay state before cascade**
→ Mitigation: `pushUndo()` is already called before any mutation in `deleteSelectedSection()`. The undo snapshot includes `editorState.overlays` and `editorState.audioOverlays`, so the full pre-delete state is captured. No additional work needed.

**[Risk] User may want to keep an overlay when deleting a section**
→ Trade-off: Accepted. The mental model is "sections drive the timeline." Users can always undo, or re-add the overlay after deletion. The predictability of "delete section = delete everything in that range" outweighs the occasional inconvenience.

**[Risk] Audio source file might not exist on disk (deleted/moved)**
→ Mitigation: Fall back to `anullsrc` if the audio file path does not resolve. Log a warning for debugging.

**[Risk] `splitSectionAtPlayhead()` (S without Cmd) doesn't cascade to overlays**
→ Trade-off: Intentional. Section-only split is valid (changes keyframe boundaries without affecting overlay timing). But this means overlays won't be aligned to section boundaries after a section-only split. If the user later deletes one of those sections, the overlay gets trimmed at the section boundary. This is correct behavior.
