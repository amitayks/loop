## 1. Canonical canvas geometry module (shared-canvas-geometry)

- [x] 1.1 Add `tests/unit/canvas-geometry.test.ts`: assert `CANVAS_W===1920`, `CANVAS_H===1080`, `REEL_CANVAS_W===Math.round(1080*9/16)`, `REEL_CANVAS_H===1080`, `PIP_SIZE===Math.round(1920*PIP_FRACTION)`, `MIN_SECTION_PAN===-1`, `MAX_SECTION_PAN===1`, and that re-exported `MIN_REEL_CROP_X/MAX_REEL_CROP_X/MIN_PIP_SCALE/MAX_PIP_SCALE/DEFAULT_PIP_SCALE` equal the `domain.ts` values; plus `getContentWidth` fit (`sourceW*min(canvasW/sourceW,canvasH/sourceH)`) and non-fit/falsy (`returns canvasW`) cases.
- [x] 1.2 Create `src/shared/domain/canvas.ts`: define `CANVAS_W, CANVAS_H, REEL_CANVAS_W=Math.round(CANVAS_H*9/16), REEL_CANVAS_H=CANVAS_H, PIP_FRACTION=0.22, PIP_MARGIN=20, PIP_SIZE=Math.round(CANVAS_W*PIP_FRACTION), MIN_SECTION_PAN=-1, MAX_SECTION_PAN=1`; import+re-export `MIN_REEL_CROP_X, MAX_REEL_CROP_X, MIN_PIP_SCALE, MAX_PIP_SCALE, DEFAULT_PIP_SCALE` from `../types/domain.js`; export parameterized `getContentWidth(sourceW, sourceH, fitMode, canvasW, canvasH)`. One-way dependency only (canvas→domain, never reverse). Make 1.1 pass.

## 2. Consolidate getContentWidth in main (shared-canvas-geometry)

- [x] 2.1 `src/main/services/render-filter-service.ts`: delete the local `getContentWidth`; `import { getContentWidth } from '../../shared/domain/canvas.js'` and re-export it (`export { getContentWidth }`) so `render-service.ts`/`thumbnail-service.ts` imports stay valid. Run `npx vitest run tests/unit/render-filter-service.test.ts` — green, no assertion edits.

## 3. Extract pure feature modules (renderer-pure-utilities) — independent files

- [x] 3.1 Create `src/renderer/features/geometry/pip-geometry.ts` with `getSnapPointPosition`, `snapToNearest`, `computePipSize` (import `PIP_MARGIN, PIP_SIZE, CANVAS_W, CANVAS_H` from `../../../shared/domain/canvas.js`). Add `tests/unit/pip-geometry.test.ts` (computePipSize math; getSnapPointPosition per snap point; snapToNearest picks nearest + returns snapPoint). Run that test green.
- [x] 3.2 Create `src/renderer/features/geometry/section-geometry.ts` with `clampSectionPan`, `clampReelCropX`, `reelCropXToPixelOffset` (import `MIN_SECTION_PAN, MAX_SECTION_PAN, MIN_REEL_CROP_X, MAX_REEL_CROP_X, CANVAS_W, REEL_CANVAS_W` from canvas.js). Add `tests/unit/section-geometry.test.ts` (clamp below/within/above bounds; non-finite → default; reelCropXToPixelOffset math). Run green.
- [x] 3.3 Create `src/renderer/features/keyframe/mode-state.ts` with `MODE_SPECIFIC_PROPS`, `saveModeState`, `restoreModeState`, `getDefaultModeState` (import canvas/pip constants; types from `../../../shared/types/domain.js`). Preserve the mutate-passed-keyframe contract. Add `tests/unit/mode-state.test.ts` (save then restore round-trip; getDefaultModeState per mode). Run green.
- [x] 3.4 Create `src/renderer/features/format/format-utils.ts` with `formatTime`, `formatProjectDate`, `hexToRgba`, `getVolumeSvg` (+ `VOL_SVG_MUTE/LOW/HIGH` constants). Add `tests/unit/format-utils.test.ts` (formatTime samples incl. 0 and >1h if applicable; hexToRgba parsing; formatProjectDate on valid/invalid; getVolumeSvg thresholds). Run green.
- [x] 3.5 Create `src/renderer/features/recording/pcm-utils.ts` with `mergeInt16Arrays`. Add `tests/unit/pcm-utils.test.ts` (concatenation length + contents; empty input). Run green.
- [x] 3.6 Create `src/renderer/features/overlay/window-overlays.ts` with `createOverlaysFromWindowPaths` (import `CANVAS_W, CANVAS_H` from canvas.js; `generateOverlayId` from `../../../shared/domain/project.js`). Add `tests/unit/window-overlays.test.ts` (one Overlay per path; ids present; positions from constants; duration applied). Run green.

## 4. Rewire app.ts (single agent — sole contention point)

- [x] 4.1 In `app.ts`: delete the 13 local geometry constant declarations (`CANVAS_W, CANVAS_H, PIP_FRACTION, PIP_MARGIN, PIP_SIZE, MIN_SECTION_PAN, MAX_SECTION_PAN, REEL_CANVAS_W, REEL_CANVAS_H, MIN_REEL_CROP_X, MAX_REEL_CROP_X, DEFAULT_PIP_SCALE, MIN_PIP_SCALE, MAX_PIP_SCALE`); import them from `../shared/domain/canvas.js`. (Confirm none collide with a still-local same-named const; remove any now-stale `void` references.)
- [x] 4.2 In `app.ts`: delete the 16 pure function definitions and import them from their new feature modules (`getSnapPointPosition, snapToNearest, computePipSize` from geometry/pip-geometry; `clampSectionPan, clampReelCropX, reelCropXToPixelOffset` from geometry/section-geometry; `saveModeState, restoreModeState, getDefaultModeState` from keyframe/mode-state; `formatTime, formatProjectDate, hexToRgba, getVolumeSvg` from format/format-utils; `mergeInt16Arrays` from recording/pcm-utils; `createOverlaysFromWindowPaths` from overlay/window-overlays). Leave the (deferred) editorState-coupled functions untouched. Remove any now-stale `void` suppression lines for deleted symbols.
- [x] 4.3 In `app.ts`: update the 7 `getContentWidth(...)` call sites to the parameterized form `getContentWidth(sourceW, sourceH, fitMode, CANVAS_W, CANVAS_H)`, importing `getContentWidth` from `../shared/domain/canvas.js`.

## 5. Verification & docs

- [x] 5.1 Residual grep: confirm `app.ts` no longer defines any of the 16 functions or the 13 constants, and that `render-filter-service.ts` has no local `function getContentWidth`. Record stragglers.
- [x] 5.2 `npm run typecheck` and `npm run lint` (`--max-warnings=0`); fix unresolved refs / unused imports only.
- [x] 5.3 `npm run test`: new suites (canvas-geometry, pip-geometry, section-geometry, mode-state, format-utils, pcm-utils, window-overlays) pass; existing render-filter-service/render-service/thumbnail-service/project-domain and all renderer-feature suites stay green with assertions intact.
- [x] 5.4 Full `npm run check` — PASSED: lint+typecheck clean, 33 files/448 tests, e2e smoke ok, packaging smoke succeeded; canvas.ts 100% coverage.
- [x] 5.5 Update `docs/production/target-architecture.md`: record `src/shared/domain/canvas.ts` as the canonical geometry-constants + `getContentWidth` home, and list the 6 new renderer feature modules.

## 6. Hand-off

- [x] 6.1 Hand-off: behavior preserved (getContentWidth renderer signature now parameterized + 6 `as ScreenFitMode` casts at call sites, runtime-identical since it only branches on !=='fit'); app.ts -287 lines; 7 new modules (canvas + 6 features) each unit-tested; existing render/thumbnail/project suites green; full `npm run check` green. Deferred: main 1920/1080 literals; editorState-coupled zoom -> Change 4.
