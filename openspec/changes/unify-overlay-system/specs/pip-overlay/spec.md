## MODIFIED Requirements

### Requirement: PIP drawn relative to crop region in preview
The camera PIP SHALL be drawn AFTER all overlay tracks (0 through 3) in the editor canvas draw loop. The PIP position is at `(cropPixelOffset + pipX, pipY)` in reel mode, `(pipX, pipY)` in landscape mode. PIP SHALL always appear on top of all overlays regardless of track index.

#### Scenario: PIP visible above window overlays
- **WHEN** window overlays exist on tracks 0-1 and camera PIP is visible
- **THEN** the PIP is drawn after all overlays, appearing on top of the window overlays

#### Scenario: PIP visible above media overlays
- **WHEN** media overlays exist on tracks 2-3 and camera PIP is visible
- **THEN** the PIP is drawn after all overlays, appearing on top of the media overlays

#### Scenario: PIP above all overlays in mixed project
- **WHEN** overlays exist on tracks 0-3 and camera PIP is visible
- **THEN** the PIP is rendered last, above everything

### Requirement: FFmpeg render with animated PIP size
The FFmpeg render SHALL apply the camera PIP overlay AFTER all 4 overlay tracks in the filter chain. The compositing order SHALL be: base → overlay tracks (0-3) → camera PIP with animated size per keyframe.

#### Scenario: Camera rendered last in FFmpeg output
- **WHEN** a project with overlays and camera is rendered via FFmpeg
- **THEN** the camera PIP filter is applied after all overlay track filters
