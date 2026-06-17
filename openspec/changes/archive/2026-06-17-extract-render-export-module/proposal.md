## Why

Continuing feature-module extraction. The **render/export** cluster (~11 functions) — export payload builders, `renderVideo` IPC, render progress, thumbnail capture/toast, render-button state, proxy progress, and segment-selection UI — is the next cohesive domain in `app.ts`.

## What Changes

- Add `src/renderer/features/render/render.ts` and move from `app.ts`: `handleRenderProgress`, `updateProxyProgressBars`, `getRenderKeyframes`, `getRenderSections`, `showThumbnailToast`, `setRenderBtnState`, `captureThumbnailFrame`, `renderVideo`, `selectSegment`, `applySegmentDeletedStyle`, `updateSegmentBadge`.
- The module consumes `state.js`, `elements.js`, sibling modules (`transport`, `compositing`, `section-editing`), and `window.electronAPI` (renderComposite/captureThumbnail). The `onRenderProgress` IPC registration stays in `app.ts` bootstrap (importing `handleRenderProgress`).
- `app.ts`: delete the moved definitions; import the entry points it calls. Any sibling that back-imported these is repointed to `render.js`.

Behavior-preserving — bodies unchanged.

## Capabilities

### New Capabilities
- `renderer-render-export-module`: The render/export pipeline (payload builders `getRenderSections`/`getRenderKeyframes`, `renderVideo` IPC, render progress, thumbnail capture/toast, render-button state) and segment-selection UI live in `src/renderer/features/render/render.ts`, consuming `state.js`/`elements.js`/siblings; `app.ts` and sibling modules import its entry points. Behavior-preserving; validated by the renderer-health e2e gate.

### Modified Capabilities
<!-- None at the spec/requirement level. Mechanical relocation; no product behavior change. -->

## Impact

- **New file**: `src/renderer/features/render/render.ts`.
- **Renderer**: `app.ts` loses the cluster bodies, gains a named import; the `onRenderProgress` registration in app.ts bootstrap imports `handleRenderProgress`.
- **Build/boundaries**: bundled by esbuild; circular imports resolved in-bundle.
- **Tests**: no new logic → no required unit test; `tsc` proves import completeness, the renderer-health e2e gate proves boot, full `npm run check` is the release gate.
- **Docs**: `docs/production/target-architecture.md` adds the module.
- **Deferred (later changes)**: drag-interactions, keyframe/camera-visibility, waveform, workspace, take/media helpers, background-image, `appendTakeToTimeline`, `enterEditor`.
- **Risk**: low. Mechanical relocation behind the proven keystone; typecheck-guided reconciliation; the gate is the behavioral proof.
