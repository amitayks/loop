## Context

`src/renderer/app.ts` is a 7,786-line god-file. Before it can be decomposed, the domain logic it duplicates must be consolidated, otherwise extraction just multiplies the copies. Five duplications were verified by reading source:

| # | Logic | Copy A | Copy B | Cross-layer? |
|---|-------|--------|--------|--------------|
| 1 | `generateOverlayId` / `generateAudioOverlayId` (+ counters) | `app.ts:467-477` | `shared/domain/project.ts:96-114` | renderer ⟷ shared |
| 2 | `easeInOut` curve | `app.ts:918` (JS) | `render-filter-service.ts:10` `easeExpr` (ffmpeg string) | renderer ⟷ main |
| 3 | section pad/merge/remap | `section-utils.ts:60` `buildRemappedSectionsFromSegments` | `sections-service.ts:3` `computeSections` | renderer ⟷ main |
| 4 | `roundMs` (`Number(x.toFixed(3))`) | `section-utils.ts:53` (named) | `sections-service.ts` (inlined ×4) | renderer ⟷ main |
| 5 | `normalizePipScale`, `normalizeExportAudioPreset` | `app.ts:554,761` | `shared/domain/project.ts:230,243` | renderer ⟷ shared |

Constraint (AGENTS.md): no duplicate business logic across renderer and main; shared normalization/domain logic belongs in `src/shared/`. Both `tsconfig.main.json` and `tsconfig.renderer.json` already reference `tsconfig.shared.json`, so `src/shared/domain/*` is importable by both layers with no build change.

## Goals / Non-Goals

**Goals:**
- One canonical implementation of each duplicated helper, living in `src/shared/domain`, imported by every consumer.
- Strictly behavior-preserving: every existing unit test stays green with assertions intact.
- Editor preview and ffmpeg render provably use the *same* easing curve (cross-tested).
- Net reduction of duplicated lines in `app.ts`, setting up later decomposition.

**Non-Goals:**
- No decomposition of `app.ts` structure beyond removing the five duplicated blocks (that is Change 2+).
- No change to user-facing behavior, section semantics, ID format, or render output.
- No new e2e/characterization tests (that is Change 3; this change is covered by unit tests on pure logic).
- Not unifying the *naming* inconsistency between `clamp*` (app.ts) and `normalize*` (shared) — deferred to Change 2 to keep this change tight.

## Decisions

### D1 — Easing: share the formula, not a single function

`easeInOut` is consumed two incompatible ways: as a JS number→number (renderer/keyframe interpolation) and as an ffmpeg expression string (render filter). They cannot be the *same* function, so the risk is silent divergence of the formula.

**Decision:** `src/shared/domain/easing.ts` exports both:
- `easeInOut(t: number): number` — `t < 0.5 ? 2*t*t : 1 - pow(-2*t+2, 2)/2`
- `easeInOutExpr(progressExpr: string): string` — returns `if(lt(<p>,0.5),2*<p>*<p>,1-pow(-2*<p>+2,2)/2)` given a progress sub-expression `<p>`.

`render-filter-service.ts`'s `easeExpr(timeVar, tStart)` keeps its current signature and call sites (lines 71,110,130,157) but builds the normalized progress `p = (timeVar - tStart)/TRANSITION_DURATION` and delegates the curve to `easeInOutExpr(p)`. The renderer's `easeInOut` becomes an import.

**Anti-divergence test:** sample `t ∈ {0, 0.1, …, 1.0}`, evaluate `easeInOut(t)` in JS, and evaluate the `easeInOutExpr` string with the same `t` substituted (a tiny arithmetic-expression evaluator over the limited grammar `+ - * / pow lt if`), assert equal within 1e-9. This makes future drift a test failure.

*Alternative considered:* keep both copies but add a comment. Rejected — that is the status quo that already drifted in intent.

### D2 — Section math: one algorithmic skeleton, policy via parameters

The renderer and main implementations share the skeleton (pad → drop-invalid → sort → merge → remap-to-cursor → round) but differ in **three policies** that MUST be preserved exactly:

| Policy | Renderer (`buildRemappedSectionsFromSegments`) | Main (`computeSections`) |
|--------|-----------------------------------------------|--------------------------|
| Padding | fixed `TRIM_PADDING = 0.15` | configurable `paddingSeconds`, default `0.15` |
| Per-segment end | `end = max(start, rawEnd + pad)` (clamp, never drop) | `end = rawEnd + pad`, then **drop** if `end <= start` |
| Merge predicate | `current.start <= last.end` (merge when touching) | `current.start < last.end` (merge only when overlapping) |
| Per-section extra fields | `transcript`, `takeId: null`, `volume: 1.0` | none |
| Transcript handling | accumulate + join + `normalizeTranscriptText` | n/a |
| Return value | `Section[]` | `{ sections, trimmedDuration }` |

**Decision:** `src/shared/domain/section-math.ts` exports a pure core:

```
interface SectionMathOptions {
  padding: number;
  emptyHandling: 'clamp' | 'drop';   // renderer = 'clamp', main = 'drop'
  mergeTouching: boolean;            // renderer = true (<=), main = false (<)
}
interface RawSegmentInput { start: number; end: number; }
interface MergedSegment { start: number; end: number; sourceIndices: number[]; }

// pad → filter non-finite → (clamp|drop) → sort → merge → return merged source-time segments
function buildMergedSegments(segments, options): MergedSegment[]

// remap merged segments onto a timeline cursor, rounding to ms, returning the base shape
interface BaseSection { id, index, sourceStart, sourceEnd, start, end, duration }
function remapToTimeline(merged): BaseSection[]

export const roundMs = (v: number) => Number(v.toFixed(3));
```

Each caller composes the core and decorates the result:
- **renderer** `buildRemappedSectionsFromSegments` → `buildMergedSegments(segs, {padding: TRIM_PADDING, emptyHandling:'clamp', mergeTouching:true})`, carrying transcripts alongside via `sourceIndices`, then `remapToTimeline`, then map each base section to add `transcript/takeId/volume`. Re-exports `roundMs` from section-math for backward compatibility (existing imports keep working).
- **main** `computeSections` → `buildMergedSegments(segs, {padding, emptyHandling:'drop', mergeTouching:false})` → `remapToTimeline` → wrap as `{ sections, trimmedDuration }`.

`sourceIndices` (which raw segments merged into each output) lets the renderer reattach transcripts without the core knowing about transcript text — the core stays domain-pure and transcript-agnostic.

*Alternative considered:* a single function with a giant options bag including a `mapMetadata` callback that returns transcript fields. Rejected — pushing transcript/`normalizeTranscriptText` knowledge (a renderer concern) into shared core leaks a renderer dependency into shared. The `sourceIndices` hand-back keeps the boundary clean.

*Alternative considered:* force both callers onto identical policy (e.g., make both use `<` and `drop`). Rejected — that is a behavior change; the existing tests encode the current policies and we must keep them green. Reconciling the policies is a *separate product decision*, out of scope.

### D3 — ID generation: delete renderer copies, import shared

`app.ts` local `generateOverlayId`/`generateAudioOverlayId` are byte-identical to shared except for owning a separate module counter. Delete both functions and both `let …Counter = 0` lines; import from `shared/domain/project.ts`; update the 9 call sites (514, 2790, 3049, 3155, 4826, 4853, 6590, 6671 + the definitions).

**Behavioral nuance (documented, not hidden):** the integer suffix sequence the renderer sees changes because it now advances the shared counter (which may already have advanced during project normalization). IDs remain globally unique (the `Date.now()` component plus a monotonically increasing counter) and keep the exact `overlay-<ts>-<n>` / `audio-overlay-<ts>-<n>` format. A proving test asserts format and uniqueness across many rapid calls.

### D4 — `roundMs`: single home in section-math

`roundMs` is logically part of section math. Move the canonical implementation to `section-math.ts`; `section-utils.ts` re-exports it (`export { roundMs } from '.../section-math.js'`) so the ~existing renderer imports are untouched; `sections-service.ts` imports it and replaces the four inlined `Number(x.toFixed(3))` sites.

### D5 — Normalizers: delete renderer copies, import shared

`normalizePipScale` and `normalizeExportAudioPreset` in `app.ts` are identical to shared. Delete the local definitions; import from `shared/domain/project.ts`. The shared `normalizeExportAudioPreset` returns the `ExportAudioPreset` union (narrower than the local `string`) — verify call sites accept it (they assign into settings typed as `ExportAudioPreset`, so this is strictly better typing, not a break). Leave the local `DEFAULT_PIP_SCALE`/`MIN/MAX_PIP_SCALE`/`EXPORT_AUDIO_PRESET_*` constants in place if still referenced elsewhere — consolidating those is Change 2.

## Risks / Trade-offs

- **[Section-math reconciliation breaks a caller]** → The two policies are captured as explicit parameters (`emptyHandling`, `mergeTouching`, `padding`); both `section-utils.test.ts` and `sections-service.test.ts` must stay green unchanged, and new direct tests pin the core. Implement section-math first, run both suites before touching anything else.
- **[Easing expr evaluator is itself buggy, giving false confidence]** → Keep the evaluator trivial (supports only the operators used) and add a self-check: evaluate a known expression (e.g. `easeInOutExpr('0.5')`) and assert it equals `easeInOut(0.5) = 0.5`.
- **[ID counter nuance surprises someone]** → Explicitly documented here and asserted by a format/uniqueness test; no requirement depends on suffix values.
- **[Hidden additional call sites]** → Before deleting any function, grep the whole repo for the symbol to confirm every consumer is updated; rely on `tsc --build` (strict, project refs) to catch missed references.
- **[Coverage]** → `src/shared/**` targets very high coverage (AGENTS.md). New modules ship with direct unit tests; vitest coverage `include` already covers `src/shared/domain/**`.

## Migration Plan

Behavior-preserving refactor; no data migration, no feature flag. Rollout is a normal PR gated by `npm run check`. Rollback = revert the commit. Suggested implementation order (mirrored in `tasks.md`): (1) `easing.ts` + test + wire both consumers; (2) `section-math.ts` + test, then route renderer, then main, running each caller's existing suite after; (3) ID-gen delete+import + proving test; (4) `roundMs` move; (5) normalizer delete+import; (6) full `npm run check` + docs.

## Open Questions

- None blocking. The `clamp*` vs `normalize*` naming unification and consolidating the duplicated PiP/audio-preset *constants* are deliberately deferred to Change 2.
