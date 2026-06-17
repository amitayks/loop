## MODIFIED Requirements

### Requirement: Unified delete works for all overlay types
Pressing Delete/Backspace with an overlay selected SHALL delete only that selected overlay (independent delete — no cascade, no timeline remapping). When NO overlay is selected, Delete/Backspace SHALL delete the selected section with full cascade (overlay remapping). `Cmd+Delete` SHALL find the section at the playhead and delete it with full cascade. The priority order SHALL be: selected overlay (any type) → selected audio overlay → section (with cascade).

#### Scenario: Delete window overlay with keyboard (independent)
- **WHEN** a window overlay is selected on the timeline and the user presses Delete
- **THEN** only that overlay is removed from the overlays array; no other overlays are remapped; timeline duration is unchanged

#### Scenario: Delete with no overlay selected cascades to section
- **WHEN** no overlay or audio overlay is selected and the user presses Delete
- **THEN** the selected section is deleted with full cascade: overlays within the section range are deleted, partially overlapping overlays are trimmed, overlays after the gap are time-shifted

#### Scenario: Cmd+Delete always targets section
- **WHEN** the user presses Cmd+Delete (regardless of overlay selection)
- **THEN** the section at the playhead is found and deleted with full cascade
