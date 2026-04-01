## ADDED Requirements

### Requirement: Unified overlay filter builder for all types
The FFmpeg render pipeline SHALL use a single overlay filter builder that processes all overlay types (`image`, `video`, `window`). Overlays SHALL be sorted by `[trackIndex, startTime]` and composited sequentially.

#### Scenario: Window and media overlays in single render
- **WHEN** a project with window overlays on tracks 0-1 and media overlays on tracks 2-3 is rendered
- **THEN** the filter chain applies overlays in track order: track 0 first, track 3 last

#### Scenario: Window overlay filter uses video input format
- **WHEN** a window overlay is included in the render
- **THEN** it uses the same video input format as video overlays: `-i {mediaPath}` with trim filter for `sourceStart` to `sourceEnd`

### Requirement: Wallpaper base in render when window overlays present
When any overlay in the render input has `mediaType: 'window'`, the FFmpeg pipeline SHALL use the wallpaper image (or solid `#1E1E1E` color) as the base layer with `-loop 1 -t {duration}`.

#### Scenario: Render with window overlays uses wallpaper base
- **WHEN** the render input includes window-type overlays
- **THEN** the FFmpeg command uses the wallpaper as the first input instead of the screen recording

#### Scenario: Render without window overlays uses screen base
- **WHEN** the render input has no window-type overlays
- **THEN** the FFmpeg command uses the screen recording as the base (existing behavior)

### Requirement: Camera PIP rendered last in filter chain
The camera PIP overlay filter SHALL be applied after ALL overlay tracks (0 through 3) in the FFmpeg filter chain. The compositing order SHALL be: base → track 0 → track 1 → track 2 → track 3 → camera PIP.

#### Scenario: Camera renders above all overlays in output
- **WHEN** a project with overlays on all 4 tracks and a camera is rendered
- **THEN** the camera PIP is composited last, appearing on top of all overlay tracks

### Requirement: Proxy file used for window overlay render input
When rendering window-type overlays, the render pipeline SHALL use the proxy file if available, falling back to the original `.webm` source path. The render input SHALL include both paths for the service to resolve.

#### Scenario: Window overlay rendered with proxy
- **WHEN** a window overlay has a proxy file generated
- **THEN** the render uses the proxy file path as the FFmpeg input

#### Scenario: Window overlay rendered without proxy
- **WHEN** a window overlay has no proxy file
- **THEN** the render uses the original `mediaPath` as the FFmpeg input

### Requirement: Rounded-corner clipping in render
All overlay types SHALL be rendered with rounded-corner clipping in the FFmpeg output, using a proportionally scaled corner radius matching the canvas preview appearance.

#### Scenario: Window overlay rendered with rounded corners
- **WHEN** a window overlay is included in the FFmpeg render
- **THEN** the output shows rounded corners on the overlay matching the editor preview
