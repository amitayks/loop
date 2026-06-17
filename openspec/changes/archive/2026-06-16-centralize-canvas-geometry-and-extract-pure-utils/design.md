## Context

`app.ts` inventory found 16 functions that are pure with respect to module state (depend only on arguments + module constants; no reads/writes of the ~93 mutable globals, no DOM, no IPC). They are currently untested and embedded in the god-file. Their supporting constants are duplicated:

- `app.ts:538-542` exactly duplicates `MIN_REEL_CROP_X`, `MAX_REEL_CROP_X`, `DEFAULT_PIP_SCALE`, `MIN_PIP_SCALE`, `MAX_PIP_SCALE` from `src/shared/types/domain.ts:18-22`.
- Canvas dims (`CANVAS_W=1920`, `CANVAS_H=1080`, derived `REEL_CANVAS_W`, `PIP_SIZE`, etc.) are loose `app.ts` consts, with the same magic numbers hardcoded across `src/main/services/*`.
- `getContentWidth` is implemented in both `app.ts` (constants bound) and `render-filter-service.ts` (parameterized) — same algorithm, verified identical.

Both main and renderer already reference `tsconfig.shared.json`, so a new `src/shared/domain/canvas.ts` is importable by both with no build change. This change continues the Change-1 pattern (canonical logic in `src/shared`, pure helpers in `src/renderer/features`).

## Goals / Non-Goals

**Goals:**
- One canonical home for canvas/PIP/reel geometry constants and `getContentWidth`.
- Remove the 16 pure functions from `app.ts` into testable feature modules with direct unit coverage.
- Strictly behavior-preserving; existing suites stay green.

**Non-Goals:**
- Not replacing main's other hardcoded `1920/1080`/reel literals (deferred — large, comment-heavy, render-correctness-sensitive).
- Not touching the `editorState`-coupled zoom helpers — they need the Change 4 state container.
- No new e2e (pure-logic change covered by unit tests).
- Not unifying constant *names* beyond what's needed (keep existing names to avoid call-site churn).

## Decisions

### D1 — `getContentWidth`: adopt the parameterized signature as canonical
The two bodies are identical apart from where canvas dims come from. The main signature `getContentWidth(sourceW, sourceH, fitMode, canvasW, canvasH)` is strictly more general than the renderer's 3-arg form.

**Decision:** put the parameterized version in `canvas.ts`. `render-filter-service.ts` imports it and re-exports it (so `render-service.ts`/`thumbnail-service.ts`, which import `getContentWidth` from `render-filter-service`, are untouched). The renderer's 7 call sites change from `getContentWidth(w, h, fit)` to `getContentWidth(w, h, fit, CANVAS_W, CANVAS_H)`.

*Alternative considered:* keep a renderer-bound 3-arg wrapper. Rejected — a thin wrapper that only binds constants is precisely the duplication smell Change 1 removed; explicit call sites are clearer and there are only 7.

### D2 — `canvas.ts` re-exports domain.ts constants rather than moving them
`MIN_REEL_CROP_X`, `MAX_REEL_CROP_X`, `MIN_PIP_SCALE`, `MAX_PIP_SCALE`, `DEFAULT_PIP_SCALE` already live in `src/shared/types/domain.ts` and have existing importers (e.g. `project.ts`).

**Decision:** keep them defined in `domain.ts`; `canvas.ts` imports and re-exports them alongside the new dimension constants, giving geometry consumers a single import surface (`from '.../canvas.js'`) without disturbing `domain.ts`'s current exporters. New constants (`CANVAS_W`, `CANVAS_H`, `REEL_CANVAS_W`, `REEL_CANVAS_H`, `PIP_FRACTION`, `PIP_MARGIN`, `PIP_SIZE`, `MIN_SECTION_PAN`, `MAX_SECTION_PAN`) are defined in `canvas.ts`. `app.ts` deletes its local copies and imports from `canvas.ts`.

*Alternative considered:* move the crop/pip constants from `domain.ts` into `canvas.ts`. Rejected — needless churn to `domain.ts`'s importers for no behavior gain; re-export is non-breaking.

### D3 — Module grouping: cohesion over one-function files
Group the 16 functions into 6 modules by domain, not 1 module per function:
- `geometry/pip-geometry.ts` (PIP snap/size), `geometry/section-geometry.ts` (pan/crop clamps + reel offset), `keyframe/mode-state.ts` (mode save/restore/defaults + `MODE_SPECIFIC_PROPS`), `format/format-utils.ts` (time/date/color/volume-icon), `recording/pcm-utils.ts` (`mergeInt16Arrays`), `overlay/window-overlays.ts` (`createOverlaysFromWindowPaths`).

Rationale: matches existing `features/<category>/<name>.ts` precedent; keeps related helpers (and their constants) together; each module is independently testable.

### D4 — Renderer-only placement for the 16 functions
The 16 functions are renderer concerns (UI geometry/formatting/recording). Per AGENTS.md, `src/shared` is for cross-layer logic — these go to `src/renderer/features/**`. Only the geometry *constants* and `getContentWidth` (genuinely shared with main) go to `src/shared/domain/canvas.ts`. If a feature helper later proves needed by main, it can be promoted then.

### D5 — Mutating helpers stay mutating
`saveModeState`/`restoreModeState` mutate their passed `Keyframe` argument (no global writes). Preserve that contract exactly — they are "pure with respect to module state," not value-pure. Tests assert the passed object is mutated as before; call sites are unchanged.

## Risks / Trade-offs

- **[getContentWidth consolidation changes render output]** → Bodies verified byte-equivalent; renderer call sites pass the same `CANVAS_W/CANVAS_H` the local version used; `render-filter-service`/`render-service`/`thumbnail-service` suites must stay green. Re-export keeps main import paths stable.
- **[A "pure" function had a hidden global dependency]** → Inventory verified none; the safety net is each new unit test plus `tsc --build` (strict) catching any unresolved reference if a constant/global was actually needed.
- **[Constant import cycle]** `canvas.ts` → imports from `domain.ts` (types/constants); `domain.ts` must not import `canvas.ts`. Keep the dependency one-way (canvas depends on domain, never the reverse).
- **[app.ts call-site breakage]** → Only `getContentWidth` call sites change; all other extracted functions keep identical names/signatures, so their call sites are untouched. Single agent owns all `app.ts` edits to avoid conflicts.
- **[Coverage]** New pure modules ship with unit tests (happy path + edge cases: null/out-of-range/clamp boundaries, fit vs non-fit, snap-point selection, mode round-trip).

## Migration Plan

Behavior-preserving; no data migration, no flag. Implementation order (mirrored in tasks.md): (1) `canvas.ts` + test; (2) wire `render-filter-service` re-export, keep its suite green; (3) create the 6 feature modules + tests (independent files, parallelizable); (4) single agent edits `app.ts` (delete consts+functions, add imports, update `getContentWidth` call sites); (5) full `npm run check` + docs. Rollback = revert the commit.

## Open Questions

- None blocking. Deferred items (main literal de-dup; editorState-coupled zoom extraction) are tracked for later changes.
