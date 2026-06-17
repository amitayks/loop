## ADDED Requirements

### Requirement: Four overlay track rows in timeline
The timeline SHALL display up to 4 overlay track rows. Tracks 0-1 (window tracks) SHALL use distinct colors: track 0 blue (`rgba(59,130,246,0.3)` with border `#3B82F6`), track 1 green (`rgba(34,197,94,0.3)` with border `#22C55E`). Tracks 2-3 (media tracks) SHALL use indigo (`rgba(99,102,241,0.22)` with border `rgba(99,102,241,0.45)`).

#### Scenario: Window overlay tracks colored differently
- **WHEN** the timeline renders tracks with window overlays on tracks 0 and 1
- **THEN** track 0 bands are blue and track 1 bands are green

#### Scenario: Media overlay tracks retain indigo color
- **WHEN** the timeline renders media overlays on tracks 2 and 3
- **THEN** the bands use indigo coloring

### Requirement: Tracks visible when overlays exist
An overlay track row SHALL be visible when at least one overlay exists on that track. An overlay track row SHALL be hidden when no overlays exist on that track. Track visibility SHALL be determined at render time, not toggled by user clicks on the canvas.

#### Scenario: Window tracks visible on project open
- **WHEN** a project with window overlays on tracks 0 and 1 is opened
- **THEN** tracks 0 and 1 are visible in the timeline immediately

#### Scenario: Empty tracks hidden
- **WHEN** no overlays exist on track 1
- **THEN** track 1 row is hidden in the timeline

#### Scenario: Tracks visible after recording finishes
- **WHEN** recording finishes and the editor opens with window overlays
- **THEN** window tracks are visible in the timeline without requiring any canvas click

### Requirement: Track labels show source name for windows
Window overlay timeline bands SHALL display the `sourceName` property as the label. Media overlay bands SHALL display the filename with a media type icon (existing behavior).

#### Scenario: Window overlay band label
- **WHEN** a window overlay band is rendered on the timeline
- **THEN** it shows the `sourceName` (window title) as the label text

### Requirement: Unified split works for all overlay types via S key
Pressing the "S" key SHALL split the selected overlay at the playhead regardless of its `mediaType`. The priority order SHALL be: selected overlay (any type) → selected audio overlay → split section.

#### Scenario: Split window overlay with S key
- **WHEN** a window overlay is selected on the timeline and the user presses "S" with the playhead within the overlay's time range
- **THEN** the overlay is split at the playhead into two overlay objects, both retaining `mediaType: 'window'` and the same `mediaPath`

#### Scenario: Split media overlay with S key
- **WHEN** a media overlay is selected on the timeline and the user presses "S"
- **THEN** the overlay is split at the playhead (existing behavior)

### Requirement: Unified delete works for all overlay types
Pressing Delete/Backspace SHALL delete the selected overlay regardless of its `mediaType`. The priority order SHALL be: selected overlay (any type) → selected audio overlay → delete section.

#### Scenario: Delete window overlay with keyboard
- **WHEN** a window overlay is selected on the timeline and the user presses Delete
- **THEN** the overlay is removed from the overlays array

### Requirement: Stale tracks cleared on project switch
When switching to a different project, all overlay track rows SHALL be re-rendered based on the new project's overlays. Tracks from the previous project SHALL NOT persist.

#### Scenario: Switch from project with windows to project without
- **WHEN** a project with window overlays is open and the user switches to a project with no window overlays
- **THEN** the window track rows (0-1) are hidden in the timeline
