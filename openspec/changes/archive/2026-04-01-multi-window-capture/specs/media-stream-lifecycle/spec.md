## MODIFIED Requirements

### Requirement: Renderer cleanup on window close
The renderer SHALL stop all active media streams, close AudioContext, stop MediaRecorders, clear recording intervals, and close any open WebSocket connection when the window is about to close (`beforeunload`). **This includes stopping all window capture streams (up to 2) and clearing their canvas capture intervals.**

#### Scenario: Window closed while idle (not recording)
- **WHEN** the user closes the app window while not recording
- **THEN** the system stops all tracks on `screenStream`, `cameraStream`, `audioStream`, **and all `windowStreams`**
- **AND** closes the `AudioContext` if open
- **AND** cancels any active `drawRAF` or editor draw loop

#### Scenario: Window closed while recording
- **WHEN** the user closes the app window while a recording is active
- **THEN** the system stops all `MediaRecorder` instances **(including window capture recorders)**
- **AND** clears `screenRecInterval` **and all window canvas capture intervals**
- **AND** stops all media stream tracks (`screenStream`, `cameraStream`, `audioStream`, **`windowStreams`**)
- **AND** closes the `AudioContext`
- **AND** closes the Scribe WebSocket if open
- **AND** disconnects the AudioWorklet node if connected

#### Scenario: Window closed after recording stopped
- **WHEN** the user closes the app window after recording has completed and the editor is open
- **THEN** the system stops all media stream tracks **(including window capture streams)**
- **AND** closes the `AudioContext`
- **AND** no errors are thrown for already-stopped resources

### Requirement: Cleanup is idempotent
The cleanup function SHALL be safe to call multiple times without errors. Calling cleanup when resources are already stopped or null MUST NOT throw. **This includes null or already-stopped window capture streams.**

#### Scenario: Cleanup with null streams
- **WHEN** `cleanupAllMedia()` is called and `screenStream`, `cameraStream`, `audioStream`, **or any `windowStreams` entry** is null
- **THEN** the function skips those streams without error

### Requirement: Lazy idle cleanup on view switch
When the user navigates away from the recording view (to timeline, home, or processing) and is not actively recording, the renderer SHALL start an idle timer. If the user does not return to the recording view before the timer fires, all media streams SHALL be cleaned up — **including window capture streams**. If the user returns before the timer fires, the timer SHALL be cancelled and streams remain active.

#### Scenario: User switches to timeline and stays
- **WHEN** the user switches from recording view to timeline view
- **AND** no recording is active
- **AND** 30 seconds elapse without returning to the recording view
- **THEN** the system stops all media stream tracks (`screenStream`, `cameraStream`, `audioStream`, **`windowStreams`**)
- **AND** closes the `AudioContext`
- **AND** resets `mediaInitialized` so streams are re-acquired on next entry to recording view

#### Scenario: User returns to recording after idle cleanup
- **WHEN** the user navigates to the recording view after streams were cleaned by the idle timer
- **THEN** the system re-acquires all media streams via `ensureMediaInitialized()` — **including re-acquiring any previously selected window capture streams based on the picker state**
- **AND** the live preview becomes available after stream acquisition (~500ms)

### Requirement: Lazy media initialization on project open
The renderer SHALL NOT initialize media streams (screen, camera, audio, **or window captures**) when opening a project unless the user enters the recording view. Media streams SHALL only be acquired when the recording view is displayed.

#### Scenario: Open existing project and navigate to recording
- **WHEN** the user opens a project that has existing timeline sections
- **AND** the user navigates to the recording view
- **THEN** `ensureMediaInitialized()` is called
- **AND** screen, camera, audio, **and any selected window capture** streams are acquired
- **AND** the live preview becomes available
