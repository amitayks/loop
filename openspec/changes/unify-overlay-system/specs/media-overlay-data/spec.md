## MODIFIED Requirements

### Requirement: Overlay persistence in project timeline
Overlay segments SHALL be stored in `project.timeline.overlays` as an array. Each overlay has a `trackIndex` from 0 to 3. The `normalizeProjectData` function SHALL normalize the overlays array, ensuring valid `trackIndex` (0-3), valid position fields for both landscape and reel modes, valid time fields, and preservation of `mediaType` (including `'window'`). Optional window metadata fields (`sourceName`, `sourceWidth`, `sourceHeight`) SHALL be preserved during normalization.

#### Scenario: Overlays loaded with 4-track support
- **WHEN** a project is loaded
- **THEN** overlays are normalized with `trackIndex` values 0-3 accepted as valid

#### Scenario: Window overlay metadata preserved on load
- **WHEN** a project with window overlays is loaded
- **THEN** the `sourceName`, `sourceWidth`, `sourceHeight`, and `mediaType: 'window'` fields are preserved

## REMOVED Requirements

### Requirement: Window capture persistence in project timeline
**Reason**: Window captures are now stored as standard overlays with `mediaType: 'window'`. The `windowCaptures` and `savedWindowCaptures` arrays are no longer used.
**Migration**: Greenfield — no migration. Old projects with `windowCaptures` data will not load window captures; users re-record.
