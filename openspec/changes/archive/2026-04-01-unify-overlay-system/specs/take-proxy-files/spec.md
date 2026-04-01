## MODIFIED Requirements

### Requirement: Proxy generation after recording stops
After recording stops, proxy generation SHALL be queued for the screen recording (if present) AND for each window recording file. Window recording proxies SHALL use the same encoding settings as screen proxies (H264, 960x540, CRF 23, preset fast, `-g 15`, AAC 64kbps, `-movflags +faststart`).

#### Scenario: Proxy generated for screen recording
- **WHEN** recording stops and the take has a `screenPath`
- **THEN** a proxy generation job is queued for the screen recording (existing behavior)

#### Scenario: Proxy generated for window recordings
- **WHEN** recording stops and the take has `windowPaths`
- **THEN** proxy generation jobs are queued for each window recording file

### Requirement: Proxy generation on project open
On project open, proxy generation SHALL be queued for takes missing `proxyPath` (existing behavior) AND for window overlay media files that lack a proxy. The system SHALL check overlay media files with `mediaType: 'window'` or `'video'` for missing proxies.

#### Scenario: Missing window proxy detected on project open
- **WHEN** a project is opened and a window overlay's media file has no proxy
- **THEN** a proxy generation job is queued for that media file

### Requirement: Editor uses proxy for overlay video elements
The editor SHALL use proxy paths when available for all video-type overlay playback (both `mediaType: 'video'` and `mediaType: 'window'`). Fallback to original source path if no proxy exists.

#### Scenario: Window overlay video element uses proxy
- **WHEN** a window overlay has a proxy file available
- **THEN** the editor video element loads the proxy path for smooth scrubbing

#### Scenario: Video overlay video element uses proxy
- **WHEN** a video overlay has a proxy file available
- **THEN** the editor video element loads the proxy path

## ADDED Requirements

### Requirement: Overlay proxy path storage
Overlay objects with `mediaType: 'video'` or `'window'` MAY have a `proxyPath: string` field storing the path to the proxy file. This field is set when proxy generation completes and persisted in `project.json`.

#### Scenario: Proxy path stored on overlay
- **WHEN** proxy generation completes for a window overlay's media file
- **THEN** the overlay's `proxyPath` field is updated and the project is saved
