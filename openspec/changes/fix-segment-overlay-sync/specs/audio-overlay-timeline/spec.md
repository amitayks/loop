## MODIFIED Requirements

### Requirement: Audio overlay delete
When an audio overlay segment is selected and the user triggers delete (without Cmd), the segment SHALL be removed from the audioOverlays array (independent delete — no cascade, no timeline remapping). The associated media file SHALL be staged for deletion only if no other audio overlay segments reference the same `mediaPath`. Undo SHALL restore the deleted segment. When a section is deleted (via Delete with section selected or Cmd+Delete), audio overlays are remapped automatically as part of the section delete cascade (see `segment-overlay-sync` spec).

#### Scenario: Delete audio overlay with unique media (independent)
- **WHEN** the only audio overlay referencing `audio-overlay-media/music.mp3` is selected and the user presses Delete
- **THEN** the segment is removed and `music.mp3` is staged to `.deleted/`; no other overlays or sections are affected

#### Scenario: Delete audio overlay with shared media (independent)
- **WHEN** an audio overlay referencing `audio-overlay-media/music.mp3` is selected and deleted, but another audio overlay also references it
- **THEN** the segment is removed but `music.mp3` is NOT staged (still referenced)

#### Scenario: Undo audio overlay delete
- **WHEN** an audio overlay delete is undone
- **THEN** the segment is restored and the media file is unstaged from `.deleted/` if it was staged

#### Scenario: Section delete cascades to audio overlays
- **WHEN** a section spanning 20-40s is deleted and an audio overlay spans 25-35s
- **THEN** the audio overlay is automatically removed as part of the section delete cascade (fully within section range)
