## Context

Post-keystone, `app.ts` drawing functions reference state via `state.ts` and canvas contexts via `elements.ts`. The drawing cluster is mostly contiguous (`drawPip` ~3534 → `drawEditorScreenWithZoom` ~3816) plus `getEffectiveCanvasDimensions` (~567). `updatePreview` is called from the capture module (which currently back-imports it from `app.js`). The renderer is esbuild-bundled; the renderer-health e2e gate exists.

## Goals / Non-Goals

**Goals:** move the drawing/compositing cluster into one module; resolve the capture `updatePreview` back-import.

**Non-Goals:** no behavior change; no body edits; leave `drawWaveformOnCanvas` (waveform domain) and all other domains.

## Decisions

### D1 — Cluster boundary: compositing only
Move the canvas compositing/preview/PiP/background/fit-fill/zoom functions. Leave `drawWaveformOnCanvas` (it draws audio-overlay waveforms — belongs with the waveform/audio domain). `getEffectiveCanvasDimensions` moves (it is a drawing helper used by compositing).

### D2 — Consume state, elements, geometry, overlay-utils, mouse-trail
`compositing.ts` imports: state bindings from `../../state.js`; canvas contexts + canvases from `../dom/elements.js`; geometry from `../geometry/*.js` and `../../shared/domain/canvas.js`; overlay-state from `../timeline/overlay-utils.js`; smoothed-mouse from `../timeline/mouse-trail.js`. Canvas/Image/Video APIs stay ambient.

### D3 — Back-imports for not-yet-extracted helpers
`drawComposite` and friends call helpers still in `app.ts` (e.g. `getStateAtTime`, `getOverlayStateAtTime`, `getRenderSections`). Import them from `../../app.js` (export from `app.ts`); the count shrinks as the transport/section/render domains extract.

### D4 — Repoint capture's updatePreview import
`source-picker.ts` imports `updatePreview` from `../../app.js`; repoint to `../drawing/compositing.js`.

### D5 — Typecheck-guided reconciliation; gate + typecheck as proof
Iterate `tsc --build` to 0 errors, then `lint --max-warnings=0` prunes unused imports across the three touched files. Bodies unchanged → behavior preserved by construction; the e2e gate proves boot health with the module loaded.

## Risks / Trade-offs

- **[Many back-imports from app.js]** → expected; esbuild resolves circular imports; they shrink as more domains extract.
- **[Heavy editorState coupling]** → reads are live bindings (unchanged); the gate confirms runtime.
- **[Leaving drawWaveformOnCanvas]** → explicitly out of scope; only the 10 listed functions move.

## Migration Plan

Behavior-preserving; single implementer creates the module, moves the cluster, reconciles imports, repoints capture, rewires `app.ts`; full `npm run build` + `npm run check`. Rollback = revert.

## Open Questions

- None blocking.
