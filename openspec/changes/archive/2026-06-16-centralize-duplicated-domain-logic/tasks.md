## 1. Easing — canonical shared module (D1, shared-easing)

- [x] 1.1 Add failing unit test `tests/unit/easing.test.ts`: assert `easeInOut(0)=0`, `easeInOut(0.5)=0.5`, `easeInOut(1)=1`, monotonic non-decreasing over sampled `t`; and a tiny arithmetic evaluator that parses the `easeInOutExpr(p)` string grammar (`+ - * / pow lt if`) and asserts it equals `easeInOut(t)` within `1e-9` for `t ∈ {0,0.1,…,1.0}`; plus a self-check that the evaluator itself returns `0.5` for `easeInOutExpr('0.5')`.
- [x] 1.2 Create `src/shared/domain/easing.ts` exporting `easeInOut(t: number): number` and `easeInOutExpr(progressExpr: string): string` (named exports, `.js`-style relative imports if any, pure). Make 1.1 pass.
- [x] 1.3 Refactor `src/main/services/render-filter-service.ts`: keep `easeExpr(timeVar, tStart)` signature and its 4 call sites (lines ~71,110,130,157) unchanged externally, but compute progress `p = (timeVar - tStart)/TRANSITION_DURATION` and delegate the curve to `easeInOutExpr(p)`; remove the inlined polynomial. Keep `tests/unit/render-filter-service.test.ts` green.
- [x] 1.4 Replace the renderer's local `easeInOut` (`app.ts:918`) with `import { easeInOut } from '../shared/domain/easing.js'`; delete the local definition; verify the `void`/unused-suppression list and all call sites still resolve.

## 2. Section math — canonical shared core (D2/D4, shared-section-math)

- [x] 2.1 Add failing unit test `tests/unit/section-math.test.ts` covering the core: padding+remap of non-overlapping segments; overlap merge with `sourceIndices` recorded; `emptyHandling: 'drop'` vs `'clamp'` for `end<=start`; `mergeTouching: true` vs `false` for exactly-touching segments; `roundMs(1.23456)===1.235`.
- [x] 2.2 Create `src/shared/domain/section-math.ts`: export `roundMs`, the `buildMergedSegments(segments, {padding, emptyHandling, mergeTouching})` core returning merged source-time segments with `sourceIndices`, and `remapToTimeline(merged)` producing base sections `{id,index,sourceStart,sourceEnd,start,end,duration}` (ms-rounded). Pure, transcript-agnostic. Make 2.1 pass.
- [x] 2.3 Route renderer: reimplement `buildRemappedSectionsFromSegments` in `src/renderer/features/timeline/section-utils.ts` on top of the core with `{padding: TRIM_PADDING, emptyHandling:'clamp', mergeTouching:true}`, reattaching `transcript` (join + `normalizeTranscriptText`) via `sourceIndices` and adding `takeId:null`, `volume:1.0`. Change `section-utils.ts` to `export { roundMs } from '.../section-math.js'` (drop its local definition). Run `tests/unit/section-utils.test.ts` — MUST stay green with no assertion edits.
- [x] 2.4 Route main: reimplement `computeSections` in `src/main/services/sections-service.ts` on top of the core with `{padding: paddingSeconds, emptyHandling:'drop', mergeTouching:false}`, importing `roundMs` from shared and removing the 4 inlined `Number(x.toFixed(3))` sites, returning `{sections, trimmedDuration}`. Run `tests/unit/sections-service.test.ts` — MUST stay green with no assertion edits.

## 3. ID generation — delete renderer copies, import shared (D3, shared-domain-canonicalization)

- [x] 3.1 Add proving test (`tests/unit/id-generation.test.ts`): assert `generateOverlayId()` matches `/^overlay-\d+-\d+$/`, `generateAudioOverlayId()` matches `/^audio-overlay-\d+-\d+$/`, and that 1000 rapid calls each are unique.
- [x] 3.2 In `app.ts`, delete local `generateOverlayId`/`generateAudioOverlayId` (467-477) and the `overlayIdCounter`/`audioOverlayIdCounter` `let`s; add `import { generateOverlayId, generateAudioOverlayId } from '../shared/domain/project.js'`; update all 9 call sites (514, 2790, 3049, 3155, 4826, 4853, 6590, 6671). Remove any now-stale `void`/unused references.

## 4. Normalizers — delete renderer copies, import shared (D5, shared-domain-canonicalization)

- [x] 4.1 In `app.ts`, delete local `normalizePipScale` (554) and `normalizeExportAudioPreset` (761); import both from `../shared/domain/project.js`; update call sites. Confirm `normalizeExportAudioPreset` returning the `ExportAudioPreset` union typechecks at every assignment.

## 5. Verification & cleanup

- [x] 5.1 Repo-wide grep to confirm no second definition remains for any consolidated symbol (`function easeInOut`, `function generateOverlayId`, `function generateAudioOverlayId`, `function normalizePipScale`, `function normalizeExportAudioPreset`, inlined `.toFixed(3)` in `sections-service.ts`) outside the canonical shared modules. — clean, residualDuplicates=[].
- [x] 5.2 Run `npm run typecheck` and `npm run lint` (`--max-warnings=0`); fix any unresolved references / unused-import warnings. — passed, no fixes needed.
- [x] 5.3 Run `npm run test` suites; confirm new suites pass and `section-utils`, `sections-service`, `project-domain`, `render-filter-service`, `overlay-utils` suites stay green with assertions intact. — 8 files / 165 tests passed.
- [x] 5.4 Run full `npm run check` (lint → typecheck → test → e2e smoke → package smoke); confirm green. — PASSED: lint+typecheck clean, 26 files/364 tests, e2e smoke ok, packaging smoke succeeded; easing.ts & section-math.ts at 100% coverage.
- [x] 5.5 Update `docs/production/target-architecture.md`: record `easing.ts` and `section-math.ts` as shared-domain canonical modules and that renderer/main now delegate to them.

## 6. Hand-off

- [x] 6.1 Hand-off: **Behavior changed** — none user-facing (duplicated logic relocated to `src/shared/domain`; only nuance is renderer overlay-ID integer suffix now shares the shared counter, IDs remain unique + same `overlay-<ts>-<n>` format, proven by `id-generation.test.ts`). **Tests added** — `easing.test.ts` (curve + JS/ffmpeg-expr cross-eval to 1e-9), `section-math.test.ts` (pad/merge/remap + policy params), `id-generation.test.ts` (format + 1000-call uniqueness); existing `section-utils`/`sections-service`/`render-filter-service`/`project-domain`/`overlay-utils` suites kept green with no assertion edits. **Commands run** — `npm run check` (lint, typecheck, `vitest run --coverage` 26 files/364 tests, e2e smoke, package smoke) all green; `easing.ts` & `section-math.ts` at 100% coverage. **Residual risk** — none material; deferred to Change 2: `clamp*`↔`normalize*` naming unification and consolidating duplicated PiP/audio-preset constants.
