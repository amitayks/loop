## Context

These 8 functions were deferred from Change 2 because they read `editorState` (not pure). Post-state-container they extract cleanly. `compositing` and `section-editing` currently back-import `clampSectionZoom`/`resolveZoomCrop`/`panToFocusCoord`/`formatSectionZoom` from `app.js`. The renderer is esbuild-bundled; the renderer-health e2e gate exists.

## Goals / Non-Goals

**Goals:** move the editorState-coupled zoom/crop/output-mode cluster into one module; resolve the compositing/section-editing back-imports.

**Non-Goals:** no behavior change; no body edits; pure geometry stays in `features/geometry/*`; leave render/drag/etc.

## Decisions

### D1 — editorState-coupled geometry, not pure math
Move the functions that read `editorState` (zoom clamp/format keyed on output mode, zoom-crop bounds, focus/pan conversion, mode switch). The pure pan/clamp helpers remain in `features/geometry/section-geometry.ts` / `shared/domain/canvas.ts` and are imported.

### D2 — Consume state, elements, canvas, mode-state, geometry, section-editing, compositing
Imports as listed in the proposal. `setOutputMode` uses `saveModeState`/`restoreModeState`/`getDefaultModeState` from `features/keyframe/mode-state.ts` and re-renders via `updatePreview`/section controls.

### D3 — Repoint compositing & section-editing back-imports
Grep `features/` for the 8 names imported from `app.js` and repoint to `../editor/zoom-crop.js`.

### D4 — Circular-safe; typecheck-guided
`zoom-crop ↔ section-editing ↔ compositing` cycles are esbuild-safe. Iterate `tsc --build` to 0 errors, then `lint --max-warnings=0`. The gate proves runtime.

## Risks / Trade-offs

- **[Circular cycles]** → esbuild-safe; the gate confirms.
- **[Back-imports]** → expected; shrink as remaining domains extract.

## Migration Plan

Behavior-preserving; single implementer creates the module, moves the cluster, repoints siblings, reconciles imports, rewires `app.ts`; full `npm run build` + `npm run check`. Rollback = revert.

## Open Questions

- None blocking.
