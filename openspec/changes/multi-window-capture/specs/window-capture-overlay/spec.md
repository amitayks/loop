## ADDED Requirements

### Requirement: Window captures appear as overlay objects in editor
When a take with `windowPaths` is loaded into the editor, each window file SHALL create a `WindowCapture` overlay object on the canvas. Each window capture is a draggable, resizable layer with aspect-ratio-locked scaling, positioned independently per output mode (landscape/reel).

#### Scenario: Open take with two window recordings
- **WHEN** the editor loads a take that has `windowPaths` with 2 entries
- **THEN** 2 `WindowCapture` objects are created in `timeline.windowCaptures`
- **AND** each has `trackIndex` 0 and 1 respectively
- **AND** each starts with one segment spanning the full recording duration
- **AND** default positions are side-by-side centered at original aspect ratios on a 1920x1080 canvas

#### Scenario: Open take with one window recording
- **WHEN** the editor loads a take that has `windowPaths` with 1 entry
- **THEN** 1 `WindowCapture` object is created with `trackIndex: 0`
- **AND** it has one segment spanning the full recording duration
- **AND** default position is centered on the canvas at original aspect ratio

#### Scenario: Open take with no window recordings (backward compat)
- **WHEN** the editor loads a take with `windowPaths` null or empty
- **THEN** `timeline.windowCaptures` is empty
- **AND** the editor behaves exactly as before (screen source as base layer)

### Requirement: Window capture canvas drag
A selected window capture segment SHALL be draggable on the editor canvas by clicking and dragging its center area. Position changes SHALL update the segment's position for the current output mode (landscape or reel).

#### Scenario: Drag window overlay in landscape mode
- **WHEN** the user clicks the center area of a selected window capture overlay on the canvas
- **AND** drags to a new position
- **THEN** the segment's `landscape.x` and `landscape.y` are updated to the new position
- **AND** the canvas redraws immediately with the window at the new position

#### Scenario: Drag window overlay in reel mode
- **WHEN** the output mode is "reel"
- **AND** the user drags a window capture overlay
- **THEN** the segment's `reel.x` and `reel.y` are updated
- **AND** the `landscape` position is not affected

### Requirement: Window capture canvas resize with aspect lock
A selected window capture segment SHALL be resizable by dragging its corner handles. Resizing SHALL maintain the original video aspect ratio. Minimum size SHALL be 50x50 pixels on canvas.

#### Scenario: Resize from bottom-right corner
- **WHEN** the user drags the bottom-right corner handle of a selected window overlay
- **THEN** the width and height change proportionally maintaining aspect ratio
- **AND** the x and y position remain fixed (top-left anchored)

#### Scenario: Resize from top-left corner
- **WHEN** the user drags the top-left corner handle
- **THEN** width, height, x, and y all adjust to maintain aspect ratio
- **AND** the bottom-right corner remains fixed

#### Scenario: Resize below minimum
- **WHEN** the user attempts to resize a window overlay below 50x50 pixels
- **THEN** the overlay is clamped to 50 pixels on the constraining dimension
- **AND** the other dimension is set proportionally via aspect ratio

### Requirement: Window capture overflow visualization
When a window capture overlay extends beyond the canvas boundaries, the out-of-bounds portion SHALL be drawn at reduced opacity (alpha 0.3), matching the existing media overlay overflow behavior.

#### Scenario: Window overlay partially off-screen
- **WHEN** the user drags a window overlay so that part of it extends beyond the canvas edge
- **THEN** the in-bounds portion is drawn at full opacity
- **AND** the out-of-bounds portion is drawn at alpha 0.3 with a subtle clip boundary

### Requirement: Window capture z-order
Window captures SHALL be drawn in z-order: wallpaper (bottom) → window track 0 → window track 1 → camera PIP → media overlays (top). Hit-testing for selection SHALL check in reverse z-order (top first).

#### Scenario: Two windows overlapping on canvas
- **WHEN** window track 0 and window track 1 overlays overlap on the canvas
- **THEN** window track 1 is drawn on top of window track 0
- **AND** clicking the overlap area selects track 1's overlay (higher z-order)

#### Scenario: Media overlay on top of window overlay
- **WHEN** a media overlay and a window overlay overlap
- **THEN** the media overlay is drawn on top
- **AND** clicking the overlap area selects the media overlay

### Requirement: Window capture segment transitions
When adjacent segments of the same window capture have different positions, the transition between them SHALL use easeInOut interpolation over 0.3 seconds, matching the existing `TRANSITION_DURATION` constant.

#### Scenario: Position change between segments
- **WHEN** window track 0 has segment A (full canvas) ending at t=5s and segment B (left half) starting at t=5s
- **THEN** between t=4.85s and t=5.15s, the position/size smoothly interpolates from A to B using easeInOut
- **AND** at t=4.85s the overlay is fully at segment A's position
- **AND** at t=5.15s the overlay is fully at segment B's position

#### Scenario: Visibility transition (fade in/out)
- **WHEN** a window capture segment starts at t=3s (preceded by a gap)
- **THEN** the overlay fades in over 0.3s starting at t=3s (opacity 0→1)
- **AND** if the segment ends at t=8s (followed by a gap), it fades out over 0.3s ending at t=8s

### Requirement: Default initial positions
When window captures are first created from a take, their initial canvas positions SHALL be calculated based on their source resolutions, centered on the canvas, side-by-side if two windows are present.

#### Scenario: Two windows with similar aspect ratios
- **WHEN** two windows are both approximately 16:9
- **THEN** they are placed side-by-side with a small gap (16px), each scaled to fit within half the canvas width while maintaining aspect ratio, vertically centered

#### Scenario: Single window
- **WHEN** one window capture exists
- **THEN** it is centered on the canvas, scaled to fit within the canvas dimensions while maintaining aspect ratio

#### Scenario: Two windows with different aspect ratios
- **WHEN** window 0 is 16:9 and window 1 is 4:3
- **THEN** each is scaled independently to fit within half the canvas width, maintaining their respective aspect ratios, vertically centered
