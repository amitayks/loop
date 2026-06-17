## ADDED Requirements

### Requirement: Window recording creates standard overlay objects
When a recording take includes `windowPaths`, the system SHALL create standard `Overlay` objects with `mediaType: 'window'` instead of `WindowCapture` objects. Each window path produces one overlay.

#### Scenario: Single window recorded
- **WHEN** a take has one entry in `windowPaths`
- **THEN** one overlay is created with `mediaType: 'window'`, `trackIndex: 0`, spanning the full recording duration

#### Scenario: Two windows recorded
- **WHEN** a take has two entries in `windowPaths`
- **THEN** two overlays are created with `mediaType: 'window'`, assigned to `trackIndex` 0 and 1 respectively

### Requirement: Window overlay auto-positioning
Window overlays created from recording SHALL be auto-positioned based on the number of windows and their source dimensions.

#### Scenario: Single window centered on canvas
- **WHEN** one window overlay is created
- **THEN** it is positioned centered on the canvas, scaled to fit within the canvas bounds while maintaining aspect ratio

#### Scenario: Two windows positioned side-by-side
- **WHEN** two window overlays are created
- **THEN** they are positioned side-by-side horizontally, each scaled to fit within half the canvas width while maintaining their respective aspect ratios

#### Scenario: Reel mode positioning
- **WHEN** window overlays are created and reel mode positions are calculated
- **THEN** the reel positions stack windows vertically within the reel canvas dimensions (608x1080)

### Requirement: Window overlay time alignment
Window overlays created from recording SHALL have `startTime: 0`, `endTime` equal to the recording duration, `sourceStart: 0`, and `sourceEnd` equal to the recording duration.

#### Scenario: Window overlay spans full recording
- **WHEN** a window overlay is created from a take
- **THEN** its `startTime` is 0, `endTime` equals the recording duration, `sourceStart` is 0, and `sourceEnd` equals the recording duration

### Requirement: Window overlay metadata from take
Window overlays SHALL populate `sourceName` from the take's `windowPaths[].name`, `sourceWidth` from `windowPaths[].width`, and `sourceHeight` from `windowPaths[].height`.

#### Scenario: Window metadata populated
- **WHEN** a window overlay is created from a take with `windowPaths: [{ name: 'Chrome', path: '/path/to/file.webm', width: 1920, height: 1080 }]`
- **THEN** the overlay has `sourceName: 'Chrome'`, `sourceWidth: 1920`, `sourceHeight: 1080`

### Requirement: Proxy generation queued for window overlays
After window overlays are created from a recording, proxy generation SHALL be queued for each window overlay's media file using the standard proxy pipeline.

#### Scenario: Proxy generation starts after window overlay creation
- **WHEN** window overlays are created from a recording take
- **THEN** proxy generation jobs are queued for each window overlay's `mediaPath`

### Requirement: Window overlay creation replaces WindowCapture creation
The function `createWindowCapturesFromTake()` SHALL be replaced by logic that creates `Overlay` objects. There SHALL be no `WindowCapture` creation code.

#### Scenario: No WindowCapture creation code
- **WHEN** the recording-to-editor transition code is checked
- **THEN** it creates `Overlay` objects with `mediaType: 'window'`, not `WindowCapture` objects
