## Context

Post-keystone, `app.ts` interaction functions reference state via `state.ts` and DOM via `elements.ts`, and call sibling modules (transport/compositing/section-editing/zoom-crop/audio-overlay/project-lifecycle). The renderer is esbuild-bundled; the renderer-health e2e gate exists and exercises the editor.

## Goals / Non-Goals

**Goals:** move the editor timeline/canvas interaction + waveform + camera-toggle cluster into one module.

**Non-Goals:** no behavior change; no body edits; leave take/media helpers, workspace, background, `appendTakeToTimeline`, `enterEditor`.

## Decisions

### D1 — Cluster boundary: editor interactions
Move trim drag, scrub/seek/zoom/scroll, crop preset, `canvasToEditorCoords`, camera-keyframe toggles, and waveform (peaks + render). `initScrubDrag` is the generic scrub-drag binder (used by pip/crop/bg drags too); it moves here and its callers import it.

### D2 — Consume state, elements, siblings
Imports: state from `../../state.js`; DOM from `../dom/elements.js`; sibling entry points from `transport.js`/`compositing.js`/`section-editing.js`/`zoom-crop.js`/`audio-overlay.js`/`project-lifecycle.js`. `MouseEvent`/canvas/DOM APIs stay ambient.

### D3 — Repoint sibling back-imports; circular-safe; typecheck-guided
Grep `features/` for the moved names imported from `app.js` and repoint to `../editor/interactions.js`. Cycles are esbuild-safe. Iterate `tsc --build` to 0 errors, then `lint --max-warnings=0`. The gate proves runtime.

## Risks / Trade-offs

- **[initScrubDrag is generic]** → moves to interactions; pip/crop/bg drag callers (still in app.ts) import it from there.
- **[Back-imports]** → expected; shrink as remaining domains extract.

## Migration Plan

Behavior-preserving; single implementer creates the module, moves the cluster, repoints siblings, reconciles imports, rewires `app.ts`; full `npm run build` + `npm run check`. Rollback = revert.

## Open Questions

- None blocking.
