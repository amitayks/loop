## MODIFIED Requirements

### Requirement: Overlay included in ffmpeg filter chain
Overlays of all types (`image`, `video`, `window`) SHALL be composited in the FFmpeg filter chain. They SHALL be sorted by `[trackIndex, startTime]` and applied sequentially. The compositing order SHALL be: base layer → track 0 overlays → track 1 overlays → track 2 overlays → track 3 overlays → camera PIP.

#### Scenario: Mixed overlay types in render
- **WHEN** a project has window overlays on tracks 0-1 and media overlays on tracks 2-3
- **THEN** the FFmpeg filter chain applies them in track order, with track 0 first and track 3 last, camera PIP after all overlays

#### Scenario: Only media overlays in render
- **WHEN** a project has only media overlays on tracks 2-3
- **THEN** the FFmpeg filter chain applies them on the screen recording base (existing behavior) with camera PIP last

### Requirement: Video overlay input format
Video overlays (both `mediaType: 'video'` and `mediaType: 'window'`) SHALL use `-i {mediaPath}` with trim filter for `sourceStart` to `sourceEnd`, and scale to output dimensions. Window overlays SHALL use proxy path when available.

#### Scenario: Window overlay input in FFmpeg
- **WHEN** a window overlay is included in the render
- **THEN** it uses `-i {proxyPath || mediaPath}` with trim and scale filters

#### Scenario: Video overlay input in FFmpeg
- **WHEN** a video overlay is included in the render
- **THEN** it uses `-i {mediaPath}` with trim and scale filters (existing behavior)

### Requirement: Build overlay filter function
The build overlay filter function SHALL accept all overlays sorted by `[trackIndex, startTime]` and process them sequentially across 4 tracks. It SHALL check `trackIndex` for position interpolation between adjacent same-media same-track segments. The function SHALL handle `mediaType: 'window'` identically to `mediaType: 'video'` in terms of filter generation.

#### Scenario: Build filter with window overlays
- **WHEN** the overlay filter builder processes window overlays
- **THEN** it generates the same filter structure as for video overlays (trim, scale, position, enable, fade)

#### Scenario: Position interpolation for split window overlays
- **WHEN** two adjacent window overlays on the same track share the same `mediaPath` but have different positions
- **THEN** position interpolation is applied over the 0.3s transition period

## ADDED Requirements

### Requirement: Rounded-corner clipping in overlay render filter
All overlay types SHALL have rounded-corner clipping applied in the FFmpeg render output. The corner radius SHALL be proportionally scaled to match the editor preview appearance.

#### Scenario: Rendered overlay has rounded corners
- **WHEN** any overlay (window, video, or image) is rendered in FFmpeg output
- **THEN** the output shows rounded corners matching the editor canvas preview
