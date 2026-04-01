## MODIFIED Requirements

### Requirement: Video overlay playback sync
The editor SHALL maintain reusable `<video>` elements for overlay playback. The pool SHALL support up to 4 tracks (one video element per track). For `mediaType: 'window'` overlays, the video element SHALL use the proxy path if available, falling back to the original `mediaPath`. Playback sync SHALL display the frame at `sourceStart + (playheadTime - startTime)`.

#### Scenario: Window overlay playback uses proxy
- **WHEN** a window overlay has a proxy file and the playhead is within its time range
- **THEN** the video element loads the proxy path and displays the synced frame

#### Scenario: Window overlay playback without proxy
- **WHEN** a window overlay has no proxy file and the playhead is within its time range
- **THEN** the video element loads the original `.webm` path and displays the synced frame

#### Scenario: Four video overlays playing simultaneously
- **WHEN** overlays on all 4 tracks are active at the current playhead time
- **THEN** 4 video elements are active and synced, one per track

### Requirement: Overlay state computation function
`getOverlayStateAtTime()` SHALL be called once per track (tracks 0 through 3) in the draw loop. The function SHALL return position, opacity, and media information for the active overlay on that track at the given time, regardless of `mediaType`.

#### Scenario: State computation for window overlay
- **WHEN** `getOverlayStateAtTime()` is called for track 0 containing a window overlay
- **THEN** it returns the overlay's position, opacity (with fade), and `mediaType: 'window'`

#### Scenario: State computation across 4 tracks
- **WHEN** the draw loop calls `getOverlayStateAtTime()` for tracks 0 through 3
- **THEN** each call returns the state for the overlay active on that track (or null/inactive)

### Requirement: Overlay fade transitions
Fade-in over 0.3s at overlay start and fade-out over 0.3s at overlay end SHALL apply to all overlay types equally, including `mediaType: 'window'`.

#### Scenario: Window overlay fades in
- **WHEN** a window overlay begins at time T and the playhead moves from before T to after T
- **THEN** the overlay fades in from opacity 0 to 1 over 0.3 seconds

### Requirement: Position interpolation between consecutive same-media segments
Position interpolation over 0.3s SHALL apply between adjacent overlays on the same track that share the same `mediaPath`, regardless of `mediaType`. This enables smooth position transitions when a window or video overlay is split and the pieces are repositioned.

#### Scenario: Split window overlays with different positions
- **WHEN** two adjacent window overlays on track 0 share the same `mediaPath` but have different positions
- **THEN** position and size interpolate smoothly over 0.3s at the boundary
