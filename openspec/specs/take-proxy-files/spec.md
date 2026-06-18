# take-proxy-files Specification

## Purpose
Proxy file generation for take screen/window media, enabling smooth editor scrubbing, including observable failure reporting and overlay proxy paths.
## Requirements
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

### Requirement: Overlay proxy path storage
Overlay objects with `mediaType: 'video'` or `'window'` MAY have a `proxyPath: string` field storing the path to the proxy file. When proxy generation completes for such an overlay, the system SHALL set its `proxyPath` and persist it in `project.json`.

#### Scenario: Proxy path stored on overlay
- **WHEN** proxy generation completes for a window overlay's media file
- **THEN** the overlay's `proxyPath` field is updated and the project is saved

### Requirement: Window proxy generation failures are observable
When proxy generation fails for a window-capture file (for example, an input FFmpeg cannot parse), the failure SHALL be observable to the renderer rather than silently swallowed: `generateProxy` rejects, the main IPC handler emits a `proxy:progress` event with `status: 'error'`, and the renderer SHALL record the take's proxy status as failed (`error`) in the `proxyStatus` map and re-render the section markers, so a missing window proxy is detectable by the editor and by tests.

> Note: this requirement is satisfied by the pre-existing `status: 'error'` proxy-progress path. An earlier attempt to add a parallel `status: 'failed'` callback mechanism was found to be redundant (never wired through `register-handlers`) and was reverted.

#### Scenario: Window proxy input is unreadable
- **WHEN** proxy generation is queued for a window capture file that FFmpeg cannot parse (e.g. a 0-byte/`EBML`-failing file)
- **THEN** `generateProxy` rejects and the main process emits `proxy:progress` with `status: 'error'`
- **AND** the renderer sets that take's `proxyStatus` entry to `{ status: 'error' }` and re-renders section markers
- **AND** the failure is surfaced (logged + observable status), not silently swallowed

#### Scenario: Valid window proxy input succeeds
- **WHEN** proxy generation is queued for a valid window capture webm
- **THEN** the proxy is generated with the same encoding settings as screen proxies (H264, 960x540, CRF 23, preset fast, `-g 15`, AAC 64kbps, `-movflags +faststart`)
- **AND** the take/overlay `proxyPath` is updated and persisted

