## MODIFIED Requirements

### Requirement: Overlay track rendered above section track
The timeline SHALL display up to 4 overlay track rows above the section track. Track ordering from top to bottom SHALL be: track 3, track 2 (media overlay tracks), track 1, track 0 (window overlay tracks), then section markers below. Each track row SHALL only be visible when at least one overlay exists on that track.

#### Scenario: All 4 tracks with overlays
- **WHEN** overlays exist on tracks 0, 1, 2, and 3
- **THEN** all 4 track rows are visible in the timeline above the section markers

#### Scenario: Only window tracks populated
- **WHEN** overlays exist on tracks 0 and 1 only
- **THEN** only tracks 0 and 1 rows are visible; tracks 2 and 3 are hidden

#### Scenario: Track visibility updates on project switch
- **WHEN** switching from a project with 4 overlay tracks to one with 0
- **THEN** all overlay track rows become hidden

### Requirement: Overlay segment selection
Click on an overlay band SHALL set `selectedOverlayId` to that overlay's ID and deselect any other selected item (section, audio overlay). This is the ONLY way to select an overlay — canvas clicks SHALL NOT select overlays.

#### Scenario: Select overlay by clicking timeline band
- **WHEN** the user clicks on an overlay band in the timeline
- **THEN** `selectedOverlayId` is set to that overlay's ID and the overlay becomes interactive on the canvas

#### Scenario: Canvas click does not select overlay
- **WHEN** the user clicks on an overlay's area on the canvas without first selecting it on the timeline
- **THEN** `selectedOverlayId` remains unchanged

### Requirement: Overlay split at playhead
The split function SHALL work for all overlay types. When a window-type overlay is split, both resulting overlays SHALL retain `mediaType: 'window'`, `sourceName`, `sourceWidth`, `sourceHeight`, and the same `mediaPath`. The `sourceStart` and `sourceEnd` SHALL be adjusted to reflect the split point relative to the source video.

#### Scenario: Split window overlay at playhead
- **WHEN** a window overlay is selected and split at the playhead
- **THEN** two overlay objects are created, both with `mediaType: 'window'` and the same `mediaPath`, with `sourceStart`/`sourceEnd` adjusted for each half

#### Scenario: Split video overlay at playhead
- **WHEN** a video overlay is selected and split at the playhead
- **THEN** two overlay objects are created with adjusted `sourceStart`/`sourceEnd` (existing behavior)

#### Scenario: Split image overlay at playhead
- **WHEN** an image overlay is selected and split at the playhead
- **THEN** two overlay objects are created (existing behavior, no source time adjustment)

### Requirement: Overlay delete
Delete SHALL work for all overlay types. When a window-type overlay is deleted, its media file SHALL NOT be staged for cleanup (window recordings are take artifacts managed by take cleanup). When a media overlay is deleted, existing reference-counting cleanup applies.

#### Scenario: Delete window overlay
- **WHEN** a window overlay is selected and deleted
- **THEN** the overlay is removed from the overlays array; the media file is NOT staged for deletion

#### Scenario: Delete media overlay
- **WHEN** a media overlay is selected and deleted
- **THEN** the overlay is removed; if no other overlay references the same `mediaPath`, the file is staged for cleanup (existing behavior)

### Requirement: Drop media onto specific track
Dropping media onto a timeline track row SHALL assign the overlay to that track. Dropping onto window tracks (0-1) SHALL be rejected for non-window media. Dropping onto media tracks (2-3) SHALL be rejected for window media. Dropping onto the canvas SHALL default to track 2.

#### Scenario: Drop image onto media track
- **WHEN** the user drops an image file onto track 2 row
- **THEN** an overlay is created with `trackIndex: 2`

#### Scenario: Drop image onto window track rejected
- **WHEN** the user drops an image file onto track 0 row
- **THEN** the drop is rejected (tracks 0-1 are window-only)
