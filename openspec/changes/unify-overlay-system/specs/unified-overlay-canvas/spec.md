## ADDED Requirements

### Requirement: Unified overlay canvas rendering loop
The editor draw loop SHALL iterate all 4 overlay tracks in order (track 0 through track 3) using a single rendering path. There SHALL NOT be separate rendering branches for window-type and media-type overlays.

#### Scenario: All overlay types rendered in single loop
- **WHEN** the editor draw loop executes
- **THEN** it iterates tracks 0 through 3, calling `getOverlayStateAtTime()` for each track, and draws any active overlay

#### Scenario: Track order determines z-order
- **WHEN** overlays exist on tracks 0, 1, 2, and 3
- **THEN** track 0 is drawn first (lowest), track 3 drawn last (highest), with camera PIP drawn after all tracks

### Requirement: Overlays require timeline selection for canvas interaction
Overlays SHALL only respond to drag and resize on the canvas when `selectedOverlayId` is set (selected via the timeline). Clicking directly on an overlay on the canvas SHALL NOT select it or initiate drag.

#### Scenario: Clicking unselected overlay on canvas
- **WHEN** no overlay is selected on the timeline and the user clicks on an overlay's area on the canvas
- **THEN** nothing happens — the overlay is not selected and no drag begins

#### Scenario: Dragging selected overlay on canvas
- **WHEN** an overlay is selected on the timeline and the user clicks within its bounds on the canvas
- **THEN** a drag operation begins, moving the overlay position

#### Scenario: Resizing selected overlay on canvas
- **WHEN** an overlay is selected on the timeline and the user clicks within a corner hit zone (40px) on the canvas
- **THEN** a resize operation begins with aspect ratio lock

#### Scenario: Previously selected overlay no longer auto-selects window
- **WHEN** a media overlay on track 2 is selected on the timeline and the user clicks on the canvas area where a window overlay (track 0) is also present
- **THEN** the media overlay drag/resize is handled, NOT the window overlay

### Requirement: Rounded-corner clipping on all overlays
All overlay types SHALL be rendered with rounded-corner clipping on the canvas. The corner radius SHALL be proportional to the overlay dimensions (matching current macOS-style window corner scaling).

#### Scenario: Window overlay drawn with rounded corners
- **WHEN** a window overlay is visible on the canvas
- **THEN** it is drawn with rounded-corner clipping

#### Scenario: Media overlay drawn with rounded corners
- **WHEN** a media (image or video) overlay is visible on the canvas
- **THEN** it is drawn with rounded-corner clipping

### Requirement: Wallpaper base when window overlays present
When any overlay with `mediaType: 'window'` exists in the editor state, the canvas SHALL render the wallpaper (or fallback `#1E1E1E`) as the base layer instead of the screen recording.

#### Scenario: Canvas base with window overlays
- **WHEN** at least one overlay has `mediaType: 'window'`
- **THEN** the canvas draws the wallpaper image (or solid `#1E1E1E` fallback) as the base before any overlays

#### Scenario: Canvas base without window overlays
- **WHEN** no overlays have `mediaType: 'window'`
- **THEN** the canvas draws the screen recording as the base (existing behavior)
