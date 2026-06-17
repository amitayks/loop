## MODIFIED Requirements

### Requirement: Overlay drawn between screen and PIP in z-order
Both overlays drawn at correct z-order position in the compositing stack. The z-order SHALL be: base layer (screen or wallpaper) → overlay track 0 → overlay track 1 → overlay track 2 → overlay track 3 → camera PIP. Maximum one active overlay per track at any given time. Camera PIP SHALL always render on top of all overlay tracks.

#### Scenario: Four overlays at different track indices
- **WHEN** overlays exist on tracks 0, 1, 2, and 3 with the playhead within all their time ranges
- **THEN** track 0 is drawn first (lowest z), track 3 drawn last (highest z), camera PIP drawn after track 3

#### Scenario: Camera PIP above all overlays
- **WHEN** overlays exist on any tracks and camera PIP is visible
- **THEN** the camera PIP is drawn after all overlay tracks, appearing on top

### Requirement: Overlay hit-testing priority
When checking for overlay interactions on canvas, the system SHALL only test the currently selected overlay (identified by `selectedOverlayId`). The system SHALL NOT iterate overlays by track to find hit targets. If no overlay is selected, canvas clicks on overlay areas SHALL have no effect on overlays.

#### Scenario: No overlay selected — canvas click does nothing to overlays
- **WHEN** no overlay is selected via the timeline and the user clicks on an overlay's area on the canvas
- **THEN** no overlay is selected or dragged

#### Scenario: Selected overlay tested for interaction
- **WHEN** an overlay is selected via the timeline and the user clicks on the canvas
- **THEN** only the selected overlay is tested for corner resize zones and drag area

### Requirement: Overlay free-placement drag
Click and drag on the canvas SHALL move the selected overlay freely. Drag SHALL only work when the overlay is selected via the timeline (`selectedOverlayId` is set). The drag updates the overlay's position for the current output mode (landscape or reel).

#### Scenario: Drag selected overlay
- **WHEN** an overlay is selected on the timeline and the user clicks within its bounds on the canvas and drags
- **THEN** the overlay position updates to follow the mouse movement

#### Scenario: Cannot drag unselected overlay
- **WHEN** no overlay is selected and the user clicks and drags on an overlay's canvas area
- **THEN** no drag occurs

### Requirement: Overlay corner resize with aspect ratio lock
Corner resize handles (40px hit zones at each corner) SHALL resize the selected overlay while maintaining its original aspect ratio. Minimum size is 50x50 pixels. Resize SHALL only work when the overlay is selected via the timeline.

#### Scenario: Resize selected overlay from corner
- **WHEN** an overlay is selected on the timeline and the user drags a corner handle
- **THEN** the overlay resizes while maintaining aspect ratio, with minimum 50x50

#### Scenario: Cannot resize unselected overlay
- **WHEN** no overlay is selected and the user clicks on a corner area of an overlay on the canvas
- **THEN** no resize occurs
