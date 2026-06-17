## MODIFIED Requirements

### Requirement: Per-section volume in FFmpeg filter chain
When sections have `volume` values other than 1.0, the FFmpeg audio filter chain SHALL apply a `volume` filter to each section's audio before concatenation. When `screenIdx < 0` (no screen recording for this section, e.g., window-only captures using wallpaper base), the system SHALL locate the take's audio source file (screen recording or camera recording, whichever exists) and extract audio from it using `atrim`/`asetpts`. The system SHALL only generate silent audio (`anullsrc`) when no audio source file exists for the take at all. The invalid fallback branch that references `[-1:v]` and `[-1:a]` SHALL be replaced with proper handling.

#### Scenario: All sections at default volume
- **WHEN** all sections have `volume: 1.0` (or no volume field)
- **THEN** no `volume` filter is added — the audio pipeline is identical to the current behavior

#### Scenario: One section at half volume
- **WHEN** section 0 has `volume: 0.5` and section 1 has `volume: 1.0`
- **THEN** section 0's audio chain includes `volume=0.5` after `asetpts`, section 1's chain does not

#### Scenario: Section at zero volume
- **WHEN** a section has `volume: 0`
- **THEN** the section's audio chain includes `volume=0` (effectively muted)

#### Scenario: Wallpaper-based section with screen recording audio
- **WHEN** a section has `screenIdx < 0` (using wallpaper base for video) but the take has a screen recording file with audio
- **THEN** the audio is extracted from the screen recording file using `atrim=start={sourceStart}:end={sourceEnd}` instead of generating `anullsrc`

#### Scenario: Wallpaper-based section with camera-only audio
- **WHEN** a section has `screenIdx < 0` and no screen recording exists, but the take has a camera recording file
- **THEN** the audio is extracted from the camera recording file (with appropriate sync offset applied)

#### Scenario: Wallpaper-based section with no audio source
- **WHEN** a section has `screenIdx < 0` and the take has neither screen recording nor camera recording with audio
- **THEN** silent audio (`anullsrc=r=48000:cl=stereo`) is generated for that section's duration

#### Scenario: Invalid screenIdx fallback eliminated
- **WHEN** `screenIdx < 0` and `wallpaperIdx < 0` (should not happen in normal operation)
- **THEN** the system SHALL generate silent audio and a blank video frame instead of referencing `[-1:v]` or `[-1:a]`
