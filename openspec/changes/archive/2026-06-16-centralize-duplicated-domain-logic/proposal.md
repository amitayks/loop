## Why

The renderer god-file `src/renderer/app.ts` (7,786 lines) re-implements domain logic that already exists — or should exist — once, in `src/shared`. Five concrete duplications were verified by reading the code: overlay/audio-overlay ID generation, the `easeInOut` curve, the section pad/merge/remap algorithm, `roundMs`, and two normalizers (`normalizePipScale`, `normalizeExportAudioPreset`). Two of these (`easeInOut`, section math) are duplicated **across the renderer/main boundary**, which AGENTS.md explicitly forbids ("Do not introduce duplicate business logic across renderer and main. Shared normalization/domain logic belongs in `src/shared/`"). Duplicated logic is a divergence hazard: the editor preview and the ffmpeg render can drift apart, and a rule change must be made in two places or silently breaks. This is the first, lowest-risk step of decomposing `app.ts`, and it directly addresses the maintainer's "duplicate functions across all / inconsistency" complaint.

## What Changes

- Create `src/shared/domain/easing.ts` exporting a canonical `easeInOut(t)` (JS evaluation) **and** `easeInOutExpr(progressExpr)` (ffmpeg-expression builder). The renderer consumes the JS function; `render-filter-service.ts` consumes the expression builder. A unit test asserts the two agree at sampled points so they can never silently diverge.
- Create `src/shared/domain/section-math.ts` with the canonical pad → drop-invalid → sort → merge-overlapping → remap-to-timeline-cursor algorithm, parameterized by padding, empty-segment handling, and an optional per-segment metadata mapper. Both `src/renderer/features/timeline/section-utils.ts` (`buildRemappedSectionsFromSegments`) and `src/main/services/sections-service.ts` (`computeSections`) delegate to it while preserving their exact existing public outputs.
- Move `roundMs` to `src/shared/domain/section-math.ts` (single canonical implementation); `section-utils.ts` re-exports it for backward compatibility and `sections-service.ts` stops inlining `Number(x.toFixed(3))`.
- Delete the local `generateOverlayId` / `generateAudioOverlayId` and their module counters from `app.ts:467-477`; import the existing canonical functions from `src/shared/domain/project.ts`. Update all 9 call sites.
- Delete the local `normalizePipScale` (`app.ts:554`) and `normalizeExportAudioPreset` (`app.ts:761`); import the identical functions already exported from `src/shared/domain/project.ts`. Update call sites.
- Net effect on `app.ts`: ~40 lines of duplicated logic removed and replaced by imports — no behavior change.

Behavior is preserved. The only observable nuance: renderer-generated overlay IDs now share the shared module's counter, so the integer suffix sequence differs — but IDs remain unique and keep the exact `overlay-<timestamp>-<n>` / `audio-overlay-<timestamp>-<n>` format. This is asserted by a proving test.

## Capabilities

### New Capabilities
- `shared-easing`: A single canonical easing curve lives in `src/shared/domain/easing.ts`, providing both a JS evaluator (renderer preview / keyframe interpolation) and an ffmpeg-expression generator (render pipeline), cross-verified by test so editor preview and exported video always use the same curve.
- `shared-section-math`: A single canonical section algorithm (pad, drop-invalid, sort, merge-overlapping, remap onto a timeline cursor, round to ms) lives in `src/shared/domain/section-math.ts` and is consumed by both the renderer section builder and the main-process sections service, parameterized so each caller's existing observable output is preserved.
- `shared-domain-canonicalization`: Duplicated domain helpers — overlay/audio-overlay ID generation, PiP-scale normalization, export-audio-preset normalization, and millisecond rounding — have exactly one canonical implementation in `src/shared`, imported by both renderer and main. No second copy exists in `app.ts`.

### Modified Capabilities
<!-- None. This change is strictly behavior-preserving at the requirement level; it relocates and de-duplicates implementations without changing user-facing behavior or spec-level contracts. The ID-counter sequence nuance does not change any requirement (IDs remain unique and same-format). -->

## Impact

- **New files**: `src/shared/domain/easing.ts`, `src/shared/domain/section-math.ts`, plus tests `tests/unit/easing.test.ts`, `tests/unit/section-math.test.ts`.
- **Renderer**: `src/renderer/app.ts` — delete duplicated `generateOverlayId`/`generateAudioOverlayId` (+ counters), `normalizePipScale`, `normalizeExportAudioPreset`; add imports from `src/shared/domain/*`; update call sites. `src/renderer/features/timeline/section-utils.ts` — `buildRemappedSectionsFromSegments` and `roundMs` delegate to `section-math.ts`.
- **Main**: `src/main/services/render-filter-service.ts` — `easeExpr` delegates to `easeInOutExpr`. `src/main/services/sections-service.ts` — `computeSections` delegates to `section-math.ts`; stop inlining ms rounding.
- **Shared**: `src/shared/domain/project.ts` — already exports `generateOverlayId`, `generateAudioOverlayId`, `normalizePipScale`, `normalizeExportAudioPreset`; becomes the single source of truth (no code change expected beyond confirming exports).
- **Tests**: existing `tests/unit/section-utils.test.ts`, `tests/unit/sections-service.test.ts`, `tests/unit/project-domain.test.ts`, `tests/unit/render-filter-service.test.ts`, `tests/unit/overlay-utils.test.ts` MUST stay green; add new tests for the new shared modules; add a proving test for ID format/uniqueness after centralization.
- **Build/boundaries**: no tsconfig change required — `tsconfig.main.json` and `tsconfig.renderer.json` already reference `tsconfig.shared.json`, so both layers may import `src/shared/domain/*`.
- **Docs**: update `docs/production/target-architecture.md` to record that easing and section math are now shared-domain canonical modules.
- **Risk**: low. Pure-logic relocation backed by existing + new unit tests. The one area needing care is reconciling the renderer-vs-main section-math differences (configurable vs fixed padding, empty-segment handling, transcript attachment) — addressed in `design.md`.
