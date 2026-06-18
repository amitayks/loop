## MODIFIED Requirements

### Requirement: Multi-window stream acquisition
When the user selects one or two windows via the hybrid picker, the system SHALL acquire a separate `MediaStream` for each selected window using `getUserMedia()` with `chromeMediaSource: 'desktop'` and the window's `chromeMediaSourceId`. Each stream SHALL target 30fps via `maxFrameRate: 30`. For each acquired stream the system SHALL create a `<video>` element, assign `srcObject`, attach it to the document in a hidden container, and start it via `play()`; the element SHALL NOT be treated as drawable until it reports a non-zero `videoWidth`/`videoHeight`.

#### Scenario: Single window selected
- **WHEN** the user checks one window checkbox (e.g., "VS Code" with source ID `window:123`)
- **THEN** the system calls `getUserMedia()` with the window's source ID
- **AND** one `MediaStream` is acquired and stored as `windowStreams[0]`
- **AND** a hidden `<video>` element is created, assigned `srcObject = windowStreams[0]`, attached to the DOM, and started via `play()`
- **AND** the element is treated as drawable only once it reports a non-zero `videoWidth`

#### Scenario: Two windows selected
- **WHEN** the user checks two window checkboxes
- **THEN** the system calls `getUserMedia()` twice, once per window source ID
- **AND** two `MediaStream` instances are stored as `windowStreams[0]` and `windowStreams[1]`
- **AND** two hidden `<video>` elements are created, attached to the DOM, and started via `play()` for preview compositing

#### Scenario: Stream acquisition failure for one window
- **WHEN** `getUserMedia()` fails for one window (e.g., permission denied, window closed)
- **THEN** the successfully acquired stream (if any) remains active
- **AND** the failed window's checkbox is unchecked in the picker
- **AND** a console warning is logged

## ADDED Requirements

### Requirement: Window videos reach drawable readiness before compositing
Window preview/record `<video>` elements SHALL begin playback and reach a drawable ready state (non-zero `videoWidth` and `videoHeight`, with frames flowing) before they are drawn to the live preview canvas or the offscreen recording canvas. The compositor and the recording draw loop SHALL skip a window source that is not yet ready rather than drawing a black or empty rectangle, and SHALL begin drawing it once ready.

#### Scenario: Window stream becomes ready
- **WHEN** a window stream is acquired and its `<video>` element starts playing
- **THEN** the system waits for `loadedmetadata` and a non-zero `videoWidth` before compositing that window
- **AND** once ready, the live preview shows the window's real content (not a black shape)

#### Scenario: Window source not yet ready
- **WHEN** the preview or recording draw loop runs while a window `<video>` still reports `videoWidth === 0`
- **THEN** that window is not drawn (its area shows the wallpaper/background, not a black fill)
- **AND** it begins drawing automatically on the first frame after it becomes ready

#### Scenario: Diagnostic distinguishes black-frame failure from readiness failure
- **WHEN** a window stream reports a non-zero `videoWidth` but its sampled pixels are entirely black
- **THEN** the system classifies this as a capture-content (ScreenCaptureKit) failure distinct from the readiness case
- **AND** the failure is recorded for diagnosis and a user-facing fallback message is shown rather than recording an all-black take

### Requirement: Recording is never silently discarded
A recording SHALL NOT be silently lost. If the user selected a visual source (Entire Screen or one/two windows) but no corresponding stream is active when recording would start, the system SHALL block the start and surface an explicit, actionable error instead of recording camera-only. If recorders nevertheless run and produce no usable visual track (`!hasScreen && !hasWindowCaptures`), the system SHALL surface an error at stop and SHALL NOT leave take-less orphan files dangling — orphaned files SHALL be routed to the recovery/cleanup path.

#### Scenario: Selected screen/window failed to acquire at record start
- **WHEN** the user has "Entire Screen" or one/more windows selected
- **AND** the corresponding `screenStream`/`windowStreams` is not active when the user presses Record
- **THEN** the recording does not start
- **AND** an explicit, actionable error is shown (e.g., prompting to check Screen Recording permission and reselect the source)

#### Scenario: No usable visual track captured at stop
- **WHEN** recording stops and neither a screen nor any window recording produced a file (`!hasScreen && !hasWindowCaptures`)
- **THEN** the system does not silently skip take creation
- **AND** an error is surfaced to the user
- **AND** any files already written by other recorders are routed to the recovery/cleanup path rather than left as take-less orphans

#### Scenario: Window capture succeeds (regression guard)
- **WHEN** recording stops with at least one window (or screen) recording present
- **THEN** a take is created, saved, appended to the timeline, and persisted (existing behavior preserved)

### Requirement: Never-ready windows are dropped, not recorded
A selected window whose capture `<video>` never reaches a drawable state (`videoWidth`/`videoHeight` stays 0 after the readiness wait, e.g. an occluded, off-screen, or degenerate window) SHALL be dropped from the active capture set rather than recorded. Such a window SHALL NOT produce a 0-byte/undecodable recording file or a take entry, and its stream SHALL be stopped and its `<video>` detached. The `windowStreams`, `windowVideos`, and `windowSourceNames` collections SHALL remain index-aligned after the drop.

#### Scenario: Selected window never produces frames
- **WHEN** the user selects a window whose `<video>` still reports `videoWidth === 0` after the readiness wait
- **THEN** that window is removed from `windowStreams`/`windowVideos`/`windowSourceNames` and its stream is stopped
- **AND** a warning is logged naming the window
- **AND** no recorder is created for it, so no 0-byte file is written

#### Scenario: No visual source remains after dropping
- **WHEN** every selected window was dropped as never-ready and no entire-screen stream is active
- **THEN** the "Recording is never silently discarded" pre-flight surfaces an explicit error at record start (no silent camera-only recording)

### Requirement: Window recording files are valid playable webm
Window recordings SHALL produce valid, playable webm files that downstream tooling (FFmpeg proxy generation, the editor video elements, the render service) can decode. The window `MediaRecorder` SHALL use the same supported mime-type selection as the screen recorder and SHALL flush a complete, decodable stream on stop.

#### Scenario: Window recording is decodable
- **WHEN** a window recording completes and is saved as `{takeId}-win{index}.webm`
- **THEN** the file is a valid webm that FFmpeg can parse without `EBML header parsing failed` / `Invalid data found when processing input`
- **AND** proxy generation for that file can proceed
