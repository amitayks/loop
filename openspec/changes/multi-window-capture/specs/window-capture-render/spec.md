## ADDED Requirements

### Requirement: Window capture inputs in FFmpeg input plan
The render service's `buildInputPlan()` SHALL include window capture webm files as FFmpeg inputs. Each window capture file is added as a separate `-i` input, mapped to its track index for filter graph reference.

#### Scenario: Render with two window captures
- **WHEN** a render is triggered for a timeline with 2 window captures
- **THEN** `buildInputPlan()` includes both `win0.webm` and `win1.webm` as FFmpeg inputs
- **AND** each input is assigned a unique input index in the filter graph

#### Scenario: Render with one window capture plus camera
- **WHEN** a timeline has 1 window capture and a camera recording
- **THEN** `buildInputPlan()` includes the window file and camera file
- **AND** both are correctly indexed for the filter graph

#### Scenario: Render with no window captures (backward compat)
- **WHEN** a timeline has no window captures (traditional screen recording)
- **THEN** `buildInputPlan()` behaves exactly as before
- **AND** the screen file is the base layer input

### Requirement: Wallpaper as base layer in filter graph
When window captures are present, the FFmpeg filter graph SHALL use the macOS desktop wallpaper image as the base layer instead of the screen recording. The wallpaper SHALL be input with `-loop 1 -t {duration}` and scaled to the output resolution.

#### Scenario: Wallpaper available
- **WHEN** a wallpaper image path is stored in the project/take metadata
- **THEN** the FFmpeg filter graph starts with: wallpaper input → `scale={outW}:{outH}` → base layer
- **AND** window captures are overlaid on top of this base

#### Scenario: Wallpaper not available (fallback)
- **WHEN** no wallpaper path is stored (retrieval failed or non-macOS)
- **THEN** the FFmpeg filter graph uses `color=c=#1E1E1E:s={outW}x{outH}:d={duration}` as the base layer

#### Scenario: No window captures (traditional render)
- **WHEN** the timeline has no window captures
- **THEN** the wallpaper is NOT used as the base layer
- **AND** the screen recording is the base layer (existing behavior unchanged)

### Requirement: Window capture overlay filter generation
Each window capture segment SHALL generate FFmpeg overlay filter expressions with position, scale, enable window, and fade transitions. The filter pattern SHALL match the existing `buildOverlayFilter()` approach used for media overlays.

#### Scenario: Single segment full duration
- **WHEN** window track 0 has one segment from t=0 to t=30 at position (100, 50) with size (800, 450)
- **THEN** the filter graph includes:
  - Input trimmed to match section time range
  - Scaled to 800x450
  - Overlaid at position (100, 50)
  - Enabled for the full duration: `enable='between(t,0,30)'`
  - Fade-in at t=0 (0.3s) and fade-out at t=30 (0.3s)

#### Scenario: Two segments with position change
- **WHEN** window track 0 has segment A (t=0-10, full canvas) and segment B (t=10-20, left half)
- **THEN** the filter graph includes position interpolation expressions:
  - From t=0 to t=9.85: segment A position/size
  - From t=9.85 to t=10.15: easeInOut interpolation from A to B position/size
  - From t=10.15 to t=20: segment B position/size

#### Scenario: Segment with gap (hidden period)
- **WHEN** window track 0 has segment A (t=0-8) and segment B (t=12-20)
- **THEN** the overlay fades out at t=8 (0.3s fade)
- **AND** is not rendered between t=8 and t=12
- **AND** fades in at t=12 (0.3s fade)

### Requirement: Window capture filter ordering in chain
Window capture overlay filters SHALL be inserted into the filter chain AFTER the base layer (wallpaper) and BEFORE camera PIP and media overlay filters. Track 0 is overlaid first, then track 1.

#### Scenario: Full filter chain with all layers
- **WHEN** a render includes wallpaper, 2 windows, camera, and media overlays
- **THEN** the filter chain order is:
  1. Wallpaper base (scaled to output)
  2. Window track 0 overlay (with segments)
  3. Window track 1 overlay (with segments)
  4. Camera PIP overlay (existing `buildScreenFilter`/PIP logic)
  5. Media overlays (existing `buildOverlayFilter`)
  6. Audio mix (existing `buildAudioOverlayFilter`)

### Requirement: Window capture position expressions for landscape and reel
Window capture filter expressions SHALL use the position data for the current output mode (landscape or reel), matching the dual-mode pattern used by media overlays.

#### Scenario: Landscape mode render
- **WHEN** the output mode is "landscape"
- **THEN** window segment positions are read from `segment.landscape.{x,y,width,height}`
- **AND** scaled proportionally to the output resolution

#### Scenario: Reel mode render
- **WHEN** the output mode is "reel"
- **THEN** window segment positions are read from `segment.reel.{x,y,width,height}`
- **AND** scaled to the reel output dimensions (9:16 aspect)

### Requirement: Window capture aspect ratio preservation in render
FFmpeg scale filters for window captures SHALL preserve the source video aspect ratio, using `force_original_aspect_ratio=decrease` with padding if needed, or by computing correct dimensions from the source aspect ratio.

#### Scenario: Window capture scaled to target size
- **WHEN** a window segment specifies width=800, height=450, and the source is 1920x1080 (16:9)
- **THEN** the FFmpeg scale produces 800x450 output (aspect ratio matches)

#### Scenario: Aspect mismatch from user resize
- **WHEN** a window segment's width/height don't match the source aspect ratio (edge case from rounding)
- **THEN** the FFmpeg scale uses the segment's width and computes height from source aspect ratio to avoid distortion

### Requirement: FPS detection includes window capture files
The `probeVideoFpsWithFfmpeg()` function SHALL probe window capture files in addition to screen and camera files when determining the target render FPS.

#### Scenario: FPS from window captures
- **WHEN** a render is triggered and only window capture files exist (no screen file)
- **THEN** `probeVideoFpsWithFfmpeg()` probes the window capture files
- **AND** the detected FPS is used as the render target
