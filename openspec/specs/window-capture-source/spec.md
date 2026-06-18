# window-capture-source Specification

## Purpose
Capture-source selection: the hybrid picker for choosing the entire screen, individual windows (max 2), or a capture device, and surfacing Screen Recording permission state.
## Requirements
### Requirement: Hybrid source picker replaces screen dropdown
The screen source dropdown (`<select id="screenSource">`) SHALL be replaced with a custom dropdown panel that supports three selection zones: a single-select zone for "None" and "Entire Screen", a multi-select zone for individual windows (max 2), and a single-select zone for capture devices.

#### Scenario: Picker displays all available sources
- **WHEN** the user opens the source picker in the recording view
- **THEN** the picker displays "None" and "Entire Screen" as single-select radio options at the top
- **AND** below a separator, all individual windows from `desktopCapturer.getSources()` are listed with checkboxes
- **AND** below a "Capture Devices" separator, all video input devices (`videoinput`) are listed as single-select radio options

#### Scenario: Default selection on first load
- **WHEN** the recording view loads and `enumerateDevices()` completes
- **THEN** the first available `screen:` source is selected as "Entire Screen" by default (matching current behavior)
- **AND** no window checkboxes are checked

### Requirement: Single-select and multi-select mutual exclusion
Selecting "None" or "Entire Screen" SHALL clear all window checkboxes. Selecting any window checkbox SHALL deselect "None" and "Entire Screen". Selecting a capture device SHALL deselect all other options (windows, entire screen). "None" and "Entire Screen" are mutually exclusive with each other.

#### Scenario: User selects Entire Screen after checking windows
- **WHEN** the user has checked "VS Code" and "Loop" window checkboxes
- **AND** the user clicks "Entire Screen"
- **THEN** "Entire Screen" becomes the active single-select
- **AND** both window checkboxes are unchecked
- **AND** the preview shows the entire screen capture

#### Scenario: User checks a window after selecting Entire Screen
- **WHEN** "Entire Screen" is the active selection
- **AND** the user checks the "VS Code" window checkbox
- **THEN** "Entire Screen" is deselected
- **AND** only the "VS Code" window is captured and shown in preview

#### Scenario: User selects None
- **WHEN** the user clicks "None"
- **THEN** all window checkboxes are unchecked
- **AND** "Entire Screen" is deselected
- **AND** no screen/window stream is active
- **AND** the preview shows only camera (if selected) or the "no preview" placeholder

#### Scenario: User selects a capture device
- **WHEN** the user selects "FaceTime HD Camera" from the capture device zone
- **THEN** "Entire Screen" and all window checkboxes are deselected
- **AND** the selected device is captured via `getUserMedia` with `deviceId` constraints (existing behavior for `device:` prefix sources)

### Requirement: Maximum two window selections
The multi-select zone SHALL enforce a maximum of 2 checked windows. When 2 windows are already checked, additional checkboxes SHALL be disabled (grayed out, non-interactive).

#### Scenario: Two windows already selected
- **WHEN** the user has checked 2 window checkboxes
- **AND** there are additional unchecked windows listed
- **THEN** the unchecked window checkboxes are visually disabled and cannot be checked

#### Scenario: User unchecks one of two windows
- **WHEN** the user has 2 windows checked and unchecks one
- **THEN** all remaining unchecked window checkboxes become enabled again

#### Scenario: Only one window available
- **WHEN** `desktopCapturer.getSources()` returns only 1 window source
- **THEN** that window is listed with a checkbox (no max enforcement needed)
- **AND** the picker still functions normally

### Requirement: Picker refreshes on device change
The picker SHALL refresh its source list when `navigator.mediaDevices.ondevicechange` fires or when the user reopens the picker panel, re-querying both `desktopCapturer.getSources()` and `navigator.mediaDevices.enumerateDevices()`.

#### Scenario: New window appears while picker is open
- **WHEN** the user opens a new application window while the source picker is displayed
- **AND** the picker is reopened (or a refresh is triggered)
- **THEN** the new window appears in the multi-select zone
- **AND** existing checkbox states are preserved for previously listed windows

#### Scenario: Selected window disappears
- **WHEN** a previously checked window is closed by the user
- **AND** the picker refreshes
- **THEN** the closed window is removed from the list
- **AND** its checkbox selection is cleared
- **AND** the corresponding stream is stopped (handled by window-capture-recording)

### Requirement: Picker shows selected state summary
The picker trigger button (replacing the `<select>`) SHALL display a summary of the current selection: "None", "Entire Screen", the single window name, "2 Windows", or the capture device name.

#### Scenario: Two windows selected
- **WHEN** the user has "VS Code" and "Loop" checked
- **THEN** the picker button displays "2 Windows"

#### Scenario: One window selected
- **WHEN** the user has only "VS Code" checked
- **THEN** the picker button displays "VS Code"

#### Scenario: Entire Screen selected
- **WHEN** "Entire Screen" is the active selection
- **THEN** the picker button displays "Entire Screen"

### Requirement: Picker disabled during recording
The source picker SHALL be disabled (non-interactive) while a recording is in progress, matching the existing behavior of `screenSelect.disabled = true` during recording.

#### Scenario: Recording starts with two windows selected
- **WHEN** the user starts a recording with 2 windows checked
- **THEN** the picker button becomes disabled and visually dimmed
- **AND** source selections cannot be changed until recording stops

### Requirement: Picker surfaces missing Screen Recording permission
When macOS Screen Recording permission is not granted, the source picker SHALL display an actionable message explaining that permission is required and where to grant it, instead of an empty source list. The renderer SHALL determine permission state via the main process (`systemPreferences.getMediaAccessStatus('screen')`, exposed as the `getScreenAccessStatus` IPC); an absence of any `screen:`/`window:` source is treated as a corroborating signal. When permission is granted, no such message is shown and sources list normally.

#### Scenario: Permission not granted
- **WHEN** the recording view's source picker is opened and `getScreenAccessStatus()` is not `granted` (and/or `getSources()` returns no screen/window sources)
- **THEN** the picker shows a message directing the user to enable Screen Recording for their terminal (or the packaged app) in System Settings → Privacy & Security → Screen Recording, then fully quit and reopen
- **AND** it does not present a silently-empty list

#### Scenario: Permission granted
- **WHEN** Screen Recording permission is granted
- **THEN** the picker lists the available screen and window sources with no permission message

