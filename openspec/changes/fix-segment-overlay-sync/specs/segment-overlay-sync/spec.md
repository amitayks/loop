## ADDED Requirements

### Requirement: Overlay time remapping on section delete
When a section is deleted from the timeline, the system SHALL remap all overlay `startTime`/`endTime` values to account for the removed time range. The remapping follows three phases applied in order:
1. **DELETE**: Overlays fully within `[sectionStart, sectionEnd]` (with 0.01s epsilon) SHALL be removed from the overlays array.
2. **TRIM**: Overlays partially overlapping the deleted section's range SHALL be trimmed at the section boundary. An overlay that starts before `sectionStart` and ends within the section SHALL have its `endTime` set to `sectionStart` (and `sourceEnd` adjusted proportionally for video/window types). An overlay that starts within the section and ends after `sectionEnd` SHALL have its `startTime` set to `sectionEnd` (and `sourceStart` adjusted proportionally for video/window types). After trimming, if the resulting duration is less than 0.1s, the overlay SHALL be deleted instead.
3. **SHIFT**: Overlays with `startTime >= sectionEnd` SHALL have both `startTime` and `endTime` reduced by the removed section's duration (`sectionEnd - sectionStart`).

#### Scenario: Overlay fully within deleted section is removed
- **WHEN** a section spanning 20-40s is deleted and an overlay spans 22-38s
- **THEN** the overlay is removed from the overlays array

#### Scenario: Overlay partially overlapping deleted section is trimmed (left side)
- **WHEN** a section spanning 20-40s is deleted and an overlay spans 15-30s
- **THEN** the overlay's `endTime` is trimmed to 20s and its `sourceEnd` is adjusted proportionally

#### Scenario: Overlay partially overlapping deleted section is trimmed (right side)
- **WHEN** a section spanning 20-40s is deleted and an overlay spans 30-50s
- **THEN** the overlay's `startTime` is set to 40s (pre-shift) and `sourceStart` adjusted proportionally, then in the shift phase, `startTime` becomes 20s and `endTime` becomes 30s

#### Scenario: Overlay after deleted section is time-shifted
- **WHEN** a section spanning 20-40s (duration 20s) is deleted and an overlay spans 45-60s
- **THEN** the overlay's `startTime` becomes 25s and `endTime` becomes 40s (shifted left by 20s)

#### Scenario: Overlay before deleted section is unchanged
- **WHEN** a section spanning 20-40s is deleted and an overlay spans 5-15s
- **THEN** the overlay's `startTime` and `endTime` remain 5s and 15s

#### Scenario: Trimmed overlay too short is deleted
- **WHEN** a section spanning 20-40s is deleted and an overlay spans 19.95-25s (would be trimmed to 0.05s duration)
- **THEN** the overlay is deleted entirely instead of being kept as a 0.05s sliver

#### Scenario: Image overlay trimmed without source adjustment
- **WHEN** a section spanning 20-40s is deleted and an image overlay (`mediaType: 'image'`) spans 15-30s
- **THEN** the overlay's `endTime` is trimmed to 20s but `sourceStart`/`sourceEnd` are NOT adjusted (images have no source timeline)

### Requirement: Audio overlay time remapping on section delete
When a section is deleted, the system SHALL apply the same three-phase remapping (delete, trim, shift) to all audio overlays, following identical rules as visual overlay remapping. Audio overlay `sourceStart`/`sourceEnd` SHALL always be adjusted proportionally when trimmed (audio is always time-based).

#### Scenario: Audio overlay fully within deleted section is removed
- **WHEN** a section spanning 20-40s is deleted and an audio overlay spans 22-38s
- **THEN** the audio overlay is removed from the audioOverlays array

#### Scenario: Audio overlay after deleted section is time-shifted
- **WHEN** a section spanning 20-40s (duration 20s) is deleted and an audio overlay spans 45-55s
- **THEN** the audio overlay's `startTime` becomes 25s and `endTime` becomes 35s

#### Scenario: Audio overlay partially overlapping is trimmed and shifted
- **WHEN** a section spanning 20-40s is deleted and an audio overlay spans 30-50s (sourceStart=10, sourceEnd=30)
- **THEN** the audio overlay is trimmed to start at 40s (sourceStart=20), then shifted to `startTime=20s, endTime=30s, sourceStart=20, sourceEnd=30`

### Requirement: Section delete always cascades to overlays and audio overlays
The `deleteSelectedSection()` function SHALL always perform overlay remapping as part of section deletion. There SHALL NOT be a separate code path for "delete section only" versus "delete section with overlays." Every section deletion includes: (1) overlay remapping, (2) audio overlay remapping, (3) keyframe remapping, (4) `recalculateTimelinePositions()`, (5) `syncSectionAnchorKeyframes()`.

#### Scenario: Delete section cascades to overlays
- **WHEN** a user selects a section and presses Delete (no modifier)
- **THEN** the section is deleted AND all overlays/audio overlays are remapped (delete/trim/shift)

#### Scenario: Delete section via Cmd+Delete cascades identically
- **WHEN** a user presses Cmd+Delete with the playhead on a section
- **THEN** the section at the playhead is selected and deleted with the same cascade behavior as pressing Delete with a section selected

### Requirement: Overlay file cleanup on cascade delete
When overlays are deleted during cascade (phase 1 — fully within deleted section), the system SHALL apply the same cleanup rules as independent overlay delete: saved overlays are moved to `savedOverlays`, unsaved non-window overlays are staged for file deletion if no other overlay references the same `mediaPath`. Window-type overlays (`mediaType: 'window'`) SHALL NOT be staged for file deletion (they are take artifacts managed by take cleanup).

#### Scenario: Unsaved media overlay cascade-deleted with unique path
- **WHEN** a section is deleted and an unsaved image overlay with a unique `mediaPath` falls fully within the section range
- **THEN** the overlay is removed and its media file is staged to `.deleted/`

#### Scenario: Saved overlay cascade-deleted
- **WHEN** a section is deleted and a saved overlay falls fully within the section range
- **THEN** the overlay is moved to `savedOverlays` (not permanently deleted)

#### Scenario: Window overlay cascade-deleted
- **WHEN** a section is deleted and a window overlay falls fully within the section range
- **THEN** the overlay is removed from the overlays array but its media file is NOT staged for deletion

### Requirement: Audio overlay file cleanup on cascade delete
When audio overlays are deleted during cascade, the system SHALL apply the same cleanup rules as independent audio overlay delete: saved audio overlays are moved to `savedAudioOverlays`, unsaved audio overlays are staged for file deletion if no other audio overlay references the same `mediaPath`.

#### Scenario: Unsaved audio overlay cascade-deleted
- **WHEN** a section is deleted and an unsaved audio overlay with a unique `mediaPath` falls fully within the section range
- **THEN** the audio overlay is removed and its media file is staged to `.deleted/`

#### Scenario: Shared audio path not staged
- **WHEN** a section is deleted and an audio overlay is cascade-deleted, but another audio overlay references the same `mediaPath`
- **THEN** the media file is NOT staged for deletion

### Requirement: Independent overlay delete does not remap
When a user selects a specific overlay and presses Delete (without Cmd modifier, and with the overlay — not a section — selected), the system SHALL delete only that overlay. No overlay time remapping, shifting, or trimming occurs. The timeline duration does not change. Other overlays are unaffected.

#### Scenario: Delete selected overlay independently
- **WHEN** a user selects an overlay on track 2 and presses Delete
- **THEN** only that overlay is removed; all other overlays retain their original `startTime`/`endTime`; the timeline duration is unchanged

#### Scenario: Delete selected audio overlay independently
- **WHEN** a user selects an audio overlay and presses Delete
- **THEN** only that audio overlay is removed; no remapping occurs

### Requirement: Independent overlay split does not cascade
When a user selects a specific overlay and presses S (without Cmd modifier), the system SHALL split only that overlay at the playhead. No section split or other overlay split occurs. The timeline structure is unchanged.

#### Scenario: Split selected overlay independently
- **WHEN** a user selects a window overlay on track 0 and presses S with the playhead at 30s
- **THEN** only that overlay is split at 30s into two overlays; no section is split; no other overlays are affected

#### Scenario: Split selected audio overlay independently
- **WHEN** a user selects an audio overlay and presses S with the playhead within its range
- **THEN** only that audio overlay is split; no section or visual overlay is split

### Requirement: Overlay sync on section trim via source-delta
When the user drags a section's trim handle, section trim is a source operation — `sourceStart`/`sourceEnd` change to reveal more or less of the original take. Overlays SHALL be adjusted using the same source delta, with different rules for shortening vs extending:

**SHORTENING** (trimming inward — removing content from the edge):
- The system SHALL cut ANY overlay that extends past the new section boundary, regardless of whether the overlay was aligned with the section edge. This acts like split+delete at the new boundary.
- The overlay's `sourceStart`/`sourceEnd` SHALL be adjusted proportionally to match the trimmed timeline range.
- Non-snapshotted overlays after the trim boundary SHALL be shifted by the duration delta to maintain contiguity.

**EXTENDING** (trimming outward — revealing more source content):
- The system SHALL only extend overlays whose edge was ALIGNED with the section edge (within epsilon). Overlays that were independently positioned away from the section edge SHALL NOT be extended.
- For aligned overlays, the overlay's `sourceStart`/`sourceEnd` SHALL be adjusted by the same source delta as the section, revealing more of the overlay's source media (clamped to 0 for sourceStart).
- Non-snapshotted overlays after the trim boundary SHALL be shifted by the duration delta.

All overlay adjustments SHALL be applied in `finishTrimDrag` AFTER `recalculateTimelinePositions()`, using the section's final contiguous position.

#### Scenario: Shorten right edge cuts any overlay in the way
- **WHEN** a section spans 0-20s with an overlay at 5-20s, and the user shortens the right edge to 15s
- **THEN** the overlay is cut to 5-15s and its `sourceEnd` is adjusted proportionally

#### Scenario: Shorten right edge cuts non-aligned overlay
- **WHEN** a section spans 0-20s with an overlay at 0-18s (not aligned at 20s), and the user shortens to 15s
- **THEN** the overlay is cut to 0-15s (bulldozer — cuts anything past the boundary)

#### Scenario: Extend right edge extends only aligned overlay
- **WHEN** a section spans 0-15s with overlay A at 0-15s (aligned) and overlay B at 0-10s (not aligned), and the user extends the right edge to 20s
- **THEN** overlay A extends to 0-20s (aligned, source extended), overlay B stays at 0-10s (not aligned, unchanged)

#### Scenario: Shorten left edge cuts overlay
- **WHEN** a section spans 0-20s with an overlay at 0-15s, and the user shortens the left edge to 5s
- **THEN** the overlay is cut to 5-15s and its `sourceStart` is adjusted proportionally

#### Scenario: Extend left edge extends aligned overlay with source delta
- **WHEN** a section spans 10-30s with an overlay at 10-30s (aligned, sourceStart=10, sourceEnd=30), and the user extends the left edge by 5s (section becomes 5-30s)
- **THEN** the overlay extends to 5-30s with sourceStart=5 (revealed 5s more of source)

#### Scenario: Extend does not affect non-aligned overlay
- **WHEN** a section spans 10-30s with an overlay at 15-25s (not aligned at either edge), and the user extends the left edge to 5s
- **THEN** the overlay stays at 15-25s (not aligned, unchanged)

#### Scenario: Adjacent overlays shift after trim
- **WHEN** a section spans 0-20s (with overlay A at 0-20s) followed by a section spanning 20-40s (with overlay B at 20-40s), and the user shortens the first section's right edge to 15s
- **THEN** overlay A is trimmed to 0-15s, overlay B is shifted to 15-35s, sections are contiguous at 0-15 and 15-35

### Requirement: Cmd+S splits all at playhead
When the user presses Cmd+S, the system SHALL split the section at the playhead AND all overlays and audio overlays that span the playhead. This is the existing `splitAllAtPlayhead()` behavior and SHALL remain unchanged.

#### Scenario: Cmd+S splits section and all overlays
- **WHEN** the user presses Cmd+S with the playhead at 30s, a section spanning 20-40s, and an overlay spanning 10-50s
- **THEN** the section is split at 30s AND the overlay is split at 30s

### Requirement: deleteAllAtPlayhead consolidated into deleteSelectedSection
The `deleteAllAtPlayhead()` function SHALL be removed. Its behavior is replaced by `Cmd+Delete` selecting the section at the playhead and then calling `deleteSelectedSection()`, which now always cascades. The keyboard handler for `Cmd+Delete` SHALL: (1) find the section at the playhead via `findSectionForTime()`, (2) set it as the selected section, (3) call `deleteSelectedSection()`.

#### Scenario: Cmd+Delete finds section at playhead and cascade-deletes
- **WHEN** no section is selected and the user presses Cmd+Delete with the playhead at 25s (within a section spanning 20-40s)
- **THEN** the section spanning 20-40s is selected and deleted with full cascade (overlays remapped, keyframes remapped)

#### Scenario: Cmd+Delete with section already selected
- **WHEN** a section is already selected and the user presses Cmd+Delete
- **THEN** the selected section is deleted with full cascade (same as pressing Delete)
