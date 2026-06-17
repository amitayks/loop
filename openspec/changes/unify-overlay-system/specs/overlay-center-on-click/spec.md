## MODIFIED Requirements

### Requirement: Click on Size label centers the selected overlay
Clicking on the "Size" label (displacement < 3px) SHALL center the selected overlay on the canvas for the current output mode. This SHALL work for all overlay types: `'image'`, `'video'`, and `'window'`. Centering formula: `x = (canvasW - width) / 2`, `y = (canvasH - height) / 2`. Dragging the label (displacement >= 3px) adjusts the overlay scale.

#### Scenario: Center window overlay via Size label click
- **WHEN** a window overlay is selected on the timeline and the user clicks the Size label (< 3px movement)
- **THEN** the window overlay is centered on the canvas for the current mode

#### Scenario: Center media overlay via Size label click
- **WHEN** a media overlay is selected on the timeline and the user clicks the Size label
- **THEN** the media overlay is centered on the canvas (existing behavior)

#### Scenario: Size label visible for all overlay types
- **WHEN** any overlay (window, video, or image) is selected on the timeline
- **THEN** the Size control (label + slider) appears in the action bar
