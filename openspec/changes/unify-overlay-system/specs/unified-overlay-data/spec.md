## ADDED Requirements

### Requirement: Overlay mediaType includes window
The `Overlay` type SHALL support `mediaType: 'image' | 'video' | 'window'`. Window-type overlays represent recorded application window captures.

#### Scenario: Window overlay created from recording
- **WHEN** a take with `windowPaths` is converted to editor state
- **THEN** each window path produces an `Overlay` object with `mediaType: 'window'`

#### Scenario: Window overlay serialized in project
- **WHEN** a project containing window overlays is saved
- **THEN** the overlays array in `project.json` includes entries with `mediaType: 'window'`

### Requirement: Overlay window metadata fields
The `Overlay` type SHALL include optional fields for window metadata: `sourceName: string` (window title from OS), `sourceWidth: number` (original capture width in pixels), `sourceHeight: number` (original capture height in pixels). These fields SHALL be present only when `mediaType` is `'window'`.

#### Scenario: Window overlay has source metadata
- **WHEN** a window overlay is created from a recording
- **THEN** the overlay has `sourceName` set to the window title, `sourceWidth` and `sourceHeight` set to the original capture dimensions

#### Scenario: Media overlay has no window metadata
- **WHEN** a media overlay is created from user import
- **THEN** the overlay does not have `sourceName`, `sourceWidth`, or `sourceHeight` fields

### Requirement: Four overlay tracks
The system SHALL support 4 overlay tracks with `MAX_OVERLAY_TRACKS = 4`. Tracks 0-1 are designated for `mediaType: 'window'` overlays. Tracks 2-3 are designated for `mediaType: 'image'` or `'video'` overlays.

#### Scenario: Window overlay assigned to tracks 0-1
- **WHEN** window overlays are created from recording
- **THEN** they are assigned `trackIndex` 0 and 1 respectively

#### Scenario: Media overlay assigned to tracks 2-3
- **WHEN** a user imports a media overlay
- **THEN** it is assigned to track 2 or 3

#### Scenario: Track assignment enforced at creation
- **WHEN** an overlay is created
- **THEN** its `trackIndex` is within the valid range for its `mediaType`

### Requirement: WindowCapture types removed
The `WindowCapture`, `WindowCaptureSegment`, and `WindowCapturePosition` types SHALL NOT exist. All references to `editorState.windowCaptures`, `editorState.savedWindowCaptures`, `editorState.selectedWindowCaptureId`, and `editorState.selectedWindowSegmentId` SHALL be removed.

#### Scenario: No window capture types in codebase
- **WHEN** the types file is checked
- **THEN** it contains no `WindowCapture`, `WindowCaptureSegment`, or `WindowCapturePosition` type definitions

#### Scenario: No window capture state in editor
- **WHEN** the editor state type is checked
- **THEN** it contains no `windowCaptures`, `savedWindowCaptures`, `selectedWindowCaptureId`, or `selectedWindowSegmentId` fields

### Requirement: Overlay normalization handles window type
The `normalizeProjectData` function SHALL normalize window-type overlays the same as other overlays — ensuring `trackIndex`, position fields, and time fields are valid. The `sourceName`, `sourceWidth`, and `sourceHeight` fields SHALL be preserved as-is during normalization.

#### Scenario: Window overlay loaded from project
- **WHEN** a project with window overlays is opened
- **THEN** the overlays are normalized with valid positions, times, and preserved window metadata
