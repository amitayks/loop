## Context

Post-keystone, `app.ts` visual-overlay functions reference state via `state.ts` and DOM via `elements.ts`. The audio-overlay and window-overlay modules already exist; this is their image/video-overlay sibling. The audio-overlay module currently back-imports `renderOverlayList`/`renderOverlayMarkers` from `app.js`. The renderer is esbuild-bundled; the renderer-health e2e gate exists.

## Goals / Non-Goals

**Goals:** move the visual-overlay editing cluster into one module; resolve the audio-overlay module's `renderOverlayList`/`renderOverlayMarkers` back-imports.

**Non-Goals:** no behavior change; no body edits; leave sections-editing, drag-interactions, render, etc.

## Decisions

### D1 — Cluster boundary: image/video overlay editing
Move the ~16 image/video overlay functions (incl. `buildVolumeHeartStack`, the overlay volume UI used by `renderOverlayList`, and the media-element pool `getOverlayImageElement`/`getOverlayVideoElement`). Audio overlays and window-overlay creation already live in their own modules.

### D2 — Consume state, elements, overlay-utils, format-utils, drawing, shared
Imports: state from `../../state.js`; DOM from `../dom/elements.js`; `generateOverlayId` from `../../shared/domain/project-fields.js`; trim/state helpers from `../timeline/overlay-utils.js`; `hexToRgba`/`getVolumeSvg`/`formatTime` from `../format/format-utils.js`; `updatePreview` from `../drawing/compositing.js`. Image/Video/canvas APIs stay ambient.

### D3 — Repoint audio-overlay's back-imports
`audio-overlay.ts` imports `renderOverlayList`/`renderOverlayMarkers` from `../../app.js`; repoint to `../overlay/overlay.js`.

### D4 — Back-imports for not-yet-extracted helpers
Overlay edits call `snapshotTimeline`/`pushUndo` (undo), `scheduleProjectSave` (persistence), `recalculateTimelinePositions`/`renderSectionMarkers`/`getSelectedSection` (section/timeline) still in `app.ts`. Import from `../../app.js`; shrink as later domains extract.

### D5 — Typecheck-guided reconciliation; gate + typecheck as proof
Iterate `tsc --build` to 0 errors, then `lint --max-warnings=0` prunes unused imports across the touched files. Bodies unchanged → behavior preserved; the e2e gate proves boot health.

## Risks / Trade-offs

- **[Audio vs visual name similarity]** → move ONLY the non-Audio overlay functions; typecheck/grep guards against miscut.
- **[Media-element pool init]** → bodies unchanged; pools live in `state.ts` (already extracted) and are imported.
- **[Many back-imports]** → expected; shrink as later domains extract.

## Migration Plan

Behavior-preserving; single implementer creates the module, moves the cluster, repoints audio-overlay's back-imports, reconciles imports, rewires `app.ts`; full `npm run build` + `npm run check`. Rollback = revert.

## Open Questions

- None blocking.
