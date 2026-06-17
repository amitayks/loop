## Context

Post-keystone, `app.ts` section-editing functions reference state via `state.ts` and DOM via `elements.ts`. They are the most depended-upon helpers in the renderer (sibling modules back-import several from `app.js`). The pure section math already lives in `features/timeline/section-utils.ts` and `keyframe-ops.ts`. The renderer is esbuild-bundled; the renderer-health e2e gate exists.

## Goals / Non-Goals

**Goals:** move the stateful section/timeline editing cluster into one module; resolve the broad set of section back-imports across overlay/audio-overlay/transport/compositing.

**Non-Goals:** no behavior change; no body edits; the pure section math stays in `section-utils`; leave render/persistence/undo/drag/etc.

## Decisions

### D1 — Stateful section editing vs pure section math
Move the stateful, DOM/state-touching section functions. The pure functions (`normalizeSections`, `buildDefaultSectionsForDuration`, `roundMs`, `reindexSections`, `buildSplitAnchorKeyframe`) stay in `features/timeline/section-utils.ts`/`keyframe-ops.ts` and are imported.

### D2 — Consume state, elements, timeline-utils, siblings
Imports: state from `../../state.js`; DOM from `../dom/elements.js`; pure utils from `../timeline/section-utils.js`/`keyframe-ops.js`/`overlay-utils.js`; sibling entry points from `../overlay/overlay.js`, `../audio-overlay/audio-overlay.js`, `../editor/transport.js`, `../drawing/compositing.js`; remaining helpers (undo `snapshotTimeline`/`pushUndo`, persistence `scheduleProjectSave`) from `../../app.js`.

### D3 — Broad repoint of section back-imports
Many already-extracted modules import section helpers (`getSelectedSection`, `findSectionForTime`, `recalculateTimelinePositions`, `renderSectionMarkers`, `getSectionAnchorKeyframe`, …) from `../../app.js`. Grep `features/` for these and repoint every one to `../section/section-editing.js`. This is the largest single back-import resolution so far.

### D4 — Circular imports are fine in-bundle
`section-editing` ↔ `overlay`/`audio-overlay`/`transport`/`compositing` form cycles; esbuild resolves them in the bundle. The continuously-running editor exercises these at runtime, so the e2e gate is a strong proof.

### D5 — Typecheck-guided reconciliation; gate + typecheck as proof
Iterate `tsc --build` to 0 errors, then `lint --max-warnings=0` prunes unused imports across all touched files. Bodies unchanged → behavior preserved; the gate proves boot+runtime health.

## Risks / Trade-offs

- **[Largest cluster + broad repoint]** → typecheck guarantees completeness (every moved/used symbol resolved); the gate proves runtime; do it as one careful pass.
- **[Circular import cycles]** → esbuild-safe; the gate confirms.
- **[Remaining app.js back-imports for undo/persistence]** → expected; shrink as those domains extract.

## Migration Plan

Behavior-preserving; single implementer creates the module, moves the cluster, repoints sibling back-imports, reconciles imports, rewires `app.ts`; full `npm run build` + `npm run check`. Rollback = revert.

## Open Questions

- None blocking.
