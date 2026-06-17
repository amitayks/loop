## Context

Post-keystone, `app.ts` audio-overlay functions reference state via `state.ts` and DOM via `elements.ts`. The cluster is interleaved with visual-overlay functions but is a distinct domain (audio context, decode, waveform, playback, audio-overlay timeline editing). `drawWaveformOnCanvas` was left in `app.ts` by the drawing change and belongs here. The renderer is esbuild-bundled; the renderer-health e2e gate exists.

## Goals / Non-Goals

**Goals:** move the audio-overlay cluster (incl. `drawWaveformOnCanvas`) into one module.

**Non-Goals:** no behavior change; no body edits; leave the visual-overlay functions (next change) and all other domains.

## Decisions

### D1 — Cluster boundary: audio overlays only
Move the audio-overlay timeline editing + Web Audio decode/waveform/playback. Leave the visual-overlay functions (image/video overlays) in `app.ts` for the next change, even though they're interleaved. Move `drawWaveformOnCanvas` here (audio-overlay waveform rendering).

### D2 — Consume state, elements, shared, section-utils
Imports: state bindings+setters from `../../state.js`; DOM (audio track elements, waveform canvas) from `../dom/elements.js`; `generateAudioOverlayId` + normalizers from `../../shared/domain/project-fields.js` / `project.js`; section helpers from `../timeline/section-utils.js`. Web Audio / canvas APIs stay ambient.

### D3 — Back-imports for undo/persistence/section helpers
Audio-overlay edits call `snapshotTimeline`/`pushUndo` (undo), `scheduleProjectSave` (persistence), `recalculateTimelinePositions`/`renderSectionMarkers`/`getSelectedSection` (section/timeline) still in `app.ts`. Import from `../../app.js` (export from `app.ts`); shrink as later domains extract.

### D4 — Typecheck-guided reconciliation; gate + typecheck as proof
Iterate `tsc --build` to 0 errors, then `lint --max-warnings=0` prunes unused imports. Bodies unchanged → behavior preserved; the e2e gate proves boot health with the module loaded.

## Risks / Trade-offs

- **[Interleaved with visual overlays]** → only the 16 listed audio functions move; visual-overlay functions stay; typecheck catches any miscut.
- **[Web Audio init order]** → bodies unchanged; `getAudioOverlayContext` lazily creates the context as before.
- **[Many back-imports from app.js]** → expected; shrink as later domains extract.

## Migration Plan

Behavior-preserving; single implementer creates the module, moves the cluster, reconciles imports, rewires `app.ts`; full `npm run build` + `npm run check`. Rollback = revert.

## Open Questions

- None blocking.
