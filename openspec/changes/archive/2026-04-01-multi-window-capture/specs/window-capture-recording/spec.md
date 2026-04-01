## ADDED Requirements

### Requirement: Multi-window stream acquisition
When the user selects one or two windows via the hybrid picker, the system SHALL acquire a separate `MediaStream` for each selected window using `getUserMedia()` with `chromeMediaSource: 'desktop'` and the window's `chromeMediaSourceId`. Each stream SHALL target 30fps via `maxFrameRate: 30`.

#### Scenario: Single window selected
- **WHEN** the user checks one window checkbox (e.g., "VS Code" with source ID `window:123`)
- **THEN** the system calls `getUserMedia()` with the window's source ID
- **AND** one `MediaStream` is acquired and stored as `windowStreams[0]`
- **AND** a hidden `<video>` element is created and assigned `srcObject = windowStreams[0]`

#### Scenario: Two windows selected
- **WHEN** the user checks two window checkboxes
- **THEN** the system calls `getUserMedia()` twice, once per window source ID
- **AND** two `MediaStream` instances are stored as `windowStreams[0]` and `windowStreams[1]`
- **AND** two hidden `<video>` elements are created for preview compositing

#### Scenario: Stream acquisition failure for one window
- **WHEN** `getUserMedia()` fails for one window (e.g., permission denied, window closed)
- **THEN** the successfully acquired stream (if any) remains active
- **AND** the failed window's checkbox is unchecked in the picker
- **AND** a console warning is logged

### Requirement: Window streams coexist with camera and audio
Window capture streams SHALL operate independently from the camera stream and audio stream. All streams (up to 2 window + 1 camera + 1 audio) SHALL be active simultaneously during recording.

#### Scenario: Two windows plus camera plus audio
- **WHEN** the user has 2 windows checked, a camera selected, and an audio device selected
- **THEN** 4 independent `MediaStream` instances are active
- **AND** all are used for recording without interfering with each other

### Requirement: Per-window MediaRecorder with canvas capture
Each selected window stream SHALL be recorded via a dedicated `MediaRecorder`. Following the existing screen recording pattern, each window's video frames SHALL be drawn to a dedicated offscreen `<canvas>` at 30fps via `setInterval`, and `canvas.captureStream(30)` SHALL provide the stream to the `MediaRecorder`. Audio tracks from the audio stream SHALL be mixed into each window recorder via `addAudioToStream()`.

#### Scenario: Recording two windows
- **WHEN** the user starts recording with 2 windows selected
- **THEN** two offscreen canvases are created, sized to each window stream's video dimensions
- **AND** two `setInterval` loops draw frames at 1000/30ms
- **AND** two `MediaRecorder` instances record the canvas capture streams
- **AND** audio tracks are mixed into both recorders

#### Scenario: Recording one window plus camera
- **WHEN** the user starts recording with 1 window and 1 camera selected
- **THEN** one window recorder and one camera recorder are active
- **AND** both have audio mixed in

### Requirement: Window recording file naming
Window capture recordings SHALL be saved with the suffix `win{index}` where index is 0 or 1, following the pattern `{takeId}-win0.webm` and `{takeId}-win1.webm`.

#### Scenario: Save two window recordings
- **WHEN** recording stops with 2 window recorders active
- **THEN** the first window's blob is saved via IPC `saveVideo` as `{takeId}-win0.webm`
- **AND** the second window's blob is saved as `{takeId}-win1.webm`

### Requirement: Take stores window file metadata
When window recordings complete, the `Take` object SHALL store window file paths in a `windowPaths` array. Each entry contains the source window name and the relative file path.

#### Scenario: Take created with two window recordings
- **WHEN** recording completes with 2 windows ("VS Code", "Loop")
- **THEN** the take's `windowPaths` is `[{ name: "VS Code", path: "...-win0.webm" }, { name: "Loop", path: "...-win1.webm" }]`
- **AND** `screenPath` is null (no entire-screen recording)

#### Scenario: Take created with Entire Screen (no windows)
- **WHEN** recording completes with "Entire Screen" selected
- **THEN** the take's `windowPaths` is null or empty
- **AND** `screenPath` contains the screen recording path (existing behavior)

### Requirement: Window stream cleanup on recording stop
When recording stops, all window-related resources SHALL be cleaned up: `MediaRecorder` instances stopped, canvas capture intervals cleared, but window `MediaStream` tracks remain active (for continued preview, matching existing screen stream behavior).

#### Scenario: Stop recording with two windows
- **WHEN** the user stops recording
- **THEN** both window `MediaRecorder` instances are stopped
- **AND** both canvas capture `setInterval` timers are cleared
- **AND** window `MediaStream` tracks remain active for preview
- **AND** blobs are saved via IPC

### Requirement: Live preview with window captures
During recording (and before recording starts), the preview canvas SHALL composite window captures on a wallpaper background. With two windows, they SHALL be positioned side-by-side centered at their original aspect ratios. With one window, it SHALL be centered. Camera PIP is drawn on top.

#### Scenario: Preview with two windows
- **WHEN** 2 window streams are active (not yet recording)
- **THEN** the preview canvas draws: wallpaper background → window 0 (left of center, original aspect ratio) → window 1 (right of center, original aspect ratio) → camera PIP (if active)

#### Scenario: Preview with one window
- **WHEN** 1 window stream is active
- **THEN** the preview canvas draws: wallpaper background → window centered at original aspect ratio → camera PIP (if active)

#### Scenario: Preview with Entire Screen (existing behavior)
- **WHEN** "Entire Screen" is selected (no window checkboxes)
- **THEN** the preview behaves exactly as before: black background → screen fit/fill → camera PIP

### Requirement: Wallpaper image retrieval
The system SHALL retrieve the user's macOS desktop wallpaper path via an IPC call to the main process, which executes `osascript -e 'tell application "Finder" to get POSIX path of (get desktop picture as alias)'`. The image SHALL be loaded once and cached as an `Image` element for canvas drawing.

#### Scenario: Wallpaper retrieved successfully
- **WHEN** the renderer requests the wallpaper path via IPC
- **AND** the osascript command returns a valid file path
- **THEN** the image is loaded from that path and cached
- **AND** the preview canvas uses it as the background layer

#### Scenario: Wallpaper retrieval fails
- **WHEN** the osascript command fails (permissions, non-macOS, error)
- **THEN** the system falls back to a solid `#1E1E1E` background
- **AND** no error is shown to the user (silent fallback)

### Requirement: Window track ended handling
If a captured window is closed by the user during recording, the corresponding `MediaStream` video track SHALL fire the `ended` event. The system SHALL handle this gracefully by stopping that window's `MediaRecorder` and clearing its canvas interval, while allowing other recorders to continue.

#### Scenario: One of two windows closed during recording
- **WHEN** the user closes "VS Code" while recording 2 windows
- **THEN** the "VS Code" stream's `ended` event fires
- **AND** its `MediaRecorder` is stopped and blob saved
- **AND** the "Loop" window recorder continues recording
- **AND** the camera recorder continues recording
- **AND** the preview updates to show only the remaining window
