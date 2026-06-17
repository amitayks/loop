## Context

Post-keystone, `app.ts` transport functions reference state via `state.ts` and DOM/contexts via `elements.ts`. The cluster spans the draw-loop helpers (~850–882, plus `editorDrawLoop` ~4957) and the transport/playback functions (~4389–4950). `getStateAtTime`/`getOverlayStateAtTime` are back-imported by the drawing module. The renderer is esbuild-bundled; the renderer-health e2e gate exists and continuously exercises the draw loop.

## Goals / Non-Goals

**Goals:** move the playback-transport cluster into one module; resolve the drawing module's `getStateAtTime` back-import.

**Non-Goals:** no behavior change; no body edits; leave `enterEditor` (orchestrator) and all other domains.

## Decisions

### D1 — Cluster boundary: transport, not bootstrap
Move the draw loop + transport controls + playback sync + visual-state-at-time. Leave `enterEditor` in `app.ts`: it is the editor bootstrap that wires section/overlay/undo rendering on entry and reaches across many not-yet-extracted domains; it stays as app.ts orchestration and imports the transport entry points it calls.

### D2 — Consume state, elements, drawing, overlay-utils, camera-sync
`transport.ts` imports state bindings+setters from `../../state.js`; DOM from `../dom/elements.js`; `drawComposite`/`updatePreview` from `../drawing/compositing.js`; `_getOverlayStateAtTime` from `../timeline/overlay-utils.js`; camera-sync helpers from `../timeline/camera-sync.js`. `requestAnimationFrame`/video APIs stay ambient.

### D3 — Back-imports for not-yet-extracted helpers
Transport calls helpers still in `app.ts` (`getSelectedSection`, `getRenderSections`, `findSectionForTime`, `getOrCreateTakeVideos`, `resolveTimeToSource`, `recalculateTimelinePositions`, …). Import them from `../../app.js` (export from `app.ts`); the count shrinks as later domains extract.

### D4 — Repoint the drawing back-import
`compositing.ts` back-imports `getStateAtTime`/`getOverlayStateAtTime` from `../../app.js`; repoint to `../editor/transport.js`.

### D5 — Typecheck-guided reconciliation; gate + typecheck as proof
Iterate `tsc --build` to 0 errors, then `lint --max-warnings=0` prunes unused imports across the three touched files. The draw loop is continuous, so any broken reference surfaces as a renderer error and fails the e2e health gate — a strong runtime proof for this domain.

## Risks / Trade-offs

- **[Hot draw loop]** → bodies are unchanged, so behavior is preserved by construction; the continuously-running loop makes the e2e gate a strong check.
- **[Many back-imports from app.js]** → expected; esbuild resolves circular imports; shrink as more domains extract.
- **[enterEditor coupling]** → left in app.ts; it imports the transport entry points it calls.

## Migration Plan

Behavior-preserving; single implementer creates the module, moves the cluster, reconciles imports, repoints the drawing back-import, rewires `app.ts`; full `npm run build` + `npm run check`. Rollback = revert.

## Open Questions

- None blocking.
