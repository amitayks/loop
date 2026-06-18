## ADDED Requirements

### Requirement: Render skips invalid window/video overlay inputs
The render service SHALL NOT hard-fail an export because a window (or video) overlay's media file is missing, 0-byte, or otherwise undecodable. Before building the FFmpeg input plan and filter graph, the render service SHALL drop `video`/`window` overlays whose resolved media file does not exist or has zero size, logging a warning for each dropped overlay. The drop SHALL happen before FFmpeg input indices and filter parts are computed, so remaining inputs stay correctly aligned. Image and other overlay types are unaffected.

#### Scenario: Window overlay file is 0-byte or missing
- **WHEN** a render is triggered for a timeline containing a `window` overlay whose recording file is missing or 0 bytes
- **THEN** that overlay is excluded from the FFmpeg inputs and filter graph (no `-i <bad file>` is added)
- **AND** a warning is logged naming the dropped overlay
- **AND** the export completes successfully with the remaining valid layers (no FFmpeg `EBML / Invalid data` crash)

#### Scenario: All window overlay files are valid
- **WHEN** every `video`/`window` overlay's media file exists and is non-empty
- **THEN** the render behaves exactly as before (all overlays included, indices unchanged)

### Requirement: Export tolerates recordings made without a microphone
A recording made without an active microphone (no mic selected, or permission denied) SHALL still be exportable. Because the export filter graph references each recording's audio stream (`[N:a]`), every recording SHALL carry an audio track — the live microphone when present, otherwise a silent track — so FFmpeg never fails with "Stream specifier ':a' matches no streams".

#### Scenario: Render a no-microphone recording
- **WHEN** the user records (screen, window, or camera) with no microphone active and then exports
- **THEN** the recording file contains a (silent) audio track
- **AND** the export completes and produces a valid `.mp4` (no FFmpeg audio-stream error)
