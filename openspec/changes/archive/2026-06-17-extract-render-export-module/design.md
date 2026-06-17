## Context

Post-keystone, `app.ts` render/export functions reference state via `state.ts` and DOM via `elements.ts`, and call `window.electronAPI` for `renderComposite`/`captureThumbnail`. `handleRenderProgress` is registered as the `onRenderProgress` IPC callback in app.ts bootstrap. The renderer is esbuild-bundled; the renderer-health e2e gate exists.

## Goals / Non-Goals

**Goals:** move the render/export + proxy-progress + segment-selection cluster into one module.

**Non-Goals:** no behavior change; no body edits; leave drag/waveform/workspace/take-media/background/`enterEditor`.

## Decisions

### D1 — Cluster boundary: render/export + proxy progress + segment selection
Move the export payload builders, `renderVideo`, thumbnail capture/toast, render-button state, proxy-progress bars, and the small segment-selection UI (related to the export/timeline view). Keep `drawComposite` (compositing) and take/media helpers out.

### D2 — Keep the onRenderProgress registration in app.ts bootstrap
The IPC listener registration (`window.electronAPI.onRenderProgress(handleRenderProgress)`) stays in app.ts's bootstrap section; app.ts imports `handleRenderProgress` from the render module. (Moving the registration itself is deferred until the bootstrap is the last thing in app.ts.)

### D3 — Consume state, elements, siblings, electronAPI
Imports: state from `../../state.js`; DOM from `../dom/elements.js`; `getStateAtTime` from `../editor/transport.js`, `drawComposite`/`updatePreview` from `../drawing/compositing.js`, section helpers from `../section/section-editing.js` as needed. `window.electronAPI` / canvas APIs stay ambient. Remaining helpers (`resolveTimeToSource`, `getOrCreateTakeVideos`) from `../../app.js`.

### D4 — Typecheck-guided reconciliation; gate + typecheck as proof
Iterate `tsc --build` to 0 errors, then `lint --max-warnings=0`. Bodies unchanged → behavior preserved; the gate proves boot health.

## Risks / Trade-offs

- **[Render runs on user action]** → the boot gate proves the module loads; bodies unchanged so behavior preserved.
- **[Back-imports for take/media helpers]** → expected; shrink as those extract.

## Migration Plan

Behavior-preserving; single implementer creates the module, moves the cluster, reconciles imports, rewires `app.ts`; full `npm run build` + `npm run check`. Rollback = revert.

## Open Questions

- None blocking.
