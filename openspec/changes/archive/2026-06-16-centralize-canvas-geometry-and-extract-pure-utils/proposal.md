## Why

Continuing the decomposition of `src/renderer/app.ts` (~7,750 lines). Change 1 centralized duplicated *behavioral* logic; this change targets the next two low-risk wins discovered by inventory:

1. **Geometry constants are triple-duplicated.** `app.ts:538-542` redeclares `MIN_REEL_CROP_X`, `MAX_REEL_CROP_X`, `DEFAULT_PIP_SCALE`, `MIN_PIP_SCALE`, `MAX_PIP_SCALE` byte-for-byte with `src/shared/types/domain.ts:18-22`; the canvas dimensions (`1920`/`1080`/reel math) live as loose `app.ts` consts and are also hardcoded across `src/main/services/*`. And `getContentWidth` exists twice — `app.ts:671` (constants bound) and `render-filter-service.ts:171` (parameterized) — the same algorithm in two layers.
2. **app.ts holds 16 verified-pure helper functions** (geometry, formatting, mode-state, PCM, window-overlay creation) that depend only on their arguments and constants. They are untested today and trapped in the god-file. Extracting them to `src/renderer/features/**` makes them unit-testable and shrinks `app.ts`, following the already-established `features/` pattern.

Doing both together is natural: the extracted geometry helpers need the constants, so we give the constants a single canonical home first.

## What Changes

- Add `src/shared/domain/canvas.ts` as the canonical home for canvas/PIP/reel geometry constants (`CANVAS_W`, `CANVAS_H`, `REEL_CANVAS_W`, `REEL_CANVAS_H`, `PIP_FRACTION`, `PIP_MARGIN`, `PIP_SIZE`, `MIN_SECTION_PAN`, `MAX_SECTION_PAN`) and re-export the existing pip/crop constants from `src/shared/types/domain.ts` so geometry has one import surface. Add the canonical parameterized `getContentWidth(sourceW, sourceH, fitMode, canvasW, canvasH)`.
- `render-filter-service.ts`: delete its local `getContentWidth`; import from `canvas.ts` and re-export it so `render-service.ts` / `thumbnail-service.ts` importers are unaffected.
- `app.ts`: delete its 13 local geometry constant declarations and import them from `canvas.ts`; delete the 16 pure functions and import them from new feature modules; update `getContentWidth`'s 7 call sites to the parameterized form (`…, CANVAS_W, CANVAS_H`).
- Extract 16 pure functions into focused, unit-tested feature modules:
  - `features/geometry/pip-geometry.ts` — `getSnapPointPosition`, `snapToNearest`, `computePipSize`
  - `features/geometry/section-geometry.ts` — `clampSectionPan`, `clampReelCropX`, `reelCropXToPixelOffset`
  - `features/keyframe/mode-state.ts` — `saveModeState`, `restoreModeState`, `getDefaultModeState` (+ `MODE_SPECIFIC_PROPS`)
  - `features/format/format-utils.ts` — `formatTime`, `formatProjectDate`, `hexToRgba`, `getVolumeSvg` (+ `VOL_SVG_*`)
  - `features/recording/pcm-utils.ts` — `mergeInt16Arrays`
  - `features/overlay/window-overlays.ts` — `createOverlaysFromWindowPaths`

Behavior-preserving. The only signature change is `getContentWidth` (renderer call sites pass the canvas dims explicitly, matching the already-canonical main form).

## Capabilities

### New Capabilities
- `shared-canvas-geometry`: Canonical canvas/PIP/reel geometry constants and the `getContentWidth` content-fit calculation live once in `src/shared/domain/canvas.ts`, consumed by both renderer and main. `app.ts` and `render-filter-service.ts` stop carrying their own copies.
- `renderer-pure-utilities`: The verified-pure helper functions are extracted from `app.ts` into testable `src/renderer/features/**` modules (pip/section geometry, keyframe mode-state, formatting, PCM merge, window-overlay creation), each with direct unit coverage.

### Modified Capabilities
<!-- None. Strictly behavior-preserving relocation/de-duplication; no requirement-level/user-facing behavior changes. The getContentWidth renderer signature change is an internal refactor — its computed result is unchanged. -->

## Impact

- **New files**: `src/shared/domain/canvas.ts`; `src/renderer/features/geometry/pip-geometry.ts`, `…/geometry/section-geometry.ts`, `…/keyframe/mode-state.ts`, `…/format/format-utils.ts`, `…/recording/pcm-utils.ts`, `…/overlay/window-overlays.ts`; matching `tests/unit/*.test.ts` for each.
- **Renderer**: `app.ts` loses 13 constant decls + 16 function bodies (net large reduction), gains imports; 7 `getContentWidth` call sites updated.
- **Main**: `render-filter-service.ts` imports+re-exports `getContentWidth` from shared (local def removed). `render-service.ts`/`thumbnail-service.ts` unchanged (re-export keeps their import path valid).
- **Shared**: new `canvas.ts`; `src/shared/types/domain.ts` unchanged (its constants are re-exported, not moved).
- **Tests**: new unit suites for all 6 feature modules + canvas geometry; existing `render-filter-service`, `render-service`, `thumbnail-service`, `project-domain`, and renderer-feature suites stay green.
- **Build/boundaries**: no tsconfig change — both main and renderer already reference `tsconfig.shared.json`.
- **Docs**: `docs/production/target-architecture.md` updated for `canvas.ts` and the new feature modules.
- **Deferred (explicitly out of scope)**: replacing main's remaining hardcoded `1920/1080`/reel literals in `render-service.ts`/`thumbnail-service.ts` with `canvas.ts` constants; extracting the `editorState`-coupled zoom helpers (`clampSectionZoom`, `getZoomCropBounds`, `resolveZoomCrop`, `panToFocusCoord`, `focusToPanCoord`, `getEffectiveCanvasDimensions`) — these wait for the Change 4 state container.
- **Risk**: low–moderate. Pure-function moves are unit-test-backed; the only cross-layer touch is `getContentWidth` (covered by render/thumbnail service tests). `getContentWidth` body equality between the two layers was verified before consolidation.
