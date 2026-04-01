## ADDED Requirements

### Requirement: Window capture track rows on timeline
The timeline SHALL display up to two thin track rows for window captures, positioned above the existing media overlay tracks. Each row corresponds to a `trackIndex` (0 or 1). Rows SHALL only be visible when the corresponding `WindowCapture` exists in the timeline.

#### Scenario: Two window captures present
- **WHEN** the timeline has window captures on track 0 and track 1
- **THEN** two thin track rows are rendered above the media overlay tracks
- **AND** track 0 row uses color `#3B82F6` (blue)
- **AND** track 1 row uses color `#22C55E` (green)

#### Scenario: One window capture present
- **WHEN** the timeline has only one window capture (track 0)
- **THEN** one thin track row is rendered (blue, track 0)
- **AND** no empty track 1 row is shown

#### Scenario: No window captures
- **WHEN** the timeline has no window captures (legacy project or Entire Screen recording)
- **THEN** no window capture track rows are rendered
- **AND** the timeline layout is unchanged from existing behavior

### Requirement: Window capture segments rendered as colored bands
Each `WindowCaptureSegment` SHALL be rendered as a colored band within its track row, positioned by `startTime`/`endTime` as a percentage of total timeline duration. Gaps between segments (where `visible: false` or no segment) SHALL appear as empty track space.

#### Scenario: One continuous segment
- **WHEN** window track 0 has one segment from t=0 to t=30s (full duration)
- **THEN** a single blue band spans the full width of track 0's row

#### Scenario: Two segments with a gap
- **WHEN** window track 0 has segment A (t=0 to t=10) and segment B (t=15 to t=30)
- **THEN** two blue bands are rendered with a gap between t=10 and t=15
- **AND** the gap appears as empty track space

#### Scenario: Segment displays source name
- **WHEN** a window capture segment is rendered on the timeline
- **THEN** the band displays the window source name (e.g., "VS Code") truncated to fit

### Requirement: Window capture segment selection
Clicking a window capture segment on the timeline SHALL select it, deselecting any currently selected section, media overlay, or audio overlay. The selected segment SHALL display a visual highlight (brighter color, border).

#### Scenario: Select window capture segment
- **WHEN** the user clicks a window track 0 segment on the timeline
- **THEN** that segment becomes selected
- **AND** any previously selected section, media overlay, or audio overlay is deselected
- **AND** the segment band shows a highlight border
- **AND** the corresponding window overlay on the canvas shows drag/resize handles

#### Scenario: Select section after window capture
- **WHEN** a window capture segment is selected
- **AND** the user clicks a section on the timeline
- **THEN** the window capture segment is deselected
- **AND** the section becomes selected
- **AND** the window overlay's drag/resize handles are hidden

### Requirement: Window capture segment trim handles
A selected window capture segment SHALL display trim handles on its left and right edges. Dragging a trim handle SHALL adjust the segment's `startTime` or `endTime`, controlling when the window is visible on the timeline. Trimming SHALL NOT go beyond adjacent segments on the same track or before t=0 / after timeline duration.

#### Scenario: Trim segment end earlier
- **WHEN** the user drags the right trim handle of a selected segment to the left
- **THEN** the segment's `endTime` decreases
- **AND** the window capture is hidden after the new `endTime`
- **AND** the segment band width decreases visually

#### Scenario: Trim segment start later
- **WHEN** the user drags the left trim handle of a selected segment to the right
- **THEN** the segment's `startTime` increases
- **AND** the window capture is hidden before the new `startTime`

#### Scenario: Trim constrained by adjacent segment
- **WHEN** the user drags a trim handle toward an adjacent segment on the same track
- **THEN** the trim is clamped to not overlap the adjacent segment's time range

#### Scenario: Minimum segment duration
- **WHEN** the user trims a segment to less than 0.1 seconds
- **THEN** the trim is clamped to maintain a minimum 0.1 second duration

### Requirement: Split window capture segment at playhead
When a window capture segment is selected and the playhead is within that segment's time range, the user SHALL be able to split the segment at the playhead position. This creates two segments from the original, each inheriting the original's canvas position. The two segments can then be independently repositioned.

#### Scenario: Split segment in the middle
- **WHEN** window track 0 has a segment from t=0 to t=20
- **AND** the playhead is at t=10
- **AND** the user triggers split (keyboard shortcut or button)
- **THEN** the original segment is replaced with segment A (t=0 to t=10) and segment B (t=10 to t=20)
- **AND** both segments inherit the original's canvas position (landscape and reel)
- **AND** segment A becomes selected

#### Scenario: Split when playhead outside segment
- **WHEN** the playhead is not within any segment of the selected window capture track
- **THEN** the split operation has no effect

#### Scenario: Split creates independently positionable segments
- **WHEN** a split creates two segments
- **AND** the user selects segment B and drags it to a new canvas position
- **THEN** segment A retains its original position
- **AND** segment B has the new position
- **AND** the transition between A and B at the split point animates with easeInOut (0.3s)

### Requirement: Delete window capture segment
A selected window capture segment SHALL be deletable via keyboard shortcut (Delete/Backspace) or a context action. Deleting a segment removes it from the timeline, creating a gap where the window is not visible.

#### Scenario: Delete middle segment
- **WHEN** window track 0 has segments A, B, C
- **AND** the user selects segment B and presses Delete
- **THEN** segment B is removed
- **AND** a gap appears between segment A and segment C
- **AND** the window is not visible during the gap's time range

#### Scenario: Delete only segment
- **WHEN** window track 0 has only one segment and the user deletes it
- **THEN** the window capture track becomes empty
- **AND** the window is not visible at any point on the timeline
- **AND** the window capture data and file remain (not cleaned up until take cleanup)

#### Scenario: Undo delete
- **WHEN** the user deletes a segment and then triggers undo
- **THEN** the segment is restored with its original time range and canvas position

### Requirement: Window capture timeline tracks respond to zoom and scroll
Window capture track rows SHALL scale and scroll in sync with the main timeline, matching the existing behavior of media overlay and audio overlay track rows.

#### Scenario: Timeline zoom in
- **WHEN** the user zooms the timeline
- **THEN** window capture track bands scale proportionally with the zoom level
- **AND** their percentage-based positions remain accurate

#### Scenario: Timeline scroll
- **WHEN** the user scrolls the timeline horizontally
- **THEN** window capture track rows scroll in sync with sections and other track rows
