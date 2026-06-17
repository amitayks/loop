# renderer-pure-utilities Specification

## Purpose
TBD - created by archiving change centralize-canvas-geometry-and-extract-pure-utils. Update Purpose after archive.
## Requirements
### Requirement: Pure geometry helpers extracted to feature modules

The verified-pure PIP and section geometry helpers SHALL be defined in `src/renderer/features/geometry/**`, not in `app.ts`: `getSnapPointPosition`, `snapToNearest`, `computePipSize` in `pip-geometry.ts`; `clampSectionPan`, `clampReelCropX`, `reelCropXToPixelOffset` in `section-geometry.ts`. They SHALL be pure (arguments + imported `canvas.ts` constants only) and `app.ts` SHALL import them. Each SHALL have direct unit tests.

#### Scenario: Clamp helpers respect bounds
- **WHEN** `clampSectionPan` / `clampReelCropX` receive values below, within, and above their min/max
- **THEN** out-of-range inputs clamp to the bound and in-range inputs pass through unchanged (matching prior `app.ts` behavior)

#### Scenario: PIP snap selects the nearest snap point
- **WHEN** `snapToNearest` is given a cursor position
- **THEN** it returns the position and `snapPoint` of the nearest snap target, using `getSnapPointPosition` and the canvas/PIP constants

#### Scenario: app.ts delegates, not redefines
- **WHEN** the renderer needs any of these geometry helpers
- **THEN** it imports them from the feature module and `app.ts` contains no local definition

### Requirement: Pure keyframe mode-state helpers extracted

`saveModeState`, `restoreModeState`, `getDefaultModeState` and the `MODE_SPECIFIC_PROPS` constant SHALL live in `src/renderer/features/keyframe/mode-state.ts`. `saveModeState`/`restoreModeState` SHALL preserve their existing contract of mutating the passed `Keyframe` argument (and SHALL NOT read or write module globals). `app.ts` SHALL import them.

#### Scenario: Mode state round-trips through a keyframe
- **WHEN** `saveModeState(kf, mode)` then `restoreModeState(kf, otherMode, defaults)` are applied
- **THEN** the per-mode properties are stored on and restored from the keyframe exactly as before, with no global state involved

### Requirement: Pure formatting, PCM, and window-overlay helpers extracted

`formatTime`, `formatProjectDate`, `hexToRgba`, `getVolumeSvg` (+ its `VOL_SVG_*` constants) SHALL live in `src/renderer/features/format/format-utils.ts`; `mergeInt16Arrays` in `src/renderer/features/recording/pcm-utils.ts`; `createOverlaysFromWindowPaths` in `src/renderer/features/overlay/window-overlays.ts` (using `generateOverlayId` from `shared/domain/project.js` and `CANVAS_W`/`CANVAS_H` from `canvas.js`). All SHALL be pure with respect to module state and imported by `app.ts`. Each module SHALL have unit tests.

#### Scenario: Formatting is deterministic
- **WHEN** `formatTime(seconds)` / `hexToRgba(hex, alpha)` are called
- **THEN** they return the same formatted strings the prior `app.ts` implementations produced

#### Scenario: PCM merge concatenates samples
- **WHEN** `mergeInt16Arrays([a, b])` is called
- **THEN** it returns a single `Int16Array` containing `a` followed by `b`, with total length `a.length + b.length`

#### Scenario: Window overlays built from paths
- **WHEN** `createOverlaysFromWindowPaths(paths, duration)` is called
- **THEN** it returns one `Overlay` per path with ids from the shared generator and positions derived from the canvas constants, matching prior behavior

